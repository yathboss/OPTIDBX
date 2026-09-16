"""Data models for experiment benchmarks and evaluation."""
from typing import Optional, Dict, Any
from pydantic import BaseModel, Field


class ExperimentItem(BaseModel):
    id: str = Field(..., description="Unique experiment run ID")
    name: str = Field(..., description="Descriptive name of the benchmark run")
    workload_type: str = Field(..., description="Type of workload: read-heavy, write-heavy, analytical, mixed")
    status: str = Field(..., description="Status of experiment: completed, running, failed")
    created_at: str = Field(..., description="Timestamp of experiment start")
    duration_seconds: Optional[int] = Field(default=None, description="Total runtime in seconds")


class ExperimentDetailResponse(ExperimentItem):
    before_metrics: Optional[Dict[str, Any]] = Field(default=None, description="Pre-tuning metrics summary")
    after_metrics: Optional[Dict[str, Any]] = Field(default=None, description="Post-tuning metrics summary")
    overall_result: Optional[str] = Field(default=None, description="Result: IMPROVED, DEGRADED, INCONCLUSIVE")

