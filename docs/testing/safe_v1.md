# Safe V1 verification

Validation ran locally on September 19, 2026; handoff completed September 20.

## Results

| Check | Result | What it establishes |
|---|---|---|
| Python tests, Windows Python 3.11 | 185 passed | Controlled telemetry, lifecycle, API, workload ownership and failure paths |
| Python tests, Ubuntu WSL Python 3.12 | 185 passed | Same suite on Linux; unit doubles remain simulated |
| Tuning/config/actions/managed-workload coverage | 88.45% | Branch-aware coverage; not a whole-repository coverage claim |
| Dashboard Node unit tests | 4 passed | Approval availability, recovery and missing/zero comparison values |
| Playwright Chromium browser tests | 5 passed | Four simulated API flows plus one real WSL/PostgreSQL browser flow |
| Vite production build | Passed | Dashboard bundles successfully |
| Ruff on changed Python files | Passed | Imports, formatting-related checks and configured lint rules |
| Python installed-dependency audit | No known vulnerabilities | `pip-audit` against the environment's pinned dependency snapshot |
| npm audit | No known vulnerabilities | Dashboard dependency lockfile |
| `git diff --check` | Passed | No whitespace errors |

FastAPI/Starlette emit two dependency deprecation warnings in tests; no test fails.
The GitHub Actions workflow repeats unit/coverage/build/audit/simulated-browser
checks. Its default browser run skips the opt-in real PostgreSQL case.

## Real end-to-end tuning result

[Full evidence: experiment 15](evidence/v1-live-cycle.json) was collected through
the actual local HTTP API against PostgreSQL 16 in WSL Ubuntu. No telemetry values
or detection thresholds were altered for this validation.

- HIGH workload: ten explicitly owned sessions, using the existing read-only
  analytical SQL against scale-10 pgbench tables.
- Three baseline intervals confirmed contention; all sessions verified the change
  from `max_parallel_workers_per_gather=2` to `1`.
- Six observation samples were evaluated after 33.84 seconds. Sampling is every
  five seconds, so evaluation occurs on the first eligible complete interval after
  the configured 30-second minimum.
- Baseline latency: **568.60 ms**; observation latency: **722.55 ms**.
- Baseline throughput: **74.79 TPS**; observation throughput: **50.75 TPS**.
- Decision: **ROLLBACK**. The effective setting was verified back at **2** on every
  owned session. This run demonstrated safe rejection of a degraded change.
- The lifecycle reached COOLDOWN and then MONITORING, with 17 paired telemetry
  samples persisted over the 88-second run. The workload stopped and the experiment
  was recorded COMPLETED without unresolved recovery.
- CPU, memory, disk-read and disk-write measurements are included in the evidence
  and in the dashboard comparison. A zero baseline does not display a fabricated
  percentage change.

This is a functional live validation, not a statistically controlled performance
study. DB TPS includes monitoring/storage transactions; OS CPU describes the whole
WSL host. No live KEEP/performance-improvement claim is made. KEEP, missing samples,
verification failure, storage failure, concurrent action exclusion and failed
rollback remain explicitly controlled-data tests.

The first exploratory live run, experiment 13, also applied and rolled back real
session settings: [action snapshots](evidence/v1-live-actions.json) and
[experiment detail snapshot](evidence/v1-live-experiment13.json). These snapshots
were taken while that run was still active; experiment 15 is the complete handoff
evidence.

## Browser validation

The real browser test started LOW workload experiment 16, received real telemetry,
enabled auto mode on owned connections, stopped the workload, and opened the
persisted baseline and experiment-15 rollback comparison.

- [Live dashboard](evidence/v1-live-dashboard.png)
- [Recorded baseline](evidence/v1-live-evaluation.png)
- [Actual rollback comparison](evidence/v1-live-comparison.png)

The four simulated browser tests separately cover workload controls/mode switching,
manual approval using the current action ID, explicit failed-rollback recovery,
and empty experiment storage without invented benchmarks.

## Regression workflow and fixes

The initial RED checkpoint `eb93bb3` captured eight missing integration contracts
and the missing dashboard action-state helper. Subsequent tests exposed missing
workload routes, cooldown release after monitoring stops, and persisted-history
pairing. Implementations then passed those tests.

The full coverage run exposed a concurrent action-record copy/mutation race. Action
snapshots and record mutations now share the lifecycle lock; database operations
remain outside that lock so telemetry continues. A cooldown regression was fixed
without weakening the existing three-new-readings requirement. Other regressions
cover partial group application, restoration across all members despite one member
failing, delayed approval of a still-current recommendation, connection cleanup,
old deadline isolation, query failure, and retention of sessions during recovery.

## Platform limits and remaining scope

No blocker remains for the local safe V1 workflow. Restricted-role PostgreSQL,
network failure behavior beyond configured connection/query timeouts, other
PostgreSQL versions, Windows-native OS actions, and a live successful KEEP are not
claimed as verified. Earlier real affinity/nice and cgroup detection evidence is
in [the Phase 3 report](phase3.tdd.md). cgroup writes, automatic OS actions,
additional DB tuning, ML, authentication and multi-worker deployment are outside
this release.

See [the V1 guide](../safe_v1.md) for setup, exact commands and recovery behavior.
