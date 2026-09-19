"""Experiment service connecting to real PostgreSQL experiment_runs and metrics tables."""

import logging

from fastapi import HTTPException

from backend.models.experiment import ExperimentDetailResponse, ExperimentItem

logger = logging.getLogger("optidbx.backend.experiment_service")


class ExperimentService:
    def list_experiments(self) -> list[ExperimentItem]:
        """Lists all benchmark experiments from PostgreSQL experiment_runs."""
        try:
            from psycopg2.extras import RealDictCursor

            from db_monitor.storage import get_connection

            conn = get_connection()
            try:
                with conn.cursor(cursor_factory=RealDictCursor) as cur:
                    cur.execute(
                        """
                        SELECT id, workload_type, started_at, ended_at, status, notes
                        FROM experiment_runs
                        ORDER BY id DESC;
                        """
                    )
                    rows = cur.fetchall()
                    if rows:
                        items = []
                        for r in rows:
                            started = (
                                r["started_at"].isoformat()
                                if hasattr(r["started_at"], "isoformat")
                                else str(r["started_at"])
                            )
                            ended = (
                                r["ended_at"].isoformat()
                                if r.get("ended_at") and hasattr(r["ended_at"], "isoformat")
                                else (str(r["ended_at"]) if r.get("ended_at") else None)
                            )
                            duration = None
                            if r.get("started_at") and r.get("ended_at"):
                                duration = max(
                                    0, int((r["ended_at"] - r["started_at"]).total_seconds())
                                )
                            name = (
                                r.get("notes") or f"Workload Run #{r['id']} ({r['workload_type']})"
                            )
                            items.append(
                                ExperimentItem(
                                    id=r["id"],
                                    name=name,
                                    workload_type=r["workload_type"],
                                    status=r["status"],
                                    created_at=started,
                                    started_at=started,
                                    ended_at=ended,
                                    duration_seconds=duration,
                                )
                            )
                        return items
            finally:
                conn.close()
        except Exception as exc:
            logger.warning("Experiment storage unavailable: %s", type(exc).__name__)
            raise HTTPException(503, "Experiment storage unavailable") from exc

        return []

    def get_experiment(self, exp_id: str) -> ExperimentDetailResponse | None:
        """Returns detailed metrics and summary for an experiment run."""
        try:
            from psycopg2.extras import RealDictCursor

            from db_monitor.storage import get_connection

            conn = get_connection()
            try:
                with conn.cursor(cursor_factory=RealDictCursor) as cur:
                    # Query experiment_runs row
                    cur.execute(
                        """
                        SELECT id, workload_type, started_at, ended_at, status, notes
                        FROM experiment_runs
                        WHERE id::text = %s;
                        """,
                        (str(exp_id),),
                    )
                    run_row = cur.fetchone()
                    if run_row:
                        started = (
                            run_row["started_at"].isoformat()
                            if hasattr(run_row["started_at"], "isoformat")
                            else str(run_row["started_at"])
                        )
                        ended = (
                            run_row["ended_at"].isoformat()
                            if run_row.get("ended_at") and hasattr(run_row["ended_at"], "isoformat")
                            else (str(run_row["ended_at"]) if run_row.get("ended_at") else None)
                        )
                        duration = None
                        if run_row.get("started_at") and run_row.get("ended_at"):
                            duration = max(
                                0,
                                int((run_row["ended_at"] - run_row["started_at"]).total_seconds()),
                            )

                        # Compute average DB metrics for this experiment
                        cur.execute(
                            """
                            SELECT AVG(query_latency_ms) as avg_lat,
                                   AVG(throughput_tps) as avg_tps,
                                   MAX(active_workers) as max_workers,
                                   MAX(temp_files_bytes) as max_temp
                            FROM db_metrics
                            WHERE experiment_id::text = %s;
                            """,
                            (str(exp_id),),
                        )
                        db_stats = cur.fetchone() or {}

                        # Compute average OS metrics for this experiment
                        cur.execute(
                            """
                            SELECT AVG(cpu_percent) as avg_cpu,
                                   AVG(memory_percent) as avg_mem,
                                   MAX(context_switches) as max_cs
                            FROM system_metrics
                            WHERE experiment_id::text = %s;
                            """,
                            (str(exp_id),),
                        )
                        os_stats = cur.fetchone() or {}

                        aggregate = {
                            key: float(value) if value is not None else None
                            for key, value in {
                                "query_latency_ms": db_stats.get("avg_lat"),
                                "throughput_tps": db_stats.get("avg_tps"),
                                "cpu_percent": os_stats.get("avg_cpu"),
                                "memory_percent": os_stats.get("avg_mem"),
                                "active_workers": db_stats.get("max_workers"),
                            }.items()
                        }
                        cur.execute(
                            "SELECT reason FROM tuning_actions WHERE experiment_id::text = %s "
                            "ORDER BY id DESC LIMIT 100",
                            (str(exp_id),),
                        )
                        import json

                        actions, seen = [], set()
                        for row in cur.fetchall():
                            try:
                                record = json.loads(row["reason"])
                                action_id = record.get("action_id")
                                if "before" in record and action_id not in seen:
                                    actions.append(record)
                                    seen.add(action_id)
                            except (ValueError, TypeError):
                                continue
                        latest = actions[0] if actions else {}

                        return ExperimentDetailResponse(
                            id=run_row["id"],
                            name=run_row.get("notes")
                            or f"Workload Run #{run_row['id']} ({run_row['workload_type']})",
                            workload_type=run_row["workload_type"],
                            status=run_row["status"],
                            created_at=started,
                            started_at=started,
                            ended_at=ended,
                            duration_seconds=duration,
                            before_metrics=latest.get("before"),
                            after_metrics=latest.get("after"),
                            overall_result=latest.get(
                                "outcome", "BASELINE" if not latest else "IN_PROGRESS"
                            ),
                            aggregate_metrics=aggregate,
                            actions=actions,
                        )
            finally:
                conn.close()
        except Exception as exc:
            logger.warning("Experiment detail unavailable: %s", type(exc).__name__)
            raise HTTPException(503, "Experiment storage unavailable") from exc

        return None


_experiment_service_instance = ExperimentService()


def get_experiment_service() -> ExperimentService:
    return _experiment_service_instance
