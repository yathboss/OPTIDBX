from unittest.mock import Mock

import pytest

from autotuner.models import OSMetrics


def test_buffer_survives_failed_commit(sample, monkeypatch):
    from os_monitor import storage

    storage._metrics_buffer.clear()
    monkeypatch.setattr(storage, "get_db_connection", Mock(side_effect=OSError()))
    storage.save_system_metrics(OSMetrics.model_validate(sample()["os_metrics"]), 21)
    conn = Mock()
    cursor = Mock()
    cursor.fetchone.return_value = (42,)
    conn.cursor.return_value.__enter__ = Mock(return_value=cursor)
    conn.cursor.return_value.__exit__ = Mock(return_value=False)
    conn.commit.side_effect = OSError("commit failed")
    monkeypatch.setattr(storage, "get_db_connection", lambda: conn)
    storage.save_system_metrics(OSMetrics.model_validate(sample(1)["os_metrics"]), 21)
    assert len(storage._metrics_buffer) == 2
    storage._metrics_buffer.clear()


@pytest.mark.parametrize(
    "profile,cpu,read,write,ctx",
    [
        ("LOW", 10, 100, 200, 50),
        ("MEDIUM", 50, 1000, 2000, 500),
        ("HIGH", 95, 10000, 20000, 4500),
    ],
)
def test_controlled_profile_interval_contract(profile, cpu, read, write, ctx, monkeypatch):
    """Synthetic counter streams, not live benchmark performance measurements."""
    from os_monitor import collector
    from workload.profiles import get_profile

    monkeypatch.setattr(collector, "get_cpu_percent", lambda: cpu)
    c = collector.OSMetricsCollector()
    assert c.interval_seconds == 5
    assert get_profile(profile)["clients"] > 0
    monkeypatch.setattr(c._disk_tracker, "get_io_deltas", lambda: (read, write))
    monkeypatch.setattr(c._cs_tracker, "get_context_switches_delta", lambda: ctx)
    c._disk_tracker.interval_valid = c._cs_tracker.interval_valid = True
    result = c.collect_sample()
    assert result.cpu_percent == cpu
    assert (result.disk_read_bytes, result.disk_write_bytes, result.context_switches) == (
        read,
        write,
        ctx,
    )


def test_collector_rejects_missing_or_reset_counters(monkeypatch):
    from os_monitor import collector

    c = collector.OSMetricsCollector()
    monkeypatch.setattr(c._disk_tracker, "get_io_deltas", lambda: (0, 0))
    c._disk_tracker.interval_valid = False
    with pytest.raises(RuntimeError, match="interval"):
        c.collect_sample()
