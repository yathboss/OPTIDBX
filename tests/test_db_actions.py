from unittest.mock import MagicMock

import pytest

from actions.db_actions.parallelism import BoundWorkloadSession


def session():
    conn = MagicMock()
    conn.autocommit, conn.closed = True, False
    state = {"value": 8, "pid": 123, "started": "original"}
    cur = conn.cursor.return_value.__enter__.return_value

    def execute(sql, params=None):
        if "pg_backend_pid" in sql:
            cur.fetchone.return_value = (state["pid"], state["started"])
        elif "current_setting" in sql:
            cur.fetchone.return_value = (str(state["value"]),)
        elif "set_config" in sql:
            assert params[0] == "max_parallel_workers_per_gather"
            state["value"] = int(params[1])

    cur.execute.side_effect = execute
    return BoundWorkloadSession(conn, (1, 2, 4, 6, 8), workload_id="controlled"), state, conn


def test_session_apply_and_restore_effective_value():
    action, state, conn = session()
    assert action.read() == 8
    action.apply(8, 6)
    assert action.read() == 6
    action.restore(8, 6)
    action.restore(8, 6)
    assert action.read() == 8
    assert action.capabilities()["scope"] == "bound_workload_session"


@pytest.mark.parametrize("old,new", [(8, 4), (1, 0), (7, 6), (6, 4)])
def test_session_rejects_non_next_or_stale_value(old, new):
    action, state, conn = session()
    with pytest.raises(ValueError):
        action.apply(old, new)
    assert state["value"] == 8


def test_identity_closed_transaction_and_external_change_guards():
    action, state, conn = session()
    state["started"] = "reused"
    with pytest.raises(ValueError):
        action.read()
    state["started"] = "original"
    state["value"] = 4
    with pytest.raises(ValueError, match="External"):
        action.restore(8, 6)
    conn.closed = True
    with pytest.raises(ValueError):
        action.read()
    conn.closed, conn.autocommit = False, False
    with pytest.raises(ValueError):
        action.read()
    with pytest.raises(ValueError):
        BoundWorkloadSession(conn, (1, 2), workload_id="x")


def test_workload_executor_and_verification_failure():
    action, state, conn = session()
    cur = conn.cursor.return_value.__enter__.return_value
    cur.description = True
    cur.fetchall.return_value = [(42,)]
    assert action.execute_workload("SELECT 42") == [(42,)]
    cur.description = None
    assert action.execute_workload("SELECT 42") is None
    cur.execute.side_effect = None
    cur.fetchone.return_value = (8,)
    action._check = lambda: None
    with pytest.raises(ValueError, match="verification"):
        action._write(6)
    with pytest.raises(ValueError, match="whitelist"):
        action._write(9)


def test_try_read_does_not_wait_for_busy_workload():
    import threading

    action, state, conn = session()
    values = []
    with action.lock:
        t = threading.Thread(target=lambda: values.append(action.try_read()))
        t.start()
        t.join(1)
    assert values == [None]
    assert action.try_read() == 8


def test_sql_action_audit_uses_existing_schema(monkeypatch):
    from db_monitor import storage

    conn = MagicMock()
    conn.cursor.return_value.__enter__.return_value.fetchone.return_value = (7,)
    monkeypatch.setattr(storage, "get_connection", lambda: conn)
    record = {
        "action": {
            "action_id": "test",
            "parameter": "max_parallel_workers_per_gather",
            "old_value": 8,
            "new_value": 6,
        },
        "automatic": False,
        "state": "ACTION_APPLIED",
        "before": {"query_latency_ms": 260, "throughput_tps": 100},
    }
    assert storage.save_action_event(record, 12) == 7
    conn.commit.assert_called_once()
    conn.commit.side_effect = OSError()
    with pytest.raises(OSError):
        storage.save_action_event(record, 12)
    conn.rollback.assert_called_once()
