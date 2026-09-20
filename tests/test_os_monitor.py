"""
OptiDBX OS Monitor Test Suite
Developer 3: Aryaman Singh (OS & Telemetry Engineer)

Comprehensive unit and workload-based tests covering:
- Real CPU, memory, disk, and context switch telemetry
- Interval delta computation (disk & context switches)
- First sample zero-baseline behavior
- Counter reset and anomaly handling
- OSMetrics schema compliance and timezone awareness
- Active experiment attachment
- Buffer fallback when PostgreSQL is offline
- Controlled CPU, memory, disk, and concurrent thread workloads
- Truthful health check reporting
"""

import os
import time
import threading
from datetime import datetime, timezone
from unittest.mock import patch, MagicMock
import pytest
from pydantic import ValidationError

from autotuner.models import OSMetrics
from os_monitor.cpu import get_cpu_percent, init_cpu
from os_monitor.memory import get_memory_percent
from os_monitor.disk import DiskTracker, get_disk_io_deltas
from os_monitor.context_switch import ContextSwitchTracker, get_context_switches_delta
from os_monitor.collector import OSMetricsCollector
from os_monitor.storage import (
    save_system_metrics,
    get_latest_os_metrics,
    get_os_metrics_history,
    _metrics_buffer,
)
from os_monitor.health import run_health_check


@pytest.fixture(autouse=True)
def offline_database(monkeypatch):
    """These tests specify offline fallback; never write to a developer's database."""
    import psycopg2
    monkeypatch.setattr(psycopg2, "connect", MagicMock(side_effect=psycopg2.OperationalError("offline test")))


# ==============================================================================
# Unit Tests: Metric Ranges & Types
# ==============================================================================

def test_cpu_telemetry_real():
    """Verify CPU telemetry returns a numeric percentage in [0.0, 100.0]."""
    init_cpu()
    cpu = get_cpu_percent(interval=0.1)
    assert isinstance(cpu, float)
    assert 0.0 <= cpu <= 100.0


def test_memory_telemetry_real():
    """Verify Memory telemetry returns a numeric percentage in [0.0, 100.0]."""
    mem = get_memory_percent()
    assert isinstance(mem, float)
    assert 0.0 <= mem <= 100.0


# ==============================================================================
# Unit Tests: Disk Interval Delta Calculations & Edge Cases
# ==============================================================================

def test_disk_tracker_first_sample_baseline():
    """First sample must return (0, 0) and establish baseline (Prompt 15, 17)."""
    tracker = DiskTracker()
    mock_counters = MagicMock()
    mock_counters.read_bytes = 10_000_000
    mock_counters.write_bytes = 5_000_000

    with patch("psutil.disk_io_counters", return_value=mock_counters):
        read_delta, write_delta = tracker.get_io_deltas()
        assert read_delta == 0
        assert write_delta == 0


def test_disk_tracker_interval_delta():
    """Subsequent samples must return the exact byte difference over the interval."""
    tracker = DiskTracker()
    mock_counters = MagicMock()

    # Sample 1: Baseline
    mock_counters.read_bytes = 10_000_000
    mock_counters.write_bytes = 5_000_000
    with patch("psutil.disk_io_counters", return_value=mock_counters):
        tracker.get_io_deltas()

    # Sample 2: Activity occurred (+2.5MB read, +1.2MB write)
    mock_counters.read_bytes = 12_500_000
    mock_counters.write_bytes = 6_200_000
    with patch("psutil.disk_io_counters", return_value=mock_counters):
        read_delta, write_delta = tracker.get_io_deltas()
        assert read_delta == 2_500_000
        assert write_delta == 1_200_000


def test_disk_tracker_counter_reset_recovery():
    """If counter resets/drops (e.g. system reboot), delta must be clamped to 0 and re-baselined."""
    tracker = DiskTracker()
    mock_counters = MagicMock()

    mock_counters.read_bytes = 50_000_000
    mock_counters.write_bytes = 30_000_000
    with patch("psutil.disk_io_counters", return_value=mock_counters):
        tracker.get_io_deltas()

    # Counter reset: counter drops below previous reading
    mock_counters.read_bytes = 1_000
    mock_counters.write_bytes = 500
    with patch("psutil.disk_io_counters", return_value=mock_counters):
        read_delta, write_delta = tracker.get_io_deltas()
        assert read_delta == 0
        assert write_delta == 0

    # Next reading from new baseline (+100 read, +200 write)
    mock_counters.read_bytes = 1_100
    mock_counters.write_bytes = 700
    with patch("psutil.disk_io_counters", return_value=mock_counters):
        read_delta, write_delta = tracker.get_io_deltas()
        assert read_delta == 100
        assert write_delta == 200


# ==============================================================================
# Unit Tests: Context Switch Interval Delta Calculations
# ==============================================================================

def test_context_switch_tracker_first_sample_baseline():
    """First sample must return 0 and establish baseline (Prompt 16, 17)."""
    tracker = ContextSwitchTracker()
    mock_stats = MagicMock()
    mock_stats.ctx_switches = 5_000_000

    with patch("psutil.cpu_stats", return_value=mock_stats):
        delta = tracker.get_context_switches_delta()
        assert delta == 0


def test_context_switch_tracker_interval_delta():
    """Subsequent samples must return interval context switches."""
    tracker = ContextSwitchTracker()
    mock_stats = MagicMock()

    # Baseline
    mock_stats.ctx_switches = 5_000_000
    with patch("psutil.cpu_stats", return_value=mock_stats):
        tracker.get_context_switches_delta()

    # Interval activity: +4,310 switches
    mock_stats.ctx_switches = 5_004_310
    with patch("psutil.cpu_stats", return_value=mock_stats):
        delta = tracker.get_context_switches_delta()
        assert delta == 4_310


def test_context_switch_tracker_counter_reset():
    """Counter drop/reset must clamp to 0 and re-establish baseline."""
    tracker = ContextSwitchTracker()
    mock_stats = MagicMock()

    mock_stats.ctx_switches = 10_000_000
    with patch("psutil.cpu_stats", return_value=mock_stats):
        tracker.get_context_switches_delta()

    # Reset
    mock_stats.ctx_switches = 200
    with patch("psutil.cpu_stats", return_value=mock_stats):
        delta = tracker.get_context_switches_delta()
        assert delta == 0

    # Next reading (+50)
    mock_stats.ctx_switches = 250
    with patch("psutil.cpu_stats", return_value=mock_stats):
        delta = tracker.get_context_switches_delta()
        assert delta == 50


# ==============================================================================
# Unit Tests: OSMetrics Model & Time Alignment
# ==============================================================================

def test_collector_normalizes_to_osmetrics():
    """OSMetricsCollector.collect_sample must return a valid autotuner.models.OSMetrics instance."""
    collector = OSMetricsCollector(interval_seconds=1.0)
    sample = collector.collect_sample()

    assert isinstance(sample, OSMetrics)
    assert sample.timestamp.tzinfo is not None
    assert 0.0 <= sample.cpu_percent <= 100.0
    assert 0.0 <= sample.memory_percent <= 100.0
    assert sample.disk_read_bytes >= 0
    assert sample.disk_write_bytes >= 0
    assert sample.context_switches >= 0


def test_osmetrics_rejects_negative_counters():
    """Contract requires all counters to be strictly non-negative integers."""
    with pytest.raises(ValidationError):
        OSMetrics(
            timestamp=datetime.now(timezone.utc),
            cpu_percent=50.0,
            memory_percent=50.0,
            disk_read_bytes=-1,
            disk_write_bytes=0,
            context_switches=0,
        )


def test_osmetrics_rejects_invalid_percentage():
    """Contract requires percentages to be within [0.0, 100.0]."""
    with pytest.raises(ValidationError):
        OSMetrics(
            timestamp=datetime.now(timezone.utc),
            cpu_percent=105.0,
            memory_percent=50.0,
            disk_read_bytes=0,
            disk_write_bytes=0,
            context_switches=0,
        )


# ==============================================================================
# Unit Tests: Experiment Attachment & Storage Buffer
# ==============================================================================

def test_collector_experiment_id_attachment():
    """Collector must associate active_experiment_id with runs."""
    collector = OSMetricsCollector(interval_seconds=1.0)
    assert collector.active_experiment_id is None

    collector.set_active_experiment(99)
    assert collector.active_experiment_id == 99

    sample = collector.run_once()
    assert isinstance(sample, OSMetrics)

    collector.set_active_experiment(None)
    assert collector.active_experiment_id is None


def test_storage_fallback_buffer_and_queries():
    """When PostgreSQL is unavailable, storage must buffer records and serve queries."""
    _metrics_buffer.clear()
    sample = OSMetrics(
        timestamp=datetime.now(timezone.utc),
        cpu_percent=25.5,
        memory_percent=60.0,
        disk_read_bytes=1024,
        disk_write_bytes=2048,
        context_switches=150,
    )

    # Save to storage (fails DB connection, buffers to memory)
    res = save_system_metrics(sample, experiment_id=101)
    # Returns None because DB is unreachable
    assert res is None

    # Latest metrics must return the sample
    latest = get_latest_os_metrics()
    assert latest is not None
    assert latest.cpu_percent == 25.5
    assert latest.context_switches == 150

    # History query must return buffered data filtered by experiment_id
    hist = get_os_metrics_history(experiment_id=101, limit=5)
    assert len(hist) >= 1
    assert hist[0]["experiment_id"] == 101
    assert hist[0]["cpu_percent"] == 25.5


# ==============================================================================
# Unit Tests: Health Check
# ==============================================================================

def test_health_check_truthful():
    """Health check must report truth for every subsystem."""
    report = run_health_check()
    assert "platform" in report
    assert report["psutil"]["status"] == "OK"
    assert report["cpu"]["status"] == "OK"
    assert report["memory"]["status"] == "OK"
    assert report["disk"]["status"] == "OK"
    assert report["context_switches"]["status"] == "OK"
    assert report["storage"]["status"] in ("OK", "NOT AVAILABLE", "PARTIAL")


# ==============================================================================
# Workload Validation Tests (CPU, Disk, Context Switches)
# ==============================================================================

def test_controlled_cpu_workload_elevation():
    """
    Test CPU metric under a brief controlled computation workload.
    Verifies that CPU metric runs without error under active workload.
    """
    stop_event = threading.Event()

    def cpu_worker():
        # Safe math loop to elevate CPU
        x = 0
        while not stop_event.is_set():
            x = (x + 1) * (x + 2) % 1_000_007

    threads = [threading.Thread(target=cpu_worker, daemon=True) for _ in range(2)]
    for t in threads:
        t.start()

    time.sleep(0.3)
    val = get_cpu_percent(interval=0.3)

    stop_event.set()
    for t in threads:
        t.join(timeout=1.0)

    assert isinstance(val, float)
    assert 0.0 <= val <= 100.0


def test_safe_disk_io_workload(tmp_path):
    """
    Write and read a temporary file to verify disk tracker executes cleanly.
    """
    tracker = DiskTracker()
    tracker.get_io_deltas()

    # Write 1MB file
    test_file = tmp_path / "test_io_payload.bin"
    payload = b"X" * (1024 * 1024)
    test_file.write_bytes(payload)

    # Read file
    read_data = test_file.read_bytes()
    assert len(read_data) == len(payload)

    read_b, write_b = tracker.get_io_deltas()
    assert read_b >= 0
    assert write_b >= 0


def test_concurrent_context_switches_workload():
    """
    Verify context switches tracker observes interval changes under concurrent threads.
    """
    tracker = ContextSwitchTracker()
    tracker.get_context_switches_delta()

    def context_switch_worker():
        for _ in range(20):
            time.sleep(0.001)

    workers = [threading.Thread(target=context_switch_worker) for _ in range(10)]
    for w in workers:
        w.start()
    for w in workers:
        w.join(timeout=2.0)

    delta = tracker.get_context_switches_delta()
    assert isinstance(delta, int)
    assert delta >= 0
