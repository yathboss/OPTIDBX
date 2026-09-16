"""
OptiDBX DBMS Telemetry Collector
Monitors PostgreSQL database performance and extracts real-time metrics.
Shared fields:
- timestamp
- query_latency_ms
- throughput_tps
- temp_files_bytes
- active_workers
"""

import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, Optional, Callable
import psycopg2
import yaml

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from db_monitor.storage import save_db_metrics, get_connection


def load_config_interval(default: int = 5) -> int:
    """Read metric_interval_seconds from config.yaml if present."""
    config_path = PROJECT_ROOT / "config" / "config.yaml"
    if config_path.exists():
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                data = yaml.safe_load(f)
                return int(data.get("system", {}).get("metric_interval_seconds", default))
        except Exception:
            pass
    return default


class DBMetricsCollector:
    """
    Collects PostgreSQL database performance telemetry every N seconds.
    Tracks state between ticks to accurately compute transaction throughput (TPS).
    """

    def __init__(self, conn_params: Optional[Dict[str, Any]] = None):
        self.conn_params = conn_params or {}
        self._last_xact_count: Optional[int] = None
        self._last_time: Optional[float] = None
        self._has_pg_stat_statements: Optional[bool] = None

    def _get_connection(self):
        if self.conn_params:
            return psycopg2.connect(**self.conn_params)
        return get_connection()

    def _check_pg_stat_statements(self, cur) -> bool:
        """Check if pg_stat_statements extension is available and queryable."""
        if self._has_pg_stat_statements is not None:
            return self._has_pg_stat_statements
        try:
            cur.execute("SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements';")
            self._has_pg_stat_statements = bool(cur.fetchone())
        except Exception:
            self._has_pg_stat_statements = False
        return self._has_pg_stat_statements

    def collect(self) -> Dict[str, Any]:
        """
        Collects a single snapshot of database metrics.
        Returns a dict strictly conforming to the shared OptiDBX telemetry contract.
        """
        now_dt = datetime.now(timezone.utc)
        now_mono = time.monotonic()

        query_latency_ms = 0.0
        throughput_tps = 0.0
        temp_files_bytes = 0
        active_workers = 0

        conn = self._get_connection()
        try:
            with conn.cursor() as cur:
                # 1. Throughput & Temp Files (from pg_stat_database)
                cur.execute(
                    """
                    SELECT 
                        COALESCE(xact_commit + xact_rollback, 0) AS total_xact,
                        COALESCE(temp_bytes, 0) AS temp_bytes
                    FROM pg_stat_database
                    WHERE datname = current_database();
                    """
                )
                db_stats = cur.fetchone()
                if db_stats:
                    total_xact, temp_files_bytes = db_stats

                    if self._last_xact_count is not None and self._last_time is not None:
                        elapsed = now_mono - self._last_time
                        if elapsed > 0:
                            xact_delta = max(0, total_xact - self._last_xact_count)
                            throughput_tps = round(xact_delta / elapsed, 2)

                    self._last_xact_count = total_xact
                    self._last_time = now_mono

                # 2. Active Workers / Active Activity (from pg_stat_activity)
                cur.execute(
                    """
                    SELECT count(*)
                    FROM pg_stat_activity
                    WHERE datname = current_database()
                      AND state = 'active'
                      AND pid != pg_backend_pid();
                    """
                )
                worker_row = cur.fetchone()
                if worker_row:
                    active_workers = int(worker_row[0])

                # 3. Query Latency (from pg_stat_statements, fallback to active queries)
                has_pgss = self._check_pg_stat_statements(cur)
                if has_pgss:
                    try:
                        cur.execute(
                            """
                            SELECT COALESCE(SUM(total_exec_time) / NULLIF(SUM(calls), 0), 0.0)
                            FROM pg_stat_statements;
                            """
                        )
                        lat_row = cur.fetchone()
                        if lat_row and lat_row[0] is not None:
                            query_latency_ms = round(float(lat_row[0]), 3)
                    except Exception:
                        conn.rollback()

                # Fallback if latency remains 0.0 or pgss is disabled
                if query_latency_ms == 0.0:
                    cur.execute(
                        """
                        SELECT COALESCE(AVG(extract(epoch from (now() - query_start)) * 1000), 0.0)
                        FROM pg_stat_activity
                        WHERE datname = current_database()
                          AND state = 'active'
                          AND pid != pg_backend_pid();
                        """
                    )
                    act_lat = cur.fetchone()
                    if act_lat and act_lat[0] is not None:
                        query_latency_ms = round(float(act_lat[0]), 3)

        finally:
            conn.close()

        return {
            "timestamp": now_dt.isoformat(),
            "query_latency_ms": float(query_latency_ms),
            "throughput_tps": float(throughput_tps),
            "temp_files_bytes": int(temp_files_bytes),
            "active_workers": int(active_workers),
        }

    def start_monitoring(
        self,
        interval_seconds: Optional[int] = None,
        max_samples: Optional[int] = None,
        experiment_id: Optional[int] = None,
        save_to_db: bool = True,
        on_sample: Optional[Callable[[Dict[str, Any]], None]] = None,
    ):
        """
        Continuously collects telemetry every `interval_seconds`.
        Optionally persists each reading to db_metrics.
        """
        interval = interval_seconds or load_config_interval(default=5)
        print(f"[DB Monitor] Starting collection loop (interval: {interval}s)...")
        sample_count = 0

        # Prime the collector with an initial baseline reading
        self.collect()

        try:
            while True:
                time.sleep(interval)
                sample = self.collect()
                sample_count += 1

                if save_to_db:
                    try:
                        record_id = save_db_metrics(sample, experiment_id=experiment_id)
                    except Exception as e:
                        print(f"[DB Monitor Error] Failed to persist sample to DB: {e}")

                if on_sample:
                    on_sample(sample)
                else:
                    print(
                        f"[DB Metric Sample #{sample_count}] "
                        f"Latency: {sample['query_latency_ms']} ms | "
                        f"Throughput: {sample['throughput_tps']} TPS | "
                        f"Temp Files: {sample['temp_files_bytes']} bytes | "
                        f"Active Workers: {sample['active_workers']}"
                    )

                if max_samples and sample_count >= max_samples:
                    break

        except KeyboardInterrupt:
            print("[DB Monitor] Monitoring stopped by user.")


def main():
    collector = DBMetricsCollector()
    collector.start_monitoring(interval_seconds=5)


if __name__ == "__main__":
    main()

