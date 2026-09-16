"""Shared telemetry and result contracts. See docs/integration_contract.md."""

from enum import StrEnum
from typing import Annotated, Literal, Self
from uuid import UUID, uuid4

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator

Counter = Annotated[int, Field(strict=True, ge=0)]
NonnegativeNumber = Annotated[float, Field(strict=True, ge=0)]
Percent = Annotated[float, Field(strict=True, ge=0, le=100)]


class ContractModel(BaseModel):
    model_config = ConfigDict(
        extra="forbid", frozen=True, allow_inf_nan=False, revalidate_instances="always"
    )


class OSMetrics(ContractModel):
    timestamp: AwareDatetime
    cpu_percent: Percent
    memory_percent: Percent
    disk_read_bytes: Counter
    disk_write_bytes: Counter
    context_switches: Counter


class DBMetrics(ContractModel):
    timestamp: AwareDatetime
    query_latency_ms: NonnegativeNumber
    throughput_tps: NonnegativeNumber
    temp_files_bytes: Counter
    active_workers: Counter


class CombinedTelemetry(ContractModel):
    timestamp: AwareDatetime
    os_metrics: OSMetrics
    db_metrics: DBMetrics

    @model_validator(mode="after")
    def aligned_timestamps(self) -> Self:
        if self.timestamp != max(self.os_metrics.timestamp, self.db_metrics.timestamp):
            raise ValueError("combined timestamp must be the latest source timestamp")
        return self


class BottleneckType(StrEnum):
    CPU_PARALLELISM = "CPU_PARALLELISM"
    MEMORY_PRESSURE = "MEMORY_PRESSURE"
    DISK_IO = "DISK_IO"
    WORK_MEM_SPILL = "WORK_MEM_SPILL"
    NONE = "NONE"


class Bottleneck(ContractModel):
    bottleneck_type: BottleneckType
    severity: Literal["NONE", "HIGH"]
    reason: str
    evidence: dict[str, float | int]
    timestamp: AwareDatetime


class ActionStatus(StrEnum):
    RECOMMENDED = "RECOMMENDED"
    APPROVED = "APPROVED"
    APPLIED = "APPLIED"
    OBSERVING = "OBSERVING"
    KEPT = "KEPT"
    ROLLED_BACK = "ROLLED_BACK"
    FAILED = "FAILED"


class TuningAction(ContractModel):
    action_id: UUID = Field(default_factory=uuid4)
    action_type: Literal["REDUCE_DB_PARALLELISM"]
    target: Literal["postgresql"]
    parameter: Literal["max_parallel_workers_per_gather"]
    direction: Literal["decrease"]
    old_value: Counter | None
    new_value: Counter | None
    reason: str
    status: ActionStatus
    timestamp: AwareDatetime


class TunerState(StrEnum):
    MONITORING = "MONITORING"
    BOTTLENECK_CANDIDATE = "BOTTLENECK_CANDIDATE"
    BOTTLENECK_CONFIRMED = "BOTTLENECK_CONFIRMED"
    RECOMMENDATION_READY = "RECOMMENDATION_READY"


class EngineResult(ContractModel):
    bottleneck: Bottleneck
    recommended_action: TuningAction | None
    consecutive_bad_readings: Counter
    state: TunerState


class RuntimeStatus(ContractModel):
    state: TunerState = TunerState.MONITORING
    mode: Literal["recommendation"] = "recommendation"
    detected_bottleneck: BottleneckType = BottleneckType.NONE
    reason: str = "Waiting for a complete telemetry interval."
    evidence: dict[str, float | int] = Field(default_factory=dict)
    recommended_action: TuningAction | None = None
    timestamp: AwareDatetime | None = None
    consecutive_bad_readings: Counter = 0
    telemetry_available: bool = False
    running: bool = False
    last_error: str | None = None
    persistence_status: Literal["NOT_REQUESTED", "SAVED", "FAILED"] = "NOT_REQUESTED"
