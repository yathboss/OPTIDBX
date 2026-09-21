"""Metric data models for OptiDBX telemetry.

These models strictly adhere to the agreed team interfaces:
OS metrics owned by Aryaman (Developer 3):
  cpu_percent, memory_percent, disk_read_bytes, disk_write_bytes, context_switches
DBMS metrics owned by Kartikeya (Developer 2):
  query_latency_ms, throughput_tps, temp_files_bytes, active_workers
"""
from pydantic import BaseModel, Field


class OSMetrics(BaseModel):
    cpu_percent: float = Field(..., description="Current OS CPU utilization percentage")
    memory_percent: float = Field(..., description="Current OS RAM usage percentage")
    disk_read_bytes: int = Field(..., description="Bytes read from disk since last interval")
    disk_write_bytes: int = Field(..., description="Bytes written to disk since last interval")
    context_switches: int = Field(..., description="Context switches count in interval")
    available_memory_bytes: int | None = Field(
        default=None, description="Available OS memory in bytes"
    )
    memory_pressure: str = Field(
        default="NORMAL", description="Memory pressure level: NORMAL, ELEVATED, HIGH, CRITICAL"
    )
    safe_for_memory_increase: bool = Field(
        default=True, description="Whether memory headroom is safe for work_mem expansion"
    )


class DBMetrics(BaseModel):
    query_latency_ms: float = Field(..., description="Average query latency in milliseconds")
    throughput_tps: float = Field(..., description="Transaction/query throughput per second")
    temp_files_bytes: int = Field(..., description="PostgreSQL temporary file usage in bytes")
    active_workers: int = Field(..., description="Active parallel query workers")


class CurrentMetricsResponse(BaseModel):
    timestamp: str = Field(..., description="ISO 8601 timestamp of metric collection")
    os: OSMetrics
    db: DBMetrics

