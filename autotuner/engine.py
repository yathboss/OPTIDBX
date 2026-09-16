"""Synchronous, in-memory recommendation engine for one telemetry stream."""

import logging
from collections import deque
from typing import Any

from autotuner.action_selector import select_action
from autotuner.detectors.cpu_detector import detect_cpu, is_cpu_candidate
from autotuner.models import BottleneckType, CombinedTelemetry, EngineResult
from config.config_loader import AppConfig, load_config

logger = logging.getLogger(__name__)


class AutotunerEngine:
    def __init__(self, config: AppConfig | None = None):
        self.config = load_config() if config is None else config
        self.recent_readings: deque[CombinedTelemetry] = deque(
            maxlen=self.config.monitoring.history_size
        )
        self._consecutive = 0

    def process(
        self,
        telemetry: CombinedTelemetry | dict[str, Any] | None,
        *,
        current_parallelism: int | None = None,
    ) -> EngineResult:
        """Validate a sample, update confirmation, and return a JSON-serializable snapshot."""
        try:
            sample = CombinedTelemetry.model_validate(telemetry)
            if self.recent_readings and sample.timestamp <= self.recent_readings[-1].timestamp:
                raise ValueError("telemetry timestamp must be newer than the previous sample")
        except ValueError:
            self._consecutive = 0
            logger.warning("Invalid or missing telemetry", extra={"event": "invalid_telemetry"})
            raise

        if self.recent_readings:
            gap = (sample.timestamp - self.recent_readings[-1].timestamp).total_seconds()
            if gap > self.config.monitoring.interval_seconds * 1.5:
                self._consecutive = 0
                logger.info("Telemetry gap reset confirmation", extra={"event": "telemetry_gap"})
        self.recent_readings.append(sample)
        logger.info(
            "Telemetry received",
            extra={"event": "telemetry_received", "sample_timestamp": sample.timestamp.isoformat()},
        )
        required = self.config.monitoring.consecutive_bad_readings
        candidate = is_cpu_candidate(sample, self.config.thresholds)
        self._consecutive = min(self._consecutive + 1, required) if candidate else 0
        if candidate:
            logger.info(
                "CPU bottleneck candidate",
                extra={
                    "event": "bottleneck_candidate",
                    "consecutive": self._consecutive,
                    "required": required,
                },
            )
        bottleneck = detect_cpu(sample, self.config.thresholds, self._consecutive, required)
        confirmed = bottleneck.bottleneck_type != BottleneckType.NONE
        if confirmed:
            logger.info("CPU bottleneck confirmed", extra={"event": "bottleneck_confirmed"})
        action = select_action(bottleneck, self.config, current_parallelism)
        if action is not None:
            logger.info(
                "Recommendation created",
                extra={
                    "event": "recommendation_created",
                    "action_id": str(action.action_id),
                    "parameter": action.parameter,
                    "old_value": action.old_value,
                    "new_value": action.new_value,
                },
            )
        return EngineResult(
            bottleneck=bottleneck,
            recommended_action=action,
            consecutive_bad_readings=self._consecutive,
            state="RECOMMENDATION" if confirmed else "CANDIDATE" if candidate else "MONITORING",
        )
