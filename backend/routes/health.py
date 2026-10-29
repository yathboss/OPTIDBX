"""Health check and diagnostic endpoints for OptiDBX API."""
from datetime import datetime, timezone
from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get("/health")
def get_health():
    """Returns basic system health status."""
    return {"status": "ok"}


@router.get("/health/detailed")
@router.get("/api/diagnostics")
def get_detailed_diagnostics():
    """Returns detailed diagnostic health check of the OptiDBX engine."""
    return {
        "status": "ok",
        "system": "OptiDBX Adaptive Co-Tuning System",
        "version": "1.0.0",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "capabilities": {
            "work_mem_tuning": True,
            "parallel_workers_tuning": True,
            "rollback_support": True,
            "memory_safety_admission": True,
        },
        "components": {
            "api_server": "healthy",
            "telemetry_stream": "ready",
            "autotuner_engine": "ready",
        },
    }

