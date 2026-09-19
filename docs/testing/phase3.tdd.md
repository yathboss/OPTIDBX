# Phase 2/3 verification evidence

Source: the user's September 19 integration request and explicit selection of a
bound workload connection (external pgbench auto-tuning unavailable).
The TDD skill was applied; the user's instruction to leave changes uncommitted
overrode its checkpoint-commit guidance. No checkpoint commits were created.

## RED to GREEN observations

- Initial `test_phase3.py`, `test_os_actions.py`, and
  `test_os_phase2_completion.py`: **16 failed**, exposing missing lifecycle/action
  modules, missing OS policy, and premature removal of buffered storage records.
  The same targets then passed after implementation.
- Initial runtime/API integration target: **4 failed**, because bound executors,
  lifecycle control and runtime mode methods did not exist; then **4 passed**.
- Blocked-apply sampling, absent-sample watchdog, and post-cooldown manual rollback:
  **3 failed**, then passed after fixes.
- Reset/missing OS counter quality: **1 failed, 4 passed**, then all passed.
- Recovery on a different workload session and loss of final outcome in history:
  **2 failed**, then passed.
- Independent improvement/degradation tolerances: **1 failed**, then passed.
- Cancellation before mutation and manual-recovery journal failure: **2 failed**,
  then passed.
- Corrupt recovery journal variants: **2 failed, 1 passed**, then all passed.

No fabricated live values were used to make these tests pass. Lifecycle decision
tests deliberately use deterministic telemetry and clocks and fake DB executors.

## Final automated verification

Windows Python 3.11.9:

```powershell
.\.venv\Scripts\python.exe -m pytest -q --cov=autotuner --cov=config --cov=actions --cov-report=term-missing
```

**161 passed**, two pre-existing upstream TestClient deprecation warnings.
Combined statement/branch coverage: **88.76%** for `autotuner`, `config`, and
`actions`. DB helper: 98%; OS actions: 96%; lifecycle: 88%; runtime: 86%.
Detector, selector, engine, models and config: 100%. CLI subprocess coverage is
not collected; coverage does not claim all inherited teammate modules are covered.

WSL Ubuntu Python 3.12.3:

```powershell
& 'C:/Windows/System32/wsl.exe' -d Ubuntu --cd 'D:\Enginner Yatharth\OPTIDBX' -- /opt/optidbx-venv/bin/python -m pytest -q
```

**161 passed**, the same two warnings. Scoped Ruff checks and formatting passed
for new actions/lifecycle/tests and modified runtime/config/tuner/storage adapters.
`git diff --check` passed. The exact installed dependency audit input from the
existing `.venv/audit-requirements.txt` reported **No known vulnerabilities found**:

```powershell
.\.venv\Scripts\python.exe -m pip_audit --disable-pip --no-deps -r .venv/audit-requirements.txt
```

No dependencies or frontend files were changed. No new browser E2E claim is made.

| Guarantee | Tests / evidence |
|---|---|
| Recommendation mode remains read-only; auto requires three readings | Phase 2, Phase 3 runtime tests |
| Manual approval and auto use the same pipeline | Phase 3 runtime and FastAPI TestClient tests |
| Concurrent approvals result in one write | concurrent manual request test |
| Telemetry continues while apply waits | blocked connection/apply test |
| Thirty-second observation and cooldown | deterministic lifecycle clock tests |
| Three new bad readings required after cooldown | runtime cooldown regression |
| Latency/TPS improvement and CPU/memory/disk guards | parameterized lifecycle tests |
| Inconclusive/missing evidence rolls back | observation, watchdog, invalid baseline tests |
| Apply, audit, verification, cancellation and restore failures are explicit | lifecycle failure-path tests |
| Failed/corrupt journal blocks recovery; wrong session cannot clear it | recovery tests |
| Session identity, approved next step, external drift and parameter verification | DB helper tests |
| PID reuse, permissions, CPU/nice bounds, restore and shared gate | OS action tests |
| Storage failure retains buffered OS records | Phase 2 completion regression |
| LOW/MEDIUM/HIGH metric contract | synthetic profile tests plus live runs below |

## Real platform validation

These opt-in checks actually ran in WSL Ubuntu against the dedicated existing
`optidbx_phase2` database and disposable processes. They are separate from the
synthetic full-lifecycle decision tests.

1. **OS LOW/MEDIUM/HIGH profiles:** experiments 9, 10 and 11, using the existing
   pgbench runner. Each ran 20 seconds and persisted three real 5-second OS samples
   in `system_metrics`. SQL history returned real row IDs and the matching
   experiment association. All experiments completed.
   [Full evidence](evidence/os-phase2-profiles.json).
2. **CPU contention:** experiment 12, using the existing analytical fixture. The
   third sample confirmed CPU_PARALLELISM at CPU 99.8%, 3924 context switches,
   7 workers and 595.450 ms interval query latency. One `2 -> 1` recommendation
   was saved. Recommendation mode left parallelism at 2 before and after, and
   FastAPI was exercised against the actual runtime.
   [Full evidence](evidence/os-phase2-contention.json).
3. **DB action mechanics:** a dedicated, peer-authenticated PostgreSQL workload
   session applied `2 -> 1`, executed a setting read on that same session, restored
   `1 -> 2`, and verified restoration. No server/database/role defaults changed.
   [Full evidence](evidence/phase3-db-session.json).
4. **OS action mechanics:** a disposable child process changed affinity from all
   16 available CPUs to CPU 0 and back, and nice from 0 to 5 and back. Two real
   samples continued at 5-second intervals while those actions were held. The
   child was terminated after validation. This run used root, so successful nice
   restoration does not imply an unprivileged user has that permission.
   cgroup-v2 controllers were detected; no cgroup writes occurred.
   [Full evidence](evidence/phase3-os-actions.json).

Reproduction from the repository in WSL (DB commands use the existing peer role):

```bash
sudo -u postgres env POSTGRES_HOST=/var/run/postgresql POSTGRES_DB=optidbx_phase2 POSTGRES_USER=postgres \
  /opt/optidbx-venv/bin/python -m tests.live_os_profiles --output docs/testing/evidence/os-phase2-profiles.json
sudo -u postgres env POSTGRES_HOST=/var/run/postgresql POSTGRES_DB=optidbx_phase2 POSTGRES_USER=postgres \
  /opt/optidbx-venv/bin/python -m tests.live_phase2 --scenario parallel --expect CPU_PARALLELISM --output docs/testing/evidence/os-phase2-contention.json
sudo -u postgres env POSTGRES_HOST=/var/run/postgresql POSTGRES_DB=optidbx_phase2 POSTGRES_USER=postgres \
  /opt/optidbx-venv/bin/python -m tests.live_phase3 --output docs/testing/evidence/phase3-db-session.json
sudo /opt/optidbx-venv/bin/python -m tests.live_phase3 --os-only --output docs/testing/evidence/phase3-os-actions.json
```

## Limits and remaining integration requirements

There is **no live claim that tuning improved performance**, and no live
30-second KEEP/degradation decision was demonstrated. That policy is verified
with controlled telemetry; live checks verify telemetry, persistence, identity,
effective setting writes and restores only. Workload and system noise can invalidate
comparisons even when the software behaves correctly.

External pgbench auto-tuning remains unavailable by the user's explicit choice.
The deployment owner must bind its actual persistent workload connection and audit
store to enable execution. Run one action owner/API worker, configure bounded
connection/query waits, and keep workload overrides/other-role traffic controlled.
Unprivileged Linux nice restoration can fail; Windows OS mutation is intentionally
unsupported. cgroup mutation is scaffold-only. OS receipts are process-local.
DB recovery after loss of the original session requires operator reconciliation,
not blindly applying an old setting on a replacement session.

No remaining blocker prevents local code review. See the [handoff report](../phase3_integration.md)
for file changes, interface contracts, unchanged dashboard controls, and exact
review/commit/push commands.
