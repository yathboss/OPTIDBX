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


class TuningConfig(ConfigSection):
    observation_window_seconds: PositiveNumber
    cooldown_seconds: PositiveNumber
    one_action_at_a_time: Literal[True]


class ModesConfig(ConfigSection):
    # Actual auto-tuning is intentionally unavailable until the action lifecycle exists.
    default_mode: Literal["recommendation"]


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
