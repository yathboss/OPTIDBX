# OptiDBX Evaluation Demo Script & Viva Q&A Guide

## 1. Quick Launch Checklist

Ensure the local backend and frontend are running:

```powershell
# Terminal 1: Launch FastAPI backend & collectors (WSL2 / local)
python -m uvicorn backend.main:app --port 8000

# Terminal 2: Launch Vite Dashboard
cd dashboard
npm run dev
```

Navigate to `http://localhost:3000` in the browser.

---

## 2. Step-by-Step Viva Demonstration Script

### Step 1: System Health & Connection Overview
- **Action**: Direct the examiner to the **Header** and top-right **ConnectionStatusBadge**.
- **Talking Point**: *"OptiDBX pairs real Linux kernel OS telemetry (`/proc/stat`, `/proc/meminfo`) with PostgreSQL internal stats (`pg_stat_database`, `pg_stat_activity`) at deterministic 5-second intervals. The badge confirms live telemetry flow."*

### Step 2: Scenario 1 Demo (CPU & Parallelism Bottleneck)
- **Action**: Select **Scenario 1: CPU / Parallelism** from the demo selector bar.
- **Talking Point**: *"When multi-client query contention causes CPU utilization to exceed 85%, thread over-subscription increases context switching overhead. OptiDBX detects the `CPU_PARALLELISM` bottleneck and recommends throttling `max_parallel_workers_per_gather` from 8 down to 6 to restore scheduler equilibrium."*

### Step 3: Scenario 2 Demo (Work Memory Spill & Admission Safety)
- **Action**: Select **Scenario 2: Work Memory / Temp Spill**. Point to the **Memory Safety Panel**.
- **Talking Point**: *"When analytical queries perform large sorts or hash joins exceeding `work_mem`, PostgreSQL spills intermediate tuples to disk (`temp_files_bytes`). OptiDBX recommends increasing `work_mem` (4MB -> 16MB), but only after verifying host RAM safety (RAM < 85%) via our admission control layer."*

### Step 4: Closed-Loop Lifecycle & Observation Window
- **Action**: Click **Apply Recommendation** (or enable Auto mode).
- **Talking Point**: *"OptiDBX enforces a closed-loop tuning lifecycle: `RECOMMENDATION_READY` -> `ACTION_APPLIED` -> `OBSERVING` (30-second window) -> `KEEP` or `ROLLBACK`. If latency deteriorates after tuning, the engine automatically rolls back to the previous known-good setting."*

### Step 5: Evidence & Telemetry Export
- **Action**: Click the **Export Data** button in the header (or press key `E`).
- **Talking Point**: *"To support scientific reproducibility and benchmark evaluations, all telemetry interval records and tuning decisions can be exported instantaneously to CSV or JSON."*

---

## 3. Examiner Q&A Defense Reference

### Q1: Why use an expert heuristic engine instead of Deep Reinforcement Learning (RL)?
> **Answer**: Deep RL systems require extensive exploration that can destabilize a live production database with out-of-memory crashes or runaway parallelism. OptiDBX prioritizes **Safe V1**: bounded parameters, admission safety guards, deterministic thresholds, and instant rollback capabilities.

### Q2: How does the system prevent Out-Of-Memory (OOM) killer invocations?
> **Answer**: In PostgreSQL, `work_mem` is allocated per sort/hash operation per worker node. A 16MB `work_mem` across 10 concurrent queries with 4 workers each can consume 640MB+. Our **MemorySafetyPanel** evaluates host RAM usage, swap usage, and max safety thresholds before ever applying a `work_mem` increase.

### Q3: How does the engine avoid flapping (repeatedly increasing and decreasing knobs)?
> **Answer**: Following each applied action, the engine enters a mandatory observation window (30s) followed by a stabilizing cooldown state. During cooldown, all further tuning actions are locked out until system variance settles.

### Q4: How are tests organized across the project?
> **Answer**: The project contains unit and integration test suites:
> - Backend & autotuner: Python `pytest` tests covering telemetry aggregation, admission control, and REST routes.
> - Dashboard: Node.js test suites covering action state transitions, telemetry formatting, analytics, and CSV/JSON export.
