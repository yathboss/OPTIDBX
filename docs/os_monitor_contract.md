# OptiDBX - OS Telemetry Interface Contract

**Developer 3: Aryaman Singh (OS & Telemetry Engineer)**
**Phase 2: Real OS Telemetry + Experiment Integration**

---

## 1. High-Level Architecture

```
Workload Execution (Kartikeya)
        │
        ▼
OS System Activity (Kernel, CPU, RAM, Disk, Scheduler)
        │
        ▼
OS Collector (Aryaman - os_monitor)
  ├── cpu.py (psutil.cpu_percent)
  ├── memory.py (psutil.virtual_memory)
  ├── disk.py (Interval read/write deltas)
  └── context_switch.py (Interval switch deltas)
        │
        ▼
Normalized OSMetrics (autotuner.models.OSMetrics)
        │
        ├──► PostgreSQL system_metrics (storage.py)
        │
        ├──► Autotuner Engine (Yatharth)
        │       └─ CombinedTelemetry (OSMetrics + DBMetrics)
        │
        └──► Backend & Dashboard (Shivansh)
                ├─ get_latest_os_metrics()
                └─ get_os_metrics_history(experiment_id, limit)
```

---

## 2. Shared Data Contract

The OS monitoring module strictly normalizes output to the Pydantic contract model `autotuner.models.OSMetrics`:

| Field Name | Type | Constraints | Units / Meaning | Source |
|---|---|---|---|---|
| `timestamp` | `AwareDatetime` | Non-null, UTC timezone-aware | Interval-end timestamp (ISO 8601) | `datetime.now(timezone.utc)` |
| `cpu_percent` | `float` | `0.0 <= val <= 100.0` | Overall system CPU utilization % | `psutil.cpu_percent()` |
| `memory_percent` | `float` | `0.0 <= val <= 100.0` | System virtual memory utilization % | `psutil.virtual_memory().percent` |
| `disk_read_bytes` | `int` | `>= 0` | Bytes read **during the sampling interval** | `psutil.disk_io_counters()` delta |
| `disk_write_bytes` | `int` | `>= 0` | Bytes written **during the sampling interval** | `psutil.disk_io_counters()` delta |
| `context_switches` | `int` | `>= 0` | Context switches **during the sampling interval** | `psutil.cpu_stats().ctx_switches` delta |

---

## 3. Delta Calculation & Baseline Policy

Cumulative hardware counters (`disk_io_counters`, `ctx_switches`) are **never emitted as raw cumulative totals**. They are converted to interval deltas:

$$\text{delta} = \text{counter}_{\text{current}} - \text{counter}_{\text{previous}}$$

### First-Sample Behavior
On the first measurement tick (initialization or warm-up), no previous interval baseline exists.
- **Rule**: First sample emits `0` for `disk_read_bytes`, `disk_write_bytes`, and `context_switches`.
- **Rationale**: Emitting 0 satisfies the non-negative integer counter contract without inventing arbitrary fake numbers or corrupting initial autotuner baselines.

### Counter Reset / Negative Delta Recovery
If an OS counter wraps around or resets (e.g. upon reboot, counter overflow, or device reconfiguration):
- **Rule**: Delta is clamped to `0`, the baseline is re-established to `current_counter`, and a diagnostic warning is logged.
- **Rationale**: Prevents negative values from violating the Pydantic schema while gracefully self-healing.

---

## 4. Sampling Interval & Configuration

- **Source**: `config/config.yaml` -> `monitoring.interval_seconds` (default: `5`).
- **Timing**: The collector operates as:
  $$\text{collect sample} \longrightarrow \text{store / log} \longrightarrow \text{sleep interval} \longrightarrow \text{repeat}$$
- **Time Gaps**: Collectors maintain steady 5-second intervals. Gaps $> 1.5 \times \text{interval}$ are flagged to prevent autotuner candidate corruption.

---

## 5. Experiment Integration Contract

Active workloads executed by Kartikeya generate an integer `experiment_id`.
The OS collector binds this ID via:
```python
from os_monitor import set_active_experiment

# When workload starts
set_active_experiment(experiment_id=12)

# When workload finishes
set_active_experiment(None)
```
- Every sample persisted while an experiment is active stores `system_metrics.experiment_id = 12`.
- When no experiment is active, `experiment_id` is recorded as `NULL`.

---

## 6. Consumer Interfaces

### For Yatharth (Autotuner Lead)
Autotuner consumes normalized `OSMetrics` directly:
```python
from autotuner.engine import AutotunerEngine
from autotuner.models import CombinedTelemetry
from os_monitor import get_latest_os_metrics

latest_os = get_latest_os_metrics()
# Combined with DBMetrics from Kartikeya
telemetry = CombinedTelemetry(
    timestamp=latest_os.timestamp,
    os_metrics=latest_os,
    db_metrics=latest_db,
)
result = engine.process(telemetry, current_parallelism=8)
```

### For Shivansh (Dashboard & Backend Lead)
Backend routes query OS telemetry via standard Python service functions:
```python
from os_monitor import get_latest_os_metrics, get_os_metrics_history

# Current metrics endpoint
latest = get_latest_os_metrics()

# History endpoint
history = get_os_metrics_history(experiment_id=12, limit=20)
```
Output is fully serialized and decoupled from database drivers or psutil dependencies.
