"""Synchronous, in-memory recommendation engine for one telemetry stream."""

import logging
from collections import deque
from typing import Any

from autotuner.action_selector import select_action
from autotuner.detectors.cpu_detector import detect_cpu, is_cpu_candidate
from autotuner.rejection_memory import condition_signature
from autotuner.models import (
    BottleneckType,
    CombinedTelemetry,
    EngineResult,
    RuntimeStatus,
    TunerState,
)
from config.config_loader import AppConfig, load_config

logger = logging.getLogger(__name__)


class AutotunerEngine:
    def __init__(self, config: AppConfig | None = None, *, rejection_memory=None):
        self.config = load_config() if config is None else config
        self.rejection_memory = rejection_memory
        self.recent_readings: deque[CombinedTelemetry] = deque(
            maxlen=self.config.monitoring.history_size
        )
        self._consecutive = 0
        self._status = RuntimeStatus()

    def get_status(self) -> RuntimeStatus:
        return self._status.model_copy(deep=True)

    def invalidate(self, reason: str) -> None:
        if self._consecutive:
            logger.info("Candidate reset: %s", reason, extra={"event": "candidate_reset"})
        self._consecutive = 0
        self._status = RuntimeStatus(reason=reason, last_error=reason)

    def process(
        self,
        telemetry: CombinedTelemetry | dict[str, Any] | None,
        *,
        current_parallelism: int | None = None,
    ) -> EngineResult:
        """Validate a sample, update confirmation, and return a JSON-serializable snapshot."""
        try:
            sample = CombinedTelemetry.model_validate(telemetry)
            skew = abs((sample.os_metrics.timestamp - sample.db_metrics.timestamp).total_seconds())
            if skew > self.config.monitoring.max_timestamp_skew_seconds:
                raise ValueError("OS and DB timestamps exceed the configured skew tolerance")
            if self.recent_readings and sample.timestamp <= self.recent_readings[-1].timestamp:
                raise ValueError("telemetry timestamp must be newer than the previous sample")
        except ValueError:
            self.invalidate("Invalid or missing telemetry")
            logger.warning("Invalid or missing telemetry", extra={"event": "invalid_telemetry"})
            raise

        if self.recent_readings:
            gap = (sample.timestamp - self.recent_readings[-1].timestamp).total_seconds()
            if gap > self.config.monitoring.interval_seconds * 1.5:
                self.invalidate("Telemetry gap")
                logger.info("Telemetry gap reset confirmation", extra={"event": "telemetry_gap"})
        self.recent_readings.append(sample)
        logger.info(
            "Telemetry received",
            extra={"event": "telemetry_received", "sample_timestamp": sample.timestamp.isoformat()},
        )
        required = self.config.monitoring.consecutive_bad_readings
        candidate = is_cpu_candidate(sample, self.config.thresholds)
        if not candidate and self._consecutive:
            self.invalidate("Normal reading interrupted CPU contention")
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
        previous = self._status.recommended_action
        if (
            action is not None
            and previous is not None
            and (action.old_value, action.new_value) == (previous.old_value, previous.new_value)
        ):
            action = previous
        suppressed_reason = None
        if action is not None and action.new_value is not None and self.rejection_memory is not None:
            signature = condition_signature(
                sample.db_metrics.active_workers, sample.os_metrics.cpu_percent
            )
            suppressed, suppressed_reason = self.rejection_memory.is_suppressed(
                (action.old_value, action.new_value), signature, sample.timestamp
            )
            if suppressed:
                logger.info(
                    "Recommendation suppressed by rejection memory: %s",
                    suppressed_reason,
                    extra={"event": "recommendation_suppressed"},
                )
                action = None
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
        state = (
            TunerState.RECOMMENDATION_READY
            if action is not None
            else TunerState.BOTTLENECK_CONFIRMED
            if confirmed
            else TunerState.BOTTLENECK_CANDIDATE
            if candidate
            else TunerState.MONITORING
        )
        reason = bottleneck.reason
        if suppressed_reason is not None:
            reason = f"{reason} {suppressed_reason}"
        self._status = RuntimeStatus(
            state=state,
            detected_bottleneck=bottleneck.bottleneck_type,
            reason=reason,
            evidence=bottleneck.evidence,
            recommended_action=action,
            timestamp=sample.timestamp,
            consecutive_bad_readings=self._consecutive,
            telemetry_available=True,
        )
        return EngineResult(
            bottleneck=bottleneck,
            recommended_action=action,
            consecutive_bad_readings=self._consecutive,
            state=state,
        )
