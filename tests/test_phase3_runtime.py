from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient

from tests.test_phase2 import at, tick
from tests.test_phase3 import FakeDB


def make_runtime(tmp_path, sample):
    from actions.guard import ActionGate
    from autotuner.runtime import AutotunerRuntime

    db = FakeDB()
    os_source, db_source, clock = Mock(), Mock(), Mock(return_value=at(sample))
    run = AutotunerRuntime(
        os_collector=os_source,
        db_collector=db_source,
        clock=clock,
        db_executor=db,
        action_store=Mock(),
        action_gate=ActionGate(),
        journal_path=tmp_path / "recover.json",
        os_store=Mock(return_value=42),
    )
    run.prime()
    return run, db, os_source, db_source, clock


def test_recommendation_stays_read_only_then_manual_approval(tmp_path, sample):
    run, db, os_source, db_source, clock = make_runtime(tmp_path, sample)
    for i in range(3):
        tick(run, os_source, db_source, clock, sample, i)
    assert db.writes == []
    rec = run.get_status().recommended_action
    run.approve(str(rec.action_id))
    run.lifecycle.wait_idle()
    assert run.get_status().state == "ACTION_APPLIED"
    assert db.value == 6
    run.rollback(str(rec.action_id))
    run.lifecycle.wait_idle()
    assert db.value == 8


def test_auto_only_after_three_readings_and_persists_os(tmp_path, sample):
    run, db, os_source, db_source, clock = make_runtime(tmp_path, sample)
    run.set_mode("auto")
    for i in range(2):
        tick(run, os_source, db_source, clock, sample, i)
    assert db.writes == []
    tick(run, os_source, db_source, clock, sample, 2)
    run.lifecycle.wait_idle()
    assert db.writes == [6]
    run.flush_telemetry()
    assert run.os_store.call_count >= 1
    run.stop()
    assert db.value == 8


def test_api_approval_unknown_id_and_unbound_auto(tmp_path, sample):
    from backend.main import app
    from backend.services.live_runtime import get_runtime

    run, db, os_source, db_source, clock = make_runtime(tmp_path, sample)
    for i in range(3):
        tick(run, os_source, db_source, clock, sample, i)
    app.dependency_overrides[get_runtime] = lambda: run
    try:
        client = TestClient(app)
        assert client.post("/tuner/actions/wrong/approve").status_code == 409
        aid = str(run.get_status().recommended_action.action_id)
        assert client.post(f"/tuner/actions/{aid}/approve").status_code == 200
        run.lifecycle.wait_idle()
        assert client.get("/tuner/live-status").json()["active_action"]
        assert client.post(f"/tuner/actions/{aid}/rollback").status_code == 200
        run.lifecycle.wait_idle()
    finally:
        app.dependency_overrides.clear()
        run.stop()


def test_unbound_runtime_rejects_auto():
    from autotuner.runtime import AutotunerRuntime

    with pytest.raises(ValueError, match="bound"):
        AutotunerRuntime().set_mode("auto")


def test_telemetry_continues_while_db_apply_is_blocked(tmp_path, sample):
    import threading

    run, db, os_source, db_source, clock = make_runtime(tmp_path, sample)
    entered, release, sampled = threading.Event(), threading.Event(), threading.Event()
    original_apply, original_read = db.apply, db.read
    lock = threading.RLock()

    def slow_apply(old, new):
        with lock:
            entered.set()
            release.wait(3)
            original_apply(old, new)

    def read():
        with lock:
            return original_read()

    db.apply, db.read = slow_apply, read
    for i in range(3):
        tick(run, os_source, db_source, clock, sample, i)
    run.approve(str(run.get_status().recommended_action.action_id))
    assert entered.wait(2)

    def collect():
        tick(run, os_source, db_source, clock, sample, 3)
        sampled.set()

    thread = threading.Thread(target=collect)
    thread.start()
    try:
        assert sampled.wait(0.5), "Telemetry waited on an action's connection lock"
    finally:
        release.set()
        thread.join(3)
        run.lifecycle.wait_idle()
        run.stop()


def test_cooldown_requires_three_new_confirming_samples(tmp_path, sample):
    run, db, os_source, db_source, clock = make_runtime(tmp_path, sample)
    seconds = [0]
    run.lifecycle.clock = lambda: seconds[0]
    run.set_mode("auto")
    for i in range(3):
        seconds[0] = i * 5
        tick(run, os_source, db_source, clock, sample, i)
    run.lifecycle.wait_idle()
    for i in range(3, 9):
        seconds[0] = i * 5
        tick(run, os_source, db_source, clock, sample, i, query_latency_ms=180)
        run.lifecycle.wait_idle()
    assert run.get_status().state == "KEEP"
    for i in range(9, 16):
        seconds[0] = i * 5
        tick(run, os_source, db_source, clock, sample, i)
        run.lifecycle.wait_idle()
    assert db.writes == [6]
    seconds[0] = 80
    tick(run, os_source, db_source, clock, sample, 16)
    run.lifecycle.wait_idle()
    assert db.writes == [6, 4]
    run.stop()


def test_concurrent_manual_requests_apply_once(tmp_path, sample):
    from concurrent.futures import ThreadPoolExecutor

    run, db, os_source, db_source, clock = make_runtime(tmp_path, sample)
    for i in range(3):
        tick(run, os_source, db_source, clock, sample, i)
    aid = str(run.get_status().recommended_action.action_id)

    def approve():
        try:
            run.approve(aid)
            return True
        except ValueError:
            return False

    with ThreadPoolExecutor(max_workers=4) as pool:
        assert sum(pool.map(lambda _: approve(), range(4))) == 1
    run.lifecycle.wait_idle()
    assert db.writes == [6]
    run.stop()
