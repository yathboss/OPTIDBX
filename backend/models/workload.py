"""Data models for workload execution and benchmark status."""
from typing import Optional
from pydantic import BaseModel, Field


class WorkloadStatusResponse(BaseModel):
    running: bool = Field(default=False, description="Whether a workload is currently running")
    profile: Optional[str] = Field(default=None, description="Active workload profile: LOW, MEDIUM, HIGH")
    experiment_id: Optional[int] = Field(default=None, description="Current experiment run ID")
    started_at: Optional[str] = Field(default=None, description="ISO timestamp of when workload started")
    details: Optional[str] = Field(default=None, description="Additional status or workload description")

