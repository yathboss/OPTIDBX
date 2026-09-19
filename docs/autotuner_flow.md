# Phase 2: real telemetry to recommendations

Historical Phase 2 flow. [Phase 3 integration](phase3_integration.md) extends this
with explicitly bound DB execution and separate manual OS actions; default startup
and unbound pgbench monitoring remain recommendation-only.

Phase 2 runs Aryaman's OS collector and Kartikeya's DB collector in one coordinator
loop. No executor applies PostgreSQL or OS tuning settings. The shared config
still allows only recommendation mode.

```text
Kartikeya: pgbench workload -> PostgreSQL
Aryaman: OSMetricsCollector.collect_sample()  ─┐
Kartikeya: DBMetricsCollector.collect()      ─┤
                                            v
Yatharth: TelemetryCoordinator -> CombinedTelemetry
          -> AutotunerEngine -> four-signal CPU detector
          -> three consecutive candidate intervals
          -> read current DB parallelism -> next approved lower value
          -> RECOMMENDED action -> existing tuning_actions storage
Shivansh: FastAPI live providers -> status, evidence, metrics, history
```

## Runtime and sampling

`AutotunerRuntime` owns a single serial stream. It calls the existing collector
methods directly; do not also start their autonomous collector loops. A warm-up
establishes CPU, disk, context-switch, and DB counter baselines. Only subsequent
complete intervals reach the engine. `psutil` CPU warm-up and collection occur in
the same thread. Run the runtime on the PostgreSQL host (inside Ubuntu when DB is
in WSL); Windows host CPU metrics would represent a different resource domain.

`TelemetryCoordinator.combine(os, db, now=...)` validates both provider payloads:

- Source timestamps remain unchanged; combined timestamp is the later one.
- Default allowed skew: 1 second. Default maximum sample age: 7.5 seconds.
- Old, reused, out-of-order, invalid, or implausibly future readings are rejected.
- The runtime resets the candidate streak and re-primes after collection failures.
- Engine also checks skew/order and resets on a gap over 1.5 configured intervals.
- Missing or stale telemetry clears actionable status. It does not mean healthy.

The timing limits live in `monitoring` in `config/config.yaml`. For slower
intervals, adjust freshness limits too. This is simple synchronous pairing, not a
distributed-clock protocol; wall-clock jumps require a fresh runtime.

## States and interfaces

`MONITORING -> BOTTLENECK_CANDIDATE -> RECOMMENDATION_READY` after 3 readings.
`BOTTLENECK_CONFIRMED` represents confirmed contention without a safe action
(e.g. the setting is already at the minimum). These replace Phase 1's `CANDIDATE`
and `RECOMMENDATION` names. Invalid input clears state to `MONITORING` with
`telemetry_available=false` and `last_error`; it never leaves an old action active.

`engine.get_status()` and `runtime.get_status()` return `RuntimeStatus`: state,
mode, detected_bottleneck, reason, evidence, recommended_action, timestamp,
consecutive_bad_readings, telemetry_available, running, last_error, persistence_status.
`running` specifically indicates the background service thread; a synchronous CLI
or integration run can produce fresh samples while that flag is false.

The CPU rule remains in `autotuner/detectors/cpu_detector.py`. Its pure functions
take an explicit `ThresholdsConfig`; a future baseline policy can supply those
thresholds without changing telemetry or recommendation contracts. No adaptive
threshold logic exists yet. All four signals must meet the experimental static
limits: CPU 90%, context switches 3000 per interval, 4 active parallel workers,
and 200 ms completed-statement execution time. These are uncalibrated development
values, not universally correct thresholds or proof of causal contention.

## DB interface corrections (impact on Kartikeya's module)

Field names are unchanged. The following corrections were necessary for detection:

- `active_workers` counts `backend_type = 'parallel worker'`, not ordinary sessions.
- `query_latency_ms` uses per-statement deltas of `total_exec_time / calls` for
  completed top-level statements in the current database and connection role.
  Statistics queries, current-setting queries, and transaction control are excluded.
  This is server execution time, not client round-trip latency. Other traffic using
  that role can still contribute. TPS covers the whole database, including observer
  transactions; use a dedicated benchmark database for controlled comparisons.
- Temporary bytes remain interval deltas. Counter resets, statement eviction,
  unavailable extensions, and intervals with no completed queries are rejected.
- `collect()` now raises `TelemetryNotReady` during warm-up/unmeasurable intervals;
  `warm_up()` and the existing standalone monitoring loop handle this explicitly.
- `get_current_parallelism()` returns `None` on read failure, never a guessed 2.

`pg_stat_statements` must be preloaded and created in the target database.
Connections use a bounded timeout. Runtime SQL reads statistics/settings; the only
runtime write is an optional recommendation insert. No ALTER, SET tuning action,
rollback, workload initialization, or schema migration occurs in the runtime.

The setting helper reads the **monitor connection's effective setting**. PostgreSQL
does not provide arbitrary other-session GUC reads. Workload and monitor must use
the same database/role without workload-specific session overrides. Until Kartikeya
provides workload-session reporting, that is an explicit integration prerequisite.

## Recommendation persistence

The approved list still determines one lower step: 8 -> 6 -> 4 -> 2 -> 1. Below
the floor, outside the list, or with invalid values, no numeric action is returned.
An unknown setting yields only a directional recommendation with null old/new values.
`new_value` remains the shared action field (the prompt's `recommended_value` is
conceptual); consumers should not rename it.

`db_monitor.storage.save_recommendation(result, experiment_id)` reuses Kartikeya's
connection helper and existing `tuning_actions` table. Both the legacy table's
`action_type` and `status` explicitly store `RECOMMENDED`. `reason` is a JSON text
envelope carrying action UUID, `REDUCE_DB_PARALLELISM`, bottleneck, reason, evidence.
No separate table or migration was needed. Unknown numeric settings are not stored.

One action UUID is retained for a continuous contention episode/current setting.
The runtime attempts persistence once per UUID; repeated samples do not spam rows.
On storage failure, status remains available with `persistence_status=FAILED`.
There is no blind retry after an ambiguous commit. Restart deduplication, durable
status/history recovery, and schema-level action UUID uniqueness are later work.

## API handoff (impact on Shivansh's module)

- `GET /tuner/live-status`: full structured RuntimeStatus.
- `GET /tuner/status`: preserves the existing summary-string `recommended_action`
  for the current dashboard, adds structured `recommendation`, `evidence`, freshness,
  running, and persistence fields.
- `GET /metrics/current`: fresh real metrics, or HTTP 503 when unavailable.
- `GET /metrics/history`: bounded real paired samples in this process.
- `POST /tuner/toggle-monitoring?active=true|false`: starts/stops the shared loop.
- `POST /tuner/mode`: only `recommendation` succeeds; `auto` returns HTTP 422.
- `/tuner/history` and `/tuning/history`: recommendations from this runtime session.

Mock telemetry/tuner providers moved into `tests/mock_providers.py`. Backend
experiment endpoints still contain Shivansh's Phase 1 fixtures; they are outside
this integration. The dashboard design is unchanged. No startup DB writes occur;
monitoring starts explicitly via the control endpoint. Run one uvicorn worker.
CLI and API are separate processes; running the CLI does not populate the API's
in-memory status. Use API monitoring when demonstrating the dashboard.

## Run on WSL Ubuntu

On this workspace, the user-authorized setup installed PostgreSQL 16 and Python
dependencies in `/opt/optidbx-venv`, enabled the statistics extension, and created
dedicated database `optidbx_phase2` with the existing schema and scale-10 pgbench
tables. Setup changes are prerequisites, not automatic tuning actions. Local Unix
peer authentication runs the demo as `postgres`; no password was created or committed.

From the repo directory inside WSL, use the same host/role for workload and monitor:

```bash
sudo -u postgres env POSTGRES_HOST=/var/run/postgresql \
  POSTGRES_DB=optidbx_phase2 POSTGRES_USER=postgres \
  /opt/optidbx-venv/bin/python -m tests.live_phase2 \
  --scenario normal --expect NONE --output docs/testing/evidence/phase2-normal.json

sudo -u postgres env POSTGRES_HOST=/var/run/postgresql \
  POSTGRES_DB=optidbx_phase2 POSTGRES_USER=postgres \
  /opt/optidbx-venv/bin/python -m tests.live_phase2 \
  --scenario parallel --expect CPU_PARALLELISM --output docs/testing/evidence/phase2-parallel.json
```

The opt-in harness reuses `workload.run_workload`; an optional `script_path` passes
the read-only `experiments/phase2_analytical.sql` fixture to pgbench. It does not
implement a separate workload generator. Both runs compare the current parallelism
setting before and after, and the positive run requires a saved recommendation.
Actual hardware may not sustain the four thresholds; a failed assertion is a real
failed scenario, not permission to fabricate values or silently lower thresholds.

For continuous operation while a workload is running, replace the module/arguments
with `python -m autotuner --samples 5`, or start the API with:

```bash
sudo -u postgres env POSTGRES_HOST=/var/run/postgresql \
  POSTGRES_DB=optidbx_phase2 POSTGRES_USER=postgres \
  /opt/optidbx-venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

Then call the start endpoint. No `.env` auto-loading is implied; export variables
in the process environment. On another machine follow the existing PostgreSQL
setup guide and use its database/role instead of copying these machine-specific paths.

PostgreSQL references: [statistics views](https://www.postgresql.org/docs/16/monitoring-stats.html)
and [pg_stat_statements counters/reset information](https://www.postgresql.org/docs/16/pgstatstatements.html).
