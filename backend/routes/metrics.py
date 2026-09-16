"""Metrics endpoints for OptiDBX telemetry.

Exposes OS and DBMS metrics adhering to the agreed team contract.
"""
from typing import List
from fastapi import APIRouter, Depends, Query
from backend.models.metrics import CurrentMetricsResponse
from backend.services.metrics_service import MetricsService, get_metrics_service

router = APIRouter(prefix="/metrics", tags=["metrics"])


@router.get("/current", response_model=CurrentMetricsResponse)
def get_current_metrics(
    metrics_service: MetricsService = Depends(get_metrics_service),
) -> CurrentMetricsResponse:
    """Returns the latest OS and DBMS telemetry reading."""
    return metrics_service.get_current_metrics()


@router.get("/history", response_model=List[CurrentMetricsResponse])
def get_metrics_history(
    limit: int = Query(default=20, ge=1, le=100),
    metrics_service: MetricsService = Depends(get_metrics_service),
) -> List[CurrentMetricsResponse]:
    """Returns recent time-series telemetry data points for charting."""
    return metrics_service.get_metrics_history(limit=limit)

