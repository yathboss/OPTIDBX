# OptiDBX Dashboard API Contract (Phase 1)

This document formalizes the REST API contract between the **FastAPI Backend**, the **React Dashboard**, and teammates' modules (Autotuner, OS Monitor, DB Monitor).

---

## Base URL
Default development URL: `http://localhost:8000`

---

## Endpoints

### 1. Health Check
Checks backend and telemetry service availability.

- **Method**: `GET`
- **Path**: `/health`
- **Response**:
```json
{
  "status": "ok"
}
```

---

### 2. Current Telemetry Metrics
Returns the latest consolidated OS and DBMS metrics snapshot. Used by the dashboard's 5-second polling loop.

- **Method**: `GET`
- **Path**: `/metrics/current`
- **Response**:
```json
{
  "timestamp": "2026-09-16T18:30:00Z",
  "os": {
    "cpu_percent": 72.4,
    "memory_percent": 61.8,
    "disk_read_bytes": 1048576,
    "disk_write_bytes": 524288,
    "context_switches": 2180
  },
  "db": {
    "query_latency_ms": 130.5,
    "throughput_tps": 520.0,
    "temp_files_bytes": 10485760,
    "active_workers": 4
  }
}
```

#### Field Specifications:
- **OS Telemetry** (Owned by Aryaman):
  - `cpu_percent`: `float` - System CPU utilization percentage (0.0 to 100.0)
  - `memory_percent`: `float` - RAM utilization percentage (0.0 to 100.0)
  - `disk_read_bytes`: `int` - Cumulative or windowed bytes read from disk
  - `disk_write_bytes`: `int` - Cumulative or windowed bytes written to disk
  - `context_switches`: `int` - Number of OS context switches

- **DBMS Telemetry** (Owned by Kartikeya):
  - `query_latency_ms`: `float` - Average query response time in milliseconds
  - `throughput_tps`: `float` - Transactions or queries per second
  - `temp_files_bytes`: `int` - Temporary file allocation on disk (spill indicator)
  - `active_workers`: `int` - Active parallel query worker processes

---

### 3. Historical Telemetry
Provides a time series of recent metric points for graphs and trend charts.

- **Method**: `GET`
- **Path**: `/metrics/history?limit=20`
- **Response**: Array of current metrics objects.

---

### 4. Autotuner Status
Returns the autotuner's operating mode, state, bottleneck detection result, and recommended action.

- **Method**: `GET`
- **Path**: `/tuner/status`
- **Response**:
```json
{
  "mode": "recommendation",
  "state": "monitoring",
  "detected_bottleneck": "CPU_PARALLELISM",
  "reason": "High CPU (>70%) and elevated context switches with active parallel workers",
  "recommended_action": "Reduce max_parallel_workers_per_gather from 8 to 4",
  "observation_remaining_seconds": 0,
  "cooldown_remaining_seconds": 0
}
```

#### Tuner Modes:
- `"recommendation"`: Identifies bottlenecks and provides advice without applying changes.
- `"auto"`: Automatically triggers safe parameter changes and observation loops.

#### Tuner States:
- `"monitoring"`: Actively analyzing telemetry windows.
- `"observing"`: 30-second observation window evaluating before vs after.
- `"cooldown"`: 30-second cooldown period preventing oscillation.
- `"idle"`: Monitoring paused.

---

### 5. Switch Autotuner Mode
Changes operating mode between Recommendation and Auto-tuning.

- **Method**: `POST`
- **Path**: `/tuner/mode`
- **Request Body**:
```json
{
  "mode": "auto"
}
```
- **Response**: Updated `TunerStatusResponse`

---

### 6. Tuning Action History
Retrieves past tuning interventions, parameter values, and whether they were kept or rolled back.

- **Method**: `GET`
- **Path**: `/tuning/history` (also `/tuner/history`)
- **Response**:
```json
[
  {
    "timestamp": "2026-09-16T18:20:00Z",
    "bottleneck": "CPU_PARALLELISM",
    "parameter": "max_parallel_workers_per_gather",
    "old_value": 8,
    "new_value": 4,
    "status": "KEPT",
    "reason": "Sustained CPU contention (latency dropped 28%)"
  }
]
```

---

### 7. List Experiments
Retrieves workload benchmark experiments.

- **Method**: `GET`
- **Path**: `/experiments`
- **Response**:
```json
[
  {
    "id": "exp-001",
    "name": "TPC-B Mixed Workload (Scale 50)",
    "workload_type": "mixed",
    "status": "completed",
    "created_at": "2026-09-16T16:30:00Z",
    "duration_seconds": 300
  }
]
```

---

### 8. Experiment Detail & Evaluation
Returns granular before/after evaluation for a specific experiment run.

- **Method**: `GET`
- **Path**: `/experiments/{id}`
- **Response**:
```json
{
  "id": "exp-001",
  "name": "TPC-B Mixed Workload (Scale 50)",
  "workload_type": "mixed",
  "status": "completed",
  "created_at": "2026-09-16T16:30:00Z",
  "duration_seconds": 300,
  "before_metrics": {
    "query_latency_ms": 210.4,
    "throughput_tps": 410.0,
    "cpu_percent": 84.5
  },
  "after_metrics": {
    "query_latency_ms": 142.1,
    "throughput_tps": 560.2,
    "cpu_percent": 68.0
  },
  "overall_result": "IMPROVED"
}
```

