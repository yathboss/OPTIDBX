# Guided demo and report validation

Starting branch: `yatharth-autotuner`, starting commit `b94254f`.
No merges, remote changes or database schema changes were required.

## Changes

- Read-only `GET /demo/setup`: explicit non-secret shared workload/timing/safe-value
  fields and existing OS framework capability detection. No new mutation route.
- Four horizontal navigation tabs; guided workload and recommendation flow;
  separate continuous-auto choice; existing manual controls preserved in details.
- Frozen report previews, browser print/PDF, JSON and spreadsheet-safe CSV.
  Stored no-action runs and incomplete/failed observations stay explicit.
- Deduplicated error/state pop-ups, notification history and persistent recovery
  notice. No detector, tuning threshold or workload SQL changes.

## RED / GREEN evidence

Before production changes, `node --test dashboard/tests/report.test.mjs` failed
with missing `demoModel.mjs`; `pytest tests/test_demo_setup.py -q` failed because
the new route returned 404. Both were run, not merely inferred to fail.
The RED test checkpoint was committed after implementation had begun; this is a
deviation from the skill's immediate checkpoint timing. The tests and observed
RED results predate their production implementation; history was not rewritten.

The report tests verify retained verification evidence, frozen values, percent
changes, zero/missing baselines, CSV formula protection and lifecycle mapping.
The API test checks shared config and prevents credential-section exposure.

Validation completed:

- Full Python suite: 220 passed. Two existing upstream deprecation warnings.
- Node units: 7 passed. Pure model/action helpers: 100% line coverage,
  88.89% combined branch coverage (demo model: 86.84%).
- New backend route: 100% coverage. React component coverage was not measured;
  browser journeys validate behavior, not a claimed whole-app coverage figure.
- Controlled browser suite: 14 passed; four opt-in live tests excluded from default
  run. Fixtures validate controls, errors, reports and narrow-screen navigation;
  their screenshots are explicitly named `simulated`.
- Separate `OPTIDBX_DEMO_LIVE=1` rehearsal: 1 passed against WSL PostgreSQL.
  Started LOW, observed real completed queries/live telemetry, stopped it, then
  generated a PDF from stored real experiment 35 (ROLLBACK, verified 2 → 1 → 2).
  This is historical tuning evidence, not a newly observed tuning improvement.
- Production Vite build passed. npm audit: zero vulnerabilities.
- Python application requirements audit: no known vulnerabilities.
- Installed Windows Python audit flags pre-existing pip 24.0 / setuptools 65.5.0
  tooling vulnerabilities. No dependency was added or modified by this change.

PDF rendering initially exposed clipped content caused by printing the modal
dialog itself. A new browser regression was run and failed (`.print-export`
missing), checkpointed in `63d1ebc`, then passed after separating the full print
document from the scrollable modal. The regenerated four-page live PDF was
rendered and checked for its title, experiment identity, all four action tables
and limitations. A local ignored PyMuPDF utility was used for PDF inspection;
it is not an application dependency.

Browser artifacts: `evidence/guided-demo-live.png`, `guided-report-live.png`,
`guided-report-live.pdf`, and separately labelled simulated screenshots.

## Limits

No new full paired performance study or live manual OS tuning was performed.
OS settings are recommended unchanged; process actions remain a separate Python
framework. PDF pagination uses the browser print engine; use Save as PDF in the
print dialog. Reports preserve unavailable data instead of inventing it.

See `docs/guided_demo.md` for the panel walkthrough.
