# Owned-workload evaluation safety and experiment checkpoint

## Objective and starting state

Target: genuinely beneficial actions, aiming for >=50% KEEP among completed valid
performance evaluations. This is not a forced success quota. Performance rollbacks,
workload-stop restores, failed/incomplete evaluations and NO_ACTION must be reported
separately, together with action frequency and real baseline-relative performance.

Work began on `yatharth-autotuner` at `e80c2c2`, preserving Claude's uncommitted
owned-measurement, net-benefit policy and rejection-memory implementation. The
baseline suite passed 233 tests. No merges, pushes, schema migrations or commits
were made during this continuation. Briefing files and `.claude-flow/` were preserved.

## Corrections made

- Require a complete warm owned baseline **before applying**. Defaults: 15 seconds
  warm-up then a complete 25-second baseline with >=30 completed queries.
- Freeze the baseline before the read/apply admission barriers. Compare it against
  a fixed 25-second observation after the five-second settling interval. Late
  callbacks do not enlarge the window.
- Queries must start and finish inside their measurement window. Apply and restore
  reset the workload measurement epoch so the next baseline cannot span settings.
- Missing, exceptional, truncated, invalid or nonfinite owned evidence cannot fall
  back to a database-telemetry KEEP. Invalid evidence remains JSON-serializable.
- Retain the original 10% degradation veto on p95 and QPS regardless of a looser
  policy-specific cap. Default policy latency cap changed from 50% to 10%.
  OS resource degradation and increased error rates still veto KEEP.
- Correct rolling-log eviction handling: old evictions do not invalidate fully
  retained recent windows.
- Dashboard observation cards and reports use owned p95/QPS for OWNED_WORKLOAD
  decisions and explicitly label legacy database telemetry. No storage migration.
- Retract the stale ~2x/5-of-5 KEEP performance claim in `docs/safe_v1.md`.
  Those cold-start artifacts remain historical records, not validated improvement.

The warm-up guard excludes startup from the baseline; it does not prove statistical
stationarity. A short operational KEEP is still not a repeated-study superiority
claim. The existing paired-study criteria were not relaxed.

## Validation

- Nine new safety regressions were executed RED before implementation: cold
  baseline; three missing/failed owned-observation cases; excessive latency cost;
  frozen/equal-duration windows; crossing queries; eviction; nonfinite metrics.
- All nine then passed. Additional baseline, epoch-reset and policy-veto tests pass.
- A nonfinite-status serialization test was separately run RED and fixed.
- Full Python suite: **250 passed**, two existing dependency deprecation warnings.
- Branch-aware coverage: lifecycle 90%, rejection memory 100%, workload group 81%,
  measurements 92%; combined **89.56%** across those four modules.
- Node: **8 unit tests passed**, including a report-source regression which was
  first observed RED (database average 999 shown instead of owned p95 100).
- New controlled browser assertion added for owned p95/QPS in both card and report.
  The current browser run and Vite build could not complete due to host resource
  exhaustion; **do not report them as passing**. Previous-session browser/build
  passes do not validate this patch.
- No fresh live tuning outcome or KEEP-rate result was obtained in this continuation.

No Git checkpoint commits were created: work is being preserved locally and
uncommitted as requested in the handoff. RED/GREEN evidence is recorded here.

## Hardware hypothesis correction

The handoff's statement that an eight-worker pool on sixteen logical CPUs can
never be oversubscribed is not established. Query leaders also execute work;
pool size alone is insufficient. On the original database, an actual EXPLAIN
ANALYZE at per-gather=8 showed **three workers planned and launched**, not eight.
See [PostgreSQL 16: How Parallel Query Works](https://www.postgresql.org/docs/16/how-parallel-query-works.html).
Real worker counts, active leaders, CPU usage and repeated performance need measurement.

## Isolated experiment setup and blocker

Rather than altering the normal cluster, a separate local PostgreSQL 16 instance
was initialized for an explicitly over-parallelized research scenario:

- Data directory: `/var/lib/postgresql/optidbx-keep-study-20260920/data`.
- Port: `55432`; database: `optidbx_keep_study`; local peer user: `postgres`.
- Worker process and parallel-worker pools: 48; session default per-gather: 8.
- New pgbench scale-10 dataset, 1,000,000 accounts.
- Experimental table hint `parallel_workers=8`; pg_stat_statements enabled.
- No CPU affinity/cgroup/OS tuning. Normal PostgreSQL configuration on 5432 unchanged.

The first initdb attempt failed because an initialization log made its target
directory nonempty. The corrected setup uses a nested `data` directory; initialization,
startup, dataset generation and table configuration then succeeded.

Before the sweep could start, WSL process launches failed with `getpwuid(0)` /
`/etc/default/locale` I/O errors. C: had approximately **11 MB free**, later below
10 MB. Windows subsequently reported ENOSPC, Node memory allocation failures and
a paging-file-too-small error. The browser test process was interrupted to stop
further resource use. User said they would free space on C:; completion is pending.

**No sweep measurements ran.** Do not infer any benefit from the setup alone.
The isolated server may still be running; normal API last checked idle with no
workload, comparison or unresolved recovery. Recheck all state after disk recovery.

## Resume checklist

1. Confirm at least 5 GB free on C: and healthy WSL process launches. If WSL still
   reports I/O errors, recover the Ubuntu environment before any database writes.
   Check both PostgreSQL clusters and logs; do not assume a restart repaired data.
2. Stop the isolated instance when no study is running. Its exact stop command:
   `runuser -u postgres -- /usr/lib/postgresql/16/bin/pg_ctl -D /var/lib/postgresql/optidbx-keep-study-20260920/data -m fast stop`.
   Verify the data directory and process identity first. Preserve its files;
   do not issue `ALTER SYSTEM RESET` against the original database.
3. Re-run the current frontend build and controlled browser suite. Temporary test
   files may be directed to `.optidbx/tmp` on D:; npm also needs its cache redirected.
4. Review and run `scripts/controlled_parallelism.py` on the isolated port. It
   records a shuffled, seeded plan before measuring; retains failures; uses the
   production query and unchanged three-second statement timeout; captures actual
   query plans and active workers/leaders; and refuses to overwrite existing evidence.
   This script has not yet been live-validated because WSL could not launch it.
5. The preselected exploratory sweep is 10 clients, levels 8/6/4/2/1, 20 seconds
   warm-up, 30 measured seconds per level, seed 20260920. One repetition is a pilot,
   not a confidence statement. Retain it even if it fails; any changed scenario
   must be labelled exploratory and logged before execution.
6. Only if a warmed comparison supports a genuinely useful reduction, run fresh
   automatic trials through the existing safe pipeline. Do not assume 50% KEEP.
   Keep rejection memory enabled for operational validation; any independent
   trial resets must be explicitly identified, not silently change production config.
7. Stop the test instance and verify the original 5432 configuration is still
   unchanged. Restart the normal API only after verifying idle/recovery state.

Example WSL study command (from repository root, after environment recovery):

```bash
runuser -u postgres -- env POSTGRES_HOST=/var/run/postgresql POSTGRES_PORT=55432 \
  POSTGRES_DB=optidbx_keep_study POSTGRES_USER=postgres \
  /opt/optidbx-venv/bin/python scripts/controlled_parallelism.py \
  --output .optidbx/isolated-sweep-high.json
```

Do not overwrite `CODEX_HANDOFF.md`, `CLAUDE_HANDOFF.md` or the original briefing
files. This document supplements them and corrects the assumptions above.
