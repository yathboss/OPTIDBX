"""Pair only recorded intervals from the requested experiment, without interpolation."""

from datetime import datetime

from fastapi import HTTPException


def timestamp(row):
    value = row["timestamp"]
    return (
        value
        if isinstance(value, datetime)
        else datetime.fromisoformat(value.replace("Z", "+00:00"))
    )


def pair_records(os_rows, db_rows, max_skew):
    remaining = sorted(db_rows, key=timestamp)
    pairs = []
    for os_row in sorted(os_rows, key=timestamp):
        if not remaining:
            break
        nearest = min(
            remaining, key=lambda row: abs((timestamp(row) - timestamp(os_row)).total_seconds())
        )
        if abs((timestamp(nearest) - timestamp(os_row)).total_seconds()) > max_skew:
            continue
        remaining.remove(nearest)

        def clean(row):
            return {k: v for k, v in row.items() if k not in {"id", "experiment_id", "timestamp"}}

        pairs.append(
            {
                "timestamp": max(timestamp(os_row), timestamp(nearest)).isoformat(),
                "os": clean(os_row),
                "db": clean(nearest),
            }
        )
    return pairs


def recorded_history(experiment_id, limit):
    from psycopg2.extras import RealDictCursor

    from config.config_loader import load_config
    from db_monitor.storage import get_connection

    try:
        conn = get_connection()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    "SELECT * FROM system_metrics WHERE experiment_id = %s "
                    "ORDER BY timestamp DESC LIMIT %s",
                    (experiment_id, limit),
                )
                os_rows = list(cur.fetchall())
                cur.execute(
                    "SELECT * FROM db_metrics WHERE experiment_id = %s "
                    "ORDER BY timestamp DESC LIMIT %s",
                    (experiment_id, limit),
                )
                db_rows = list(cur.fetchall())
            return pair_records(
                os_rows, db_rows, load_config().monitoring.max_timestamp_skew_seconds
            )
        finally:
            conn.close()
    except Exception as exc:
        raise HTTPException(503, "Recorded telemetry storage unavailable") from exc
