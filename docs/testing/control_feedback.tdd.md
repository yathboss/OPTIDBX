# Browser control feedback fix

2026-09-20, branch `yatharth-autotuner`, starting commit `e90d96d`.
The user reported “Failed to fetch” and a disabled Start Workload button while
the HIGH comparison owned the workload.

## Cause and change

The control-protection middleware returned 409 before the inner CORS middleware
ran. A trusted browser therefore could not read the rejection body and reported
a fetch failure. CORS now wraps control protection; the same localhost/127.0.0.1
origin whitelist remains enforced. Untrusted origins are still refused.

Workload status now exposes optional `benchmark_id`. The UI displays a clear
comparison ownership banner with View comparison and Cancel active comparison.
Manual workload/tuning controls stay disabled while ownership is held, including
between runs. The running profile/duration are displayed instead of the draft
values for the next run. Missing workload status cannot enable Start Workload.
No storage schema, tuning thresholds, query timeout or success criteria changed.

## RED/GREEN evidence

Journeys were derived from this bug report: read the real rejection, understand
the lock, cancel safely, and regain manual start/stop control.

- `0235502`: 7 backend regressions failed (6 missing CORS headers and missing
  ownership metadata); the untrusted-origin check passed. Both new browser
  regressions failed (missing ownership explanation and falsely enabled Start).
- `dd29edf`: 58 focused Python tests and both browser regressions passed.

Final validation:

```powershell
.\.venv\Scripts\python.exe -m pytest -q --cov=autotuner --cov=actions --cov=config --cov=workload.managed --cov=workload.runner --cov=workload.measurements --cov=experiments.evidence --cov=experiments.benchmark --cov=backend.routes.benchmarks
```

**219 passed**, 89.43% coverage of the selected core/evidence sources. Tests in
`tests/test_control_feedback.py` separately check the middleware and status model.
Two pre-existing FastAPI/Starlette deprecation warnings remain.

In `dashboard/`: `npm test` **4 passed**; `npm run build` passed;
`npm run test:e2e` **8 passed, 3 opt-in live tests skipped**. Simulated browser
regressions are in `control-feedback.spec.js`. Ruff passed on changed Python
files; dependency audits found no known vulnerabilities. No dependency was added.

## Actual browser and PostgreSQL check

```powershell
$env:OPTIDBX_CONTROLS_LIVE='1'
npm run test:e2e -- --grep 'real browser reads comparison conflict'
Remove-Item Env:OPTIDBX_CONTROLS_LIVE
```

**1 passed in 13 seconds**. No HTTP interception: the test started a LOW comparison
through the UI, performed a real cross-origin browser POST while it owned the
controls, received/read HTTP 409, cancelled through the new banner, then started
and stopped a manual PostgreSQL workload (experiment 25, completed queries > 0).
The final API status had `running=false`, `benchmark_id=null`,
`recovery_required=false`, and no workload error. Both local servers responded.

[Actual fixed UI screenshot](evidence/control-feedback-fixed.png).

## Preserve the failed full study

The earlier full HIGH study `fbcc1142-bf2a-4e1d-9434-430050cb0576` is **FAILED /
INCONCLUSIVE**. Its first adaptive run (experiment 22) completed and recorded
three rollback outcomes. The baseline (experiment 23) then recorded one
query cancellation/timeout and stopped after about 95.8 measured seconds.
The five-pair study did not finish; it establishes no performance improvement.

The [original failed report](evidence/performance-evidence-high-failed.json)
remains available both locally and through the UI. The UI repair neither erases
this failure nor relaxes the timeout to make the study appear successful.
Further long-duration performance validation remains outstanding.
