"""Load and validate shared settings; no connection credentials belong here."""

from pathlib import Path
from typing import Annotated, Any, Literal

import yaml
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

PositiveInt = Annotated[int, Field(strict=True, gt=0)]
Percent = Annotated[float, Field(strict=True, ge=0, le=100)]
PositiveNumber = Annotated[float, Field(strict=True, gt=0)]


class ConfigSection(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, allow_inf_nan=False)


class MonitoringConfig(ConfigSection):
    interval_seconds: PositiveNumber
    consecutive_bad_readings: PositiveInt
    history_size: PositiveInt
    max_timestamp_skew_seconds: PositiveNumber = 1
    max_sample_age_seconds: PositiveNumber = 7.5


class TuningConfig(ConfigSection):
    observation_window_seconds: PositiveNumber
    cooldown_seconds: PositiveNumber
    one_action_at_a_time: Literal[True]
    baseline_samples: Annotated[int, Field(strict=True, ge=3)] = 3
    minimum_observation_samples: Annotated[int, Field(strict=True, ge=3)] = 5
    # Minimum owned-workload queries per baseline/observation window before a
    # client-observed KEEP/ROLLBACK decision is trusted; too few is insufficient evidence.
    minimum_owned_queries: Annotated[int, Field(strict=True, ge=1)] = 30
    baseline_warmup_seconds: PositiveNumber = 15
    improvement_percent: PositiveNumber = 5
    degradation_percent: PositiveNumber = 10
    resource_degradation_percent: PositiveNumber = 20
    disk_noise_floor_bytes: PositiveNumber = 1048576
    # KEEP policy for owned-workload evaluations. net_benefit keeps when the weighted
    # throughput gain outweighs the latency cost; latency_first/throughput_first favor
    # one axis. A latency blowout past max_latency_regression_percent is never kept.
    keep_policy: Literal["net_benefit", "latency_first", "throughput_first"] = "net_benefit"
    throughput_weight: PositiveNumber = 1.0
    latency_weight: Annotated[float, Field(strict=True, ge=0)] = 0.5
    max_latency_regression_percent: PositiveNumber = 10
    # A reduction rolled back for performance is not retried under comparable
    # conditions until this many seconds pass (then it is reconsidered).
    rejection_memory_ttl_seconds: PositiveNumber = 1800


class ModesConfig(ConfigSection):
    # Startup remains recommendation-only. Auto requires a bound workload executor.
    default_mode: Literal["recommendation"]


class OSActionsConfig(ConfigSection):
    allowed_pids: tuple[Annotated[int, Field(strict=True, gt=1)], ...] = ()
    allowed_cpu_ids: tuple[Annotated[int, Field(strict=True, ge=0)], ...] = ()
    allowed_nice_values: tuple[Annotated[int, Field(strict=True, ge=-20, le=19)], ...] = (0, 5, 10)
    same_user_only: Literal[True] = True


class ThresholdsConfig(ConfigSection):
    cpu_high_percent: Percent
    memory_high_percent: Percent
    context_switches_high_per_interval: PositiveInt
    active_workers_high: PositiveInt
    query_latency_high_ms: PositiveNumber


class SafeValuesConfig(ConfigSection):
    work_mem_mb: tuple[PositiveInt, ...]
    max_parallel_workers_per_gather: tuple[PositiveInt, ...]

    @field_validator("work_mem_mb", "max_parallel_workers_per_gather")
    @classmethod
    def ordered_values(cls, values: tuple[int, ...]) -> tuple[int, ...]:
        if not values or tuple(sorted(set(values))) != values:
            raise ValueError("safe values must be nonempty, unique and ascending")
        return values


class AppConfig(ConfigSection):
    monitoring: MonitoringConfig
    tuning: TuningConfig
    modes: ModesConfig
    thresholds: ThresholdsConfig
    safe_values: SafeValuesConfig
    os_actions: OSActionsConfig = Field(default_factory=OSActionsConfig)
    # Preserve DBMS-owned sections without interpreting them as autotuner policy.
    # In config.yaml, system compatibility keys alias the canonical values above.
    system: dict[str, Any] = Field(default_factory=dict)
    database: dict[str, Any] = Field(default_factory=dict)
    workload: dict[str, Any] = Field(default_factory=dict)
    tuning_rules: dict[str, Any] = Field(default_factory=dict)


def load_config(path: str | Path | None = None) -> AppConfig:
    """Resolve the default relative to this module, not the caller's directory."""
    config_path = Path(path) if path is not None else Path(__file__).with_name("config.yaml")
    try:
        raw = config_path.read_text(encoding="utf-8")
    except (OSError, UnicodeError) as exc:
        raise ValueError(f"Cannot read configuration at {config_path}: {exc}") from exc
    try:
        return AppConfig.model_validate(yaml.safe_load(raw))
    except (yaml.YAMLError, ValidationError) as exc:
        raise ValueError(f"Invalid configuration at {config_path}: {exc}") from exc
