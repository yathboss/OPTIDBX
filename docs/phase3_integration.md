# Local Phase 2/3 integration handoff

## Starting point and scope

Work began on `yatharth-autotuner` at `f46a277` in
`D:\Enginner Yatharth\OPTIDBX`. `git fetch origin --prune` found no additional
remote commits. Inspected remote tips and their relevant ancestors:

| Branch / commit | Existing work retained |
|---|---|
| `origin/main` — `c9d6591` | Original project notes |
| `origin/yatharth-autotuner` — `66af179` | Yatharth Phase 2 real telemetry integration |
| `origin/shivansh-dashboard` — `f46a277` | Live backend routes and Phase 2 dashboard |
| `origin/aryaman_os` — `746e31b` | Aryaman's existing collectors, storage, health and tests |
| `origin/kartikeya-dbms` — `99a49a9` | DB collector, schema, workload and evaluator work |
| `9bd09de`, `e055625` | Earlier contributor integrations already in this branch |

No new merge was necessary and no merge conflicts occurred. There was no Phase 3
implementation or DB action helper in any fetched branch: both action directories
contained README placeholders. Existing OS telemetry already covered much of
Aryaman Phase 2 despite the phase label. It was extended rather than replaced.

The user's local `Context.md`, `promp1.md`, and `prompt2.md` remain untouched and
untracked. Implementation was initially left uncommitted as requested. The user
subsequently authorized committing and pushing this work to `yatharth-autotuner`.
No PR or merge into `main` was requested.

## Completed OS telemetry integration

Existing CPU, memory, disk/context-switch interval trackers, `OSMetrics`,
`system_metrics`, latest/history queries, and health checks are retained.

- The integrated runtime persists OS samples with its explicit `experiment_id`,
  including when DB telemetry cannot be paired. Storage runs on a separate worker.
- The storage queue has one in-flight write; overload is reported as
  `BACKPRESSURE` rather than blocking sampling. It is not an unbounded or lossless queue.
- Existing offline buffering remains bounded. Buffered records are removed only
  after commit, and access is serialized. An ambiguous connection failure during
  commit can still duplicate retried telemetry; no exactly-once claim is made.
- No hardcoded password fallback remains in OS storage. Connection and statement
  timeouts bound normal storage waits.
- Standalone collection primes CPU in the sampling thread, then waits the configured
  interval. Runtime and collector use the shared 5-second configuration.
- Tracker helpers retain their legacy zero/clamp behavior, with additive
  `interval_valid` flags. The collector rejects unavailable/reset intervals instead
  of presenting their zero values as trustworthy observations.
- `/metrics/os/latest`, `/metrics/os/history`, and `/metrics/os/health` expose access.
  Latest samples carry timestamps; a cached sample is not automatically fresh.

## DB action scope and binding

The user explicitly selected **an explicitly bound workload connection**, leaving
external pgbench auto-tuning unavailable. `BoundWorkloadSession` takes an existing,
named, dedicated autocommit connection; it does not create a monitor connection or
change server/database/role defaults. The owner must run workload SQL through
`execute_workload()` or use the same lock, avoid session GUC overrides/reconnects,
and configure bounded network/query timeouts. The existing `get_connection()` helper
provides connect and statement timeouts.

```python
from actions.db_actions.parallelism import BoundWorkloadSession
from autotuner.runtime import AutotunerRuntime
from config.config_loader import load_config
from db_monitor.storage import get_connection, save_action_event, save_recommendation
from os_monitor.storage import save_system_metrics

config = load_config()
connection = get_connection()  # POSTGRES_* environment, same database/role as telemetry
connection.autocommit = True
workload = BoundWorkloadSession(
    connection, config.safe_values.max_parallel_workers_per_gather,
    workload_id="owned-workload",
)
runtime = AutotunerRuntime(
    config, db_executor=workload, action_store=save_action_event,
    recommendation_store=save_recommendation, os_store=save_system_metrics,
    experiment_id=None,
)
# Execute workload queries on `workload` in the workload owner's thread.
# runtime.start() begins monitoring; recommendation is always the startup mode.
# runtime.set_mode("auto") explicitly opts in to DB actions on this bound session.
# Always runtime.stop() before connection.close(); inspect recovery_required.
```

For a custom API host, inject this same runtime via FastAPI's `get_runtime`
dependency and stop it in that host's shutdown/finally handler. Use **one worker**
and one shared action gate. The default API instance has no bound connection and
rejects auto mode or execution. Workload connection ownership cannot safely be
inferred from external pgbench processes.

The helper reads, applies, and verifies `max_parallel_workers_per_gather` in the
same backend session. PID plus `backend_start` bind identity. Apply rechecks the
old value and exactly one lower approved step; rollback verifies the old value
and refuses to overwrite an unrelated external change. Workload and sampling
run on the same host; use a dedicated database/role without competing workloads
for meaningful before/after comparisons. Existing DB statistics are role/database
aggregates, not exact per-session query tracing.

## Lifecycle and safety

The detector remains pure and still requires three consecutive four-signal readings.
Its confirmed detection and recommendation are produced together on the third
reading. Execution lives in `autotuner/lifecycle.py`, outside the detector:

```text
MONITORING -> BOTTLENECK_CANDIDATE -> BOTTLENECK_CONFIRMED
 -> RECOMMENDATION_READY -> ACTION_APPLIED -> OBSERVING
 -> KEEP / ROLLBACK -> COOLDOWN -> MONITORING
```

- Startup/recommendation mode never auto-applies; explicit manual approval uses the
  same pipeline as auto mode.
- Recent continuous telemetry forms the baseline (default 3 samples). Apply is
  asynchronous; sampling does not wait for an action to finish.
- Observation lasts 30 monotonic seconds, needs at least 5 full intervals, and
  excludes the mixed interval immediately after apply. Missing/stale/gapped
  telemetry or watchdog expiry requests rollback.
- The existing evaluator supplies latency/TPS/CPU comparisons. Configurable
  improvement (5%) and degradation (10%) tolerances are independent. CPU, memory,
  disk reads and disk writes have a 20% resource degradation tolerance, with a
  1 MiB disk noise floor. Inconclusive or unsupported evidence rolls back.
- A verified KEEP or rollback starts a 30-second cooldown while telemetry continues.
  The detector then starts a new confirmation streak. Only one action can hold the
  shared gate, including manual OS requests and concurrent approval requests.
- Audit storage must succeed before mutation. A local recovery journal is flushed
  and atomically replaced before apply. Later storage failure causes rollback;
  rollback remains allowed even when audit storage is offline.
- Failed restore, verification, or recovery cleanup exposes `ROLLBACK_FAILED` and
  retains the action gate. Monitoring restart/mode changes cannot clear recovery.
- A surviving `.optidbx/action-recovery.json` blocks new actions on process restart.
  Manual rollback must match the original recorded session identity. A different
  connection cannot masquerade as successful recovery. If the original connection
  is gone, an operator must verify its termination and reconcile/archive the journal;
  there is deliberately no unconditional API “clear failure” switch.
- One API process is required: the shared gate is in-process, not a distributed lock.
  Do not run independent action owners or multiple uvicorn workers against one target.

## APIs and storage compatibility

Existing status, recommendation and history fields remain. Additive fields include
capabilities, current action evidence, observation/cooldown seconds, recovery flag,
and OS persistence status. These endpoints share one execution pipeline:

| Endpoint | Behavior |
|---|---|
| `POST /tuner/mode` with `{"mode":"auto"}` | Requires explicitly bound workload session |
| `POST /tuner/actions/{action_id}/approve` | Approves only the current fresh recommendation |
| `POST /tuner/actions/{action_id}/rollback` | Verified rollback or recovery retry |
| `GET /tuner/actions` | Structured in-process lifecycle records |
| `GET /tuner/status`, `/tuner/live-status` | Live state and recovery/capability details |
| `GET /tuner/history`, `/tuning/history` | Recommendations plus execution outcomes |

Control rejection is HTTP 409; unavailable/invalid auto mode is HTTP 422. Existing
dashboard layout and its Phase 2 disabled action buttons were preserved. The new
manual controls are available through these API endpoints/Python methods; wiring
those buttons is a separate dashboard task, not an alternate execution pipeline.

No schema migration is required. `save_action_event()` appends events to existing
`tuning_actions`; its `reason` JSON contains UUID, session identity, transitions,
before/after CPU/memory/disk and DB metrics. Existing numeric before/after latency
and throughput columns are populated. Repeated event rows share an action UUID;
history consumers should distinguish events from distinct tuning attempts.

## Manual OS actions

`actions/os_actions/process.py` supports explicit read/apply/verify/restore of
affinity and Linux nice. It requires exact PID whitelisting, caller-supplied creation
time, same UID, and a live original `psutil.Process`. PID 0/1 and the controller's
own PID are rejected. Affinity must be a nonempty whitelisted subset of existing
CPUs; nice must be whitelisted and within -20..19. The original value is retained
for restore. The shared gate is held until restore succeeds, including failure.

Permissions are not assumed: denied apply/restore and stale identities produce
structured results. psutil's guarded setters and pre/post identity checks mitigate
PID reuse, but multiple OS syscalls are not atomic. OS receipt recovery is local to
the live framework instance; retain receipts and keep that owner alive until restore.
No OS actions are called by the automatic loop. cgroup v2 detection reports
controllers and filesystem writability; delegation is not assumed and applying
cgroup changes is explicitly unsupported.

References: [PostgreSQL session settings](https://www.postgresql.org/docs/15/functions-admin.html)
and [psutil process identity and setters](https://psutil.readthedocs.io/stable/).

## Review and delivery

New implementation: `actions/guard.py`, `actions/db_actions/parallelism.py`,
`actions/os_actions/process.py`, `autotuner/lifecycle.py`.
Modified: runtime/models/config; DB event storage; OS collector/trackers/storage;
backend tuner models/routes/provider and OS access routes; `.gitignore`, root/action
READMEs and the Phase 2 flow's historical notice.
Added tests: `test_phase3.py`, `test_phase3_runtime.py`, `test_db_actions.py`,
`test_os_actions.py`, `test_os_phase2_completion.py`; opt-in live scripts
`live_phase3.py` and `live_os_profiles.py`; evidence JSONs and this documentation.

See [verification evidence](testing/phase3.tdd.md) for commands, observed results,
and the distinction between synthetic lifecycle tests and real platform checks.

PowerShell review and delivery commands (the user subsequently authorized the
assistant to perform this commit/push workflow):

```powershell
Set-Location -LiteralPath 'D:\Enginner Yatharth\OPTIDBX'
git switch yatharth-autotuner
git status --short
git diff --check
git diff
# Review new files too: git diff does not display untracked file contents.
.\.venv\Scripts\python.exe -m pytest -q --cov=autotuner --cov=config --cov=actions
.\.venv\Scripts\python.exe -m pip_audit --disable-pip --no-deps -r .venv/audit-requirements.txt
git add .gitignore README.md actions autotuner config backend db_monitor/storage.py os_monitor
git add tests/test_phase3.py tests/test_phase3_runtime.py tests/test_db_actions.py tests/test_os_actions.py tests/test_os_phase2_completion.py tests/live_phase3.py tests/live_os_profiles.py
git add docs/autotuner_flow.md docs/phase3_integration.md docs/testing/phase3.tdd.md docs/testing/evidence/phase3-db-session.json docs/testing/evidence/phase3-os-actions.json docs/testing/evidence/os-phase2-profiles.json docs/testing/evidence/os-phase2-contention.json
git diff --cached --check
git diff --cached
git commit -m "feat: integrate OS telemetry and safe Phase 3 action lifecycles"
git push origin yatharth-autotuner
```

Review the staged paths before committing if you make additional edits. These
commands exclude the three local user briefing files and ignored recovery state.
