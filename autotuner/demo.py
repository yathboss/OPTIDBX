"""Run with python -m autotuner.demo. Uses synthetic data; no database is needed."""

import logging
from datetime import UTC, datetime, timedelta

from autotuner.engine import AutotunerEngine
from autotuner.models import CombinedTelemetry, DBMetrics, OSMetrics


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    engine = AutotunerEngine()
    start = datetime(2026, 1, 1, tzinfo=UTC)
    for index in range(engine.config.monitoring.consecutive_bad_readings):
        timestamp = start + timedelta(seconds=index * engine.config.monitoring.interval_seconds)
        telemetry = CombinedTelemetry(
            timestamp=timestamp,
            os_metrics=OSMetrics(
                timestamp=timestamp,
                cpu_percent=94,
                memory_percent=60,
                disk_read_bytes=100,
                disk_write_bytes=200,
                context_switches=4200,
            ),
            db_metrics=DBMetrics(
                timestamp=timestamp,
                query_latency_ms=260,
                throughput_tps=100,
                temp_files_bytes=0,
                active_workers=8,
            ),
        )
        print(engine.process(telemetry, current_parallelism=8).model_dump_json())


if __name__ == "__main__":
    main()
