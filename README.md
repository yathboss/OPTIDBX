# OptiDBX

## Safe V1 - current runnable version

Local workload controls, real OS/PostgreSQL telemetry and history, safe parallelism
recommendation/auto modes, manual approval and rollback, and a connected dashboard
are implemented. Startup remains recommendation-only. Only explicitly owned
workload sessions can be tuned.

**Start here:** [setup, usage, safety, APIs and Git handoff](docs/safe_v1.md).
[Validation and real evidence](docs/testing/safe_v1.md) include an observed full
apply/observe/rollback/cooldown cycle; this is not a claim of improved performance.

**Performance Evidence:** [run paired baseline/auto comparisons](docs/performance_evidence.md)
in the dashboard, inspect direct query throughput and median/p95 latency, and
download the actual run evidence. Short pilots remain inconclusive.

In this Windows workspace, run `scripts/start_v1.ps1` for the WSL API and
`scripts/start_v1.ps1 -Dashboard` in another terminal, then open
<http://localhost:3000>. Both use the existing local installation.

Development Phase 1 foundations, Phase 2 real telemetry/recommendations, Phase 3
safe actions, and the safe V1 dashboard/evaluation integration are delivered.
Automatic OS tuning, additional DB parameters, ML, and public deployment remain
outside this release. Original contributor work and authorship remain in Git.

**Historical notes below:** these describe earlier milestones and the original
research roadmap. Use the linked Safe V1 guide for current behavior and commands.

## Phase 3 — local integration

The runtime now supports a verified DB action lifecycle on an explicitly bound
workload connection, plus separate manual Linux affinity/nice actions. Startup
remains recommendation-only; external pgbench sessions cannot be auto-tuned.
See [binding, safety, APIs, and review commands](docs/phase3_integration.md) and
[verification evidence](docs/testing/phase3.tdd.md).

The Phase 2/1 sections below describe the earlier development milestones.

## Phase 2 — real telemetry integration

The recommendation runtime now pairs real OS and PostgreSQL interval readings,
confirms sustained CPU/parallelism contention, reads the current setting, and stores
safe recommendations. FastAPI metrics/tuner endpoints use this runtime by default.
Auto mode is unavailable; no tuning parameter is applied.

See [the integrated flow and WSL run commands](docs/autotuner_flow.md) and
[Phase 2 verification evidence](docs/testing/phase2.tdd.md). Run `python -m autotuner`
on the database host while a workload is running. For the API, start monitoring
through `POST /tuner/toggle-monitoring?active=true`; metrics return 503 until a valid
paired interval is available.

The Phase 1 instructions below remain useful for isolated mock tests; the real
runtime uses `python -m autotuner`, not `python -m autotuner.demo`.

## Phase 1 prototype — quick start

The shared configuration, telemetry contracts, CPU/parallelism detector, and
recommendation engine are implemented. This prototype runs entirely on mock data;
PostgreSQL, OS collectors, API, and dashboard integration are later work.

Requires Python 3.11 or newer. From the repository root on Ubuntu/WSL:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements-dev.txt
python -m autotuner.demo
python -m pytest -q --cov --cov-report=term-missing
```

On Windows PowerShell (use your installed Python executable if `py` is unavailable):

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m autotuner.demo
.\.venv\Scripts\python.exe -m pytest -q --cov --cov-report=term-missing
```

The demo prints three JSON snapshots with counters `1`, `2`, `3`. The first two
have bottleneck `NONE`; the third confirms `CPU_PARALLELISM` and recommends
`max_parallel_workers_per_gather: 8 -> 6`. It never changes database settings.
For a demo-only installation, `requirements.txt` contains just runtime dependencies.

- [Shared configuration](config/config.yaml): all thresholds and approved values.
- [Integration contract](docs/integration_contract.md): fields, units, engine API,
  error handling, and teammate handoffs.
- [Test evidence](docs/testing/phase1.tdd.md): verification results and limits.
- [Phase 1 delivery](docs/phase1_delivery.md): files, ownership, and Git commands.

Development checks:

```bash
python -m ruff check .
python -m ruff format --check .
python -m pip_audit -r requirements-dev.txt
```

Use the `yatharth-autotuner` feature branch for this implementation. The sections
below describe the broader project vision; features beyond the prototype remain planned.

**Adaptive OS–DBMS Co-Tuning Framework**

OptiDBX is a research-oriented system that monitors both the **Operating System** and **PostgreSQL** in real time, detects performance bottlenecks, and applies safe tuning actions to improve database performance under changing workloads.

## Problem

Database workloads do not remain constant. A configuration that works well for normal read queries may perform poorly when the workload becomes write-heavy, analytical, or highly concurrent.

PostgreSQL manages query memory, parallel workers, connections, and execution settings, while the operating system separately manages CPU, memory, disk I/O, and process scheduling.

Because both layers usually work independently, a database configuration may look fine from the DBMS side but still perform poorly because of CPU pressure, memory pressure, excessive context switching, or heavy disk I/O.

## Our Solution

OptiDBX brings OS and DBMS monitoring into one feedback loop.

The system will:

1. Generate controlled PostgreSQL workloads.
2. Collect OS and DBMS metrics.
3. Detect the likely bottleneck.
4. Choose a safe tuning action.
5. Apply the change.
6. Measure the result.
7. Keep the change if performance improves, otherwise roll it back.

## Architecture

```text
Workload Generator
        |
        v
PostgreSQL Database
        |
        +-------------------+
        |                   |
        v                   v
 DBMS Metrics          OS Metrics
        \                   /
         \                 /
          v               v
            Metric Collector
                  |
                  v
            Autotuner Engine
          /                 \
         v                   v
   DBMS Tuning          OS Tuning
         \                   /
          \                 /
           v               v
         Performance Evaluation
                  |
         Improved or Worse?
            /          \
           v            v
        Keep         Rollback
           \            /
            ---- Repeat ----
```

## Metrics Monitored

### DBMS Metrics
- Query latency
- Throughput
- Active sessions
- Active workers
- Temporary-file usage
- Query statistics

### OS Metrics
- CPU usage
- Memory pressure
- Disk I/O
- Context switches
- Page faults
- Process-level resource usage

## Tuning Actions

### DBMS Tuning
- `work_mem`
- Query parallelism
- Worker limits
- Connection limits

### OS Tuning
- CPU affinity
- Process priority
- I/O priority
- cgroup resource limits

All automatic changes will remain inside predefined safe ranges.

## Safety and Rollback

OptiDBX will not blindly keep every tuning decision.

After each action, the system will observe performance for a short period.

```text
Performance Improved  -> Keep Change
Performance Degraded  -> Roll Back
```

This makes the tuning process controlled, measurable, and reversible.

## Workloads

The project will be tested using repeatable synthetic workloads:

- Read-heavy
- Write-heavy
- Analytical
- Mixed workload

These workloads will help compare OptiDBX against a normal static PostgreSQL configuration.

## Technology Stack

- **Database:** PostgreSQL
- **Backend / Autotuner:** Python
- **API:** FastAPI
- **Frontend:** React.js
- **OS Environment:** Linux / WSL2
- **PostgreSQL Monitoring:** `pg_stat_statements`
- **System Monitoring:** `/proc`, `psutil`, `vmstat`, `iostat`, `perf`
- **Advanced Telemetry:** eBPF
- **OS Resource Control:** cgroups, CPU affinity, process priority, I/O priority

## Evaluation

OptiDBX will be evaluated using:

- Average query latency
- p95 / p99 latency
- Throughput
- CPU utilization
- Memory pressure
- Disk I/O
- Context-switch activity

The main comparison will be:

```text
Static PostgreSQL
        VS
OptiDBX Adaptive Tuning
```

## Research Scope

The main research question is:

> **Can real-time OS and DBMS telemetry be used to automatically tune system and database parameters and outperform a static database configuration under changing workloads?**

Future work may include:

- Machine-learning-based tuning
- Reinforcement learning
- Deeper eBPF telemetry
- Additional PostgreSQL parameters
- Testing across different hardware configurations

## Development Roadmap

- [ ] PostgreSQL + workload setup
- [ ] OS metric collection
- [ ] DBMS metric collection
- [ ] Unified telemetry layer
- [ ] Rule-based bottleneck detection
- [ ] DBMS tuning actions
- [ ] OS tuning actions
- [ ] Performance feedback loop
- [ ] Automatic rollback
- [ ] Live dashboard
- [ ] Benchmark comparison
- [ ] ML-based extension

## Team

**Team OptiDBX — T-021**

- Yatharth Singh
- Kartikeya Kushwaha
- Aryaman Singh
- Shivansh Bhardwaj

## Project Status

**Phase 1 — Research, architecture, and prototype planning.**

The first implementation will focus on a small set of explainable and reversible tuning rules before moving toward ML-based approaches.

---

## Quick Start & Run Instructions (Phase 1)

### 1. Prerequisites
- Python 3.10+
- Node.js 18+ and npm
- Git

### 2. Backend Setup & Run (FastAPI)
Install backend dependencies:
```bash
pip install -r backend/requirements.txt
# or: pip install fastapi uvicorn pydantic
```

Run the backend development server:
```bash
uvicorn backend.main:app --reload --port 8000
```
- Interactive API Documentation (Swagger UI): `http://localhost:8000/docs`
- Health Endpoint: `http://localhost:8000/health`
- Live Telemetry Snapshot: `http://localhost:8000/metrics/current`
- Autotuner Status: `http://localhost:8000/tuner/status`
- Tuning Action History: `http://localhost:8000/tuning/history`
- Benchmark Experiments: `http://localhost:8000/experiments`

### 3. Dashboard Setup & Run (React)
Navigate to `dashboard/`:
```bash
cd dashboard
npm install
npm run dev
```
- The dashboard will be available at `http://localhost:3000`.
- Automatically polls `http://localhost:8000/metrics/current` and `/tuner/status` every 5 seconds.
- Falls back gracefully to structured mock telemetry if the backend is offline.

### 4. Evaluation Module
Evaluate before/after tuning results programmatically:
```python
from experiments.evaluator import evaluate_tuning_action

result = evaluate_tuning_action(
    before_latency=250.0,
    after_latency=180.0,
    before_throughput=500.0,
    after_throughput=620.0,
    before_cpu=85.0,
    after_cpu=70.0
)
print(result.overall_result)  # IMPROVED / DEGRADED / INCONCLUSIVE
print(result.latency_change_percent)  # -28.0%
```
