"""
OptiDBX Database Telemetry Storage
Handles persisting telemetry and managing experiment runs in PostgreSQL.
"""

import os
from typing import Dict, Any, Optional, List
from datetime import datetime, timezone
import psycopg2
from psycopg2.extras import RealDictCursor


def get_connection():
    """Create a new PostgreSQL database connection using environment variables."""
    return psycopg2.connect(
        host=os.environ.get("POSTGRES_HOST", "localhost"),
        port=int(os.environ.get("POSTGRES_PORT", 5432)),
        dbname=os.environ.get("POSTGRES_DB", "optidbx"),
        user=os.environ.get("POSTGRES_USER", "postgres"),
        password=os.environ.get("POSTGRES_PASSWORD", "postgres"),
    )


def start_experiment(workload_type: str, notes: Optional[str] = None) -> int:
    """
    Start a new experiment run session and record it in experiment_runs.
    Returns the newly created experiment_id.
    """
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO experiment_runs (workload_type, started_at, status, notes)
                VALUES (%s, CURRENT_TIMESTAMP, 'RUNNING', %s)
                RETURNING id;
                """,
                (workload_type, notes),
            )
            experiment_id = cur.fetchone()[0]
            conn.commit()
            print(f"[OptiDBX Storage] Started experiment #{experiment_id} ({workload_type})")
            return experiment_id
    finally:
        conn.close()


def end_experiment(experiment_id: int, status: str = "COMPLETED", notes: Optional[str] = None):
    """Mark an experiment run session as finished."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE experiment_runs
                SET ended_at = CURRENT_TIMESTAMP,
                    status = %s,
                    notes = COALESCE(%s, notes)
                WHERE id = %s;
                """,
                (status, notes, experiment_id),
            )
            conn.commit()
            print(f"[OptiDBX Storage] Ended experiment #{experiment_id} [Status: {status}]")
    finally:
        conn.close()


def save_db_metrics(metrics: Dict[str, Any], experiment_id: Optional[int] = None) -> int:
    """
    Persist a collected DB telemetry sample into the db_metrics table.
    Returns the generated record ID.
    """
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            timestamp = metrics.get("timestamp")
            if isinstance(timestamp, str):
                ts_val = timestamp
            elif isinstance(timestamp, datetime):
                ts_val = timestamp.isoformat()
            else:
                ts_val = datetime.now(timezone.utc).isoformat()

            cur.execute(
                """
                INSERT INTO db_metrics (
                    experiment_id,
                    timestamp,
                    query_latency_ms,
                    throughput_tps,
                    temp_files_bytes,
                    active_workers
                )
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING id;
                """,
                (
                    experiment_id,
                    ts_val,
                    float(metrics.get("query_latency_ms", 0.0)),
                    float(metrics.get("throughput_tps", 0.0)),
                    int(metrics.get("temp_files_bytes", 0)),
                    int(metrics.get("active_workers", 0)),
                ),
            )
            record_id = cur.fetchone()[0]
            conn.commit()
            return record_id
    finally:
        conn.close()


def get_recent_db_metrics(experiment_id: Optional[int] = None, limit: int = 10) -> List[Dict[str, Any]]:
    """Retrieve recent DB metric records from db_metrics."""
    conn = get_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            if experiment_id is not None:
                cur.execute(
                    """
                    SELECT id, experiment_id, timestamp, query_latency_ms, throughput_tps, temp_files_bytes, active_workers
                    FROM db_metrics
                    WHERE experiment_id = %s
                    ORDER BY timestamp DESC
                    LIMIT %s;
                    """,
                    (experiment_id, limit),
                )
            else:
                cur.execute(
                    """
                    SELECT id, experiment_id, timestamp, query_latency_ms, throughput_tps, temp_files_bytes, active_workers
                    FROM db_metrics
                    ORDER BY timestamp DESC
                    LIMIT %s;
                    """,
                    (limit,),
                )
            return list(cur.fetchall())
    finally:
        conn.close()

