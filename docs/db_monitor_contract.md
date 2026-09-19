# OptiDBX: DB Monitor Interface Contract

> Phase 2 integration corrections: see [autotuner_flow.md](autotuner_flow.md).
> `collect()` now requires pg_stat_statements, returns interval completed-statement
> latency and parallel-worker counts, and raises `TelemetryNotReady` for warm-up,
> resets, or unmeasurable intervals. Call `warm_up()` then wait a full interval.
> `get_current_parallelism()` returns None if the setting cannot be read.
> These rules supersede the cumulative/fallback descriptions in the Phase 1 text below.

**Owner:** Developer 2 — Kartikeya Kushwaha (DBMS & Workload Engineer)  
**Consumers:**
- Developer 1 (Yatharth Singh) — Autotuner Decision Engine
- Developer 4 (Shivansh Bhardwaj) — FastAPI Backend & Live Dashboard

---

## 1. Metric Payload Specification

The DB monitor produces real-time database telemetry every **5 seconds** adhering strictly to this JSON/Dict structure:

```json
{
  "timestamp": "2026-09-16T10:00:05.123456+00:00",
  "query_latency_ms": 132.65,
  "throughput_tps": 520.0,
  "temp_files_bytes": 44040192,
  "active_workers": 4
}
```

### Field Definitions & Units

| Field | Type | Unit | Source | Description |
| :--- | :--- | :--- | :--- | :--- |
| `timestamp` | String (ISO 8601) | UTC timestamp | System clock | Exact time the telemetry sample was captured. |
| `query_latency_ms` | Float | Milliseconds (`ms`) | `pg_stat_statements` / `pg_stat_activity` | Mean query execution latency across recorded statements. |
| `throughput_tps` | Float | Transactions / sec (`TPS`) | `pg_stat_database` | Delta transactions committed or rolled back per elapsed second ($\Delta \text{xacts} / \Delta t$). |
| `temp_files_bytes` | Integer | Bytes | `pg_stat_database.temp_bytes` | Total volume of data spilled to temporary disk files. Key indicator for `work_mem` exhaustion. |
| `active_workers` | Integer | Count | `pg_stat_activity` | Number of currently active backend connections and parallel worker threads. |

---

## 2. Programmatic Integration (For Yatharth's Autotuner)

### Single Snapshot Collection
To pull a single metric reading inside the Autotuner:

```python
from db_monitor.collector import DBMetricsCollector

collector = DBMetricsCollector()
sample = collector.collect()

print(sample["throughput_tps"])
print(sample["query_latency_ms"])
```

### Continuous Loop with Callback
To continuously monitor and trigger the Autotuner on each 5-second tick:

```python
from db_monitor.collector import DBMetricsCollector

def autotuner_callback(db_sample: dict):
    # Yatharth's bottleneck detection logic here
    if db_sample["active_workers"] > 4 and db_sample["query_latency_ms"] > 100:
        print("Parallelism bottleneck suspected!")

collector = DBMetricsCollector()
collector.start_monitoring(
    interval_seconds=5,
    experiment_id=1,
    on_sample=autotuner_callback
)
```

---

## 3. Database Persistence (Tables & Queries)

All collected samples can be persisted to the `db_metrics` table:

```sql
SELECT id, experiment_id, timestamp, query_latency_ms, throughput_tps, temp_files_bytes, active_workers
FROM db_metrics
WHERE experiment_id = :experiment_id
ORDER BY timestamp DESC
LIMIT 10;
```

---

## 4. Workload Runner API

To trigger repeatable standard workloads for benchmark tests:

```python
from workload.run_workload import run_workload

# Start non-blocking HIGH concurrency workload
proc = run_workload(profile_name="HIGH", duration_sec=60, async_mode=True)

# Later wait for completion
proc.wait()
```

