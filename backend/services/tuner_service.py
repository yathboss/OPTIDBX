"""Autotuner service abstraction.

Phase 1 provides mock status and tuning action history.
Designed to connect to Yatharth's (Developer 1) Autotuner engine in subsequent phases.
"""
from datetime import datetime, timezone, timedelta
from typing import List
from fastapi import Depends
from backend.services.live_runtime import get_runtime, LiveTunerProvider
from backend.models.tuner import TunerStatusResponse, TuningActionItem


class TunerProvider:
    """Base interface for autotuner telemetry & control."""
    def get_status(self) -> TunerStatusResponse:
        raise NotImplementedError

    def set_mode(self, mode: str) -> TunerStatusResponse:
        raise NotImplementedError

    def get_history(self) -> List[TuningActionItem]:
        raise NotImplementedError


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

    def get_history(self) -> List[TuningActionItem]:
        now = datetime.now(timezone.utc)
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


class TunerService:
    def __init__(self, provider: TunerProvider = None):
        self._provider = provider if provider is not None else LiveTunerProvider(get_runtime())

    def get_status(self) -> TunerStatusResponse:
        return self._provider.get_status()

    def set_mode(self, mode: str) -> TunerStatusResponse:
        return self._provider.set_mode(mode)

    def set_monitoring(self, active: bool) -> TunerStatusResponse:
        if hasattr(self._provider, "set_monitoring"):
            return self._provider.set_monitoring(active)
        return self.get_status()

    def get_history(self) -> List[TuningActionItem]:
        return self._provider.get_history()


def get_tuner_service(runtime=Depends(get_runtime)) -> TunerService:
    return TunerService(LiveTunerProvider(runtime))

