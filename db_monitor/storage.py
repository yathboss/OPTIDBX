"""
OptiDBX Database Telemetry Storage
Handles persisting telemetry and managing experiment runs in PostgreSQL.
"""

import json
import os
from datetime import UTC, datetime
from typing import Any

import psycopg2
from psycopg2.extras import RealDictCursor


def save_action_event(record, experiment_id=None):
    """Append lifecycle evidence to the existing table; no incompatible migration.

    Multiple events share an action UUID inside the JSON reason envelope.
    """
    action = record["action"]
    before, after = record["before"], record.get("after") or {}
    envelope = {**record, "action_id": action["action_id"], "bottleneck": "CPU_PARALLELISM"}
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO tuning_actions (experiment_id, timestamp, action_type,
                    parameter, old_value, new_value, reason, status, before_latency_ms,
                    after_latency_ms, before_throughput_tps, after_throughput_tps)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id
            """,
                (
                    experiment_id,
                    datetime.now(UTC),
                    "APPLIED_AUTO" if record["automatic"] else "APPLIED_MANUAL",
                    action["parameter"],
                    str(action["old_value"]),
                    str(action["new_value"]),
                    json.dumps(envelope),
                    record["state"],
                    before["query_latency_ms"],
                    after.get("query_latency_ms"),
                    before["throughput_tps"],
                    after.get("throughput_tps"),
                ),
            )
            row_id = cur.fetchone()[0]
        conn.commit()
        return row_id
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def save_recommendation(result, experiment_id: int | None = None) -> int:
    """Store an explicit recommendation in the existing tuning_actions schema.

    The reason TEXT field holds a JSON evidence envelope; no schema fork is needed.
    Unknown settings cannot be saved as executable numeric recommendations.
    """
    action = result.recommended_action
    if action is None or action.old_value is None or action.new_value is None:
        raise ValueError("a concrete recommendation is required for persistence")
    if action.status != "RECOMMENDED":
        raise ValueError("Phase 2 persists recommendations only")
    reason = json.dumps(
        {
            "action_id": str(action.action_id),
            "action_type": action.action_type,
            "bottleneck": result.bottleneck.bottleneck_type,
            "reason": result.bottleneck.reason,
            "evidence": result.bottleneck.evidence,
        }
    )
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO tuning_actions
                (experiment_id, timestamp, action_type, parameter, old_value,
                 new_value, reason, status, before_latency_ms)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id;
            """,
                (
                    experiment_id,
                    action.timestamp,
                    "RECOMMENDED",
                    action.parameter,
                    str(action.old_value),
                    str(action.new_value),
                    reason,
                    "RECOMMENDED",
                    result.bottleneck.evidence["query_latency_ms"],
                ),
            )
            row_id = cur.fetchone()[0]
        conn.commit()
        return row_id
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def get_connection():
    """Create a new PostgreSQL database connection using environment variables."""
    return psycopg2.connect(
        host=os.environ.get("POSTGRES_HOST", "localhost"),
        port=int(os.environ.get("POSTGRES_PORT", 5432)),
        dbname=os.environ.get("POSTGRES_DB", "optidbx"),
        user=os.environ.get("POSTGRES_USER", "postgres"),
        password=os.environ.get("POSTGRES_PASSWORD"),
        connect_timeout=3,
        options="-c statement_timeout=3000",
    )


def start_experiment(workload_type: str, notes: str | None = None) -> int:
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


def end_experiment(experiment_id: int, status: str = "COMPLETED", notes: str | None = None):
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


def save_db_metrics(metrics: dict[str, Any], experiment_id: int | None = None) -> int:
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
                ts_val = datetime.now(UTC).isoformat()

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


def get_recent_db_metrics(
    experiment_id: int | None = None, limit: int = 10
) -> list[dict[str, Any]]:
    """Retrieve recent DB metric records from db_metrics."""
    conn = get_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            if experiment_id is not None:
                cur.execute(
                    """
                    SELECT id, experiment_id, timestamp, query_latency_ms, throughput_tps,
                           temp_files_bytes, active_workers
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
                    SELECT id, experiment_id, timestamp, query_latency_ms, throughput_tps,
                           temp_files_bytes, active_workers
                    FROM db_metrics
                    ORDER BY timestamp DESC
                    LIMIT %s;
                    """,
                    (limit,),
                )
            return list(cur.fetchall())
    finally:
        conn.close()
