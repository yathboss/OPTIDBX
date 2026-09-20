# OptiDBX Operating System Telemetry Subsystem (`os_monitor`)

**Developer 3: Aryaman Singh (OS & Telemetry Engineer)**
**Phase 2: Real OS Telemetry + Experiment Integration**

---

## Overview

The `os_monitor` package is responsible for non-invasive, continuous observation of system-level resources (CPU, Memory, Disk I/O, Context Switches). It produces contract-compliant, interval-normalized telemetry for consumption by the Autotuner engine (Yatharth) and Dashboard/Backend API (Shivansh), and persists time-series data to PostgreSQL `system_metrics`.

---

## File Structure

```
os_monitor/
├── __init__.py           # High-level API exports
├── collector.py          # Continuous monitoring loop & experiment binding
├── cpu.py                # CPU utilization percent extractor
├── memory.py             # Virtual RAM percent extractor
├── disk.py               # Disk I/O interval delta tracker (bytes read/written)
├── context_switch.py     # OS context switches interval delta tracker
├── storage.py            # PostgreSQL persistence & in-memory buffer fallback
├── health.py             # Truthful diagnostic health check CLI
└── README.md             # Subsystem documentation
```

---

## Configuration

Sampling interval is configured centrally in `config/config.yaml`:
```yaml
monitoring:
  interval_seconds: 5
```
The collector automatically reads this value, falling back gracefully to 5 seconds if the config file is absent.

---

## How to Run

### Standalone Health Check
```bash
python os_monitor/health.py
# or
python -m os_monitor.health
```

### Run Continuous Collector CLI
```bash
python os_monitor/collector.py
```

### Programmatic Usage
```python
from os_monitor import (
    OSMetricsCollector,
    set_active_experiment,
    get_latest_os_metrics,
    get_os_metrics_history,
)

# Start background collection
collector = OSMetricsCollector()
collector.start()

# Bind to an experiment
set_active_experiment(experiment_id=1)

# Retrieve latest sample
latest = get_latest_os_metrics()
print(f"Current CPU: {latest.cpu_percent}%, Context switches: {latest.context_switches}")

# Stop collector cleanly
collector.stop()
```

---

## Telemetry Format

Each collected sample is normalized to `autotuner.models.OSMetrics`:
```json
{
  "timestamp": "2026-09-16T17:15:00.000000Z",
  "cpu_percent": 34.2,
  "memory_percent": 61.8,
  "disk_read_bytes": 1048576,
  "disk_write_bytes": 524288,
  "context_switches": 2410
}
```

- `disk_read_bytes`, `disk_write_bytes`, and `context_switches` represent **interval activity only**, not cumulative lifetime totals.
- The first sample produces `0` deltas as the baseline.

---

## Testing

Run the OS monitor test suite:
```bash
python -m pytest tests/test_os_monitor.py -v
```

Run all unit tests across the repository:
```bash
python -m pytest tests/test_config_and_models.py tests/test_autotuner_mock.py tests/test_collector_unit.py tests/test_evaluator.py tests/test_os_monitor.py -v
```
