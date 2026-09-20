# Performance Evidence: validation record

Date: 2026-09-20. Journeys were derived from the user's request to see and verify
OptiDBX's claims in the UI; no external plan file was used.

Starting point: `yatharth-autotuner`, `5d8bbb0` (safe V1). The existing owned
workload, safe action lifecycle, experiment APIs and telemetry persistence were
inspected and reused. This task adds the comparison runner, direct measurements,
verdicts, dashboard tab and exports. No merge or conflict resolution was needed;
fetch confirmed no unseen commits on the upstream branch. The local briefings
`Context.md`, `promp1.md`, and `prompt2.md` were left untracked and unchanged.

## Journeys and RED/GREEN checkpoints

| Journey / guarantee | RED evidence | GREEN evidence |
| --- | --- | --- |
| Compare owned-query performance with frozen criteria; no fabricated results | `88aabaf`: six missing measurement/evaluation/storage/API contracts failed | `4c77c63`: six tests passed |
| Start/cancel from the evidence tab; preserve partial and failed reports | `441d408`: missing UI, partial-run loss and failed-start state reproduced | `af1899d`: 10 backend tests and 2 browser tests passed |
| Prevent concurrent manual interference; disclose unresolved cleanup | `b54504e`: 2 failures, 22 passes | `a8b1096`: 48 focused backend tests passed |
| Do not estimate between-run uncertainty from one pair; disclose dirty source | `53b2a88`: 2 failures, 24 passes | `7cde03d`: 26 tests passed; subsequent real pilot passed |

`807ef0e` formats the implementation and adds an opt-in real browser test. All
checkpoints are reachable on the active branch; they have not been squashed.

## Automated results

These commands were run from the repository root, except npm commands in
`dashboard/`. Python tests use controlled data/doubles unless explicitly identified
as the live browser pilot below. They do not prove a real speedup.

```powershell
.\.venv\Scripts\python.exe -m pytest -q --cov=autotuner --cov=actions --cov=config --cov=workload.managed --cov=workload.runner --cov=workload.measurements --cov=experiments.evidence --cov=experiments.benchmark --cov=backend.routes.benchmarks
```

Final Windows result: **211 passed**, **89.43%** combined statement/branch
coverage for those sources. The WSL full suite passed 209 tests before the last
two provenance/uncertainty tests; the final WSL evidence suite passed all **26**
tests with **95.33%** coverage for the four new measurement/evidence/API modules:

```powershell
wsl -d Ubuntu --cd 'D:\Enginner Yatharth\OPTIDBX' -- bash -lc '/opt/optidbx-venv/bin/python -m pytest tests/test_evidence.py -q --cov=experiments.evidence --cov=experiments.benchmark --cov=workload.measurements --cov=backend.routes.benchmarks'
```

| Guarantee | Test location | Type / result |
| --- | --- | --- |
| Warm-up/monitor traffic excluded; median/p95/counts/errors/timeouts correct | `tests/test_evidence.py` | Controlled unit tests, pass |
| Overflow, incomplete/duplicate pairs and absent actions cannot support claims | Same | Controlled unit tests, pass |
| Known repeated positive and negative data exercise both verdicts | Same | Simulated evidence only, pass |
| Occupied workload, cooldown and unapproved values are refused | Same | Controlled coordinator tests, pass |
| Cancel/failed restore/initial disk failure/restart retain honest states | Same | Fault-injection tests, pass |
| A manual approval rechecks reservation at its execution boundary | Same | Controlled race-window regression, pass |
| JSON/CSV, validation, missing records and storage errors are explicit | Same | TestClient integration, pass |
| UI start, cancel, inconclusive verdict and export link are connected | `dashboard/tests/e2e/evidence.spec.js` | 2 simulated browser tests, pass |
| Existing manual controls/recovery/empty history remain correct | `dashboard/tests/e2e/controls.spec.js` | 4 simulated browser tests, pass |

`npm test`: **4 passed**. `npm run build`: passed (204.74 kB application JS before
gzip). `npm run test:e2e`: **6 passed, 2 skipped**. The two opt-in live tests are
skipped in ordinary runs/CI; the evidence pilot was explicitly enabled and passed.
The older V1 live test is documented in [its original report](safe_v1.md).

Ruff check passed for all new Python modules plus the modified runner, API entry,
tuner routes and workload service. `git diff --check` passed. `npm audit` reported
0 vulnerabilities; `pip_audit --disable-pip --no-deps -r .venv/audit-requirements.txt`
reported no known vulnerabilities against the installed dependency inventory.
No new dependencies were added. Two existing FastAPI/Starlette deprecation
warnings remain; no tests failed because of them.

## Real WSL/PostgreSQL pilot

Command, in `dashboard/`:

```powershell
$env:OPTIDBX_EVIDENCE_LIVE='1'
npm run test:e2e -- --grep 'real PostgreSQL pilot'
Remove-Item Env:OPTIDBX_EVIDENCE_LIVE
```

Result: **1 passed**, approximately 1.2 minutes. This test drives the actual UI
without API interception, runs both modes, reads persisted telemetry by experiment
ID, downloads a CSV, checks browser errors and saves the report/screenshot.

Latest comparison: `77ea2bab-3cac-4d78-aa99-200cd13eb731`, PostgreSQL 16.15 in
WSL Ubuntu, `optidbx_phase2`, 1,000,000 account rows, LOW/one owned client,
starting parallelism 2. One pair, 5 seconds warm-up and 30 measured seconds per
run. The seeded order was baseline then adaptive.

| Measurement | Baseline, experiment 20 | Adaptive, experiment 21 |
| --- | ---: | ---: |
| Successful queries in window | 200 | 195 |
| Queries/s | 6.6667 | 6.5000 |
| Median latency ms | 149.7980 | 152.5193 |
| p95 latency ms | 162.5502 | 174.8912 |
| Errors / timeouts | 0 / 0 | 0 / 0 |
| Applied actions | 0 | 0 |

Verdict: **INCONCLUSIVE**. No setting change was triggered. A one-pair pilot
cannot estimate variation or establish a tuning benefit/regression. The measured
-2.5% throughput and +7.59% p95 differences must not be attributed to tuning.
Both runs were executed on real PostgreSQL with a synthetic analytical workload.

- [Actual JSON export](evidence/performance-evidence-pilot.json)
- [Actual UI screenshot](evidence/performance-evidence-pilot.png)

The manifest identifies `7cde03d6bd0cc98b8767551a332d3b0b7bd164e2` and correctly
marks the tracked working tree dirty (formatting changes were still present).
The previous local pilot also passed, experiments 18/19, and remains in local
artifact storage. It exposed two issues subsequently fixed: missing Git provenance
under the PostgreSQL service account, and a meaningless one-pair interval. Its
original artifact was not rewritten. The latest screenshot/report supersede it
as the checked-in demonstration. No repeated full study was run.

## Interface, storage and limits

New source files are `workload/measurements.py`, `experiments/evidence.py`,
`experiments/benchmark.py`, `backend/routes/benchmarks.py` and
`dashboard/src/components/PerformanceEvidence.jsx`. The existing runner, workload
status model, API entry/tuner controls, dashboard navigation/API/CSS and CI were
extended. Test files and documentation are linked above.

No PostgreSQL schema change. Comparison snapshots live in ignored local
`.optidbx/benchmarks/`; OS/DB telemetry and action records use existing tables.
Only the explicitly named real export and screenshot were copied into docs.
Controls share the existing session ownership, approved value list, action gate,
verification, rollback and cooldown behavior. No OS automation, memory tuning,
work_mem changes or detector rewrites were added.

No implementation blocker remains for the local pilot/study UI. A real sustained
improvement, full five-pair study, restricted PostgreSQL role, forced live disk
failure, forced live rollback failure and multi-host reproducibility remain
unverified. Failure verdicts are tested with controlled faults; earlier actual
rollback evidence is in the V1 report. Artifacts are not tamper-evident. The tool
does not control background applications or verify a full dataset checksum.

## Review and use

```powershell
Set-Location 'D:\Enginner Yatharth\OPTIDBX'
git switch yatharth-autotuner
git status --short
git log --oneline 5d8bbb0..HEAD
git diff 5d8bbb0..HEAD --stat
# Startup, in separate terminals when the services are not already running:
.\scripts\start_v1.ps1
.\scripts\start_v1.ps1 -Dashboard
```

The task's code and evidence are committed on `yatharth-autotuner`. For subsequent
edits, stage only intended paths, then `git commit -m "Describe the change"` and
`git push origin yatharth-autotuner`. No main merge or PR is part of this task.
