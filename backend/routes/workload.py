"""Workload execution status endpoints."""

from fastapi import APIRouter, Depends

from backend.models.workload import WorkloadStartRequest, WorkloadStatusResponse
from backend.services.workload_service import WorkloadService, get_workload_service

router = APIRouter(prefix="/workload", tags=["workload"])


@router.get("/status", response_model=WorkloadStatusResponse)
def get_workload_status(
    service: WorkloadService = Depends(get_workload_service),
) -> WorkloadStatusResponse:
    """Returns the current execution state of PostgreSQL workloads and active experiment ID."""
    return service.get_status()


@router.post("/start", response_model=WorkloadStatusResponse)
def start_workload(request: WorkloadStartRequest, service=Depends(get_workload_service)):
    return service.start(request.profile, request.duration_seconds)


@router.post("/stop", response_model=WorkloadStatusResponse)
def stop_workload(service=Depends(get_workload_service)):
    return service.stop()
