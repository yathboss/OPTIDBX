# OptiDBX

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
