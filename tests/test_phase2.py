"""Phase 2 guarantees: real-provider wiring, timing, state, and read-only decisions."""

import importlib
from datetime import datetime, timedelta
from unittest.mock import Mock

import pytest

from autotuner.engine import AutotunerEngine
from config.config_loader import load_config


def coordinator():
    return importlib.import_module("autotuner.telemetry_coordinator").TelemetryCoordinator(
        load_config()
    )


def at(sample, index=0):
    return datetime.fromisoformat(sample(index)["timestamp"])


def test_coordinator_preserves_source_times_with_small_skew(sample):
    data = sample()
    now = at(sample) + timedelta(seconds=0.7)
    data["db_metrics"]["timestamp"] = now.isoformat()
    combined = coordinator().combine(data["os_metrics"], data["db_metrics"], now=now)
    assert combined.timestamp == now
    assert combined.os_metrics.timestamp == at(sample)
    assert combined.db_metrics.timestamp == now


@pytest.mark.parametrize("offset,age", [(2, 0), (0, 20), (0, -10)])
def test_coordinator_rejects_skew_stale_and_future(sample, offset, age):
    data = sample()
    data["db_metrics"]["timestamp"] = (at(sample) + timedelta(seconds=offset)).isoformat()
    with pytest.raises(ValueError):
        coordinator().combine(
            data["os_metrics"], data["db_metrics"], now=at(sample) + timedelta(seconds=age)
        )


def test_coordinator_cannot_reuse_either_source(sample):
    pairer = coordinator()
    data = sample()
    pairer.combine(data["os_metrics"], data["db_metrics"], now=at(sample))
    data["db_metrics"]["timestamp"] = (at(sample) + timedelta(seconds=0.1)).isoformat()
    with pytest.raises(ValueError, match="newer"):
        pairer.combine(
            data["os_metrics"], data["db_metrics"], now=at(sample) + timedelta(seconds=1)
        )


def test_engine_state_and_status_reset(sample, caplog):
    engine = AutotunerEngine()
    assert engine.get_status().detected_bottleneck == "NONE"
    expected = ["BOTTLENECK_CANDIDATE", "BOTTLENECK_CANDIDATE", "RECOMMENDATION_READY"]
    for i, state in enumerate(expected):
        assert engine.process(sample(i), current_parallelism=8).state == state
    status = engine.get_status()
    assert status.recommended_action.new_value == 6
    assert status.evidence["active_workers"] == 8
    assert status.mode == "recommendation"
    with caplog.at_level("INFO"):
        engine.process(sample(3, cpu_percent=10))
    assert engine.get_status().state == "MONITORING"
    assert engine.get_status().recommended_action is None
    assert "candidate_reset" in [r.event for r in caplog.records if hasattr(r, "event")]


def test_intermittent_spikes_and_floor(sample):
    engine = AutotunerEngine()
    for i, cpu in enumerate([94, 10, 94]):
        assert engine.process(sample(i, cpu_percent=cpu)).bottleneck.bottleneck_type == "NONE"
    for i in range(3, 6):
        result = engine.process(sample(i), current_parallelism=1)
    assert result.state == "BOTTLENECK_CONFIRMED"
    assert result.recommended_action is None


def test_missing_input_clears_previous_recommendation(sample):
    engine = AutotunerEngine()
    for i in range(3):
        engine.process(sample(i), current_parallelism=8)
    with pytest.raises(ValueError):
        engine.process(None)
    assert engine.get_status().recommended_action is None
    assert not engine.get_status().telemetry_available


def test_one_recommendation_identity_per_episode(sample):
    engine = AutotunerEngine()
    for i in range(3):
        result = engine.process(sample(i), current_parallelism=8)
    first = result.recommended_action.action_id
    assert engine.process(sample(3), current_parallelism=8).recommended_action.action_id == first
    assert engine.process(sample(4), current_parallelism=6).recommended_action.action_id != first
    engine.process(sample(5, cpu_percent=10))
    for i in range(6, 9):
        result = engine.process(sample(i), current_parallelism=8)
    assert result.recommended_action.action_id != first


def test_engine_rejects_unpaired_skew_even_without_coordinator(sample):
    data = sample()
    data["timestamp"] = data["db_metrics"]["timestamp"] = (
        at(sample) + timedelta(seconds=3)
    ).isoformat()
    with pytest.raises(ValueError):
        AutotunerEngine().process(data)


def runtime(sample, store=None):
    cls = importlib.import_module("autotuner.runtime").AutotunerRuntime
    os_source, db_source = Mock(), Mock()
    clock = Mock(return_value=at(sample))
    instance = cls(
        os_collector=os_source, db_collector=db_source, recommendation_store=store, clock=clock
    )
    instance.prime()
    return instance, os_source, db_source, clock


def tick(instance, os_source, db_source, clock, sample, index, **changes):
    data = sample(index, **changes)
    os_source.collect_sample.return_value = data["os_metrics"]
    db_source.collect.return_value = data["db_metrics"]
    db_source.get_current_parallelism.return_value = 8
    clock.return_value = at(sample, index)
    return instance.tick()


def test_runtime_reuses_collectors_and_saves_once(sample):
    store = Mock(return_value=42)
    run, os_source, db_source, clock = runtime(sample, store)
    for i in range(4):
        tick(run, os_source, db_source, clock, sample, i)
    assert run.get_status().state == "RECOMMENDATION_READY"
    assert run.get_status().persistence_status == "SAVED"
    assert store.call_count == 1
    assert os_source.collect_sample.call_count == 4
    assert db_source.get_current_parallelism.call_count == 4
    assert len(run.get_history()) == 4


def test_runtime_failure_and_stale_status_fail_closed(sample):
    run, os_source, db_source, clock = runtime(sample)
    for i in range(3):
        tick(run, os_source, db_source, clock, sample, i)
    clock.return_value += timedelta(seconds=30)
    assert not run.get_status().telemetry_available
    assert run.get_status().recommended_action is None
    db_source.collect.side_effect = RuntimeError("offline")
    assert run.tick() is None
    assert run.get_status().last_error


def test_storage_failure_keeps_recommendation_but_reports_failure(sample):
    run, os_source, db_source, clock = runtime(sample, Mock(side_effect=RuntimeError("offline")))
    for i in range(3):
        tick(run, os_source, db_source, clock, sample, i)
    assert run.get_status().state == "RECOMMENDATION_READY"
    assert run.get_status().persistence_status == "FAILED"


def test_unknown_parameter_is_never_guessed(sample):
    run, os_source, db_source, clock = runtime(sample)
    db_source.get_current_parallelism.side_effect = RuntimeError("offline")
    for i in range(3):
        tick(run, os_source, db_source, clock, sample, i)
    assert run.get_status().recommended_action.old_value is None
    assert run.get_status().recommended_action.new_value is None


def test_live_api_returns_real_status_and_rejects_auto(sample):
    from fastapi.testclient import TestClient

    from backend.main import app
    from backend.services.live_runtime import get_runtime

    run, os_source, db_source, clock = runtime(sample)
    for i in range(3):
        tick(run, os_source, db_source, clock, sample, i)
    app.dependency_overrides[get_runtime] = lambda: run
    try:
        client = TestClient(app)
        status = client.get("/tuner/live-status")
        assert status.status_code == 200
        assert status.json()["recommended_action"]["new_value"] == 6
        assert client.post("/tuner/mode", json={"mode": "auto"}).status_code == 422
        assert client.get("/tuner/status").json()["evidence"]["cpu_percent"] == 94
        assert client.get("/metrics/current").json()["os"]["cpu_percent"] == 94
    finally:
        app.dependency_overrides.clear()


def test_default_api_has_no_fabricated_metrics_or_recommendation():
    from fastapi.testclient import TestClient

    from backend.main import app

    client = TestClient(app)
    assert client.get("/tuner/status").json()["detected_bottleneck"] == "NONE"
    assert client.get("/metrics/current").status_code == 503


def test_existing_workload_runner_accepts_a_read_only_benchmark_script(tmp_path, monkeypatch):
    import importlib

    module = importlib.import_module("workload.run_workload")
    script = tmp_path / "analytical.sql"
    script.write_text("SELECT sum(aid) FROM pgbench_accounts;")
    launch = Mock()
    monkeypatch.setattr(module.subprocess, "Popen", launch)
    module.run_workload(
        "MEDIUM", duration_sec=20, async_mode=True, pgbench_bin="pgbench", script_path=script
    )
    command = launch.call_args.args[0]
    assert command[command.index("-f") + 1] == str(script)
    assert "-i" not in command


def test_runtime_background_stops_without_publishing_after_stop(sample):
    import threading

    from autotuner.runtime import AutotunerRuntime

    run = AutotunerRuntime(os_collector=Mock(), db_collector=Mock())
    entered = threading.Event()
    run.prime = Mock(side_effect=entered.set)
    run.start()
    thread = run._thread
    run.start()
    assert run._thread is thread
    assert entered.wait(2)
    run.stop()
    assert not run.get_status().running
    assert run.tick() is None
    assert not run.get_status().telemetry_available
