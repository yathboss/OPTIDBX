"""Asynchronous, fail-closed execution around the existing pure detector.

Disk journal is written before mutation. SQL audit is required before applying.
An unresolved journal blocks new actions after process restart. Timers advance
from monotonic time; UTC timestamps validate measurement intervals only.
"""

import json
import logging
import math
import os
import threading
import time
from collections import deque
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from pathlib import Path
from statistics import mean

from actions.guard import GLOBAL_ACTION_GATE
from autotuner.models import TuningAction
from experiments.evaluator import PerformanceEvaluator
from experiments.metrics import WorkloadMetrics

logger = logging.getLogger(__name__)


def summarize(samples):
    return {
        "query_latency_ms": mean(s.db_metrics.query_latency_ms for s in samples),
        "throughput_tps": mean(s.db_metrics.throughput_tps for s in samples),
        "cpu_percent": mean(s.os_metrics.cpu_percent for s in samples),
        "memory_percent": mean(s.os_metrics.memory_percent for s in samples),
        "disk_read_bytes": mean(s.os_metrics.disk_read_bytes for s in samples),
        "disk_write_bytes": mean(s.os_metrics.disk_write_bytes for s in samples),
    }


class ActionLifecycle:
    def __init__(
        self,
        config,
        executor,
        *,
        gate=None,
        journal_path=None,
        store=None,
        monotonic=None,
        experiment_id=None,
    ):
        self.config = config
        self.executor = executor
        self.gate = gate or GLOBAL_ACTION_GATE
        self.path = Path(journal_path or ".optidbx/action-recovery.json")
        self.store = store
        self.clock = monotonic or time.monotonic
        self.experiment_id = experiment_id
        self.lock = threading.RLock()
        self.pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="OptiDBXAction")
        self.future = None
        self.state = "MONITORING"
        self.record = None
        self.error = None
        self.persistence = "NOT_REQUESTED"
        self.records = deque(maxlen=config.monitoring.history_size)
        self.after = []
        self.applied_at = None
        self.deadline = None
        self.cooldown_end = None
        self.last_timestamp = None
        self.cancel_requested = False
        self.owner = None
        self.last_received = None
        self.watchdog = None
        if self.path.exists():
            self.state = "ROLLBACK_FAILED"
            self.error = "Unresolved recovery journal; bind the original session and roll back"
            try:
                recovered = json.loads(self.path.read_text(encoding="utf-8"))
                TuningAction.model_validate(recovered["action"])
                if (
                    not isinstance(recovered["transitions"], list)
                    or not isinstance(recovered["scope"], dict)
                    or not isinstance(recovered["before"], dict)
                ):
                    raise ValueError("Invalid recovery envelope")
                self.record = recovered
                self.experiment_id = recovered.get("experiment_id", experiment_id)
                self.records.append(self.record)
            except (OSError, ValueError, KeyError, TypeError):
                self.error = "Unreadable recovery journal; manual recovery required"
            self.owner = f"recovery:{self.path.resolve()}"
            try:
                self.gate.acquire(self.owner)
            except ValueError:
                self.owner = None  # Another runtime already blocks this process.

    def capabilities(self):
        if self.executor is None:
            return {"available": False, "reason": "No explicitly bound workload connection"}
        return self.executor.capabilities()

    def _journal(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temp = self.path.with_suffix(".tmp")
        with temp.open("w", encoding="utf-8") as handle:
            json.dump(self.record, handle)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp, self.path)

    def _save(self):
        if self.store is None:
            raise ValueError("Action audit storage is unavailable")
        self.store(deepcopy(self.record), experiment_id=self.experiment_id)
        self.persistence = "SAVED"

    def _transition(self, state):
        with self.lock:
            self.state = state
            if self.record is not None:
                self.record["state"] = state
                self.record["transitions"].append(state)
            logger.info("Action lifecycle: %s", state, extra={"event": "action_state"})

    def _schedule(self, function, *args):
        if self.future is not None and not self.future.done():
            raise ValueError("An action request is already executing")
        self.future = self.pool.submit(function, *args)

    def wait_idle(self):
        """Wait for a bounded action call (test/shutdown helper, never telemetry)."""
        if self.future is not None:
            self.future.result(timeout=15)

    def approve(self, action, history, *, now, automatic=False):
        with self.lock:
            if self.state != "MONITORING" or not self.capabilities().get("available"):
                raise ValueError("Action unavailable, busy, cooling down, or recovery unresolved")
            action = TuningAction.model_validate(action)
            safe = self.config.safe_values.max_parallel_workers_per_gather
            if (
                action.status != "RECOMMENDED"
                or action.old_value not in safe
                or safe.index(action.old_value) == 0
                or action.new_value != safe[safe.index(action.old_value) - 1]
            ):
                raise ValueError("No concrete next approved value")
            n = self.config.tuning.baseline_samples
            baseline = list(history)[-n:]
            interval = self.config.monitoring.interval_seconds
            if len(baseline) < n:
                raise ValueError("Insufficient baseline")
            times = [s.timestamp for s in baseline]
            age = (now - times[-1]).total_seconds()
            if (
                not 0 <= age <= self.config.monitoring.max_sample_age_seconds
                or not times[0] <= action.timestamp <= times[-1]
                or any(
                    not interval * 0.5 <= (b - a).total_seconds() <= interval * 1.5
                    for a, b in zip(times, times[1:], strict=False)
                )
            ):
                raise ValueError("Stale or discontinuous baseline/recommendation")
            before = summarize(baseline)
            if before["query_latency_ms"] <= 0 or before["throughput_tps"] <= 0:
                raise ValueError("Insufficient workload baseline")
            self.owner = str(action.action_id)
            self.gate.acquire(self.owner)
            self.record = {
                "action": action.model_dump(mode="json"),
                "before": before,
                "after": None,
                "automatic": automatic,
                "transitions": [],
                "scope": self.capabilities(),
                "experiment_id": self.experiment_id,
                "reason": action.reason,
            }
            self.records.append(self.record)
            self.after = []
            self.cancel_requested = False
            self.error = None
            self.last_timestamp = times[-1]
            self._transition("RECOMMENDATION_READY")
            self._schedule(self._apply)

    def _apply(self):
        action = self.record["action"]
        attempted = False
        try:
            if self.executor.read() != action["old_value"]:
                raise ValueError("Workload setting changed since recommendation")
            self._journal()
            self._save()  # Fail before mutation if audit storage is unavailable.
            if self.cancel_requested:
                raise ValueError("Action cancelled before apply")
            attempted = True  # Includes ambiguous network errors after a successful SET.
            self.executor.apply(action["old_value"], action["new_value"])
            if self.executor.read() != action["new_value"]:
                raise ValueError("Apply verification failed")
            with self.lock:
                self.applied_at = self.clock()
                self.last_received = self.applied_at
                self.deadline = self.applied_at + self.config.tuning.observation_window_seconds
                self._transition("ACTION_APPLIED")
            self._journal()
            self._save()
            if self.cancel_requested:
                self._rollback("Monitoring interrupted during apply")
            else:
                self.watchdog = threading.Thread(
                    target=self._watch, daemon=True, name="OptiDBXActionWatchdog"
                )
                self.watchdog.start()
        except Exception as exc:
            self.error = f"Apply failed: {type(exc).__name__}: {exc}"
            self.persistence = "FAILED"
            if attempted:
                self._rollback(self.error)
            else:
                self._finish("FAILED", self.error)

    def advance(self, sample, *, now):
        with self.lock:
            if self.future is not None and not self.future.done():
                return
            if self.state in ("KEEP", "ROLLBACK", "FAILED"):
                self._transition("COOLDOWN")
            if self.state == "COOLDOWN":
                if self.clock() >= self.cooldown_end:
                    self._transition("MONITORING")
                    if self.owner:
                        self.gate.release(self.owner)
                        self.owner = None
                return
            if self.state not in ("ACTION_APPLIED", "OBSERVING"):
                return
            interval = self.config.monitoring.interval_seconds
            age = (now - sample.timestamp).total_seconds()
            gap = (sample.timestamp - self.last_timestamp).total_seconds()
            if (
                not 0 <= age <= self.config.monitoring.max_sample_age_seconds
                or not 0 < gap <= 1.5 * interval
            ):
                self._schedule(self._rollback, "Missing, duplicate or stale observation interval")
                return
            self.last_timestamp = sample.timestamp
            self.last_received = self.clock()
            self._transition("OBSERVING")
            # Exclude intervals that might include pre-apply work.
            if self.clock() - self.applied_at >= interval:
                self.after.append(sample)
            if self.clock() >= self.deadline:
                self._schedule(self._evaluate)

    def check_deadlines(self):
        with self.lock:
            if (
                self.state in ("ACTION_APPLIED", "OBSERVING")
                and self.last_received is not None
                and self.clock() - self.last_received
                > self.config.monitoring.max_sample_age_seconds
            ):
                self.telemetry_missing("Telemetry watchdog expired")

    def _watch(self):
        while self.state in ("ACTION_APPLIED", "OBSERVING", "RECOMMENDATION_READY"):
            time.sleep(0.25)
            self.check_deadlines()

    def telemetry_missing(self, reason):
        with self.lock:
            if self.state in ("RECOMMENDATION_READY", "ACTION_APPLIED", "OBSERVING"):
                self.cancel_requested = True
                if self.future is None or self.future.done():
                    self._schedule(self._rollback, reason)

    def _evaluate(self):
        if len(self.after) < self.config.tuning.minimum_observation_samples:
            self._rollback("Insufficient observation evidence")
            return
        after = summarize(self.after)
        self.record["after"] = after
        before = self.record["before"]
        cfg = self.config.tuning
        evaluation = PerformanceEvaluator(cfg.improvement_percent, cfg.improvement_percent).compare(
            WorkloadMetrics(
                **{k: before[k] for k in ("query_latency_ms", "throughput_tps", "cpu_percent")}
            ),
            WorkloadMetrics(
                **{k: after[k] for k in ("query_latency_ms", "throughput_tps", "cpu_percent")}
            ),
        )
        degraded = after["query_latency_ms"] > before["query_latency_ms"] * (
            1 + cfg.degradation_percent / 100
        ) or after["throughput_tps"] < before["throughput_tps"] * (
            1 - cfg.degradation_percent / 100
        )
        for key in ("cpu_percent", "memory_percent", "disk_read_bytes", "disk_write_bytes"):
            floor = cfg.disk_noise_floor_bytes if key.startswith("disk") else 1
            degraded |= (
                after[key]
                > before[key] + max(before[key], floor) * cfg.resource_degradation_percent / 100
            )
        improved = (
            evaluation.latency_change_percent <= -cfg.improvement_percent
            or evaluation.throughput_change_percent >= cfg.improvement_percent
        )
        if not improved or degraded or self.cancel_requested or after["throughput_tps"] <= 0:
            self._rollback("Degraded or insufficient improvement across observation metrics")
            return
        try:
            if self.executor.read() != self.record["action"]["new_value"]:
                raise ValueError("Workload setting drifted during observation")
            self._finish(
                "KEEP",
                "Improvement met configured tolerance without resource degradation: "
                f"latency {evaluation.latency_change_percent:+}%, "
                f"throughput {evaluation.throughput_change_percent:+}%",
            )
        except Exception as exc:
            self._rollback(f"Keep verification/storage failed: {type(exc).__name__}")

    def _finish(self, state, reason):
        if state == "KEEP" and self.cancel_requested:
            raise ValueError("Observation was interrupted")
        self.record["reason"] = reason
        self.record["outcome"] = state
        self._transition(state)
        try:
            self._save()
        except Exception:
            self.persistence = "FAILED"
            if state == "KEEP":
                raise
        # Keep a failed recovery journal until both restore and local cleanup succeed.
        try:
            self.path.unlink(missing_ok=True)
        except OSError as exc:
            self.error = f"Recovery journal cleanup failed: {exc}"
            self._transition("ROLLBACK_FAILED")
            return
        self.cooldown_end = self.clock() + self.config.tuning.cooldown_seconds

    def _rollback(self, reason):
        try:
            if self.capabilities() != self.record["scope"]:
                raise ValueError("Recovery workload session differs from original target")
            TuningAction.model_validate(self.record["action"])
            action = self.record["action"]
            self.executor.restore(action["old_value"], action["new_value"])
            if self.executor.read() != action["old_value"]:
                raise ValueError("Rollback effective value verification failed")
            self._finish("ROLLBACK", reason)
        except Exception as exc:
            self.error = f"Rollback failed: {type(exc).__name__}: {exc}"
            self.record["reason"] = self.error
            self._transition("ROLLBACK_FAILED")
            try:
                self._journal()
                self._save()
            except Exception:
                self.persistence = "FAILED"

    def rollback(self, action_id):
        with self.lock:
            if self.future is not None and not self.future.done():
                raise ValueError("An action request is already executing")
            if self.record is None or self.record["action"]["action_id"] != str(action_id):
                raise ValueError("Unknown action ID")
            if self.state == "MONITORING" and "KEEP" in self.record["transitions"]:
                self.gate.acquire(str(action_id))
                self.owner = str(action_id)
                self._transition("KEEP")
            if self.state not in (
                "ACTION_APPLIED",
                "OBSERVING",
                "KEEP",
                "COOLDOWN",
                "ROLLBACK_FAILED",
            ):
                raise ValueError("Action cannot be rolled back in this state")
            if self.owner is None:
                raise ValueError("Another runtime owns recovery")
            try:
                self._journal()  # Preserve recovery evidence before a manual restore attempt.
            except OSError as exc:
                self.error = f"Cannot record manual recovery: {type(exc).__name__}"
                self._transition("ROLLBACK_FAILED")
                raise ValueError(self.error) from exc
            self._schedule(self._rollback, "Manual rollback")

    def status(self):
        with self.lock:
            return {
                "state": self.state,
                "last_error": self.error,
                "active_action": deepcopy(self.record),
                "persistence_status": self.persistence,
                "observation_remaining_seconds": max(
                    0, math.ceil((self.deadline or 0) - self.clock())
                )
                if self.state in ("ACTION_APPLIED", "OBSERVING")
                else 0,
                "cooldown_remaining_seconds": max(
                    0, math.ceil((self.cooldown_end or 0) - self.clock())
                )
                if self.state in ("KEEP", "ROLLBACK", "FAILED", "COOLDOWN")
                else 0,
                "recovery_required": self.state == "ROLLBACK_FAILED",
            }

    def history(self):
        with self.lock:
            return deepcopy(list(self.records))
