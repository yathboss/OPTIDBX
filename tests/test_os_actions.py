"""OS action tests use controlled process objects, never arbitrary machine PIDs."""

import importlib
from unittest.mock import Mock

import pytest


def framework():
    from config.config_loader import load_config

    config = load_config().os_actions.model_copy(
        update={"allowed_pids": (1234,), "allowed_cpu_ids": (0, 1), "allowed_nice_values": (0, 5)}
    )
    p = Mock()
    p.pid = 1234
    p.create_time.return_value = 10.0
    p.is_running.return_value = True
    p.uids.return_value.real = 1000
    affinity, nice = [[0, 1]], [0]

    def cpus(value=None):
        if value is not None:
            affinity[0] = value
        return affinity[0]

    def priority(value=None):
        if value is not None:
            nice[0] = value
        return nice[0]

    p.cpu_affinity.side_effect = cpus
    p.nice.side_effect = priority
    cls = importlib.import_module("actions.os_actions.process").ProcessActions
    gate = importlib.import_module("actions.guard").ActionGate()
    return (
        cls(config, process_factory=lambda pid: p, gate=gate, platform="linux", uid=1000),
        p,
        gate,
    )


@pytest.mark.parametrize("kind,value", [("affinity", [0]), ("nice", 5)])
def test_apply_verify_restore(kind, value):
    actions, proc, gate = framework()
    result = actions.apply(1234, 10.0, kind, value)
    assert result["status"] == "APPLIED"
    assert gate.busy
    assert actions.restore(result["action_id"])["status"] == "RESTORED"
    assert not gate.busy


def test_reused_pid_unsafe_target_and_bounds_fail_closed():
    actions, proc, gate = framework()
    for pid, start, kind, value in [
        (1, 10, "nice", 5),
        (1234, 11, "nice", 5),
        (1234, 10, "affinity", []),
        (1234, 10, "affinity", [3]),
        (1234, 10, "nice", -20),
    ]:
        assert actions.apply(pid, start, kind, value)["status"] == "REJECTED"
    assert not gate.busy


def test_reuse_during_restore_does_not_touch_new_process():
    actions, proc, gate = framework()
    result = actions.apply(1234, 10.0, "nice", 5)
    proc.is_running.return_value = False
    assert actions.restore(result["action_id"])["status"] == "RESTORE_FAILED"
    assert gate.busy


def test_shared_gate_prevents_stacking_db_and_os():
    actions, proc, gate = framework()
    gate.acquire("db")
    assert actions.apply(1234, 10.0, "nice", 5)["status"] == "REJECTED"
    assert gate.busy


def test_permission_failure_and_restore_failure_are_structured():
    actions, proc, gate = framework()
    proc.nice.side_effect = [0, PermissionError("denied"), 0, PermissionError("restore denied")]
    result = actions.apply(1234, 10.0, "nice", 5)
    assert result["status"] == "RESTORE_FAILED"
    assert result["error"] == "PermissionError"
    assert gate.busy


def test_read_unknown_restore_unsupported_and_verification_failure():
    actions, proc, gate = framework()
    assert actions.read(1234, 10)["nice"] == 0
    assert actions.read(1, 10)["status"] == "REJECTED"
    assert actions.restore("missing")["status"] == "REJECTED"
    assert actions.apply(1234, 10, "cgroup", 1)["status"] == "REJECTED"
    proc.nice.side_effect = lambda value=None: 0
    result = actions.apply(1234, 10, "nice", 5)
    assert result["status"] == "RESTORED"
    assert "verification" in result["reason"]
    assert actions.restore(result["action_id"])["status"] == "RESTORED"


def test_cgroup_detection_is_read_only_scaffold(tmp_path):
    from actions.os_actions.process import cgroup_capabilities

    assert cgroup_capabilities(tmp_path)["version"] is None
    (tmp_path / "cgroup.controllers").write_text("cpu memory io")
    (tmp_path / "cgroup.subtree_control").touch()
    result = cgroup_capabilities(tmp_path)
    assert result["version"] == 2
    assert result["controllers"] == ["cpu", "memory", "io"]
    assert not result["apply_supported"]
    assert not result["delegation_verified"]
    assert (tmp_path / "cgroup.subtree_control").read_text() == ""
