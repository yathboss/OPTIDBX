"""Performance Evaluator for OptiDBX observation window.

Compares before vs after telemetry to determine whether to KEEP or ROLLBACK
a tuning parameter modification.
"""
from typing import Optional
from .metrics import WorkloadMetrics, EvaluationResult, ResultStatus


class PerformanceEvaluator:
    """Evaluates telemetry before and after a tuning intervention."""

    def __init__(self, latency_threshold_pct: float = 5.0, throughput_threshold_pct: float = 5.0):
        self.latency_threshold_pct = latency_threshold_pct
        self.throughput_threshold_pct = throughput_threshold_pct

    def compare(
        self,
        before: WorkloadMetrics,
        after: WorkloadMetrics,
    ) -> EvaluationResult:
        """Calculates percentage deltas and classifies the overall result."""
        # Calculate latency delta (negative delta = latency reduced = GOOD)
        if before.query_latency_ms > 0:
            lat_delta = ((after.query_latency_ms - before.query_latency_ms) / before.query_latency_ms) * 100.0
        else:
            lat_delta = 0.0

        # Calculate throughput delta (positive delta = throughput increased = GOOD)
        if before.throughput_tps > 0:
            tps_delta = ((after.throughput_tps - before.throughput_tps) / before.throughput_tps) * 100.0
        else:
            tps_delta = 0.0

        # Calculate CPU delta
        if before.cpu_percent > 0:
            cpu_delta = ((after.cpu_percent - before.cpu_percent) / before.cpu_percent) * 100.0
        else:
            cpu_delta = 0.0

        lat_delta = round(lat_delta, 2)
        tps_delta = round(tps_delta, 2)
        cpu_delta = round(cpu_delta, 2)

        # Classification rules:
        # 1. Clear Improvement: Latency lowered by >= threshold and throughput didn't degrade significantly
        if lat_delta <= -self.latency_threshold_pct and tps_delta >= -self.throughput_threshold_pct:
            status = ResultStatus.IMPROVED
            details = f"Query latency reduced by {abs(lat_delta)}% with stable/better throughput ({tps_delta:+}%)."
        # 2. Throughput boost: Throughput increased by >= threshold without latency spike
        elif tps_delta >= self.throughput_threshold_pct and lat_delta <= self.latency_threshold_pct:
            status = ResultStatus.IMPROVED
            details = f"Throughput increased by {tps_delta}% with latency change of {lat_delta:+} %."
        # 3. Clear Degradation: Latency increased by >= threshold OR throughput dropped by >= threshold
        elif lat_delta >= self.latency_threshold_pct or tps_delta <= -self.throughput_threshold_pct:
            status = ResultStatus.DEGRADED
            details = f"Performance degraded: latency changed by {lat_delta:+}% and throughput changed by {tps_delta:+} %."
        # 4. Inconclusive: Within noise margin
        else:
            status = ResultStatus.INCONCLUSIVE
            details = f"Performance delta within noise margin (latency {lat_delta:+}%, throughput {tps_delta:+}%)."

        return EvaluationResult(
            latency_change_percent=lat_delta,
            throughput_change_percent=tps_delta,
            cpu_change_percent=cpu_delta,
            overall_result=status,
            details=details,
        )


def evaluate_tuning_action(
    before_latency: float,
    after_latency: float,
    before_throughput: float,
    after_throughput: float,
    before_cpu: float,
    after_cpu: float,
) -> EvaluationResult:
    """Convenience helper function to compare scalar telemetry before and after."""
    evaluator = PerformanceEvaluator()
    before = WorkloadMetrics(
        query_latency_ms=before_latency,
        throughput_tps=before_throughput,
        cpu_percent=before_cpu,
    )
    after = WorkloadMetrics(
        query_latency_ms=after_latency,
        throughput_tps=after_throughput,
        cpu_percent=after_cpu,
    )
    return evaluator.compare(before, after)

