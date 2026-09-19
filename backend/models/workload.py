"""Data models for workload execution and benchmark status."""

from typing import Literal

from pydantic import BaseModel, Field


class WorkloadStatusResponse(BaseModel):
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
