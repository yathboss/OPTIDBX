"""Explicit manual process actions, separate from autotuning.

psutil setters check PID plus creation time. We retain the original Process
object and also recheck liveness/identity before reads, writes and restoration.
These checks mitigate PID reuse; they cannot make several OS syscalls atomic.
"""

import os
import sys
import threading
from copy import deepcopy
from pathlib import Path
from uuid import uuid4

import psutil

from actions.guard import GLOBAL_ACTION_GATE


def cgroup_capabilities(root="/sys/fs/cgroup"):
    path = Path(root)
    try:
        controllers = (path / "cgroup.controllers").read_text().split()
        return {
            "version": 2,
            "controllers": controllers,
            "subtree_control_writable": os.access(path / "cgroup.subtree_control", os.W_OK),
            "delegation_verified": False,
            "apply_supported": False,
            "reason": "Detection scaffold only; no cgroup writes",
        }
    except OSError:
        return {
            "version": None,
            "controllers": [],
            "subtree_control_writable": False,
            "delegation_verified": False,
            "apply_supported": False,
            "reason": "cgroup v2 unavailable",
        }


class ProcessActions:
    def __init__(
        self, config, *, process_factory=psutil.Process, gate=None, platform=None, uid=None
    ):
        self.config = config
        self.factory = process_factory
        self.gate = gate or GLOBAL_ACTION_GATE
        self.platform = platform or sys.platform
        self.uid = uid if uid is not None else (os.getuid() if hasattr(os, "getuid") else None)
        self.lock = threading.RLock()
        self.receipts = {}

    def capabilities(self):
        return {
            "affinity": hasattr(psutil.Process, "cpu_affinity") and self.platform == "linux",
            "nice": self.platform == "linux",
            "cgroup": cgroup_capabilities(),
            "automatic": False,
            "allowed_pids": list(self.config.allowed_pids),
        }

    def _check(self, process, created):
        if (
            not process.is_running()
            or process.create_time() != created
            or process.uids().real != self.uid
        ):
            raise ValueError("Process exited, PID reused, or process owner changed")

    def _target(self, pid, created):
        if (
            self.platform != "linux"
            or type(pid) is not int
            or pid <= 1
            or pid == os.getpid()
            or pid not in self.config.allowed_pids
        ):
            raise ValueError("Unsupported platform or PID outside explicit whitelist")
        p = self.factory(pid)
        self._check(p, created)
        return p

    @staticmethod
    def _accessor(p, kind):
        if kind == "affinity":
            return p.cpu_affinity
        if kind == "nice":
            return p.nice
        raise ValueError("Only affinity and nice actions are supported")

    def read(self, pid, created):
        try:
            p = self._target(pid, created)
            values = {"affinity": p.cpu_affinity(), "nice": p.nice()}
            self._check(p, created)
            return {"status": "READ", "pid": pid, "create_time": created, **values}
        except Exception as exc:
            return {"status": "REJECTED", "error": type(exc).__name__, "reason": str(exc)}

    def apply(self, pid, created, kind, value):
        with self.lock:
            acquired = False
            receipt = {
                "action_id": str(uuid4()),
                "pid": pid,
                "create_time": created,
                "kind": kind,
                "new_value": value,
            }
            try:
                p = self._target(pid, created)
                access = self._accessor(p, kind)
                old = access()
                if kind == "affinity":
                    if (
                        not isinstance(value, (tuple, list))
                        or not value
                        or any(type(cpu) is not int for cpu in value)
                        or not set(value) <= set(self.config.allowed_cpu_ids)
                        or not set(value) <= set(old)
                    ):
                        raise ValueError(
                            "Affinity must be a nonempty allowed subset of current CPUs"
                        )
                    value = sorted(set(value))
                elif type(value) is not int or value not in self.config.allowed_nice_values:
                    raise ValueError("Nice value outside whitelist")
                self.gate.acquire(receipt["action_id"])
                acquired = True
                receipt.update(old_value=old, new_value=value, status="APPLYING")
                self.receipts[receipt["action_id"]] = (receipt, p)
                self._check(p, created)
                access(value)
                self._check(p, created)
                if access() != value:
                    raise ValueError("Effective process value verification failed")
                receipt["status"] = "APPLIED"
                return deepcopy(receipt)
            except Exception as exc:
                receipt.update(
                    status="RESTORE_FAILED" if acquired else "REJECTED",
                    error=type(exc).__name__,
                    reason=str(exc),
                )
                if acquired:
                    # A setter may have succeeded before verification failed.
                    return self.restore(receipt["action_id"])
                return receipt

    def restore(self, action_id):
        with self.lock:
            if action_id not in self.receipts:
                return {"status": "REJECTED", "reason": "Unknown action ID"}
            receipt, p = self.receipts[action_id]
            if receipt["status"] == "RESTORED":
                return deepcopy(receipt)
            try:
                self._check(p, receipt["create_time"])
                access = self._accessor(p, receipt["kind"])
                if access() not in (receipt["new_value"], receipt["old_value"]):
                    raise ValueError("External process setting change; refusing overwrite")
                access(receipt["old_value"])
                self._check(p, receipt["create_time"])
                if access() != receipt["old_value"]:
                    raise ValueError("Restore verification failed")
                receipt["status"] = "RESTORED"
                self.gate.release(action_id)
            except Exception as exc:
                receipt.update(status="RESTORE_FAILED", error=type(exc).__name__, reason=str(exc))
            return deepcopy(receipt)
