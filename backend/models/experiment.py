"""Data models for experiment benchmarks and evaluation."""
from typing import Optional, Dict, Any, Union
from pydantic import BaseModel, Field


class ExperimentItem(BaseModel):
    id: Union[str, int] = Field(..., description="Unique experiment run ID")
    name: str = Field(..., description="Descriptive name of the benchmark run")
    workload_type: str = Field(..., description="Type of workload: LOW, MEDIUM, HIGH, analytical, mixed")
    status: str = Field(..., description="Status of experiment: RUNNING, COMPLETED, FAILED")
    created_at: str = Field(..., description="Timestamp of experiment start")
    started_at: Optional[str] = Field(default=None, description="Timestamp of experiment start")
    ended_at: Optional[str] = Field(default=None, description="Timestamp of experiment completion")
    duration_seconds: Optional[int] = Field(default=None, description="Total runtime in seconds")


class ExperimentDetailResponse(ExperimentItem):
    before_metrics: Optional[Dict[str, Any]] = Field(default=None, description="Pre-tuning/baseline metrics summary")
    after_metrics: Optional[Dict[str, Any]] = Field(default=None, description="Post-tuning metrics summary")
    overall_result: Optional[str] = Field(default=None, description="Result: IMPROVED, DEGRADED, INCONCLUSIVE")
