"""Workload execution status endpoints."""

import os

from fastapi import APIRouter, Depends

from backend.models.workload import WorkloadStartRequest, WorkloadStatusResponse
from backend.services.live_runtime import get_runtime
from backend.services.workload_service import WorkloadService, get_workload_service
from workload import queries

router = APIRouter(prefix="/workload", tags=["workload"])


@router.get("/options")
def workload_options(runtime=Depends(get_runtime)):
    """Config-driven choices for the live setup screen (safe values + workload types).

    ``os_preview`` is intentionally labelled as a preview: these values are shown
    and modelled in the UI but are never applied to the operating system.
    """
    config = runtime.config
    os_rules = (config.tuning_rules or {}).get("os", {})
    nice_values = os_rules.get("nice_priority", {}).get("allowed_values", [0, 5, 10])
    return {
        "profiles": config.workload.get("managed_clients", {}),
        "workload_types": queries.WORKLOAD_TYPE_META,
        "parallelism_values": list(config.safe_values.max_parallel_workers_per_gather),
        "work_mem_mb_values": list(config.safe_values.work_mem_mb),
        "os_preview": {
            "simulated": True,
            "nice_values": list(nice_values),
            "cpu_count": os.cpu_count() or 1,
        },
    }


@router.get("/status", response_model=WorkloadStatusResponse)
def get_workload_status(
    service: WorkloadService = Depends(get_workload_service),
) -> WorkloadStatusResponse:
    """Returns the current execution state of PostgreSQL workloads and active experiment ID."""
    return service.get_status()


@router.post("/start", response_model=WorkloadStatusResponse)
def start_workload(request: WorkloadStartRequest, service=Depends(get_workload_service)):
    return service.start(
        request.profile,
        request.duration_seconds,
        workload_type=request.workload_type,
        initial_parallelism=request.initial_parallelism,
        initial_work_mem_mb=request.initial_work_mem_mb,
    )


@router.post("/stop", response_model=WorkloadStatusResponse)
def stop_workload(service=Depends(get_workload_service)):
    return service.stop()
