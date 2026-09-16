"""Evaluation metrics and data structures for OptiDBX benchmark results.

Supports before vs after comparison for observation window decision (KEEP vs ROLLBACK).
"""
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field


class ResultStatus(str, Enum):
    IMPROVED = "IMPROVED"
    DEGRADED = "DEGRADED"
    INCONCLUSIVE = "INCONCLUSIVE"


class WorkloadMetrics(BaseModel):
    """Snapshot or aggregated metrics for a workload observation phase."""
    query_latency_ms: float = Field(..., description="Average query latency in ms")
    throughput_tps: float = Field(..., description="Throughput in transactions per second")
    cpu_percent: float = Field(..., description="Average CPU utilization percentage")


class EvaluationResult(BaseModel):
    """Result of comparing before vs after tuning performance."""
    latency_change_percent: float = Field(
        ...,
        description="Percentage change in latency: negative is improvement (lower latency), positive is degradation"
    )
    throughput_change_percent: float = Field(
        ...,
        description="Percentage change in throughput: positive is improvement (higher throughput), negative is degradation"
    )
    cpu_change_percent: float = Field(
        ...,
        description="Percentage change in CPU utilization"
    )
    overall_result: ResultStatus = Field(
        ...,
        description="Outcome classification: IMPROVED, DEGRADED, or INCONCLUSIVE"
    )
    details: Optional[str] = Field(
        default=None,
        description="Summary explanation of evaluation decision"
    )

