"""Autotuner service abstraction.

Phase 2 exposes real recommendation-only runtime status and history.
Designed to connect to Yatharth's (Developer 1) Autotuner engine in subsequent phases.
"""

from fastapi import Depends

from backend.models.tuner import TunerStatusResponse, TuningActionItem
from backend.services.live_runtime import LiveTunerProvider, get_runtime


class TunerProvider:
    """Base interface for autotuner telemetry & control."""

    def get_status(self) -> TunerStatusResponse:
        raise NotImplementedError

    def set_mode(self, mode: str) -> TunerStatusResponse:
        raise NotImplementedError

    def get_history(self) -> list[TuningActionItem]:
        raise NotImplementedError


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

    def get_history(self) -> list[TuningActionItem]:
        return self._provider.get_history()


def get_tuner_service(runtime=Depends(get_runtime)) -> TunerService:
    return TunerService(LiveTunerProvider(runtime))
