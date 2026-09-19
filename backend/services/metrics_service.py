"""Metrics service abstraction.

Phase 2 uses fresh paired telemetry from the shared runtime.
Later, this service will be replaced or plugged into real PostgreSQL telemetry
tables (system_metrics, db_metrics) maintained by Aryaman and Kartikeya.
"""

from fastapi import Depends

from backend.models.metrics import CurrentMetricsResponse
from backend.services.live_runtime import LiveMetricsProvider, get_runtime


class MetricsProvider:
    """Base interface for metric telemetry providers."""

    def get_current_metrics(self) -> CurrentMetricsResponse:
        raise NotImplementedError

    def get_metrics_history(self, limit: int = 20) -> list[CurrentMetricsResponse]:
        raise NotImplementedError


class MetricsService:
    def __init__(self, provider: MetricsProvider = None):
        self._provider = provider if provider is not None else LiveMetricsProvider(get_runtime())

    def get_current_metrics(self) -> CurrentMetricsResponse:
        return self._provider.get_current_metrics()

    def get_metrics_history(self, limit: int = 20) -> list[CurrentMetricsResponse]:
        return self._provider.get_metrics_history(limit)


def get_metrics_service(runtime=Depends(get_runtime)) -> MetricsService:
    return MetricsService(LiveMetricsProvider(runtime))
