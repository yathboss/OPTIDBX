"""Phase 1 CPU rule: all four signals must be elevated together."""

from autotuner.models import Bottleneck, BottleneckType, CombinedTelemetry
from config.config_loader import ThresholdsConfig


def is_cpu_candidate(sample: CombinedTelemetry, thresholds: ThresholdsConfig) -> bool:
    return (
        sample.os_metrics.cpu_percent >= thresholds.cpu_high_percent
        and sample.os_metrics.context_switches >= thresholds.context_switches_high_per_interval
        and sample.db_metrics.active_workers >= thresholds.active_workers_high
        and sample.db_metrics.query_latency_ms >= thresholds.query_latency_high_ms
    )


def detect_cpu(
    sample: CombinedTelemetry,
    thresholds: ThresholdsConfig,
    consecutive: int,
    required: int,
) -> Bottleneck:
    confirmed = consecutive >= required and is_cpu_candidate(sample, thresholds)
    return Bottleneck(
        bottleneck_type=BottleneckType.CPU_PARALLELISM if confirmed else BottleneckType.NONE,
        severity="HIGH" if confirmed else "NONE",
        reason=(
            f"CPU, context switches, parallel workers and query latency met or exceeded "
            f"their thresholds for {consecutive} consecutive samples; possible CPU/parallelism "
            "contention. This association does not establish causation."
            if confirmed
            else f"No confirmed bottleneck ({consecutive}/{required} CPU-contention samples)."
        ),
        evidence={
            "cpu_percent": sample.os_metrics.cpu_percent,
            "context_switches": sample.os_metrics.context_switches,
            "active_workers": sample.db_metrics.active_workers,
            "query_latency_ms": sample.db_metrics.query_latency_ms,
            "cpu_high_percent": thresholds.cpu_high_percent,
            "context_switches_high_per_interval": thresholds.context_switches_high_per_interval,
            "active_workers_high": thresholds.active_workers_high,
            "query_latency_high_ms": thresholds.query_latency_high_ms,
            "consecutive_bad_readings": consecutive,
        },
        timestamp=sample.timestamp,
    )
