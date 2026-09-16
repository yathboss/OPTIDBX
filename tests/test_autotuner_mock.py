import importlib
import json
import logging
import subprocess
import sys

import pytest


def engine():
    # Lazy import makes missing Phase-1 implementation an executed RED assertion.
    module = importlib.import_module("autotuner.engine")
    return module.AutotunerEngine()


def test_three_readings_confirm_and_recommend(sample, caplog):
    tuner = engine()
    with caplog.at_level(logging.INFO):
        results = [tuner.process(sample(i), current_parallelism=8) for i in range(3)]
    assert [r.bottleneck.bottleneck_type for r in results] == ["NONE", "NONE", "CPU_PARALLELISM"]
    action = results[-1].recommended_action
    assert (action.action_type, action.status) == ("REDUCE_DB_PARALLELISM", "RECOMMENDED")
    assert (action.old_value, action.new_value) == (8, 6)
    assert results[-1].bottleneck.reason
    assert results[-1].bottleneck.evidence["cpu_percent"] == 94
    assert results[-1].model_dump(mode="json")["state"] == "RECOMMENDATION"
    events = {record.event for record in caplog.records if hasattr(record, "event")}
    assert {
        "telemetry_received",
        "bottleneck_candidate",
        "bottleneck_confirmed",
        "recommendation_created",
    } <= events


@pytest.mark.parametrize(
    "normal",
    [
        dict(cpu_percent=20),
        dict(context_switches=0),
        dict(active_workers=0),
        dict(query_latency_ms=10),
    ],
)
def test_every_signal_required_and_normal_resets_streak(sample, normal):
    tuner = engine()
    tuner.process(sample(0))
    tuner.process(sample(1))
    assert tuner.process(sample(2, **normal)).consecutive_bad_readings == 0
    assert tuner.process(sample(3)).bottleneck.bottleneck_type == "NONE"
    assert tuner.process(sample(4)).bottleneck.bottleneck_type == "NONE"
    assert tuner.process(sample(5)).bottleneck.bottleneck_type == "CPU_PARALLELISM"


@pytest.mark.parametrize("bad", [None, {}, {"os_metrics": {}}, "bad"])
def test_invalid_input_resets_streak_and_logs(sample, bad, caplog):
    tuner = engine()
    tuner.process(sample(0))
    tuner.process(sample(1))
    with caplog.at_level(logging.WARNING), pytest.raises(ValueError):
        tuner.process(bad)
    assert "invalid_telemetry" in [r.event for r in caplog.records]
    assert tuner.process(sample(2)).consecutive_bad_readings == 1


def test_duplicate_and_out_of_order_readings_rejected(sample):
    tuner = engine()
    tuner.process(sample(1))
    for index in [1, 0]:
        with pytest.raises(ValueError, match="newer"):
            tuner.process(sample(index))
    assert tuner.process(sample(2)).consecutive_bad_readings == 1


def test_gap_resets_and_history_is_bounded(sample):
    tuner = engine()
    tuner.process(sample(0))
    tuner.process(sample(1))
    assert tuner.process(sample(10)).consecutive_bad_readings == 1
    for index in range(11, 100):
        tuner.process(sample(index))
    assert len(tuner.recent_readings) <= tuner.config.monitoring.history_size


def test_configured_count_and_thresholds(sample):
    from autotuner.engine import AutotunerEngine
    from config.config_loader import AppConfig, load_config

    data = load_config().model_dump()
    data["monitoring"]["consecutive_bad_readings"] = 2
    data["thresholds"]["cpu_high_percent"] = 95
    tuner = AutotunerEngine(AppConfig.model_validate(data))
    assert tuner.process(sample(0)).consecutive_bad_readings == 0
    assert tuner.process(sample(1, cpu_percent=95)).consecutive_bad_readings == 1
    assert tuner.process(sample(2, cpu_percent=95)).bottleneck.bottleneck_type == "CPU_PARALLELISM"


@pytest.mark.parametrize("current,expected", [(8, 6), (6, 4), (4, 2), (2, 1), (None, None)])
def test_safe_step_or_explicit_unknown_setting(sample, current, expected):
    tuner = engine()
    for index in range(3):
        result = tuner.process(sample(index), current_parallelism=current)
    assert result.recommended_action.new_value == expected
    assert result.recommended_action.old_value == current
    assert result.recommended_action.status == "RECOMMENDED"


@pytest.mark.parametrize("current", [0, 1, 3, -1, True, "8"])
def test_no_unsafe_or_floor_recommendation(sample, current):
    tuner = engine()
    for index in range(3):
        result = tuner.process(sample(index), current_parallelism=current)
    assert result.recommended_action is None


def test_cli_demo_end_to_end():
    run = subprocess.run(
        [sys.executable, "-m", "autotuner.demo"], capture_output=True, text=True, check=True
    )
    results = [json.loads(line) for line in run.stdout.splitlines()]
    assert [r["consecutive_bad_readings"] for r in results] == [1, 2, 3]
    assert results[-1]["recommended_action"]["new_value"] == 6
