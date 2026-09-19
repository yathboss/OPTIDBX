"""Metrics endpoints for OptiDBX telemetry.

Exposes live and historical OS and DBMS metrics adhering to the agreed team contract.
"""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query

from backend.models.metrics import CurrentMetricsResponse
from backend.services.metrics_service import MetricsService, get_metrics_service
from db_monitor.storage import get_recent_db_metrics
from os_monitor.health import run_health_check
from os_monitor.storage import get_latest_os_metrics, get_os_metrics_history

router = APIRouter(prefix="/metrics", tags=["metrics"])


@router.get("/os/latest")
def latest_os_metrics():
    """Last observed OS sample; timestamp lets consumers check its age."""
    return get_latest_os_metrics()


@router.get("/os/health")
def os_health():
    return run_health_check()


@router.get("/current", response_model=CurrentMetricsResponse)
def get_current_metrics(
    metrics_service: MetricsService = Depends(get_metrics_service),
) -> CurrentMetricsResponse:
    """Returns the latest real OS and DBMS telemetry reading."""
    return metrics_service.get_current_metrics()


@router.get("/history", response_model=list[CurrentMetricsResponse])
def get_metrics_history(
    experiment_id: int | None = Query(default=None, description="Filter by experiment run ID"),
    limit: int = Query(default=20, ge=1, le=100),
    metrics_service: MetricsService = Depends(get_metrics_service),
) -> list[CurrentMetricsResponse]:
    """Returns recent time-series telemetry data points for charting."""
    if experiment_id is not None:
        from backend.services.history import recorded_history

        return recorded_history(experiment_id, limit)
    return metrics_service.get_metrics_history(limit=limit)


@router.get("/os/history", response_model=list[dict[str, Any]])
def get_os_history(
    experiment_id: int | None = Query(default=None, description="Filter by experiment ID"),
    limit: int = Query(default=20, ge=1, le=120),
) -> list[dict[str, Any]]:
    """Returns recent OS telemetry samples from system_metrics storage or memory buffer."""
    return get_os_metrics_history(experiment_id=experiment_id, limit=limit)


@router.get("/db/history", response_model=list[dict[str, Any]])
def get_db_history(
    experiment_id: int | None = Query(default=None, description="Filter by experiment ID"),
    limit: int = Query(default=20, ge=1, le=120),
) -> list[dict[str, Any]]:
    """Returns recent DBMS telemetry samples from db_metrics storage."""
    try:
        return get_recent_db_metrics(experiment_id=experiment_id, limit=limit)
    except Exception as exc:
        raise HTTPException(503, "DB telemetry storage unavailable") from exc
