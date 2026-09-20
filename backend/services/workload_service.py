"""The API controls only sessions owned by its single local runtime."""

from functools import lru_cache
from contextlib import contextmanager

from fastapi import Depends, HTTPException

from backend.models.workload import WorkloadStatusResponse
from backend.services.live_runtime import get_runtime
from workload.runner import ManagedWorkload


class WorkloadService:
    def __init__(self, runtime):
        self.manager = ManagedWorkload(runtime)

    def get_status(self):
        return WorkloadStatusResponse(**self.manager.status())

    def start(self, profile, duration):
        try:
            return WorkloadStatusResponse(**self.manager.start(profile, duration))
        except ValueError as exc:
            raise HTTPException(409, str(exc)) from exc
        except Exception as exc:
            raise HTTPException(503, f"Workload could not start: {type(exc).__name__}") from exc

    def stop(self):
        return WorkloadStatusResponse(**self.manager.stop())


@lru_cache(maxsize=1)
def service_for_runtime(runtime):
    return WorkloadService(runtime)


@contextmanager
def manual_control(runtime):
    """Serialize the ownership check and mutation with comparison startup."""
    manager = service_for_runtime(runtime).manager
    with manager.lock:
        if manager.reservation:
            raise HTTPException(409, 'A benchmark owns these controls. Cancel the comparison first.')
        yield


def get_workload_service(runtime=Depends(get_runtime)):
    return service_for_runtime(runtime)
