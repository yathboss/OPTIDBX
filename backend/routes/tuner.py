"""Autotuner and tuning history endpoints."""

from fastapi import APIRouter, Depends, HTTPException

from autotuner.models import RuntimeStatus
from backend.models.tuner import TunerModeRequest, TunerStatusResponse, TuningActionItem
from backend.services.live_runtime import get_runtime
from backend.services.tuner_service import TunerService, get_tuner_service
from backend.services.workload_service import manual_control

router = APIRouter(tags=["tuner"])


@router.get("/tuner/actions")
def action_history(runtime=Depends(get_runtime)):
    return runtime.get_action_history()


@router.post("/tuner/actions/{action_id}/approve", response_model=RuntimeStatus)
def approve_action(action_id: str, runtime=Depends(get_runtime)):
    try:
        with manual_control(runtime):
            return runtime.approve(action_id)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post("/tuner/apply-recommended", response_model=RuntimeStatus)
def apply_recommended(runtime=Depends(get_runtime)):
    """Applies the current active recommendation."""
    status = runtime.get_status()
    action = status.recommended_action
    if action is None:
        raise HTTPException(status_code=400, detail="No active recommendation to apply")
    try:
        with manual_control(runtime):
            return runtime.approve(str(action.action_id))
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post("/tuner/actions/{action_id}/rollback", response_model=RuntimeStatus)
def rollback_action(action_id: str, runtime=Depends(get_runtime)):
    try:
        with manual_control(runtime):
            return runtime.rollback(action_id)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post("/tuner/rollback-last", response_model=RuntimeStatus)
def rollback_last(runtime=Depends(get_runtime)):
    """Rolls back the most recent applied tuning action."""
    status = runtime.get_status()
    action_id = None
    if status.active_action and status.active_action.get("action"):
        action_id = status.active_action["action"].get("action_id")
    if not action_id:
        history = runtime.get_action_history()
        if history:
            action_id = history[-1].get("action", {}).get("action_id")
    if not action_id:
        raise HTTPException(status_code=400, detail="No action available to rollback")
    try:
        with manual_control(runtime):
            return runtime.rollback(str(action_id))
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


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
    runtime=Depends(get_runtime),
) -> TunerStatusResponse:
    """Switches the autotuner operating mode between 'recommendation' and 'auto'."""
    with manual_control(runtime):
        return tuner_service.set_mode(req.mode)


@router.post("/tuner/toggle-monitoring", response_model=TunerStatusResponse)
def toggle_monitoring(
    active: bool,
    tuner_service: TunerService = Depends(get_tuner_service),
    runtime=Depends(get_runtime),
) -> TunerStatusResponse:
    """Start or stop monitoring."""
    with manual_control(runtime):
        return tuner_service.set_monitoring(active)


# Both /tuning/history and /tuner/history for backward and forward compatibility
@router.get("/tuning/history", response_model=list[TuningActionItem])
@router.get("/tuner/history", response_model=list[TuningActionItem])
def get_tuning_history(
    tuner_service: TunerService = Depends(get_tuner_service),
) -> list[TuningActionItem]:
    """Returns historical tuning actions with before/after results and status."""
    return tuner_service.get_history()
