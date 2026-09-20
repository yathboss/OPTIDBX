"""Controlled regressions for trustworthy owned-workload decisions, not live results."""

import pytest

from tests.test_phase3 import OwnedDB, feed, owned_metrics, setup_owned
from workload.measurements import RollingQueryLog


def warm_db():
    db = OwnedDB(owned_metrics(qps=10, p95=100), owned_metrics(qps=12, p95=90))
    db.earliest = lambda: -100.0
    return db


def test_cold_baseline_defers_without_mutating(tmp_path, sample):
    db = warm_db()
    db.earliest = lambda: 0.0
    ctl, now, hist, rec = setup_owned(tmp_path, sample, db)
    with pytest.raises(ValueError, match="baseline"):
        ctl.approve(rec, hist, now=hist[-1].timestamp)
    assert db.writes == []
    assert not ctl.gate.busy


@pytest.mark.parametrize("missing", [None, {}, "error"])
def test_missing_owned_observation_never_falls_back_to_telemetry(tmp_path, sample, missing):
    db = warm_db()
    original = db.window

    def window(start, end):
        if end <= 10.5:
            return original(start, end)
        if missing == "error":
            raise RuntimeError("measurement unavailable")
        return missing

    db.window = window
    ctl, now, hist, rec = setup_owned(tmp_path, sample, db)
    ctl.approve(rec, hist, now=hist[-1].timestamp)
    ctl.wait_idle()
    for i in range(3, 9):
        feed(ctl, now, sample, i, query_latency_ms=100, throughput_tps=200)
    assert ctl.status()["state"] == "ROLLBACK"
    assert ctl.record["evaluation_source"] == "OWNED_WORKLOAD"
    assert "Insufficient owned" in ctl.record["reason"]


def test_keep_cannot_trade_large_tail_regression_for_throughput(tmp_path, sample):
    db = warm_db()
    db._after = owned_metrics(qps=15, p95=126)
    ctl, now, hist, rec = setup_owned(tmp_path, sample, db)
    ctl.approve(rec, hist, now=hist[-1].timestamp)
    ctl.wait_idle()
    for i in range(3, 9):
        feed(ctl, now, sample, i)
    assert ctl.status()["state"] == "ROLLBACK"


def test_owned_windows_have_equal_duration_and_baseline_is_frozen(tmp_path, sample):
    db = warm_db()
    ctl, now, hist, rec = setup_owned(tmp_path, sample, db)
    ctl.approve(rec, hist, now=hist[-1].timestamp)
    ctl.wait_idle()
    db._before = None  # Old samples may be cleared when the workload setting changes.
    for i in range(3, 9):
        feed(ctl, now, sample, i)
    assert ctl.status()["state"] == "KEEP"
    lengths = [end - start for start, end in db.windows]
    assert len(set(lengths)) == 1
    assert ctl.record["before_owned"]["qps"] == 10


def test_rolling_windows_exclude_queries_crossing_the_boundary():
    log = RollingQueryLog()
    log.record(0, 10)  # Mostly executed before the requested window.
    log.record(9.5, 10.5)
    assert log.window(9, 11)["successful_queries"] == 1
    assert log.earliest() == 0


def test_old_evictions_do_not_invalidate_a_fully_retained_recent_window():
    log = RollingQueryLog(capacity=2)
    log.record(0, 1)
    log.record(2, 3)
    log.record(4, 5)
    assert log.window(1.5, 6)["truncated"] is False
    assert log.window(0, 6)["truncated"] is True


def test_nonfinite_owned_measurements_cannot_keep(tmp_path, sample):
    db = warm_db()
    db._after = owned_metrics(qps=float("inf"), p95=50)
    ctl, now, hist, rec = setup_owned(tmp_path, sample, db)
    ctl.approve(rec, hist, now=hist[-1].timestamp)
    ctl.wait_idle()
    for i in range(3, 9):
        feed(ctl, now, sample, i)
    assert ctl.status()["state"] == "ROLLBACK"
    import json
    json.dumps(ctl.status(), allow_nan=False)


@pytest.mark.parametrize("bad", [None, {}, "exception", {"qps": 1}])
def test_unavailable_baseline_never_writes(tmp_path, sample, bad):
    db = warm_db()
    def window(start, end):
        if bad == "exception":
            raise RuntimeError("offline")
        return bad
    db.window = window
    ctl, now, hist, rec = setup_owned(tmp_path, sample, db)
    with pytest.raises(ValueError, match="baseline"):
        ctl.approve(rec, hist, now=hist[-1].timestamp)
    assert not db.writes
    assert not ctl.gate.busy


def test_new_setting_epoch_requires_another_warm_baseline():
    log = RollingQueryLog()
    log.record(1, 2)
    log.reset()
    assert log.earliest() is None
    assert log.window(0, 5) is None
    log.record(20, 21)
    assert log.earliest() == 20


@pytest.mark.parametrize("policy", ["net_benefit", "latency_first", "throughput_first"])
def test_global_safety_limit_cannot_be_bypassed_by_a_relaxed_policy_cap(tmp_path, sample, policy):
    db = warm_db()
    ctl, *_ = setup_owned(tmp_path, sample, db)
    cfg = ctl.config.tuning.model_copy(update={"max_latency_regression_percent": 50, "keep_policy": policy})
    assert ctl._keep_decision(cfg, 100, 26, False)[0] is False
    assert ctl._keep_decision(cfg, -20, -90, False)[0] is False
    assert ctl._keep_decision(cfg, 20, -20, True)[0] is False
