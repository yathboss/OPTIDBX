# Safe V1: run and review

OptiDBX V1 runs a local, bounded PostgreSQL workload, samples OS and DB telemetry,
detects sustained CPU/parallelism contention, and recommends or safely applies one
lower approved `max_parallel_workers_per_gather` value. The dashboard controls this
same execution pipeline and displays recorded experiment results.

## Run on this workspace

Path: `D:\Enginner Yatharth\OPTIDBX`; branch: `yatharth-autotuner`.
This machine already has Ubuntu WSL, PostgreSQL 16, the `optidbx_phase2` database,
pgbench scale 10 tables, and `/opt/optidbx-venv` installed. Start PostgreSQL if needed:

```powershell
wsl -d Ubuntu -- service postgresql start
Set-Location 'D:\Enginner Yatharth\OPTIDBX'
.\scripts\start_v1.ps1
```

In a second PowerShell terminal:

```powershell
Set-Location 'D:\Enginner Yatharth\OPTIDBX'
.\scripts\start_v1.ps1 -Dashboard
```

Open <http://localhost:3000>. The API is <http://localhost:8000/docs>.
The local launcher uses peer authentication as the Linux `postgres` account when
WSL runs as root; it contains no password. Use one API worker and bind to loopback.
Do not expose this unauthenticated local control API publicly.

1. Choose LOW, MEDIUM, or HIGH and 30–600 seconds, then **Start Workload**.
   These profiles use 1, 4, and 10 explicitly owned analytical sessions by default.
   The SQL is the existing read-only `experiments/phase2_analytical.sql` fixture.
2. Startup is **Recommendation Mode**. After three consecutive bad readings,
   **Apply Recommendation** performs a manual approval through the same pipeline.
3. **Auto-Tuning** opts in to automatic execution for this owned workload only.
   LOW need not trigger any recommendation; HIGH does not guarantee one either.
4. Follow observation, the KEEP/ROLLBACK result, and cooldown in the dashboard.
   **Rollback** restores the original setting; failed recovery blocks new actions.
5. **Stop Workload** stops queries, resolves an active action, restores a kept
   setting before closing sessions, and finishes the experiment. Wait for any
   remaining cooldown before starting another run.
6. Open **Evaluation & Benchmarks**, then **View run** for stored averages,
   action comparisons, and recorded telemetry. Empty storage stays empty.
7. Open **Performance Evidence** for repeated baseline/auto comparisons with
   direct workload timings, frozen verdict criteria and JSON/CSV downloads.
   See [the comparison guide](performance_evidence.md).

Stopping monitoring during an observation requests rollback. A kept setting stays
on its owned session until manual rollback or workload stop. Changing to
recommendation mode stops future automatic approvals; it does not interrupt an
already active observation. External pgbench runs can be monitored but cannot be
automatically tuned through a separate connection.

## Setup on a new Linux/WSL installation

Use Python 3.11+, Node 22+, and PostgreSQL 16 with `pg_stat_statements`. In Ubuntu:

```bash
sudo apt-get update
sudo apt-get install -y postgresql postgresql-contrib python3-venv
python3 -m venv .venv-linux
.venv-linux/bin/python -m pip install -r requirements-dev.txt
cd dashboard
npm ci
cd ..
```

Use a **dedicated demo database**. Add `pg_stat_statements` to the existing
`shared_preload_libraries` setting without discarding other entries, then restart
PostgreSQL. The extension needs preload plus a database-level `CREATE EXTENSION`;
see the [PostgreSQL 16 documentation](https://www.postgresql.org/docs/16/pgstatstatements.html).

As a database administrator, create a dedicated database and enable the extension;
apply `database/schema.sql`. Initialize pgbench tables **only in a new disposable
demo database**, since `pgbench -i` replaces its benchmark tables:

```bash
createdb optidbx_demo
psql -d optidbx_demo -c 'CREATE EXTENSION IF NOT EXISTS pg_stat_statements'
psql -d optidbx_demo -f database/schema.sql
pgbench -i -s 10 optidbx_demo
```

Run these commands under the appropriate local database account or configured
authentication. Export `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`,
`POSTGRES_USER`, and, only if required, `POSTGRES_PASSWORD` in your environment.
The Python API does not automatically load `.env`. Use a role with access to the
demo tables, telemetry tables, sequences, and statistics. The recorded validation
used the local postgres administrator; restricted-role deployment has not been
validated end to end.

```bash
.venv-linux/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --workers 1
```

Run the API on the PostgreSQL host so OS telemetry describes the database machine.
Keep unrelated workloads off the demo database. Latency is based on statement
statistics and TPS on database transactions, including monitoring/storage overhead;
these are not isolated per-session benchmark measurements.

## Safety and interfaces

- Shared `config/config.yaml`: 5-second sampling, three-reading confirmation,
  30-second observation, 30-second cooldown, value whitelist and metric tolerances.
- New `BoundWorkloadGroup` reuses `BoundWorkloadSession`. It pauses query admission,
  drains in-flight work, checks session identity, changes each owned session and
  verifies every result. Partial application attempts restoration on every member.
- One existing shared action gate covers manual/automatic DB requests and manual
  OS actions. No automatic OS actions, `work_mem`, memory tuning, ML, server/role
  defaults, or cgroup writes were added. Affinity/nice remain separate explicit
  Python APIs under `actions/os_actions`; cgroup v2 remains capability detection.
- The local recovery journal and PostgreSQL audit must be written before applying.
  Unresolved rollback retains the original connections and blocks further actions.
  Use **Retry Rollback**, then **Stop Workload** after recovery succeeds.
- After a process crash, the journal remains fail-closed. Do not delete it merely
  to unblock tuning. An operator must inspect the original backend PID and
  `backend_start`, confirm session termination/restoration, and archive the journal
  before restarting. New connections cannot impersonate old recovery targets.
- OS and DB telemetry writes are asynchronous and bounded. Storage failures and
  backpressure are reported, and sampling continues. This is not lossless or
  exactly-once storage. Invalid DB samples are never persisted as default zeros.
- No schema migration: existing `experiment_runs`, `system_metrics`, `db_metrics`,
  and `tuning_actions` tables are reused. Action evidence stays in JSON inside the
  existing reason column.
- Added `POST /workload/start` (`profile`, `duration_seconds`) and `/workload/stop`.
  Status adds owned clients, completed queries, errors, and recovery state.
  `/metrics/history?experiment_id=...` now reads that experiment, pairing recorded
  timestamps within the configured skew without filling missing measurements.
- Tuner status adds DB persistence and retains the last completed action. Experiment
  details add actual aggregate metrics and deduplicated action records. Storage
  outages return 503 rather than fabricated experiments or silent empty results.
- Browser mutations accept only the local dashboard origins. CLI requests without
  Origin remain supported. Authentication and multi-process coordination are
  outside this local V1.

## Verification and evidence

See [V1 test evidence](testing/safe_v1.md). The live result was **ROLLBACK**, not a
performance win. KEEP and failure paths are also covered with controlled test data.
The earlier [Phase 3 handoff](phase3_integration.md) documents OS validation and
historical branch integration; its default-unbound-dashboard limitation is now
resolved by starting an owned workload.

```powershell
Set-Location 'D:\Enginner Yatharth\OPTIDBX'
.\.venv\Scripts\python.exe -m pytest -q --cov=autotuner --cov=actions --cov=config --cov=workload.managed --cov=workload.runner
Set-Location dashboard
npm test
npm run build
npm run test:e2e
```

The default browser suite uses explicitly simulated API responses. To run the real
browser test, keep the initialized API running and set `$env:OPTIDBX_LIVE='1'` before
`npm run test:e2e`. It creates and stops a real LOW workload.

To repeat the real HIGH tuning cycle, stop other workloads and run from the root:

```powershell
.\.venv\Scripts\python.exe scripts/validate_v1_live.py --output .optidbx/live-validation.json
```

It uses unchanged detection thresholds and reports failure if a complete cycle is
not observed. Hardware load can affect whether the contention threshold is reached.

## Git handoff

V1 started at `b2cdaeb` on `yatharth-autotuner`. Remote refs were fetched and
inspected; no new contributor commits needed merging. Existing Phase 2/3 modules,
schema and dashboard structure were retained. There were no merge conflicts.
The local briefing files `Context.md`, `promp1.md`, and `prompt2.md` were preserved
and excluded from commits. Changes were committed and pushed only to
`yatharth-autotuner` under the user's later push authorization; no PR or main merge.

Review with:

```powershell
Set-Location 'D:\Enginner Yatharth\OPTIDBX'
git status --short
git log --oneline -5
git diff b2cdaeb..HEAD --stat
git diff b2cdaeb..HEAD -- autotuner workload backend dashboard
```

For your subsequent edits, stage explicit paths, review, commit, and push:

```powershell
git add -- <paths-you-reviewed>
git diff --cached
git commit -m "Describe your change"
git push origin yatharth-autotuner
```
