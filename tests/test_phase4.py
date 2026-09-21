"""Phase 4 unit tests: Workload profiles, Memory Safety models, and Tuner status."""

import pytest
from backend.models.metrics import OSMetrics
from backend.models.tuner import TunerStatusResponse
from backend.models.workload import WorkloadStartRequest
from backend.services.live_runtime import LiveTunerProvider


def test_workload_start_request_accepts_analytical_and_temp_spill():
    req1 = WorkloadStartRequest(profile="ANALYTICAL", duration_seconds=120)
    assert req1.profile == "ANALYTICAL"
    assert req1.duration_seconds == 120

    req2 = WorkloadStartRequest(profile="TEMP_SPILL", duration_seconds=60)
    assert req2.profile == "TEMP_SPILL"


def test_os_metrics_memory_safety_fields():
    metrics = OSMetrics(
        cpu_percent=45.2,
        memory_percent=62.5,
        disk_read_bytes=1024,
        disk_write_bytes=2048,
        context_switches=1500,
        available_memory_bytes=8589934592,
        memory_pressure="NORMAL",
        safe_for_memory_increase=True,
    )
    assert metrics.available_memory_bytes == 8589934592
    assert metrics.memory_pressure == "NORMAL"
    assert metrics.safe_for_memory_increase is True


def test_tuner_status_response_memory_safety_and_deferred():
    resp = TunerStatusResponse(
        running=True,
        state="MONITORING",
        mode="recommendation",
        memory_safety={
            "usage_percent": 65.0,
            "available_bytes": 4294967296,
            "available_gb": 4.0,
            "pressure_level": "NORMAL",
            "safe_for_memory_increase": True,
            "reason": "OS memory usage is 65.0% (<80% threshold)",
        },
        deferred_bottlenecks=["WORK_MEM_SPILL"],
    )
    assert resp.memory_safety["safe_for_memory_increase"] is True
    assert resp.deferred_bottlenecks == ["WORK_MEM_SPILL"]


def test_live_tuner_provider_memory_safety_telemetry():
    from unittest.mock import Mock
    mock_runtime = Mock()
    mock_status = Mock()
    mock_status.running = True
    mock_status.mode = "recommendation"
    mock_status.state = "MONITORING"
    mock_status.detected_bottleneck = "NONE"
    mock_status.reason = "Normal"
    mock_status.consecutive_bad_readings = 0
    mock_status.recommended_action = None
    mock_status.active_action = None
    mock_status.cooldown_remaining_seconds = 0
    mock_status.observation_remaining_seconds = 0
    mock_status.latest_evidence = {}
    mock_status.evidence = {}
    mock_status.telemetry_available = True
    mock_status.last_error = None
    mock_status.persistence_status = "IDLE"
    mock_status.os_persistence_status = "IDLE"
    mock_status.db_persistence_status = "IDLE"
    mock_status.capabilities = {"available": True}
    mock_status.recovery_required = False
    mock_runtime.get_status.return_value = mock_status
    mock_runtime.db_executor.capabilities.return_value = {"available": True}
    mock_runtime.action_gate.capabilities.return_value = {"available": True}
    mock_runtime.latest_sample = None
    mock_runtime.last_error = None

    provider = LiveTunerProvider(mock_runtime)
    status_resp = provider.get_status()
    assert status_resp.memory_safety is not None
    mem_safety = status_resp.memory_safety
    assert "memory_percent" in mem_safety
    assert "pressure_level" in mem_safety
    assert "safe_for_memory_increase" in mem_safety
    assert isinstance(mem_safety["safe_for_memory_increase"], bool)
    assert isinstance(status_resp.deferred_bottlenecks, list)

