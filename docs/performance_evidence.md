# Performance Evidence

Open <http://localhost:3000> and select **Performance Evidence**. Start the API
and dashboard with the [existing local launchers](safe_v1.md) if needed.

This screen compares the same owned PostgreSQL workload in two modes:

- **Baseline:** fixed `max_parallel_workers_per_gather`, recommendation mode,
  and no applied action.
- **Adaptive:** the same starting setting, followed by the existing safe
  auto-tuning policy. Only `REDUCE_DB_PARALLELISM` is available. An action is
  neither forced nor guaranteed.

## Use the screen

1. Stop any manually started workload and wait for cooldown/recovery to finish.
2. Choose **Pilot preset** to check the measurement pipeline. Its default LOW
   comparison has one pair, 5 seconds of warm-up and 30 seconds of measurement
   per run. A pilot cannot support an improvement claim.
3. Choose **Evidence study preset** for five pairs, 30 seconds of warm-up and
   180 seconds of measurement per run. Choose the workload level to study.
   The minimum workload time is 35 minutes, plus setup and action cooldown.
4. Click **Start comparison**. Follow the current run, warm-up/measurement phase,
   query throughput, p95 latency and tuner state. Manual workload and tuning
   controls are disabled while the comparison owns the sessions. The banner's
   **View comparison** opens progress; **Cancel active comparison** safely
   releases the workload before you start a manual run.
5. Review the verdict, paired changes, each run's metrics and action outcomes.
   **Download JSON** includes the configuration, random seed, order, source and
   dataset metadata, measurements and action records. **Download CSV** gives
   per-run measurements, including failed/partial runs.
6. **Cancel comparison** stops through the workload's existing restoration
   pipeline. A restoration failure is FAILED, with the error visible; original
   sessions remain available for manual recovery. Cancel does not erase evidence.

Keep the host awake and avoid unrelated load or writes to the demo dataset during
a study. Do not repeatedly select only the best result: retain all comparisons.
The runner does not flush OS/PostgreSQL caches or change machine-wide settings.
Randomized order within each pair and consistent warm-up reduce order effects;
they cannot eliminate all effects of background load or thermal/cache state.

## What is measured

The existing read-only aggregate in `experiments/phase2_analytical.sql` runs on
1/4/10 owned sessions for LOW/MEDIUM/HIGH, using the shared configuration.
Measurements use a monotonic clock around each owned query round trip, including
session-identity checks and waiting at the action barrier. Monitoring/storage
transactions do not contribute to query throughput.

Only queries wholly inside the fixed measurement window count. Successful queries
provide median and p95 latency; failed queries and SQL cancellations/timeouts are
counted separately. A query failure stops the run and prevents a positive claim.
At most 250,000 latency samples are retained; overflow invalidates a claim instead
of silently estimating from a truncated sample. Warm-up queries are excluded.

These direct workload measurements are distinct from the existing dashboard DB
statistics, which are database-wide, and from the tuner's existing telemetry-based
KEEP/ROLLBACK evaluation. CPU, memory and disk telemetry remain available through
the live/history views and each run's experiment ID. This feature does not change
the detector or force it to act. A verified rollback proves recovery, not speed.

## Verdict rules

Criteria are copied into the report before starting any workload. Baseline and
adaptive runs start with the same verified approved parallelism value, and each
pair's order is randomized with its seed saved. Auto mode begins only after
warm-up; confirmation and baseline history are reset at that boundary.

| Verdict | Meaning |
| --- | --- |
| NOT_EVALUATED | No completed comparison has been evaluated. |
| INCONCLUSIVE | Pilot, incomplete/failed measurements, insufficient samples, no automatic change, or benefit not established. |
| IMPROVEMENT_SUPPORTED | All minimum criteria pass, throughput's 95% paired bootstrap interval is at least +10%, p95's upper bound is at most +5%, errors do not increase, and an automatic change was verified. |
| REGRESSION_OBSERVED | In a complete eligible study, throughput's upper bound is below -5%, p95's lower bound exceeds +5%, or a paired error rate increases. |

Eligibility requires all requested pairs, at least five pairs, at least 30 seconds
warm-up and 180 measured seconds per run, and at least 30 successful queries in
every run. The confidence interval uses 5,000 deterministic paired bootstrap
resamples of percentage changes. With one pair, uncertainty is unavailable.
Small-sample intervals are exploratory; even a supported result applies only to
this workload, configuration, dataset and host. No general speedup is promised.

## Storage and interfaces

No PostgreSQL migration is required. Existing experiments, system/DB metrics and
action history retain their schemas. Workload status adds optional
`measurements` and `benchmark_id` fields. Comparison artifacts are atomic, fsynced JSON snapshots in
`.optidbx/benchmarks/`, separate from the PostgreSQL telemetry tables and ignored
by Git. Run as one local API process with write access to that directory.

| Endpoint | Purpose |
| --- | --- |
| `GET /benchmarks` | Latest 100 reports, including in-memory progress. |
| `POST /benchmarks/start` | Start an exclusive comparison. |
| `POST /benchmarks/cancel` | Request cancellation and safe cleanup. |
| `GET /benchmarks/{id}/export?format=json` | Full report download. |
| `GET /benchmarks/{id}/export?format=csv` | Per-run table download. |

Start accepts `profile`, `repetitions` (1–10), `warmup_seconds` (0–120),
`measurement_seconds` (30–480), and `initial_parallelism` (shared whitelist).
No arbitrary SQL, process targeting or additional DB parameter can be supplied.
Invalid requests return 422, occupied/unsafe controls 409, and unavailable evidence
storage 503. Existing API origin restrictions apply to these controls.

Evidence must be stored before workload startup. Later storage failure stops the
comparison and is visible in its in-memory status. On API restart, an unfinished
persisted comparison becomes INTERRUPTED and INCONCLUSIVE; it is not resumed on
new sessions. If final storage failed, the last durable snapshot may be incomplete.
Reports are not tamper-evident and there is no multi-host/multi-worker coordinator.

The manifest records Git revision and whether tracked files were modified at
startup, query hash/text, shared configuration, PostgreSQL version, database name,
dataset row count and runtime platform. The dataset row count is not a content
checksum. Configuration and code must remain unchanged during a study. A Git
lookup failure is recorded as unavailable, never substituted with a guessed hash.

See [test results and real pilot evidence](testing/performance_evidence.tdd.md).
The [control-feedback regression report](testing/control_feedback.tdd.md) records
the browser error fix and the subsequent full HIGH study's timeout failure.
