"""Construct recommendations only. This module cannot execute tuning actions."""

from autotuner.models import ActionStatus, Bottleneck, BottleneckType, TuningAction
from config.config_loader import AppConfig


def select_action(
    bottleneck: Bottleneck, config: AppConfig, current_parallelism: int | None = None
) -> TuningAction | None:
    if bottleneck.bottleneck_type != BottleneckType.CPU_PARALLELISM:
        return None
    safe = config.safe_values.max_parallel_workers_per_gather
    new_value = None
    reason = "Reduce PostgreSQL parallelism by one approved step to evaluate CPU contention."
    if current_parallelism is None:
        reason += " Read the actual workload setting first; old/new values are unknown."
    else:
        if type(current_parallelism) is not int or current_parallelism not in safe:
            return None
        position = safe.index(current_parallelism)
        if position == 0:
            return None
        new_value = safe[position - 1]
    return TuningAction(
        action_type="REDUCE_DB_PARALLELISM",
        target="postgresql",
        parameter="max_parallel_workers_per_gather",
        direction="decrease",
        old_value=current_parallelism,
        new_value=new_value,
        reason=reason,
        status=ActionStatus.RECOMMENDED,
        timestamp=bottleneck.timestamp,
    )
