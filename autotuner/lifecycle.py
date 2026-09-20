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
        self.baseline_end_mono = None
        self.before_owned = None
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
        with self.lock:
            snapshot = deepcopy(self.record)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temp = self.path.with_suffix(".tmp")
        with temp.open("w", encoding="utf-8") as handle:
            json.dump(snapshot, handle)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp, self.path)

    def _save(self):
        if self.store is None:
            raise ValueError("Action audit storage is unavailable")
        with self.lock:
            snapshot = deepcopy(self.record)
        self.store(snapshot, experiment_id=self.experiment_id)
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
            # Validate BEFORE acquiring the action gate or mutating a setting.
            self._prepare_owned_baseline()
            self.owner = str(action.action_id)
            self.gate.acquire(self.owner)
            self.record = {
                "action": action.model_dump(mode="json"),
                "before": before,
                "baseline_samples": len(baseline),
                "baseline_started_at": times[0].isoformat(),
                "baseline_ended_at": times[-1].isoformat(),
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
            # Freeze steady-state evidence before read/apply barriers interrupt admission.
            self._prepare_owned_baseline()
            if self.before_owned is not None:
                self.record["before_owned"] = deepcopy(self.before_owned)
                self.record["owned_baseline_end_monotonic"] = self.baseline_end_mono
                self.record["owned_window_seconds"] = self._owned_window_seconds()
                self.record["baseline_warmup_seconds"] = self.config.tuning.baseline_warmup_seconds
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
                self.record["verified_applied_value"] = action["new_value"]
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
        with self.lock:
            self.record["after"] = after
            self.record["observation_samples"] = len(self.after)
            self.record["observation_elapsed_seconds"] = self.clock() - self.applied_at
        before = self.record["before"]
        cfg = self.config.tuning

        # OS resource-degradation guard from telemetry applies regardless of signal source.
        resource_degraded = False
        for key in ("cpu_percent", "memory_percent", "disk_read_bytes", "disk_write_bytes"):
            floor = cfg.disk_noise_floor_bytes if key.startswith("disk") else 1
            resource_degraded |= (
                after[key]
                > before[key] + max(before[key], floor) * cfg.resource_degradation_percent / 100
            )

        # Judge benefit from real owned-workload client measurements when available;
        # Legacy executors without the owned-measurement contract retain telemetry evaluation.
        # A broken owned contract must NEVER silently fall back to a different signal.
        owned = self._owned_evaluation(cfg)
        if owned is not None:
            with self.lock:
                self.record["evaluation_source"] = "OWNED_WORKLOAD"
                self.record["keep_policy"] = cfg.keep_policy
                self.record["before_owned"] = owned["before"]
                self.record["after_owned"] = owned["after"]
                if not owned["insufficient"]:
                    self.record["owned_change"] = {
                        "qps_percent": owned["qps_change_percent"],
                        "p95_percent": owned["p95_change_percent"],
                    }
            if owned["insufficient"]:
                self._rollback("Insufficient owned-workload measurements during observation")
                return
            improved, degraded, detail = owned["improved"], owned["degraded"], owned["detail"]
        else:
            with self.lock:
                self.record["evaluation_source"] = "DATABASE_TELEMETRY"
            evaluation = PerformanceEvaluator(
                cfg.improvement_percent, cfg.improvement_percent
            ).compare(
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
            improved = (
                evaluation.latency_change_percent <= -cfg.improvement_percent
                or evaluation.throughput_change_percent >= cfg.improvement_percent
            ) and after["throughput_tps"] > 0
            detail = (
                f"latency {evaluation.latency_change_percent:+}%, "
                f"throughput {evaluation.throughput_change_percent:+}%"
            )

        if not improved or degraded or resource_degraded or self.cancel_requested:
            reason = "Degraded or insufficient improvement across observation metrics"
            if detail:
                reason += f" ({detail})"
            self._rollback(reason)
            return
        try:
            if self.executor.read() != self.record["action"]["new_value"]:
                raise ValueError("Workload setting drifted during observation")
            self._finish(
                "KEEP",
                "Improvement met configured tolerance without resource degradation: " + detail,
            )
        except Exception as exc:
            self._rollback(f"Keep verification/storage failed: {type(exc).__name__}")

    def _owned_evaluation(self, cfg):
        """Compare pre-apply vs post-apply owned-workload windows; None if unbound.

        Uses client-observed p95 latency and QPS from the bound workload itself,
        which reducing parallelism can actually move, unlike database-wide telemetry.
        """
        window = getattr(self.executor, "window", None)
        if window is None:
            return None
        settle = self.config.monitoring.interval_seconds
        before, after = deepcopy(self.before_owned), None
        try:
            # Equal, fixed-length windows. Later scheduler callbacks do not enlarge the sample.
            start = self.applied_at + settle
            end = start + self._owned_window_seconds()
            if self.clock() >= end:
                after = window(start, end)
        except Exception:
            logger.warning("Owned observation measurements unavailable")
        insufficient = not self._valid_owned(before) or not self._valid_owned(after)
        if insufficient:
            # Invalid external summaries must not make the status API itself fail JSON encoding.
            def safe_summary(summary):
                try:
                    json.dumps(summary, allow_nan=False)
                    return summary if isinstance(summary, dict) else None
                except (ValueError, TypeError):
                    return None
            return {
                "before": safe_summary(before),
                "after": safe_summary(after),
                "improved": False,
                "degraded": False,
                "insufficient": True,
                "detail": "insufficient owned samples",
            }
        p95_change = (after["p95_latency_ms"] / before["p95_latency_ms"] - 1) * 100
        qps_change = (after["qps"] / before["qps"] - 1) * 100
        if not math.isfinite(p95_change) or not math.isfinite(qps_change):
            return {"before": before, "after": after, "insufficient": True,
                    "improved": False, "degraded": False, "detail": "nonfinite changes"}
        errors_rose = after.get("error_rate", 0) > before.get("error_rate", 0)
        keep, detail = self._keep_decision(cfg, qps_change, p95_change, errors_rose)
        return {
            "before": before,
            "after": after,
            # Fold the whole owned decision into one signal; the caller still applies
            # the independent OS resource-degradation and cancellation vetoes on top.
            "improved": keep,
            "degraded": not keep,
            "insufficient": False,
            "detail": detail,
            "qps_change_percent": round(qps_change, 1),
            "p95_change_percent": round(p95_change, 1),
        }

    def _owned_window_seconds(self):
        return self.config.tuning.observation_window_seconds - self.config.monitoring.interval_seconds

    def _valid_owned(self, value):
        if not isinstance(value, dict) or value.get("truncated"):
            return False
        for key in ("qps", "p95_latency_ms", "successful_queries", "elapsed_seconds"):
            number = value.get(key)
            if not isinstance(number, (int, float)) or not math.isfinite(number) or number <= 0:
                return False
        rate = value.get("error_rate")
        return (
            isinstance(rate, (int, float)) and math.isfinite(rate) and 0 <= rate <= 1
            and value["successful_queries"] >= self.config.tuning.minimum_owned_queries
            and abs(value["elapsed_seconds"] - self._owned_window_seconds()) < 0.001
        )

    def _prepare_owned_baseline(self):
        if getattr(self.executor, "window", None) is None:
            self.before_owned = None
            return
        end = self.clock()
        start = end - self._owned_window_seconds()
        try:
            earliest = self.executor.earliest()
            if (earliest is None or not math.isfinite(earliest)
                    or self._owned_window_seconds() <= 0
                    or earliest > start - self.config.tuning.baseline_warmup_seconds):
                raise ValueError("Owned baseline is warming up; wait for a complete warm baseline")
            baseline = self.executor.window(start, end)
            if not self._valid_owned(baseline):
                raise ValueError("Insufficient owned baseline measurements; wait before applying")
        except ValueError:
            raise
        except Exception as exc:
            raise ValueError("Owned baseline measurements unavailable") from exc
        self.before_owned = deepcopy(baseline)
        self.baseline_end_mono = end

    def _keep_decision(self, cfg, qps_change, p95_change, errors_rose):
        """Policy-driven KEEP/ROLLBACK from owned throughput and latency changes."""
        policy = cfg.keep_policy
        net = cfg.throughput_weight * qps_change - cfg.latency_weight * p95_change
        detail = f"{policy}: qps {qps_change:+.1f}%, p95 {p95_change:+.1f}%"
        if policy == "net_benefit":
            detail += f", net {net:+.1f}%"
        # A latency blowout or a new error rate is never worth keeping, any policy.
        if errors_rose:
            return False, "errors increased; " + detail
        if p95_change >= min(cfg.max_latency_regression_percent, cfg.degradation_percent):
            return False, "latency regressed past cap; " + detail
        if qps_change <= -cfg.degradation_percent:
            return False, "throughput regressed past cap; " + detail
        if policy == "latency_first":
            keep = p95_change <= -cfg.improvement_percent and qps_change > -cfg.degradation_percent
        elif policy == "throughput_first":
            keep = qps_change >= cfg.improvement_percent
        else:  # net_benefit: a real net win with neither axis falling off a cliff.
            keep = net >= cfg.improvement_percent and qps_change > -cfg.degradation_percent
        return keep, detail

    def _finish(self, state, reason):
        if state == "KEEP" and self.cancel_requested:
            raise ValueError("Observation was interrupted")
        with self.lock:
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
            with self.lock:
                self.record["verified_restored_value"] = action["old_value"]
            self._finish("ROLLBACK", reason)
        except Exception as exc:
            self.error = f"Rollback failed: {type(exc).__name__}: {exc}"
            with self.lock:
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
            if (
                self.state in ("KEEP", "ROLLBACK", "FAILED", "COOLDOWN")
                and self.cooldown_end is not None
                and self.clock() >= self.cooldown_end
                and (self.future is None or self.future.done())
            ):
                if self.state != "COOLDOWN":
                    self._transition("COOLDOWN")
                self._transition("MONITORING")
                if self.owner:
                    self.gate.release(self.owner)
                    self.owner = None
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
