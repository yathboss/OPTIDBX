"""Pair fresh interval readings without changing either provider's timestamp."""

from datetime import UTC, datetime

from autotuner.models import CombinedTelemetry, DBMetrics, OSMetrics
from config.config_loader import AppConfig


class TelemetryCoordinator:
    def __init__(self, config: AppConfig):
        self.config = config.monitoring
        self._last_os: datetime | None = None
        self._last_db: datetime | None = None

    def combine(self, os_metrics, db_metrics, *, now: datetime | None = None) -> CombinedTelemetry:
        os_sample = OSMetrics.model_validate(os_metrics)
        db_sample = DBMetrics.model_validate(db_metrics)
        now = now or datetime.now(UTC)
        if now.tzinfo is None:
            raise ValueError("coordinator clock must be timezone-aware")
        os_time, db_time = os_sample.timestamp, db_sample.timestamp
        if abs((os_time - db_time).total_seconds()) > self.config.max_timestamp_skew_seconds:
            raise ValueError("OS and DB timestamp skew exceeds the configured tolerance")
        for timestamp, previous in [(os_time, self._last_os), (db_time, self._last_db)]:
            age = (now - timestamp).total_seconds()
            if age > self.config.max_sample_age_seconds:
                raise ValueError("telemetry is stale")
            if age < -self.config.max_timestamp_skew_seconds:
                raise ValueError("telemetry timestamp is in the future")
            if previous is not None and timestamp <= previous:
                raise ValueError("both telemetry sources must be newer than their last reading")
        combined = CombinedTelemetry(timestamp=max(os_time, db_time),
                                     os_metrics=os_sample, db_metrics=db_sample)
        self._last_os, self._last_db = os_time, db_time
        return combined
