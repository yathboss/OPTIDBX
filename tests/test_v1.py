"""Safe V1 completion contracts. DB and workload doubles are explicitly simulated."""
from datetime import UTC, datetime
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
    response = client.post("/tuner/toggle-monitoring?active=false", headers={"Origin": "https://evil.invalid"})
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
    from tests.test_phase3_runtime import make_runtime
    from tests.test_phase2 import tick
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

