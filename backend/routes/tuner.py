"""Autotuner and tuning history endpoints."""
from typing import List
from fastapi import APIRouter, Depends
from backend.models.tuner import TunerStatusResponse, TunerModeRequest, TuningActionItem
from backend.services.tuner_service import TunerService, get_tuner_service
from autotuner.models import RuntimeStatus
from backend.services.live_runtime import get_runtime

router = APIRouter(tags=["tuner"])


@router.get("/tuner/live-status", response_model=RuntimeStatus)
def live_status(runtime=Depends(get_runtime)):
    """Full Phase 2 state, evidence, and structured recommendation."""
    return runtime.get_status()


@router.get("/tuner/status", response_model=TunerStatusResponse)
def get_tuner_status(
    tuner_service: TunerService = Depends(get_tuner_service),
) -> TunerStatusResponse:
    """Returns the current autotuner state, detected bottleneck, and recommendation."""
    return tuner_service.get_status()


@router.post("/tuner/mode", response_model=TunerStatusResponse)
def set_tuner_mode(
    req: TunerModeRequest,
    tuner_service: TunerService = Depends(get_tuner_service),
) -> TunerStatusResponse:
    """Switches the autotuner operating mode between 'recommendation' and 'auto'."""
    return tuner_service.set_mode(req.mode)


@router.post("/tuner/toggle-monitoring", response_model=TunerStatusResponse)
def toggle_monitoring(
    active: bool,
    tuner_service: TunerService = Depends(get_tuner_service),
) -> TunerStatusResponse:
    """Start or stop monitoring."""
    return tuner_service.set_monitoring(active)


# Both /tuning/history and /tuner/history for backward and forward compatibility
@router.get("/tuning/history", response_model=List[TuningActionItem])
@router.get("/tuner/history", response_model=List[TuningActionItem])
def get_tuning_history(
    tuner_service: TunerService = Depends(get_tuner_service),
) -> List[TuningActionItem]:
    """Returns historical tuning actions with before/after results and status."""
    return tuner_service.get_history()

