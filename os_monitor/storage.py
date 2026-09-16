"""
OptiDBX OS Telemetry Storage
Developer 3: Aryaman Singh (OS & Telemetry Engineer)

Handles persistence of OS telemetry to PostgreSQL `system_metrics` table
and exposes latest metrics and historical retrieval APIs.
Includes resilient in-memory buffering when PostgreSQL is unavailable.
"""

import os
import logging
from collections import deque
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List, Union
import psycopg2
from psycopg2.extras import RealDictCursor

from autotuner.models import OSMetrics

logger = logging.getLogger("optidbx.os_monitor.storage")

# Bounded in-memory fallback buffer (holds up to 120 samples = 10 minutes at 5s intervals)
_MAX_BUFFER_SIZE = 120
_metrics_buffer: deque = deque(maxlen=_MAX_BUFFER_SIZE)
_latest_metric_cache: Optional[OSMetrics] = None


def get_db_connection():
    """Create a new PostgreSQL database connection using environment variables."""
    return psycopg2.connect(
        host=os.environ.get("POSTGRES_HOST", "localhost"),
        port=int(os.environ.get("POSTGRES_PORT", 5432)),
        dbname=os.environ.get("POSTGRES_DB", "optidbx"),
        user=os.environ.get("POSTGRES_USER", "postgres"),
        password=os.environ.get("POSTGRES_PASSWORD", "postgres"),
        connect_timeout=3,
    )


def save_system_metrics(
    metrics: Union[OSMetrics, Dict[str, Any]],
    experiment_id: Optional[int] = None,
) -> Optional[int]:
    """
    Persist an OS telemetry sample into PostgreSQL `system_metrics` table.
    Updates the latest metrics cache.

    If PostgreSQL is unavailable:
    - Buffers the sample in an in-memory bounded ring buffer.
    - Logs a warning without crashing.
    - Returns None (truthfully indicating the database write did not succeed).
    """
    global _latest_metric_cache

    # Normalize to dict and OSMetrics instance
    if isinstance(metrics, OSMetrics):
        os_obj = metrics
        metrics_dict = metrics.model_dump(mode="json")
    elif isinstance(metrics, dict):
        os_obj = OSMetrics.model_validate(metrics)
        metrics_dict = os_obj.model_dump(mode="json")
    else:
        raise TypeError(f"Expected OSMetrics or dict, got {type(metrics)}")

    _latest_metric_cache = os_obj

    # Format timestamp for SQL
    ts = os_obj.timestamp
    ts_val = ts.isoformat() if isinstance(ts, datetime) else str(ts)

    record_to_buffer = {
        "experiment_id": experiment_id,
        "timestamp": ts_val,
        "cpu_percent": os_obj.cpu_percent,
        "memory_percent": os_obj.memory_percent,
        "disk_read_bytes": os_obj.disk_read_bytes,
        "disk_write_bytes": os_obj.disk_write_bytes,
        "context_switches": os_obj.context_switches,
    }

    try:
        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                # Flush previously buffered items if any
                while _metrics_buffer:
                    buffered = _metrics_buffer[0]
                    cur.execute(
                        """
                        INSERT INTO system_metrics (
                            experiment_id,
                            timestamp,
                            cpu_percent,
                            memory_percent,
                            disk_read_bytes,
                            disk_write_bytes,
                            context_switches
                        )
                        VALUES (%s, %s, %s, %s, %s, %s, %s);
                        """,
                        (
                            buffered["experiment_id"],
                            buffered["timestamp"],
                            buffered["cpu_percent"],
                            buffered["memory_percent"],
                            buffered["disk_read_bytes"],
                            buffered["disk_write_bytes"],
                            buffered["context_switches"],
                        ),
                    )
                    _metrics_buffer.popleft()

                # Insert current sample
                cur.execute(
                    """
                    INSERT INTO system_metrics (
                        experiment_id,
                        timestamp,
                        cpu_percent,
                        memory_percent,
                        disk_read_bytes,
                        disk_write_bytes,
                        context_switches
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    RETURNING id;
                    """,
                    (
                        experiment_id,
                        ts_val,
                        os_obj.cpu_percent,
                        os_obj.memory_percent,
                        os_obj.disk_read_bytes,
                        os_obj.disk_write_bytes,
                        os_obj.context_switches,
                    ),
                )
                record_id = cur.fetchone()[0]
                conn.commit()
                logger.debug(f"Saved system_metrics row #{record_id} (experiment_id={experiment_id})")
                return record_id
        finally:
            conn.close()

    except Exception as exc:
        # Buffer the sample for retry
        _metrics_buffer.append(record_to_buffer)
        logger.warning(
            f"PostgreSQL unavailable for system_metrics persistence ({exc}). "
            f"Buffered sample in memory (buffer size: {len(_metrics_buffer)})."
        )
        return None


def get_latest_os_metrics() -> Optional[OSMetrics]:
    """
    Retrieve the newest normalized OS telemetry.
    Intended for Autotuner (Yatharth) and Dashboard/Backend (Shivansh).

    Returns OSMetrics or None if no sample has been collected yet.
    """
    global _latest_metric_cache
    if _latest_metric_cache is not None:
        return _latest_metric_cache

    # Fallback to database query if memory cache is empty
    try:
        conn = get_db_connection()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    """
                    SELECT timestamp, cpu_percent, memory_percent,
                           disk_read_bytes, disk_write_bytes, context_switches
                    FROM system_metrics
                    ORDER BY timestamp DESC
                    LIMIT 1;
                    """
                )
                row = cur.fetchone()
                if row:
                    _latest_metric_cache = OSMetrics.model_validate(dict(row))
                    return _latest_metric_cache
        finally:
            conn.close()
    except Exception as exc:
        logger.debug(f"Could not query latest OS metrics from DB: {exc}")

    return None


def get_os_metrics_history(
    experiment_id: Optional[int] = None,
    limit: int = 20,
) -> List[Dict[str, Any]]:
    """
    Retrieve historical OS metrics filtered by experiment_id in descending order.

    Returns:
        List of normalized dictionaries containing:
        timestamp, cpu_percent, memory_percent, disk_read_bytes, disk_write_bytes, context_switches
    """
    try:
        conn = get_db_connection()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                if experiment_id is not None:
                    cur.execute(
                        """
                        SELECT id, experiment_id, timestamp, cpu_percent, memory_percent,
                               disk_read_bytes, disk_write_bytes, context_switches
                        FROM system_metrics
                        WHERE experiment_id = %s
                        ORDER BY timestamp DESC
                        LIMIT %s;
                        """,
                        (experiment_id, limit),
                    )
                else:
                    cur.execute(
                        """
                        SELECT id, experiment_id, timestamp, cpu_percent, memory_percent,
                               disk_read_bytes, disk_write_bytes, context_switches
                        FROM system_metrics
                        ORDER BY timestamp DESC
                        LIMIT %s;
                        """,
                        (limit,),
                    )
                rows = list(cur.fetchall())
                # Format timestamps to ISO strings
                for r in rows:
                    if isinstance(r["timestamp"], datetime):
                        r["timestamp"] = r["timestamp"].isoformat()
                    r["cpu_percent"] = float(r["cpu_percent"])
                    r["memory_percent"] = float(r["memory_percent"])
                    r["disk_read_bytes"] = int(r["disk_read_bytes"])
                    r["disk_write_bytes"] = int(r["disk_write_bytes"])
                    r["context_switches"] = int(r["context_switches"])
                return rows
        finally:
            conn.close()

    except Exception as exc:
        logger.warning(f"Failed to query system_metrics history from DB: {exc}. Reading from memory buffer.")
        # Fallback to in-memory buffer
        history = []
        for item in reversed(_metrics_buffer):
            if experiment_id is None or item["experiment_id"] == experiment_id:
                history.append(dict(item))
                if len(history) >= limit:
                    break
        return history
