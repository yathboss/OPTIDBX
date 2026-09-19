import importlib

import pytest
import yaml
from pydantic import ValidationError


def loader():
    return importlib.import_module("config.config_loader")


def test_default_config_loads_outside_repo(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    config = loader().load_config()
    assert config.monitoring.interval_seconds == 5
    assert config.tuning.one_action_at_a_time is True
    assert config.modes.default_mode == "recommendation"


@pytest.mark.parametrize(
    "content", ["", "[]", "monitoring: [", "monitoring: {}", "!!python/object:builtins.object {}"]
)
def test_malformed_or_incomplete_config_has_clear_error(tmp_path, content):
    path = tmp_path / "config.yaml"
    path.write_text(content)
    with pytest.raises(ValueError, match="Invalid configuration"):
        loader().load_config(path)


def test_missing_config(tmp_path):
    with pytest.raises(ValueError, match="Cannot read configuration"):
        loader().load_config(tmp_path / "absent.yaml")


def test_shared_interval_reaches_both_modules(tmp_path, monkeypatch):
    from pathlib import Path

    from db_monitor import collector

    source = Path(__file__).resolve().parents[1] / "config" / "config.yaml"
    shared = tmp_path / "config" / "config.yaml"
    shared.parent.mkdir()
    shared.write_text(source.read_text().replace("&metric_interval 5", "&metric_interval 7"))
    monkeypatch.setattr(collector, "PROJECT_ROOT", tmp_path)
    assert loader().load_config(shared).monitoring.interval_seconds == 7
    assert collector.load_config_interval() == 7


@pytest.mark.parametrize(
    "section,key,value",
    [
        ("monitoring", "interval_seconds", 0),
        ("monitoring", "consecutive_bad_readings", -1),
        ("monitoring", "consecutive_bad_readings", True),
        ("thresholds", "cpu_high_percent", 101),
        ("thresholds", "query_latency_high_ms", float("nan")),
        ("safe_values", "max_parallel_workers_per_gather", [1, 4, 2]),
        ("safe_values", "work_mem_mb", [4, 4]),
        ("safe_values", "work_mem_mb", []),
        ("modes", "default_mode", "auto"),
        ("tuning", "one_action_at_a_time", False),
    ],
)
def test_invalid_config_values(tmp_path, section, key, value):
    module = loader()
    data = module.load_config().model_dump()
    data[section][key] = value
    path = tmp_path / "bad.yaml"
    path.write_text(yaml.safe_dump(data))
    with pytest.raises(ValueError, match="Invalid configuration"):
        module.load_config(path)


def test_telemetry_round_trip_and_frozen_model(sample):
    from autotuner.models import CombinedTelemetry

    telemetry = CombinedTelemetry.model_validate(sample())
    assert CombinedTelemetry.model_validate_json(telemetry.model_dump_json()) == telemetry
    with pytest.raises(ValidationError):
        telemetry.os_metrics.cpu_percent = 1


@pytest.mark.parametrize(
    "field,value",
    [
        ("cpu_percent", 101),
        ("cpu_percent", float("nan")),
        ("memory_percent", -1),
        ("context_switches", -1),
        ("active_workers", 1.5),
        ("active_workers", True),
        ("query_latency_ms", None),
        ("throughput_tps", -2),
    ],
)
def test_invalid_metrics(sample, field, value):
    from autotuner.models import CombinedTelemetry

    with pytest.raises(ValidationError):
        CombinedTelemetry.model_validate(sample(**{field: value}))


def test_missing_unknown_and_unaligned_fields(sample):
    from autotuner.models import CombinedTelemetry

    for mutate in [
        lambda data: data["os_metrics"].pop("context_switches"),
        lambda data: data["db_metrics"].update(typo=1),
        lambda data: data["db_metrics"].update(timestamp="2026-01-01T00:00:05Z"),
        lambda data: data.update(timestamp="2026-01-01T00:00:00"),
    ]:
        data = sample()
        mutate(data)
        with pytest.raises(ValidationError):
            CombinedTelemetry.model_validate(data)
