from datetime import UTC, datetime, timedelta

import pytest


@pytest.fixture
def sample():
    """Aligned interval-end telemetry; all counters cover the preceding five seconds."""

    def make(index=0, **changes):
        timestamp = (datetime(2026, 1, 1, tzinfo=UTC) + timedelta(seconds=index * 5)).isoformat()
        os_metrics = dict(
            timestamp=timestamp,
            cpu_percent=94,
            memory_percent=60,
            disk_read_bytes=100,
            disk_write_bytes=200,
            context_switches=4200,
        )
        db_metrics = dict(
            timestamp=timestamp,
            query_latency_ms=260,
            throughput_tps=100,
            temp_files_bytes=0,
            active_workers=8,
        )
        for key, value in changes.items():
            (os_metrics if key in os_metrics else db_metrics)[key] = value
        return dict(timestamp=timestamp, os_metrics=os_metrics, db_metrics=db_metrics)

    return make
