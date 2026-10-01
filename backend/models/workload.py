"""Data models for workload execution and benchmark status."""

from typing import Literal

from pydantic import BaseModel, Field


class WorkloadStatusResponse(BaseModel):
    benchmark_id: str | None = None
    measurements: dict | None = None
    error: str | None = None
    clients: int = 0
    completed_queries: int = 0
    duration_seconds: int | None = None
    recovery_required: bool = False
    running: bool = Field(default=False, description="Whether a workload is currently running")
    profile: str | None = Field(
        default=None, description="Active workload profile: LOW, MEDIUM, HIGH"
    )
    workload_type: str | None = Field(
        default=None, description="Active workload type: READ, WRITE, ANALYTICAL, MIXED"
    )
    initial_parallelism: int | None = Field(
        default=None, description="Starting max_parallel_workers_per_gather applied to the session"
    )
    initial_work_mem_mb: int | None = Field(
        default=None, description="Starting work_mem (MB) applied to the session"
    )
    experiment_id: int | None = Field(default=None, description="Current experiment run ID")
    started_at: str | None = Field(
        default=None, description="ISO timestamp of when workload started"
    )
    details: str | None = Field(
        default=None, description="Additional status or workload description"
    )


class WorkloadStartRequest(BaseModel):
    profile: Literal["LOW", "MEDIUM", "HIGH"] = "LOW"
    duration_seconds: int = Field(default=180, strict=True, ge=30, le=600)
    workload_type: Literal["READ", "WRITE", "ANALYTICAL", "MIXED"] = "ANALYTICAL"
    # Starting configuration the autotuner runs from. Whitelist membership is
    # enforced against config.safe_values in ManagedWorkload.start.
    initial_parallelism: int | None = Field(default=None, strict=True, ge=1, le=64)
    initial_work_mem_mb: int | None = Field(default=None, strict=True, ge=1, le=4096)
