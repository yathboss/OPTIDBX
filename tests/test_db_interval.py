"""Contract corrections required before DB readings may drive recommendations."""

from unittest.mock import MagicMock

import psycopg2
import pytest

from db_monitor.collector import DBMetricsCollector


def connection(stats=(100, 1000, "reset-a"), workers=4, statements=None, info=("reset-a", 0)):
    conn = MagicMock()
    cursor = conn.cursor.return_value.__enter__.return_value
    cursor.fetchone.side_effect = [stats, (workers,), info]
    cursor.fetchall.return_value = statements or [(123, 10, 1000.0)]
    return conn, cursor


def test_read_setting_failure_returns_unknown(monkeypatch):
    collector = DBMetricsCollector()
    monkeypatch.setattr(
        collector, "get_current_setting", MagicMock(side_effect=psycopg2.OperationalError())
    )
    assert collector.get_current_parallelism() is None


def test_real_db_latency_uses_interval_deltas_and_only_parallel_workers(monkeypatch):
    import db_monitor.collector as module

    collector = DBMetricsCollector()
    initial, _ = connection()
    next_conn, cursor = connection(stats=(150, 1200, "reset-a"), statements=[(123, 12, 1500.0)])
    monkeypatch.setattr(collector, "_get_connection", MagicMock(side_effect=[initial, next_conn]))
    monkeypatch.setattr(module.time, "monotonic", MagicMock(side_effect=[10, 15]))
    with pytest.raises(ValueError, match="baseline"):
        collector.collect()
    sample = collector.collect()
    assert sample["query_latency_ms"] == 250
    assert sample["throughput_tps"] == 10
    assert sample["temp_files_bytes"] == 200
    queries = " ".join(call.args[0] for call in cursor.execute.call_args_list)
    assert "backend_type = 'parallel worker'" in queries
    assert "current_database()" in queries
    assert "pg_stat_statements_info" in queries
    assert not any(word in queries.upper() for word in ["ALTER SYSTEM", "SET_CONFIG", "UPDATE "])


@pytest.mark.parametrize(
    "stats,statements,info",
    [
        ((1, 0, "reset-b"), [(123, 1, 10.0)], ("reset-a", 0)),
        ((150, 1200, "reset-a"), [(123, 12, 1500.0)], ("reset-b", 0)),
        ((150, 1200, "reset-a"), [(123, 12, 1500.0)], ("reset-a", 1)),
        ((150, 1200, "reset-a"), [(123, 10, 1000.0)], ("reset-a", 0)),
    ],
)
def test_reset_eviction_or_no_completed_queries_does_not_fabricate_latency(
    monkeypatch, stats, statements, info
):
    import db_monitor.collector as module

    collector = DBMetricsCollector()
    initial, _ = connection()
    followup, _ = connection(stats=stats, statements=statements, info=info)
    monkeypatch.setattr(collector, "_get_connection", MagicMock(side_effect=[initial, followup]))
    monkeypatch.setattr(module.time, "monotonic", MagicMock(side_effect=[10, 15]))
    with pytest.raises(ValueError):
        collector.collect()
    with pytest.raises(ValueError):
        collector.collect()


def test_recommendation_insert_uses_existing_schema_and_never_applied(sample, monkeypatch):
    from autotuner.engine import AutotunerEngine
    from db_monitor import storage

    engine = AutotunerEngine()
    for i in range(3):
        result = engine.process(sample(i), current_parallelism=8)
    conn = MagicMock()
    cursor = conn.cursor.return_value.__enter__.return_value
    cursor.fetchone.return_value = (42,)
    monkeypatch.setattr(storage, "get_connection", lambda: conn)
    assert storage.save_recommendation(result, experiment_id=None) == 42
    sql, params = cursor.execute.call_args.args
    assert "INSERT INTO tuning_actions" in sql
    assert "RECOMMENDED" in params
    assert '"cpu_percent": 94' in " ".join(str(item) for item in params)
    assert "APPLIED" not in params
    conn.commit.assert_called_once()
