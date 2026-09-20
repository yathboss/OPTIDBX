"""Read-only, non-secret setup information for the guided demo."""

from fastapi import APIRouter, Depends

from actions.os_actions.process import ProcessActions
from backend.services.live_runtime import get_runtime

router = APIRouter(tags=["demo"])


@router.get("/demo/setup")
def demo_setup(runtime=Depends(get_runtime)):
    config = runtime.config
    return {
        "profiles": config.workload.get("managed_clients", {}),
        "recommended_profile": "MEDIUM",
        "interval_seconds": config.monitoring.interval_seconds,
        "confirmation_readings": config.monitoring.consecutive_bad_readings,
        "baseline_samples": config.tuning.baseline_samples,
        "observation_seconds": config.tuning.observation_window_seconds,
        "cooldown_seconds": config.tuning.cooldown_seconds,
        "approved_values": config.safe_values.max_parallel_workers_per_gather,
        "os": ProcessActions(config.os_actions).capabilities(),
    }
