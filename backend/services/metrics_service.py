"""Metrics service abstraction.

Phase 1 provides mock telemetry adhering strictly to the contract.
Later, this service will be replaced or plugged into real PostgreSQL telemetry
tables (system_metrics, db_metrics) maintained by Aryaman and Kartikeya.
"""
from datetime import datetime, timezone, timedelta
import random
from typing import List, Dict, Any
from fastapi import Depends
from backend.services.live_runtime import get_runtime, LiveMetricsProvider
from backend.models.metrics import OSMetrics, DBMetrics, CurrentMetricsResponse


class MetricsProvider:
    """Base interface for metric telemetry providers."""
    def get_current_metrics(self) -> CurrentMetricsResponse:
        raise NotImplementedError

    def get_metrics_history(self, limit: int = 20) -> List[CurrentMetricsResponse]:
        raise NotImplementedError


class MockMetricsProvider(MetricsProvider):
    """Generates realistic mock metrics matching the OptiDBX V1 CPU/Parallelism bottleneck scenario."""
    def __init__(self):
        # Baseline simulation values
        self._cpu = 72.4
        self._mem = 61.8
        self._latency = 130.5
        self._tps = 520.0

    def get_current_metrics(self) -> CurrentMetricsResponse:
        now = datetime.now(timezone.utc).isoformat()
        # Small fluctuations around realistic values
        cpu = round(max(10.0, min(99.0, self._cpu + random.uniform(-2.5, 2.5))), 1)
        mem = round(max(20.0, min(95.0, self._mem + random.uniform(-0.5, 0.5))), 1)
        read_bytes = random.randint(800000, 1500000)
        write_bytes = random.randint(300000, 800000)
        cs = random.randint(2000, 2500)

        latency = round(max(20.0, min(500.0, self._latency + random.uniform(-5.0, 5.0))), 1)
        tps = round(max(100.0, min(1000.0, self._tps + random.uniform(-15.0, 15.0))), 1)
        temp_bytes = 10485760  # 10 MB
        workers = 4

        return CurrentMetricsResponse(
            timestamp=now,
            os=OSMetrics(
                cpu_percent=cpu,
                memory_percent=mem,
                disk_read_bytes=read_bytes,
                disk_write_bytes=write_bytes,
                context_switches=cs,
            ),
            db=DBMetrics(
                query_latency_ms=latency,
                throughput_tps=tps,
                temp_files_bytes=temp_bytes,
                active_workers=workers,
            ),
        )

    def get_metrics_history(self, limit: int = 20) -> List[CurrentMetricsResponse]:
        """Generate historical data points at 5-second intervals."""
        history: List[CurrentMetricsResponse] = []
        now = datetime.now(timezone.utc)
        for i in range(limit, 0, -1):
            point_time = (now - timedelta(seconds=i * 5)).isoformat()
            cpu = round(max(30.0, min(95.0, 70.0 + random.uniform(-8.0, 8.0))), 1)
            latency = round(max(50.0, min(300.0, 120.0 + random.uniform(-15.0, 15.0))), 1)
            tps = round(max(200.0, min(800.0, 500.0 + random.uniform(-30.0, 30.0))), 1)
            history.append(
                CurrentMetricsResponse(
                    timestamp=point_time,
                    os=OSMetrics(
                        cpu_percent=cpu,
                        memory_percent=61.8,
                        disk_read_bytes=1048576,
                        disk_write_bytes=524288,
                        context_switches=random.randint(1800, 2400),
                    ),
                    db=DBMetrics(
                        query_latency_ms=latency,
                        throughput_tps=tps,
                        temp_files_bytes=10485760,
                        active_workers=4,
                    ),
                )
            )
        return history


class MetricsService:
    def __init__(self, provider: MetricsProvider = None):
        self._provider = provider if provider is not None else LiveMetricsProvider(get_runtime())

    def get_current_metrics(self) -> CurrentMetricsResponse:
        return self._provider.get_current_metrics()

    def get_metrics_history(self, limit: int = 20) -> List[CurrentMetricsResponse]:
        return self._provider.get_metrics_history(limit)


def get_metrics_service(runtime=Depends(get_runtime)) -> MetricsService:
    return MetricsService(LiveMetricsProvider(runtime))

