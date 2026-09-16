"""Real telemetry loop shared by CLI and FastAPI; no parameter modification."""

import logging
import threading
import time
from collections import deque
from datetime import UTC, datetime

from autotuner.engine import AutotunerEngine
from autotuner.telemetry_coordinator import TelemetryCoordinator
from config.config_loader import load_config

logger = logging.getLogger(__name__)


class AutotunerRuntime:
    def __init__(self, config=None, *, os_collector=None, db_collector=None,
                 recommendation_store=None, clock=None, experiment_id=None):
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
        self._persistence = "NOT_REQUESTED"

    def prime(self):
        # psutil CPU baselines are thread-specific; prime in the sampling thread.
        if self.os_collector is None:
            from os_monitor.collector import OSMetricsCollector
            self.os_collector = OSMetricsCollector(self.config.monitoring.interval_seconds)
        if self.db_collector is None:
            from db_monitor.collector import DBMetricsCollector
            self.db_collector = DBMetricsCollector()
        self.os_collector.warm_up()
        self.db_collector.warm_up()
        self._primed = True

    def _invalidate(self, reason):
        with self._lock:
            self.engine.invalidate(reason)
            self._persistence = "NOT_REQUESTED"

    def tick(self):
        """Read one full interval; provider failures clear the detection streak."""
        with self._tick_lock:
            try:
                if not self._primed:
                    self.prime()
                    return None
                db_metrics = self.db_collector.collect()
                os_metrics = self.os_collector.collect_sample()
                telemetry = self.coordinator.combine(os_metrics, db_metrics, now=self.clock())
            except Exception as exc:
                self._invalidate(f"Telemetry unavailable: {type(exc).__name__}")
                logger.warning("Telemetry interval rejected (%s)", type(exc).__name__,
                               extra={"event": "invalid_telemetry"})
                self._primed = False
                return None
            try:
                current = self.db_collector.get_current_parallelism()
            except Exception:
                current = None
            with self._lock:
                try:
                    result = self.engine.process(telemetry, current_parallelism=current)
                except ValueError:
                    self._primed = False
                    return None
                self._history.append(telemetry)
                action = result.recommended_action
                if action is None:
                    self._persistence = "NOT_REQUESTED"
                elif not self._actions or self._actions[-1].recommended_action.action_id != action.action_id:
                    self._actions.append(result)
                    self._persistence = "NOT_REQUESTED"
                if (action is not None and action.new_value is not None and self.store is not None
                        and self._last_saved != action.action_id):
                    # One attempt per ID, including ambiguous commit failures. No blind retry.
                    self._last_saved = action.action_id
                    try:
                        self.store(result, experiment_id=self.experiment_id)
                        self._persistence = "SAVED"
                    except Exception:
                        self._persistence = "FAILED"
                        logger.warning("Recommendation persistence failed",
                                       extra={"event": "recommendation_storage_failed"})
                return result

    def get_status(self):
        with self._lock:
            status = self.engine.get_status()
            if status.timestamp is not None:
                age = (self.clock() - status.timestamp).total_seconds()
                if age > self.config.monitoring.max_sample_age_seconds:
                    self.engine.invalidate("Latest telemetry is stale")
                    status = self.engine.get_status()
            return status.model_copy(update={
                "running": self._thread is not None and self._thread.is_alive(),
                "persistence_status": self._persistence,
            })

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
            remaining = max(0, self.config.monitoring.interval_seconds - (time.monotonic() - started))
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
        thread = self._thread
        if thread is not None and thread is not threading.current_thread():
            thread.join(timeout=10)
        self._invalidate("Monitoring stopped")
