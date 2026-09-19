"""Controlled-data safety tests; these do not claim live PostgreSQL tuning."""

import importlib
from datetime import datetime
from unittest.mock import Mock

import pytest

from autotuner.engine import AutotunerEngine
from autotuner.models import CombinedTelemetry
from config.config_loader import load_config


class FakeDB:
    def __init__(self):
        self.value = 8
        self.writes = []
        self.fail_restore = False
        self.bad_verify = False

    def read(self):
        return self.value

    def apply(self, old, new):
        assert self.value == old
        self.writes.append(new)
        self.value = new if not self.bad_verify else old

    def restore(self, old, applied):
        if self.fail_restore:
            raise RuntimeError("restore denied")
        self.writes.append(old)
        self.value = old

    def capabilities(self):
        return {"available": True, "scope": "test workload session"}


def setup_controller(tmp_path, sample, store=None):
    mod = importlib.import_module("autotuner.lifecycle")
    gate = importlib.import_module("actions.guard").ActionGate()
    db = FakeDB()
    now = [10.0]
    controller = mod.ActionLifecycle(
        load_config(),
        db,
        gate=gate,
        journal_path=tmp_path / "recovery.json",
        store=store or Mock(),
        monotonic=lambda: now[0],
    )
    history = [CombinedTelemetry.model_validate(sample(i)) for i in range(3)]
    engine = AutotunerEngine()
    for s in history:
        recommendation = engine.process(s, current_parallelism=8).recommended_action
    return controller, db, now, history, recommendation


def feed(controller, now, sample, index, **changes):
    now[0] = index * 5.0
    pair = CombinedTelemetry.model_validate(sample(index, **changes))
    controller.advance(pair, now=pair.timestamp)
    controller.wait_idle()


def test_verified_apply_observe_keep_cooldown(tmp_path, sample):
    ctl, db, now, hist, rec = setup_controller(tmp_path, sample)
    ctl.approve(rec, hist, now=hist[-1].timestamp)
    ctl.wait_idle()
    assert ctl.status()["state"] == "ACTION_APPLIED"
    assert db.value == 6
    for i in range(3, 9):
        feed(ctl, now, sample, i, query_latency_ms=180, throughput_tps=120, cpu_percent=80)
    assert ctl.status()["state"] == "KEEP"
    assert ctl.history()[-1]["after"]["memory_percent"] == 60
    assert len(db.writes) == 1
    feed(ctl, now, sample, 9)
    assert ctl.status()["state"] == "COOLDOWN"
    feed(ctl, now, sample, 14)
    assert ctl.status()["state"] == "MONITORING"


@pytest.mark.parametrize(
    "changes",
    [
        {"query_latency_ms": 400},
        {"throughput_tps": 30},
        {"memory_percent": 90},
        {"disk_read_bytes": 1000000},
        {},
    ],
)
def test_degradation_or_no_improvement_rolls_back(tmp_path, sample, changes):
    ctl, db, now, hist, rec = setup_controller(tmp_path, sample)
    ctl.approve(rec, hist, now=hist[-1].timestamp)
    ctl.wait_idle()
    for i in range(3, 9):
        feed(ctl, now, sample, i, **changes)
    assert ctl.status()["state"] == "ROLLBACK"
    assert db.value == 8


def test_missing_data_and_failed_rollback_block_restarts(tmp_path, sample):
    ctl, db, now, hist, rec = setup_controller(tmp_path, sample)
    ctl.approve(rec, hist, now=hist[-1].timestamp)
    ctl.wait_idle()
    db.fail_restore = True
    ctl.telemetry_missing("offline")
    ctl.wait_idle()
    assert ctl.status()["state"] == "ROLLBACK_FAILED"
    with pytest.raises(ValueError):
        ctl.approve(rec, hist, now=hist[-1].timestamp)
    mod = importlib.import_module("autotuner.lifecycle")
    restarted = mod.ActionLifecycle(
        load_config(), db, journal_path=tmp_path / "recovery.json", store=Mock()
    )
    assert restarted.status()["state"] == "ROLLBACK_FAILED"
    db.fail_restore = False
    ctl.rollback(str(rec.action_id))
    ctl.wait_idle()
    assert db.value == 8
    assert ctl.status()["state"] == "ROLLBACK"


def test_storage_preflight_failure_does_not_change_setting(tmp_path, sample):
    ctl, db, now, hist, rec = setup_controller(tmp_path, sample, Mock(side_effect=OSError()))
    ctl.approve(rec, hist, now=hist[-1].timestamp)
    ctl.wait_idle()
    assert db.writes == []
    assert ctl.status()["last_error"]


def test_verification_failure_restores_and_duplicate_approval_rejected(tmp_path, sample):
    ctl, db, now, hist, rec = setup_controller(tmp_path, sample)
    db.bad_verify = True
    ctl.approve(rec, hist, now=hist[-1].timestamp)
    with pytest.raises(ValueError):
        ctl.approve(rec, hist, now=hist[-1].timestamp)
    ctl.wait_idle()
    assert db.value == 8
    assert ctl.status()["state"] == "ROLLBACK"


def test_short_stale_or_out_of_order_baseline_rejected(tmp_path, sample):
    ctl, db, now, hist, rec = setup_controller(tmp_path, sample)
    for bad in [hist[:1], hist[::-1], [hist[0]] * 3]:
        with pytest.raises(ValueError):
            ctl.approve(rec, bad, now=hist[-1].timestamp)
    with pytest.raises(ValueError):
        ctl.approve(rec, hist, now=datetime.fromisoformat(sample(8)["timestamp"]))
    assert db.writes == []


def test_watchdog_rolls_back_without_further_samples(tmp_path, sample):
    ctl, db, now, hist, rec = setup_controller(tmp_path, sample)
    ctl.approve(rec, hist, now=hist[-1].timestamp)
    ctl.wait_idle()
    now[0] += 9
    ctl.check_deadlines()
    ctl.wait_idle()
    assert db.value == 8
    assert ctl.status()["state"] == "ROLLBACK"


def test_manual_rollback_of_kept_action_after_cooldown(tmp_path, sample):
    ctl, db, now, hist, rec = setup_controller(tmp_path, sample)
    ctl.approve(rec, hist, now=hist[-1].timestamp)
    ctl.wait_idle()
    for i in range(3, 9):
        feed(ctl, now, sample, i, query_latency_ms=180)
    feed(ctl, now, sample, 14)
    assert ctl.status()["state"] == "MONITORING"
    ctl.rollback(str(rec.action_id))
    ctl.wait_idle()
    assert db.value == 8


def test_recovery_cannot_target_a_different_workload_session(tmp_path, sample):
    from actions.guard import ActionGate
    from autotuner.lifecycle import ActionLifecycle

    ctl, db, now, hist, rec = setup_controller(tmp_path, sample)
    ctl.approve(rec, hist, now=hist[-1].timestamp)
    ctl.wait_idle()
    other = FakeDB()
    other.capabilities = lambda: {"available": True, "scope": "different session"}
    restarted = ActionLifecycle(
        load_config(),
        other,
        gate=ActionGate(),
        journal_path=tmp_path / "recovery.json",
        store=Mock(),
    )
    restarted.rollback(str(rec.action_id))
    restarted.wait_idle()
    assert restarted.status()["state"] == "ROLLBACK_FAILED"
    assert other.writes == []
    ctl.rollback(str(rec.action_id))
    ctl.wait_idle()


def test_insufficient_observations_external_drift_and_storage_after_apply(tmp_path, sample):
    ctl, db, now, hist, rec = setup_controller(tmp_path, sample)
    ctl.approve(rec, hist, now=hist[-1].timestamp)
    ctl.wait_idle()
    ctl._evaluate()
    assert db.value == 8
    assert ctl.status()["state"] == "ROLLBACK"


def test_storage_failure_after_apply_rolls_back(tmp_path, sample):
    store = Mock(side_effect=[None, OSError("offline"), None])
    ctl, db, now, hist, rec = setup_controller(tmp_path, sample, store)
    ctl.approve(rec, hist, now=hist[-1].timestamp)
    ctl.wait_idle()
    assert db.writes == [6, 8]
    assert ctl.status()["state"] == "ROLLBACK"


def test_kept_history_retains_outcome_after_cooldown(tmp_path, sample):
    ctl, db, now, hist, rec = setup_controller(tmp_path, sample)
    ctl.approve(rec, hist, now=hist[-1].timestamp)
    ctl.wait_idle()
    for i in range(3, 9):
        feed(ctl, now, sample, i, query_latency_ms=180)
    feed(ctl, now, sample, 14)
    assert ctl.history()[-1]["outcome"] == "KEEP"


def test_configured_degradation_tolerance_is_independent_from_improvement(tmp_path, sample):
    ctl, db, now, hist, rec = setup_controller(tmp_path, sample)
    ctl.approve(rec, hist, now=hist[-1].timestamp)
    ctl.wait_idle()
    # Latency improves >5%, TPS degrades 7%, within configured 10% tolerance.
    for i in range(3, 9):
        feed(ctl, now, sample, i, query_latency_ms=180, throughput_tps=93)
    assert ctl.status()["state"] == "KEEP"


def test_cancel_before_apply_does_not_write(tmp_path, sample):
    import threading

    entered, release = threading.Event(), threading.Event()

    def slow_store(*args, **kwargs):
        entered.set()
        release.wait(3)

    ctl, db, now, hist, rec = setup_controller(tmp_path, sample, slow_store)
    ctl.approve(rec, hist, now=hist[-1].timestamp)
    assert entered.wait(2)
    ctl.telemetry_missing("Stopped by user")
    release.set()
    ctl.wait_idle()
    assert db.writes == []


def test_journal_failure_before_manual_restore_is_explicit(tmp_path, sample, monkeypatch):
    ctl, db, now, hist, rec = setup_controller(tmp_path, sample)
    ctl.approve(rec, hist, now=hist[-1].timestamp)
    ctl.wait_idle()
    monkeypatch.setattr(ctl, "_journal", Mock(side_effect=OSError("disk full")))
    with pytest.raises(ValueError):
        ctl.rollback(str(rec.action_id))
    assert ctl.status()["state"] == "ROLLBACK_FAILED"
    assert ctl.gate.busy


@pytest.mark.parametrize("content", ["not json", "[]", '{"action": {}}'])
def test_corrupt_recovery_journal_stays_blocked_without_crashing(tmp_path, content):
    from actions.guard import ActionGate
    from autotuner.lifecycle import ActionLifecycle

    path = tmp_path / "corrupt.json"
    path.write_text(content)
    ctl = ActionLifecycle(load_config(), FakeDB(), gate=ActionGate(), journal_path=path)
    assert ctl.status()["recovery_required"]
    assert ctl.status()["active_action"] is None
    with pytest.raises(ValueError):
        ctl.rollback("anything")
