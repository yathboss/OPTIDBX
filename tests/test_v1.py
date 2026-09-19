"""Safe V1 completion contracts. DB and workload doubles are explicitly simulated."""

from unittest.mock import MagicMock, Mock

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient


def test_experiments_offline_never_fabricate_runs(monkeypatch):
    from backend.services.experiment_service import ExperimentService

    monkeypatch.setattr("db_monitor.storage.get_connection", Mock(side_effect=OSError("offline")))
    with pytest.raises(HTTPException) as error:
        ExperimentService().list_experiments()
    assert error.value.status_code == 503


def test_empty_experiments_and_missing_detail_are_empty(monkeypatch):
    from backend.services.experiment_service import ExperimentService

    conn = MagicMock()
    cur = conn.cursor.return_value.__enter__.return_value
    cur.fetchall.return_value = []
    cur.fetchone.return_value = None
    monkeypatch.setattr("db_monitor.storage.get_connection", lambda: conn)
    assert ExperimentService().list_experiments() == []
    assert ExperimentService().get_experiment("123") is None


def test_mutations_reject_untrusted_browser_origin():
    from backend.main import app

    client = TestClient(app)
    response = client.post(
        "/tuner/toggle-monitoring?active=false", headers={"Origin": "https://evil.invalid"}
    )
    assert response.status_code == 403


class Session:
    def __init__(self, pid, fail=False):
        self.value, self.pid, self.fail = 2, pid, fail
        self.writes = []

    def read(self):
        return self.value

    def capabilities(self):
        return {"backend_pid": self.pid, "backend_start": "original", "available": True}

    def apply(self, old, new):
        if self.fail:
            raise ValueError("write rejected")
        assert self.value == old
        self.value = new
        self.writes.append(new)

    def restore(self, old, applied):
        assert self.value in (old, applied)
        self.value = old
        self.writes.append(old)

    def execute_workload(self, query):
        return [(42,)]


def test_bound_group_verifies_every_owned_session():
    from workload.managed import BoundWorkloadGroup

    sessions = [Session(1), Session(2)]
    group = BoundWorkloadGroup(sessions, workload_id="test")
    assert group.try_read() == 2
    group.apply(2, 1)
    assert all(s.value == 1 for s in sessions)
    assert group.read() == 1
    group.restore(2, 1)
    assert group.read() == 2


def test_group_partial_apply_is_restorable():
    from workload.managed import BoundWorkloadGroup

    sessions = [Session(1), Session(2, fail=True)]
    group = BoundWorkloadGroup(sessions, workload_id="test")
    with pytest.raises(ValueError):
        group.apply(2, 1)
    group.restore(2, 1)
    assert all(s.value == 2 for s in sessions)


def test_group_refuses_mixed_initial_settings():
    from workload.managed import BoundWorkloadGroup

    sessions = [Session(1), Session(2)]
    sessions[1].value = 4
    with pytest.raises(ValueError):
        BoundWorkloadGroup(sessions, workload_id="test")


def test_runtime_persists_db_with_same_experiment(tmp_path, sample):
    from tests.test_phase2 import tick
    from tests.test_phase3_runtime import make_runtime

    run, db, os_source, db_source, clock = make_runtime(tmp_path, sample)
    run.experiment_id = 22
    run.db_store = Mock(return_value=1)
    tick(run, os_source, db_source, clock, sample, 0)
    run.flush_telemetry()
    run.db_store.assert_called_once()
    assert run.db_store.call_args.kwargs["experiment_id"] == 22


def test_action_outcome_remains_visible_after_cooldown(tmp_path, sample):
    from tests.test_phase3_runtime import make_runtime

    run, *_ = make_runtime(tmp_path, sample)
    run.lifecycle.record = {"outcome": "KEEP", "action": {"action_id": "last"}}
    assert run.get_status().active_action["outcome"] == "KEEP"


def test_workload_api_validates_duration_and_profile():
    from backend.main import app

    client = TestClient(app)
    assert (
        client.post(
            "/workload/start", json={"profile": "CUSTOM", "duration_seconds": 90}
        ).status_code
        == 422
    )
    assert (
        client.post(
            "/workload/start", json={"profile": "HIGH", "duration_seconds": 100000}
        ).status_code
        == 422
    )


def test_cooldown_releases_even_when_monitoring_stopped(tmp_path, sample):
    from tests.test_phase3_runtime import make_runtime

    run, *_ = make_runtime(tmp_path, sample)
    lifecycle = run.lifecycle
    lifecycle.owner = "completed"
    lifecycle.gate.acquire("completed")
    lifecycle.state = "COOLDOWN"
    lifecycle.cooldown_end = lifecycle.clock() - 1
    assert lifecycle.status()["state"] == "MONITORING"
    lifecycle.gate.acquire("next")
    lifecycle.gate.release("next")


def test_managed_start_refuses_unresolved_recovery(tmp_path, sample):
    from tests.test_phase3_runtime import make_runtime
    from workload.runner import ManagedWorkload

    run, *_ = make_runtime(tmp_path, sample)
    run.lifecycle.state = "ROLLBACK_FAILED"
    with pytest.raises(ValueError, match="recovery"):
        ManagedWorkload(run).start("LOW", 90)


def test_group_drains_inflight_query_before_mutation():
    import threading

    from workload.managed import BoundWorkloadGroup

    entered, release, applied = threading.Event(), threading.Event(), threading.Event()
    session = Session(1)

    def query(sql):
        entered.set()
        assert release.wait(2)

    session.execute_workload = query
    group = BoundWorkloadGroup([session], workload_id="drain")
    worker = threading.Thread(target=group.execute, args=(0, "SELECT 1"))
    worker.start()
    assert entered.wait(2)
    action = threading.Thread(target=lambda: (group.apply(2, 1), applied.set()))
    action.start()
    assert not applied.wait(0.05)
    assert session.value == 2
    release.set()
    worker.join(2)
    action.join(2)
    assert applied.is_set() and group.read() == 1


def test_persisted_pairing_never_reuses_or_fabricates_samples():
    from backend.services.history import pair_records

    db = [{"timestamp": "2026-09-19T10:00:00.5Z", "query_latency_ms": 10}]
    os = [
        {"timestamp": "2026-09-19T10:00:00Z", "cpu_percent": 20},
        {"timestamp": "2026-09-19T10:00:00.7Z", "cpu_percent": 30},
        {"timestamp": "2026-09-19T10:00:10Z", "cpu_percent": 40},
    ]
    paired = pair_records(os, db, max_skew=1)
    assert len(paired) == 1
    assert paired[0]["db"]["query_latency_ms"] == 10
    assert pair_records(os, db, max_skew=0.1) == []


def test_manual_approval_revalidates_persistent_recommendation(tmp_path, sample):
    from tests.test_phase2 import tick
    from tests.test_phase3_runtime import make_runtime

    run, db, os_source, db_source, clock = make_runtime(tmp_path, sample)
    for index in range(8):
        tick(run, os_source, db_source, clock, sample, index)
    rec = run.get_status().recommended_action
    run.approve(str(rec.action_id))
    run.lifecycle.wait_idle()
    assert db.writes == [6]
    run.stop()


@pytest.fixture
def managed(tmp_path, sample, monkeypatch):
    import threading
    from types import SimpleNamespace

    import workload.runner as module
    from tests.test_phase3_runtime import make_runtime

    run, *_ = make_runtime(tmp_path, sample)
    run.stop, run.start, run.flush_telemetry = Mock(), Mock(), Mock()
    manager = module.ManagedWorkload(run)
    connections = []

    def connect():
        conn = MagicMock()
        conn.cursor.return_value.__enter__.return_value.fetchone.return_value = (
            "pgbench_accounts",
        )
        connections.append(conn)
        return conn

    monkeypatch.setattr("db_monitor.storage.get_connection", connect)
    start = Mock(side_effect=[100, 101])
    end = Mock()
    monkeypatch.setattr("db_monitor.storage.start_experiment", start)
    monkeypatch.setattr("db_monitor.storage.end_experiment", end)
    monkeypatch.setattr(
        module, "BoundWorkloadSession", lambda *args, **kwargs: Session(len(connections))
    )
    def thread(**kwargs):
        return Mock(is_alive=Mock(return_value=False))
    monkeypatch.setattr(
        module, "threading", SimpleNamespace(Thread=thread, current_thread=threading.current_thread)
    )
    return manager, run, connections, start, end


def test_managed_owned_start_stop_and_old_deadline(managed):
    manager, run, connections, start, end = managed
    assert manager.start("MEDIUM", 90)["clients"] == 4
    assert run.experiment_id == run.lifecycle.experiment_id == 100
    with pytest.raises(ValueError, match="already"):
        manager.start("LOW", 90)
    manager.stop()
    assert all(conn.close.called for conn in connections)
    end.assert_called_once_with(100, "COMPLETED")
    manager.start("LOW", 90)
    manager.stop(expected_experiment=100)
    assert manager.running and manager.experiment_id == 101
    manager.stop()


def test_managed_query_failure_stops_run_and_records_failure(managed):
    manager, run, connections, start, end = managed
    manager.start("LOW", 90)
    manager.group.execute = Mock(side_effect=OSError("disconnected"))
    manager._worker(0)
    assert manager.stop_event.is_set()
    assert "OSError" in manager.error
    manager.stop()
    end.assert_called_once_with(100, "FAILED")


def test_managed_success_counts_only_completed_queries(managed):
    manager, *_ = managed
    manager.start("LOW", 90)
    manager.group.execute = Mock(side_effect=lambda *args: manager.stop_event.set())
    manager._worker(0)
    assert manager.status()["completed_queries"] == 1
    manager.stop()


def test_managed_recovery_retains_original_connections(managed):
    manager, run, connections, start, end = managed
    manager.start("LOW", 90)
    run.lifecycle.state = "ROLLBACK_FAILED"
    manager.stop()
    assert manager.status()["recovery_required"]
    assert manager.connections
    assert not connections[0].close.called
    end.assert_not_called()
    run.lifecycle.state = "MONITORING"
    manager.stop()


def test_managed_failed_restore_never_closes_session(managed):
    manager, run, connections, start, end = managed
    manager.start("LOW", 90)
    run.lifecycle.record = {"outcome": "KEEP", "action": {"action_id": "x"}}
    run.rollback = Mock(side_effect=ValueError("busy"))
    manager.stop()
    assert "retained" in manager.error
    assert not connections[0].close.called
    run.lifecycle.record = None
    manager.stop()


def test_managed_partial_connection_failure_cleans_up(managed, monkeypatch):
    manager, run, connections, start, end = managed
    import db_monitor.storage as storage

    connect = storage.get_connection

    def fail_second():
        if connections:
            raise OSError("connection refused")
        return connect()

    monkeypatch.setattr(storage, "get_connection", fail_second)
    with pytest.raises(OSError):
        manager.start("MEDIUM", 90)
    assert connections[0].close.called
    assert not manager.connections
    start.assert_not_called()


def test_db_storage_failure_does_not_stop_detection(tmp_path, sample):
    from tests.test_phase2 import tick
    from tests.test_phase3_runtime import make_runtime

    run, db, os_source, db_source, clock = make_runtime(tmp_path, sample)
    run.db_store = Mock(side_effect=OSError("offline"))
    assert tick(run, os_source, db_source, clock, sample, 0) is not None
    run.flush_telemetry()
    assert run.get_status().db_persistence_status == "FAILED"


def test_invalid_db_sample_is_never_stored_as_zeros(tmp_path, sample):
    from tests.test_phase3_runtime import make_runtime

    run, db, os_source, db_source, clock = make_runtime(tmp_path, sample)
    os_source.collect_sample.return_value = sample(0)["os_metrics"]
    db_source.collect.return_value = {"timestamp": sample(0)["timestamp"]}
    run.db_store = Mock()
    assert run.tick() is None
    run.flush_telemetry()
    run.db_store.assert_not_called()


def test_group_restore_attempts_every_session_after_failure():
    from workload.managed import BoundWorkloadGroup

    sessions = [Session(1), Session(2)]
    group = BoundWorkloadGroup(sessions, workload_id="restore")
    group.apply(2, 1)
    sessions[0].restore = Mock(side_effect=ValueError("disconnected"))
    with pytest.raises(ValueError, match="could not be restored"):
        group.restore(2, 1)
    assert sessions[1].value == 2
    assert group.try_read() is None


def test_setup_never_uses_default_password(monkeypatch):
    from database.init_db import get_db_config

    monkeypatch.delenv("POSTGRES_PASSWORD", raising=False)
    monkeypatch.delenv("POSTGRES_ADMIN_PASSWORD", raising=False)
    assert get_db_config()["password"] is None
    assert get_db_config()["admin_password"] is None
