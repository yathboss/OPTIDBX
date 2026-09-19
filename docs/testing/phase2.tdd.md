# Phase 2 verification

Source: the user's local `prompt2.md`. Scope: real collectors -> fresh paired
telemetry -> sustained four-signal detection -> safe recommendation -> storage/API.
No automatic tuning, new storage schema, dashboard redesign, or collector replacement.

## Delivery files and Git handoff

Created: `autotuner/telemetry_coordinator.py`, `autotuner/runtime.py`,
`autotuner/__main__.py`, `backend/services/live_runtime.py`,
`tests/test_phase2.py`, `tests/test_db_interval.py`, `tests/live_phase2.py`,
`tests/mock_providers.py`, `experiments/phase2_analytical.sql`,
`docs/autotuner_flow.md`, this report, and the two JSON evidence files.

Modified: autotuner models/engine; shared config/loader; DB collector/storage;
backend main, tuner models/routes, telemetry/tuner service adapters; workload
runner's optional script argument; existing engine/backend/OS tests; root README,
DB/shared interface docs, and the Ruff configuration in `pyproject.toml`.

All work is committed on `yatharth-autotuner`. To publish committed work:

```bash
git switch yatharth-autotuner
git fetch origin
git merge origin/main
git diff origin/main...HEAD
git push origin yatharth-autotuner
```

No additional commit is needed for delivered files. For later edits, stage the
specific files, run the checks above, and use `git commit -m "fix: describe change"`.
`Context.md`, `promp1.md`, and `prompt2.md` remain local, untracked user briefings.

## TDD checkpoints

- `3af221c`: added Phase 2 regressions. `python -m pytest -q tests/test_phase2.py
  tests/test_db_interval.py --tb=line` initially reported **18 failed, 5 passed**.
  Failures included missing coordinator/runtime, fabricated API defaults, unknown
  parameter being guessed as 2, and absent recommendation persistence.
- `63a2aa5`: same targets reported **23 passed** after implementation.
- Later regression: the existing workload runner rejected `script_path` with
  TypeError. Added that optional pgbench argument, retaining the existing runner.
- Phase 1 tests were updated for the explicitly changed state names and now inject
  test-only mock API providers. Incoming OS fallback tests explicitly mock offline
  PostgreSQL instead of relying on a developer's database being unavailable.

## Final automated checks

`python -m pytest -q --cov --cov-report=term-missing`: **108 passed** on both
Windows Python 3.11.9 and WSL Ubuntu Python 3.12.3. Two upstream TestClient
deprecation warnings remain. Core coverage (`autotuner`, `config`) is **86.05%**;
engine, selector, detector, and models are 100%, runtime 87%, coordinator 95%.
This percentage does not claim coverage of all inherited team modules. CLI entry
points are exercised separately/in subprocesses and are not measured in this report.

| Guarantee | Evidence |
|---|---|
| Small timestamp skew works without changing source timestamps | test_phase2 coordinator tests |
| Stale, future, duplicated, out-of-order and invalid inputs cannot confirm | coordinator and Phase 1 engine tests |
| One/two bad readings and Bad/Normal/Bad do not confirm | test_phase2 and test_autotuner_mock |
| Three bad readings confirm with reason/evidence; floor is respected | test_phase2 engine tests |
| Repeated confirmation retains one action ID and one persistence attempt | test_phase2 runtime tests |
| DB resets/evictions/empty intervals do not fabricate latency | test_db_interval |
| Unknown setting is None, never a guessed default | test_db_interval, test_phase2 |
| Runtime start/stop is idempotent and invalid status clears actions | test_phase2 lifecycle tests |
| API defaults are live, no fake metrics, auto is rejected | test_phase2 live API tests |
| Existing schema receives RECOMMENDED plus serialized evidence | test_db_interval and live SQL verification |

Scoped Ruff lint/format checks cover all new or modified implementation files.
`git diff --check` passed. Auditing the exact installed Windows dependency set
with `python -m pip_audit --disable-pip --no-deps -r .venv/audit-requirements.txt`
reported **No known vulnerabilities found**. The audit input contains installed
transitive dependencies and remains ignored. No frontend code/dependencies changed.

## Live PostgreSQL evidence

Environment: local WSL Ubuntu, PostgreSQL 16.15, 16 logical CPUs, dedicated
`optidbx_phase2` database, existing schema, pg_stat_statements, scale-10 pgbench data.
The user authorized installing prerequisites. The test role uses Unix peer auth;
no secret is stored in evidence files.

Commands (from the workspace in WSL, prefixed with `sudo -u postgres env
POSTGRES_HOST=/var/run/postgresql POSTGRES_DB=optidbx_phase2 POSTGRES_USER=postgres`):

```bash
/opt/optidbx-venv/bin/python -m tests.live_phase2 --scenario normal \
  --expect NONE --output docs/testing/evidence/phase2-normal.json
/opt/optidbx-venv/bin/python -m tests.live_phase2 --scenario parallel \
  --expect CPU_PARALLELISM --output docs/testing/evidence/phase2-parallel.json
```

Both recorded runs collected five real paired intervals. The harness requires at
least three, verifies FastAPI against the live runtime, queries stored actions,
and checks parallelism before/after is unchanged.
See [normal evidence](evidence/phase2-normal.json) and
[parallel evidence](evidence/phase2-parallel.json) for exact timestamps/measurements.

Earlier live checks also showed:

- LOW: five NONE results, no recommendation; CPU approximately 6–10%, zero workers.
- A lighter double-precision aggregate saturated CPU but stayed around 100 ms
  latency. It correctly produced NONE with the configured 200 ms threshold.
- The numeric aggregate confirmed on sample 3 at CPU 99.7%, 4059 context switches,
  7 workers, 584.638 ms latency; one 2 -> 1 recommendation was saved and exposed by
  FastAPI. The current setting stayed 2 throughout.
- An initial fixture failed on negative balances. The workload was marked FAILED;
  the query was fixed to use abs(), and the harness now rejects early workload exit.

Thresholds stayed at the original experimental defaults; none were lowered to make
a run pass. Results demonstrate detection/recommendation integration, not a measured
performance improvement or proof that reducing parallelism would help.

## Remaining team work / limits

- Kartikeya: review the documented corrected metric semantics and provide actual
  workload-session GUC reporting if session overrides are introduced. The current
  setting read is valid only for matching database/role without overrides.
- Aryaman: coordinate further counter-reset quality metadata. Runtime currently
  uses existing OS delta/CPU methods in one sampling thread on the DB host.
- Shivansh: render the new structured recommendation/evidence/freshness fields;
  experiment endpoints still have Phase 1 fixture data. No browser E2E claim here.
- Status/history buffers and per-episode deduplication are process-local; storage
  failure is reported, not silently retried. Restart recovery is deferred.
- No parameter application, rollback, cooldown execution, adaptive thresholds,
  or performance-improvement comparison is implemented in Phase 2.
