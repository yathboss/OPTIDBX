"""Real telemetry loop with a separate, explicitly bound action lifecycle."""

import logging
import threading
import time
from collections import deque
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime

from autotuner.engine import AutotunerEngine
from autotuner.lifecycle import ActionLifecycle
from autotuner.models import DBMetrics, OSMetrics
from autotuner.telemetry_coordinator import TelemetryCoordinator
from config.config_loader import load_config

logger = logging.getLogger(__name__)


class AutotunerRuntime:
    def __init__(
        self,
        config=None,
        *,
        os_collector=None,
        db_collector=None,
        recommendation_store=None,
        clock=None,
        experiment_id=None,
        db_executor=None,
        action_store=None,
        action_gate=None,
        journal_path=None,
        os_store=None,
        db_store=None,
    ):
        self.config = config or load_config()
        self.engine = AutotunerEngine(self.config)
        self.coordinator = TelemetryCoordinator(self.config)
        self.os_collector = os_collector
        self.db_collector = db_collector
        self.store = recommendation_store
        self.clock = clock or (lambda: datetime.now(UTC))
        self.experiment_id = experiment_id
        self._lock = threading.RLock()
        self._tick_lock = threading.Lock()
        self._stop = threading.Event()
        self._thread = None
        self._primed = False
        self._history = deque(maxlen=self.config.monitoring.history_size)
        self._actions = deque(maxlen=self.config.monitoring.history_size)
        self._last_saved = None
        self._last_sample_lifecycle_state = "MONITORING"
        self._persistence = "NOT_REQUESTED"
        self.mode = "recommendation"
        self.db_executor = db_executor
        self.lifecycle = ActionLifecycle(
            self.config,
            db_executor,
            gate=action_gate,
            journal_path=journal_path,
            store=action_store,
            experiment_id=experiment_id,
        )
        self._action_error = None
        self.os_store = os_store
        self.db_store = db_store
        self._db_storage_future = None
        self._db_persistence = "NOT_REQUESTED"
        self._os_persistence = "NOT_REQUESTED"
        self._telemetry_pool = ThreadPoolExecutor(
            max_workers=1, thread_name_prefix="TelemetryStorage"
        )
        self._storage_future = None

    def prime(self):
        # psutil CPU baselines are thread-specific; prime in the sampling thread.
        if self.os_collector is None:
            from os_monitor.collector import OSMetricsCollector

            self.os_collector = OSMetricsCollector(self.config.monitoring.interval_seconds)
            if self.os_store is None:
                from os_monitor.storage import save_system_metrics

                self.os_store = save_system_metrics
        if self.db_collector is None:
            from db_monitor.collector import DBMetricsCollector

            self.db_collector = DBMetricsCollector()
        self.os_collector.warm_up()
        self.db_collector.warm_up()
        self._primed = True

    def _invalidate(self, reason):
        self.lifecycle.telemetry_missing(reason)
        with self._lock:
            self.engine.invalidate(reason)
            self._persistence = "NOT_REQUESTED"

    def tick(self):
        """Read one full interval; provider failures clear the detection streak."""
        with self._tick_lock:
            if self._stop.is_set():
                return None
            try:
                if not self._primed:
                    self.prime()
                    return None
                os_metrics = self.os_collector.collect_sample()
                self._persist_os(OSMetrics.model_validate(os_metrics))
                db_metrics = self.db_collector.collect()
                self._persist_db(DBMetrics.model_validate(db_metrics))
                telemetry = self.coordinator.combine(os_metrics, db_metrics, now=self.clock())
            except Exception as exc:
                self._invalidate(f"Telemetry unavailable: {type(exc).__name__}")
                logger.warning(
                    "Telemetry interval rejected (%s)",
                    type(exc).__name__,
                    extra={"event": "invalid_telemetry"},
                )
                self._primed = False
                return None
            try:
                # Never read/write a monitor connection as if it were the workload.
                if self.lifecycle.status()["state"] != "MONITORING":
                    current = None
                elif self.db_executor is not None:
                    reader = getattr(self.db_executor, "try_read", self.db_executor.read)
                    current = reader()
                else:
                    current = self.db_collector.get_current_parallelism()
            except Exception:
                current = None
            with self._lock:
                if self._stop.is_set():
                    return None
                prior_state = self._last_sample_lifecycle_state
                self.lifecycle.advance(telemetry, now=self.clock())
                if prior_state != "MONITORING":
                    # Confirmation must start again after cooldown; no stacked evidence.
                    self.engine.invalidate("Action lifecycle in progress")
                    if self.lifecycle.status()["state"] == "MONITORING":
                        self._history.clear()
                try:
                    result = self.engine.process(telemetry, current_parallelism=current)
                except ValueError:
                    self._primed = False
                    return None
                self._history.append(telemetry)
                action = result.recommended_action
                if action is None:
                    self._persistence = "NOT_REQUESTED"
                elif (
                    not self._actions
                    or self._actions[-1].recommended_action.action_id != action.action_id
                ):
                    self._actions.append(result)
                    self._persistence = "NOT_REQUESTED"
                if (
                    action is not None
                    and action.new_value is not None
                    and self.store is not None
                    and self._last_saved != action.action_id
                ):
                    # One attempt per ID, including ambiguous commit failures. No blind retry.
                    self._last_saved = action.action_id
                    try:
                        self.store(result, experiment_id=self.experiment_id)
                        self._persistence = "SAVED"
                    except Exception:
                        self._persistence = "FAILED"
                        logger.warning(
                            "Recommendation persistence failed",
                            extra={"event": "recommendation_storage_failed"},
                        )
                if (
                    self.mode == "auto"
                    and action is not None
                    and self.lifecycle.status()["state"] == "MONITORING"
                ):
                    try:
                        self.lifecycle.approve(
                            action, list(self._history), now=self.clock(), automatic=True
                        )
                        self._action_error = None
                    except ValueError as exc:
                        self._action_error = str(exc)
                self._last_sample_lifecycle_state = self.lifecycle.status()["state"]
                return result

    def _persist_os(self, sample):
        if self.os_store is None:
            return
        # Bound the queue: storage failure/backpressure never stalls collection.
        if self._storage_future is not None and not self._storage_future.done():
            self._os_persistence = "BACKPRESSURE"
            return
        experiment_id = self.experiment_id

        def persist():
            try:
                result = self.os_store(sample, experiment_id=experiment_id)
                self._os_persistence = "SAVED" if result is not None else "BUFFERED"
            except Exception:
                self._os_persistence = "FAILED"
                logger.warning(
                    "OS telemetry persistence failed", extra={"event": "os_storage_failed"}
                )

        self._storage_future = self._telemetry_pool.submit(persist)

    def flush_telemetry(self):
        if self._storage_future is not None:
            self._storage_future.result(timeout=10)
        if self._db_storage_future is not None:
            self._db_storage_future.result(timeout=10)

    def _persist_db(self, sample):
        if self.db_store is None:
            return
        if self._db_storage_future is not None and not self._db_storage_future.done():
            self._db_persistence = "BACKPRESSURE"
            return
        experiment_id = self.experiment_id

        def persist():
            try:
                payload = sample.model_dump() if hasattr(sample, "model_dump") else dict(sample)
                self.db_store(payload, experiment_id=experiment_id)
                self._db_persistence = "SAVED"
            except Exception:
                self._db_persistence = "FAILED"
                logger.warning(
                    "DB telemetry persistence failed", extra={"event": "db_storage_failed"}
                )

        self._db_storage_future = self._telemetry_pool.submit(persist)

    def set_mode(self, mode):
        if mode not in ("auto", "recommendation"):
            raise ValueError("Mode must be recommendation or auto")
        if mode == "auto" and not self.lifecycle.capabilities().get("available"):
            raise ValueError("Auto requires an explicitly bound workload connection")
        if self.lifecycle.status()["recovery_required"]:
            raise ValueError("Resolve failed rollback before changing modes")
        self.mode = mode
        return self.get_status()

    def approve(self, action_id):
        with self._lock:
            status = self.get_status()
            action = status.recommended_action
            if (
                not status.telemetry_available
                or action is None
                or str(action.action_id) != str(action_id)
            ):
                raise ValueError("Unknown or stale recommendation")
            # The detector retains a stable recommendation ID while readings stay bad.
            # Revalidate against the newest interval, not its original creation time.
            action = action.model_copy(update={"timestamp": self._history[-1].timestamp})
            self.lifecycle.approve(action, list(self._history), now=self.clock())
        return self.get_status()

    def bind_workload(self, executor, experiment_id):
        """Only the stopped local owner can bind; recovery cannot be bypassed."""
        with self._lock, self.lifecycle.lock:
            if (self._thread is not None and self._thread.is_alive()) or self.lifecycle.status()[
                "state"
            ] != "MONITORING":
                raise ValueError("Stop monitoring and resolve recovery/cooldown before binding")
            self.db_executor = executor
            self.lifecycle.executor = executor
            self.lifecycle.record = None  # Prior records remain in the action history.
            self.experiment_id = self.lifecycle.experiment_id = experiment_id
            self.mode = "recommendation"
            self._history.clear()
            self.engine = AutotunerEngine(self.config)

    def rollback(self, action_id):
        self.lifecycle.rollback(action_id)
        return self.get_status()

    def get_action_history(self):
        return self.lifecycle.history()

    def get_status(self):
        with self._lock:
            status = self.engine.get_status()
            if status.timestamp is not None:
                age = (self.clock() - status.timestamp).total_seconds()
                if age > self.config.monitoring.max_sample_age_seconds:
                    self.engine.invalidate("Latest telemetry is stale")
                    self.lifecycle.telemetry_missing("Latest telemetry is stale")
                    self._persistence = "NOT_REQUESTED"
                    status = self.engine.get_status()
            updates = {
                "running": self._thread is not None and self._thread.is_alive(),
                "persistence_status": self._persistence,
                "mode": self.mode,
                "capabilities": self.lifecycle.capabilities(),
                "os_persistence_status": self._os_persistence,
                "db_persistence_status": self._db_persistence,
            }
            lifecycle = self.lifecycle.status()
            updates["active_action"] = lifecycle["active_action"]
            if lifecycle["state"] != "MONITORING":
                updates.update(lifecycle)
            elif self._action_error:
                updates["last_error"] = self._action_error
            return status.model_copy(update=updates)

    def get_history(self, limit=20):
        with self._lock:
            return [sample.model_copy(deep=True) for sample in list(self._history)[-limit:]]

    def get_recommendations(self):
        with self._lock:
            return [result.model_copy(deep=True) for result in self._actions]

    def run(self, samples=None):
        """Blocking CLI loop. Samples counts valid results, not rejected intervals."""
        count = 0
        while not self._stop.is_set() and (samples is None or count < samples):
            started = time.monotonic()
            result = self.tick()
            if result is not None:
                count += 1
                yield result
            remaining = max(
                0, self.config.monitoring.interval_seconds - (time.monotonic() - started)
            )
            if self._stop.wait(remaining):
                break

    def _background(self):
        for _ in self.run():
            pass

    def start(self):
        with self._lock:
            if self._thread is not None and self._thread.is_alive():
                return
            self._stop.clear()
            self._primed = False
            self.coordinator = TelemetryCoordinator(self.config)
            self.engine = AutotunerEngine(self.config)
            self._thread = threading.Thread(target=self._background, name="OptiDBX", daemon=True)
            self._thread.start()

    def stop(self):
        self._stop.set()
        self.lifecycle.telemetry_missing("Monitoring stopped")
        thread = self._thread
        if thread is not None and thread is not threading.current_thread():
            thread.join(timeout=10)
        self._invalidate("Monitoring stopped")
        self.lifecycle.wait_idle()
