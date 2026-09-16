# OptiDBX Experiments & Evaluation Module

This module provides the foundation for benchmarking workloads and evaluating whether tuning decisions should be kept or rolled back.

## Responsibilities
- **Workload Evaluation**: Compares metrics collected before a tuning intervention (during baseline/problematic state) with metrics collected during the 30-second observation window.
- **Decision Engine Support**: Provides `evaluate_tuning_action()` returning an `EvaluationResult` categorized as:
  - `IMPROVED`: Suggests keeping the applied parameter (`KEEP`).
  - `DEGRADED`: Triggers immediate rollback (`ROLLBACK`).
  - `INCONCLUSIVE`: Retains or rolls back based on policy configuration.

## Metrics Analyzed
1. `query_latency_ms`: Negative delta indicates improved response times.
2. `throughput_tps`: Positive delta indicates higher query execution capacity.
3. `cpu_percent`: Resource utilization delta.

## Usage Example
```python
from experiments.evaluator import evaluate_tuning_action

result = evaluate_tuning_action(
    before_latency=250.0,
    after_latency=180.0,
    before_throughput=500.0,
    after_throughput=620.0,
    before_cpu=85.0,
    after_cpu=70.0
)

print(result.overall_result)  # ResultStatus.IMPROVED
print(result.latency_change_percent)  # -28.0%
print(result.details)
```

