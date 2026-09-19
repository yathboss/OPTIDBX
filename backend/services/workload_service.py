"""Workload service for querying active benchmark and workload runs.

Connects to PostgreSQL experiment_runs table and workload runner state.
Handles database disconnection gracefully without crashing.
"""
import logging
from typing import Optional, Dict, Any
from datetime import datetime
from backend.models.workload import WorkloadStatusResponse

logger = logging.getLogger("optidbx.backend.workload_service")


class WorkloadService:
    def get_status(self) -> WorkloadStatusResponse:
        """Checks if a workload/experiment run is currently active."""
        try:
            from db_monitor.storage import get_connection
            from psycopg2.extras import RealDictCursor

            conn = get_connection()
            try:
                with conn.cursor(cursor_factory=RealDictCursor) as cur:
                    cur.execute(
                        """
                        SELECT id, workload_type, started_at, status, notes
                        FROM experiment_runs
                        WHERE status = 'RUNNING'
                        ORDER BY started_at DESC
                        LIMIT 1;
                        """
                    )
                    row = cur.fetchone()
                    if row:
                        started = row["started_at"]
                        started_iso = started.isoformat() if hasattr(started, "isoformat") else str(started)
                        return WorkloadStatusResponse(
                            running=True,
                            profile=row["workload_type"],
                            experiment_id=row["id"],
                            started_at=started_iso,
                            details=row.get("notes") or f"Active {row['workload_type']} workload",
                        )
            finally:
                conn.close()
        except Exception as exc:
            logger.debug("Could not query active workload from database: %s", exc)

        return WorkloadStatusResponse(
            running=False,
            profile=None,
            experiment_id=None,
            started_at=None,
            details="No workload currently executing",
        )


_workload_service_instance = WorkloadService()


def get_workload_service() -> WorkloadService:
    return _workload_service_instance

