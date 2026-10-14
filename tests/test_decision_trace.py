"""Unit and integration tests for real decision trace recording and algorithm configuration."""

from datetime import UTC, datetime, timedelta
import pytest
from fastapi.testclient import TestClient

from autotuner.engine import AutotunerEngine
from autotuner.models import (
    CombinedTelemetry,
    DBMetrics,
    OSMetrics,
    TunerState,
)
from backend.main import app
from config.config_loader import load_config


def make_sample(
    dt: datetime,
    cpu: float = 95.0,
    ctx_switches: int = 5000,
    workers: int = 5,
    latency: float = 250.0,
) -> CombinedTelemetry:
    return CombinedTelemetry(
        timestamp=dt,
        os_metrics=OSMetrics(
            timestamp=dt,
            cpu_percent=cpu,
            memory_percent=50.0,
            disk_read_bytes=0,
            disk_write_bytes=0,
            context_switches=ctx_switches,
        ),
        db_metrics=DBMetrics(
            timestamp=dt,
            query_latency_ms=latency,
            throughput_tps=50.0,
            temp_files_bytes=0,
            active_workers=workers,
        ),
    )


def test_decision_trace_records_signals_and_counter_reset_sequence():
    config = load_config()
    engine = AutotunerEngine(config)

    base = datetime(2026, 1, 1, 12, 0, 0, tzinfo=UTC)

    # Sample 1: Hot contention (hi 1)
    s1 = make_sample(base, cpu=95.0, ctx_switches=5000, workers=5, latency=250.0)
    r1 = engine.process(s1, current_parallelism=8)
    assert r1.consecutive_bad_readings == 1

    # Sample 2: Hot contention (hi 2)
    s2 = make_sample(base + timedelta(seconds=5), cpu=96.0, ctx_switches=5100, workers=5, latency=260.0)
    r2 = engine.process(s2, current_parallelism=8)
    assert r2.consecutive_bad_readings == 2

    # Sample 3: Normal reading (ok) -> resets consecutive to 0
    s3 = make_sample(base + timedelta(seconds=10), cpu=40.0, ctx_switches=1000, workers=1, latency=50.0)
    r3 = engine.process(s3, current_parallelism=8)
    assert r3.consecutive_bad_readings == 0

    # Sample 4: Hot contention again (hi 1)
    s4 = make_sample(base + timedelta(seconds=15), cpu=95.0, ctx_switches=5200, workers=5, latency=270.0)
    r4 = engine.process(s4, current_parallelism=8)
    assert r4.consecutive_bad_readings == 1

    trace = engine.get_decision_trace(10)
    assert len(trace) == 4

    # Verify first tick
    t1 = trace[0]
    assert t1["consecutive"] == 1
    assert t1["candidate"] is True
    assert t1["signals"]["cpu_percent"]["passed"] is True
    assert t1["signals"]["context_switches"]["passed"] is True
    assert t1["signals"]["active_workers"]["passed"] is True
    assert t1["signals"]["query_latency_ms"]["passed"] is True

    # Verify normal tick reset
    t3 = trace[2]
    assert t3["consecutive"] == 0
    assert t3["candidate"] is False
    assert t3["invalidated"] == "Normal reading interrupted CPU contention"
    assert t3["signals"]["cpu_percent"]["passed"] is False

    # Verify restart tick
    t4 = trace[3]
    assert t4["consecutive"] == 1
    assert t4["candidate"] is True


def test_keep_decision_evaluates_net_benefit_and_records_vetoes():
    config = load_config()
    cfg = config.tuning

    # Test net-benefit calculation: net = 1.0 * qps - 0.5 * p95
    # e.g. qps +10%, p95 +2% -> net = 10 - 1 = 9% >= 5% -> keep
    from autotuner.lifecycle import ActionLifecycle
    lc = ActionLifecycle(config, executor=None)

    keep, detail, net, vetoes = lc._keep_decision(cfg, qps_change=10.0, p95_change=2.0, errors_rose=False)
    assert keep is True
    assert net == 9.0
    assert len(vetoes) == 3
    assert all(v["passed"] for v in vetoes)

    # Test tail-latency regression veto (e.g. p95 increased by 12% >= 10%)
    keep_bad_p95, detail_bad_p95, net_bad, vetoes_bad = lc._keep_decision(
        cfg, qps_change=30.0, p95_change=12.0, errors_rose=False
    )
    assert keep_bad_p95 is False
    lat_veto = next(v for v in vetoes_bad if v["name"] == "latency_cap")
    assert lat_veto["passed"] is False

    # Test error increase veto
    keep_err, detail_err, _, vetoes_err = lc._keep_decision(
        cfg, qps_change=20.0, p95_change=-5.0, errors_rose=True
    )
    assert keep_err is False
    err_veto = next(v for v in vetoes_err if v["name"] == "errors")
    assert err_veto["passed"] is False


def test_decision_trace_endpoint_matches_config():
    client = TestClient(app)
    response = client.get("/tuner/decision-trace")
    assert response.status_code == 200

    data = response.json()
    assert "ticks" in data
    assert "algorithm" in data

    algo = data["algorithm"]
    cfg = load_config()

    assert algo["thresholds"]["cpu_high_percent"] == cfg.thresholds.cpu_high_percent
    assert algo["thresholds"]["context_switches_high_per_interval"] == cfg.thresholds.context_switches_high_per_interval
    assert algo["thresholds"]["active_workers_high"] == cfg.thresholds.active_workers_high
    assert algo["thresholds"]["query_latency_high_ms"] == cfg.thresholds.query_latency_high_ms
    assert algo["required_consecutive"] == cfg.monitoring.consecutive_bad_readings
    assert algo["interval_seconds"] == cfg.monitoring.interval_seconds
    assert algo["allowed_workers"] == list(cfg.safe_values.max_parallel_workers_per_gather)
    assert algo["keep_policy"] == cfg.tuning.keep_policy
    assert algo["weights"]["throughput"] == cfg.tuning.throughput_weight
    assert algo["weights"]["latency"] == cfg.tuning.latency_weight
    assert algo["improvement_percent"] == cfg.tuning.improvement_percent
    assert algo["degradation_percent"] == cfg.tuning.degradation_percent
    assert algo["rejection_memory_ttl_seconds"] == cfg.tuning.rejection_memory_ttl_seconds


def test_invalid_telemetry_appends_to_decision_trace():
    config = load_config()
    engine = AutotunerEngine(config)

    with pytest.raises(ValueError):
        engine.process(None)

    trace = engine.get_decision_trace(10)
    assert len(trace) == 1
    t = trace[0]
    assert t["invalidated"] == "Invalid or missing telemetry"
    assert t["candidate"] is False
    assert t["consecutive"] == 0
    assert t["signals"]["cpu_percent"]["value"] is None

