"""Data models for Autotuner status and tuning actions.

These models adhere to the interface defined with Yatharth (Developer 1).
"""

from typing import Any

from pydantic import BaseModel, Field

from autotuner.models import TuningAction


class TunerStatusResponse(BaseModel):
    evidence: dict = Field(default_factory=dict)
    recommendation: TuningAction | None = None
    telemetry_available: bool = False
    last_error: str | None = None
    running: bool = False
    persistence_status: str = "NOT_REQUESTED"
    mode: str = Field(
        default="recommendation", description="Operating mode: 'recommendation' or 'auto'"
    )
    state: str = Field(
        default="monitoring", description="Tuner state: 'monitoring', 'observing', 'cooldown', etc."
    )
    detected_bottleneck: str = Field(default="NONE", description="Identified bottleneck category")
    reason: str | None = Field(
        default=None, description="Explanation for why the bottleneck was detected"
    )
    recommended_action: str | None = Field(
        default=None, description="Recommended or applied safe tuning action"
    )
    observation_remaining_seconds: int = Field(
        default=0, description="Seconds remaining in observation window (30s)"
    )
    cooldown_remaining_seconds: int = Field(
        default=0, description="Seconds remaining in cooldown period (30s)"
    )


class TunerModeRequest(BaseModel):
    mode: str = Field(..., description="Target mode: 'recommendation' or 'auto'")


class TuningActionItem(BaseModel):
    timestamp: str = Field(..., description="ISO 8601 timestamp of the tuning action")
    bottleneck: str = Field(..., description="Bottleneck category triggering this action")
    parameter: str = Field(..., description="Tuned parameter name")
    old_value: Any = Field(..., description="Previous parameter value")
    new_value: Any = Field(..., description="Updated parameter value")
    status: str = Field(..., description="Outcome status: KEPT, ROLLED_BACK, RECOMMENDED, PENDING")
    reason: str = Field(..., description="Rationale for tuning action")
