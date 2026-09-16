"""Phase 1 mock providers retained only for API contract tests."""

import random
from datetime import UTC, datetime, timedelta

from backend.models.metrics import CurrentMetricsResponse, DBMetrics, OSMetrics
from backend.models.tuner import TunerStatusResponse, TuningActionItem
from backend.services.metrics_service import MetricsProvider
from backend.services.tuner_service import TunerProvider


class MockMetricsProvider(MetricsProvider):
    """Mock metrics for the Phase 1 CPU/parallelism API contract tests."""

    def __init__(self):
        # Baseline simulation values
        self._cpu = 72.4
        self._mem = 61.8
        self._latency = 130.5
        self._tps = 520.0

    def get_current_metrics(self) -> CurrentMetricsResponse:
        now = datetime.now(UTC).isoformat()
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

    def get_metrics_history(self, limit: int = 20) -> list[CurrentMetricsResponse]:
        """Generate historical data points at 5-second intervals."""
        history: list[CurrentMetricsResponse] = []
        now = datetime.now(UTC)
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


class MockTunerProvider(TunerProvider):
    def __init__(self):
        self._mode = "recommendation"
        self._state = "monitoring"
        self._detected_bottleneck = "CPU_PARALLELISM"
        self._reason = "High CPU (>70%) and elevated context switches with active parallel workers"
        self._recommended_action = "Reduce max_parallel_workers_per_gather from 8 to 4"
        self._is_monitoring = True

    def get_status(self) -> TunerStatusResponse:
        return TunerStatusResponse(
            mode=self._mode,
            state=self._state if self._is_monitoring else "idle",
            detected_bottleneck=self._detected_bottleneck if self._is_monitoring else "NONE",
            reason=self._reason if self._is_monitoring else None,
            recommended_action=self._recommended_action if self._is_monitoring else None,
            observation_remaining_seconds=0,
            cooldown_remaining_seconds=0,
        )

    def set_mode(self, mode: str) -> TunerStatusResponse:
        if mode in ("recommendation", "auto"):
            self._mode = mode
        return self.get_status()

    def set_monitoring(self, active: bool) -> TunerStatusResponse:
        self._is_monitoring = active
        return self.get_status()

    def get_history(self) -> list[TuningActionItem]:
        now = datetime.now(UTC)
        return [
            TuningActionItem(
                timestamp=(now - timedelta(minutes=12)).isoformat(),
                bottleneck="CPU_PARALLELISM",
                parameter="max_parallel_workers_per_gather",
                old_value=8,
                new_value=4,
                status="KEPT",
                reason="Sustained CPU contention and high context switching (latency dropped 28%)",
            ),
            TuningActionItem(
                timestamp=(now - timedelta(minutes=35)).isoformat(),
                bottleneck="WORK_MEM_SPILL",
                parameter="work_mem",
                old_value="4MB",
                new_value="16MB",
                status="KEPT",
                reason="Temporary files exceeded 10MB during hash aggregation",
            ),
            TuningActionItem(
                timestamp=(now - timedelta(hours=1, minutes=10)).isoformat(),
                bottleneck="CPU_PARALLELISM",
                parameter="max_parallel_workers_per_gather",
                old_value=4,
                new_value=2,
                status="ROLLED_BACK",
                reason="Workload shifted to single-query analytical; latency increased by 15%",
            ),
        ]
