# Phase 1 integration contract

Owner: Yatharth (autotuner/integration). This is the initial contract for team review.
The repository previously had no Python interfaces or database schema. Adding these
models affects Aryaman's collector, Kartikeya's collector, and Shivansh's API;
their implementations should use these names and units. No schema is introduced yet.

## Input

Python 3.11+. Import `OSMetrics`, `DBMetrics`, and `CombinedTelemetry` from
`autotuner.models`. All fields below are required. Extra fields, negative counters,
non-finite numbers, and missing values are rejected; do not substitute zero for
unavailable measurements. Percentages must be between 0 and 100 inclusive.

| Model | Field | Meaning / unit |
|---|---|---|
| All three | timestamp | Timezone-aware ISO 8601 interval-end timestamp; use UTC |
| OSMetrics | cpu_percent | Average CPU usage over interval, percent |
| OSMetrics | memory_percent | Memory usage at interval end, percent |
| OSMetrics | disk_read_bytes | Integer bytes read during interval |
| OSMetrics | disk_write_bytes | Integer bytes written during interval |
| OSMetrics | context_switches | Integer context-switch count during interval |
| DBMetrics | query_latency_ms | Mean completed workload-query latency over interval, milliseconds |
| DBMetrics | throughput_tps | Completed workload transactions / elapsed interval seconds |
| DBMetrics | temp_files_bytes | Integer temporary-file bytes generated during interval |
| DBMetrics | active_workers | Integer active PostgreSQL parallel workers at interval end |
| CombinedTelemetry | os_metrics | OSMetrics object or mapping |
| CombinedTelemetry | db_metrics | DBMetrics object or mapping |

Counter fields are **interval deltas, not lifetime totals**. Collectors should warm
up before publishing their first complete interval. Counter resets and intervals
without usable latency must be reported as missing/invalid input, not fabricated
normal readings. `context_switches` is a count per configured interval, not a rate.
If interval length changes, recalibrate its threshold.

The integration layer coordinates the interval boundaries; all three timestamps
must identify the same interval. Do not relabel stale collector data to make it
match. Samples must arrive in increasing timestamp order. Gaps greater than
1.5 times the configured interval reset confirmation. That tolerance accommodates
collection jitter; it does not infer elapsed time from rapid synthetic samples.
Three readings refer to three complete measurement windows (normally 15 seconds),
not 15 seconds between the first and third interval-end timestamps.

## Engine entry point

```python
from autotuner.engine import AutotunerEngine
from autotuner.models import CombinedTelemetry

engine = AutotunerEngine()  # loads config/config.yaml independently of cwd
telemetry = CombinedTelemetry.model_validate(
    {
        "timestamp": "2026-01-01T00:00:05Z",
        "os_metrics": {
            "timestamp": "2026-01-01T00:00:05Z",
            "cpu_percent": 94,
            "memory_percent": 60,
            "disk_read_bytes": 100,
            "disk_write_bytes": 200,
            "context_switches": 4200,
        },
        "db_metrics": {
            "timestamp": "2026-01-01T00:00:05Z",
            "query_latency_ms": 260,
            "throughput_tps": 100,
            "temp_files_bytes": 0,
            "active_workers": 8,
        },
    }
)
result = engine.process(telemetry, current_parallelism=8)
payload = result.model_dump(mode="json")
```

The engine also accepts nested dictionaries and validates them at entry. On invalid
input it clears the consecutive-candidate count, logs `invalid_telemetry`, and
raises `ValueError`. Providers/backend should report the failure and resume with a
fresh interval. Call `process(None)` when a collector fails; do not silently skip a
failed interval. One engine instance represents one monitored workload/host and is
called serially; it is not a concurrent service or a scheduler.

## Detection and output

All four signals must meet or exceed their configured thresholds in every candidate
sample: CPU, context switches, active workers, mean latency. Defaults are development
fixtures, not calibrated production recommendations. The rule detects a contention
candidate; it does not establish that parallelism caused the slowdown. It uses an
absolute latency threshold in Phase 1, not a learned baseline or trend.

`EngineResult` provides:

- `bottleneck`: `bottleneck_type`, `severity`, `reason`, `evidence`, `timestamp`.
- `recommended_action`: `TuningAction` or null.
- `consecutive_bad_readings`: confirmed progress, capped at the required count.
- `state`: `MONITORING`, `CANDIDATE`, or `RECOMMENDATION`.

Before confirmation and after a normal sample, bottleneck type is `NONE`. Only
`CPU_PARALLELISM` currently has detection logic. Evidence uses the original metric
names, includes the four thresholds and the number of consecutive readings, and
describes the newest sample in the confirmed run.

`TuningAction` carries `action_id`, `action_type`, `target`, `parameter`, `direction`,
`old_value`, `new_value`, `reason`, `status`, and `timestamp`. All Phase 1 actions
have status `RECOMMENDED`, target `postgresql`, and type `REDUCE_DB_PARALLELISM`.
Other status names exist only to reserve the later action lifecycle.

`current_parallelism` is the actual integer `max_parallel_workers_per_gather` for
the intended workload/session, supplied separately by DB integration. **Never
derive it from `active_workers`.** For an approved current value, select the next
lower approved value (8 -> 6 -> 4 -> 2 -> 1 by default). At the minimum, or if the
setting is invalid/outside the approved list (including 0), no action is returned.
If the setting is unknown (`None`), the recommendation is directional only:
`old_value` and `new_value` are null and its reason requests the current setting.

Repeated confirmed samples return fresh recommendation snapshots, not executable
jobs. The backend must not treat them as approvals or applied changes. Auto mode
is deliberately rejected by Phase 1 configuration. There are no DB connections,
OS commands, persistence, observation/cooldown timers, or rollback execution yet.
The configured 30-second observation/cooldown values are reserved for later phases.

## Logging and handoffs

Python `logging` records have an `event` attribute plus small structured fields.
Events: `telemetry_received`, `bottleneck_candidate`, `bottleneck_confirmed`,
`recommendation_created`, `invalid_telemetry`, `telemetry_gap`. The library does not
configure root handlers; the demo configures a console handler. Invalid payloads
are not copied into logs.

- Aryaman: emit interval OS deltas and aligned timestamps; confirm units.
- Kartikeya: emit workload DB metrics; supply actual workload setting separately;
  agree on the later persistence schema/migrations before implementing storage.
- Shivansh: serialize EngineResult and display null/unknown recommendations safely.
- Yatharth: combine aligned windows, calibrate thresholds using benchmarks, and
  later add approval/application, persistence, observation, and rollback.

Validation dependencies follow [Pydantic model configuration](https://pydantic.dev/docs/validation/latest/api/pydantic/config/)
and [PyYAML safe loading](https://pyyaml.org/wiki/PyYAMLDocumentation).
