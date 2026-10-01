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


class DBMetrics(BaseModel):
    query_latency_ms: float = Field(..., description="Average query latency in milliseconds")
    throughput_tps: float = Field(..., description="Transaction/query throughput per second")
    temp_files_bytes: int = Field(..., description="PostgreSQL temporary file usage in bytes")
    active_workers: int = Field(..., description="Active parallel query workers")


class MetricProvenance(BaseModel):
    """Where the published numbers come from, for the 'not fake' verification view.

    Every field is a real, independently checkable fact about how the latest
    interval was measured — the collector source, the exact interval length, and
    how many completed statements the DB latency was averaged over.
    """

    db_source: str = Field(
        default="pg_stat_statements + pg_stat_database + pg_stat_activity",
        description="PostgreSQL catalogs the DB metrics are read from",
    )
    os_source: str = Field(
        default="psutil (/proc)", description="Collector the OS metrics are read from"
    )
    sample_calls: int | None = Field(
        default=None,
        description="Completed statements the DB latency was averaged over this interval",
    )
    interval_seconds: float | None = Field(
        default=None, description="Measured length of the interval the deltas span"
    )
    collected_at: str | None = Field(
        default=None, description="ISO timestamp the latest interval was collected"
    )


class CurrentMetricsResponse(BaseModel):
    timestamp: str = Field(..., description="ISO 8601 timestamp of metric collection")
    os: OSMetrics
    db: DBMetrics
    provenance: MetricProvenance | None = Field(
        default=None, description="Real derivation inputs for the latest reading"
    )

