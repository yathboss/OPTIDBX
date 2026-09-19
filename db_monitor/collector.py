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

import sys
import time
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import psycopg2
import yaml

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from db_monitor.storage import get_connection, save_db_metrics  # noqa: E402


def load_config_interval(default: int = 5) -> int:
    """Read metric_interval_seconds from config.yaml if present."""
    config_path = PROJECT_ROOT / "config" / "config.yaml"
    if config_path.exists():
        try:
            with open(config_path, encoding="utf-8") as f:
                data = yaml.safe_load(f)
                return int(data.get("system", {}).get("metric_interval_seconds", default))
        except Exception:
            pass
    return default


class TelemetryNotReady(ValueError):
    """No trustworthy complete DB interval is available yet."""


class DBMetricsCollector:
    """
    Collects PostgreSQL database performance telemetry every N seconds.
    Tracks state between ticks to accurately compute transaction throughput (TPS).
    """

    def __init__(self, conn_params: dict[str, Any] | None = None):
        self.conn_params = conn_params or {}
        self._last_xact_count: int | None = None
        self._last_temp_bytes: int | None = None
        self._last_time: float | None = None
        self._has_pg_stat_statements: bool | None = None
        self._baseline = None

    def _get_connection(self):
        if self.conn_params:
            return psycopg2.connect(**self.conn_params)
        return get_connection()

    def get_current_setting(self, param_name: str) -> str:
        """Query PostgreSQL for the current value of a configuration parameter."""
        conn = self._get_connection()
        try:
            with conn.cursor() as cur:
                # Use parameterized query via set_config/current_setting
                cur.execute("SELECT current_setting(%s);", (param_name,))
                row = cur.fetchone()
                return str(row[0]) if row else ""
        finally:
            conn.close()

    def get_current_parallelism(self) -> int | None:
        """Read this connection role's default; never guess a value on failure.

        Workloads must use this same database/role without session overrides.
        PostgreSQL does not expose another session's arbitrary GUC settings.
        """
        try:
            return int(self.get_current_setting("max_parallel_workers_per_gather"))
        except (ValueError, TypeError, psycopg2.Error):
            return None

    def warm_up(self) -> None:
        """Establish a fresh baseline without publishing a zero-valued sample."""
        self._baseline = None
        try:
            self.collect()
        except TelemetryNotReady:
            pass

    def collect(self) -> dict[str, Any]:
        """Read interval deltas; reject unmeasurable latency, resets and evictions.

        Requires pg_stat_statements (PostgreSQL 14+) and access to statistics.
        Latency covers top-level completed statements for the current role/database,
        excluding this monitor's statistics queries. Throughput is database-wide.
        """
        now_mono = time.monotonic()
        conn = self._get_connection()
        try:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT xact_commit + xact_rollback, temp_bytes, stats_reset
                    FROM pg_stat_database WHERE datname = current_database();
                """)
                stats = cur.fetchone()
                if stats is None:
                    raise TelemetryNotReady("database statistics unavailable")
                cur.execute("""
                    SELECT count(*) FROM pg_stat_activity
                    WHERE datname = current_database() AND state = 'active'
                      AND backend_type = 'parallel worker';
                """)
                workers = int(cur.fetchone()[0])
                cur.execute("SELECT stats_reset, dealloc FROM pg_stat_statements_info;")
                info = cur.fetchone()
                cur.execute("""
                    SELECT queryid, calls, total_exec_time FROM pg_stat_statements
                    WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
                      AND userid = (SELECT oid FROM pg_roles WHERE rolname = current_user)
                      AND toplevel
                      AND query NOT ILIKE '%%pg_stat_%%'
                      AND query NOT ILIKE '%%current_setting%%'
                      AND btrim(query) !~* '^(BEGIN|COMMIT|ROLLBACK|END|START TRANSACTION);?$';
                """)
                statements = {row[0]: (row[1], float(row[2])) for row in cur.fetchall()}
        except Exception:
            self._baseline = None
            raise
        finally:
            conn.close()

        previous = self._baseline
        self._baseline = (now_mono, stats, info, statements)
        if previous is None:
            raise TelemetryNotReady("baseline established; wait for a full interval")
        old_time, old_stats, old_info, old_statements = previous
        elapsed = now_mono - old_time
        if elapsed <= 0 or stats[2] != old_stats[2] or info != old_info:
            raise TelemetryNotReady("statistics reset/eviction or invalid measurement interval")
        xacts, temp = stats[0] - old_stats[0], stats[1] - old_stats[1]
        if xacts < 0 or temp < 0 or not old_statements.keys() <= statements.keys():
            raise TelemetryNotReady("statistics counters reset or statement entries disappeared")
        calls, duration = 0, 0.0
        for query_id, (count, total_time) in statements.items():
            old_count, old_total = old_statements.get(query_id, (0, 0.0))
            delta_count, delta_time = count - old_count, total_time - old_total
            if delta_count < 0 or delta_time < 0:
                raise TelemetryNotReady("statement counters reset")
            calls += delta_count
            duration += delta_time
        if calls == 0:
            raise TelemetryNotReady("no completed statements; latency is unavailable")
        return {
            "timestamp": datetime.now(UTC).isoformat(),
            "query_latency_ms": round(duration / calls, 3),
            "throughput_tps": round(xacts / elapsed, 2),
            "temp_files_bytes": int(temp),
            "active_workers": workers,
        }

    def start_monitoring(
        self,
        interval_seconds: int | None = None,
        max_samples: int | None = None,
        experiment_id: int | None = None,
        save_to_db: bool = True,
        on_sample: Callable[[dict[str, Any]], None] | None = None,
    ):
        """
        Continuously collects telemetry every `interval_seconds`.
        Optionally persists each reading to db_metrics.
        """
        interval = interval_seconds or load_config_interval(default=5)
        print(f"[DB Monitor] Starting collection loop (interval: {interval}s)...")
        sample_count = 0

        # Prime the collector with an initial baseline reading
        self.warm_up()

        try:
            while True:
                time.sleep(interval)
                try:
                    sample = self.collect()
                except TelemetryNotReady as exc:
                    print(f"[DB Monitor] Skipping unavailable interval: {exc}")
                    continue
                sample_count += 1

                if save_to_db:
                    try:
                        save_db_metrics(sample, experiment_id=experiment_id)
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
