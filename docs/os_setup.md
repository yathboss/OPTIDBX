# OptiDBX - OS Environment & Monitoring Setup Guide

**Developer 3: Aryaman Singh (OS & Telemetry Engineer)**
**Phase 2: Real OS Telemetry + Experiment Integration**

---

## 1. System Requirements & Environment

- **Python**: 3.11+ (Tested on Python 3.12.10)
- **Supported Platforms**: Linux (Ubuntu 22.04+), WSL2 (Ubuntu), Windows 11
- **Key Dependencies**:
  - `psutil >= 5.9.0` (Native OS telemetry extraction)
  - `psycopg2-binary >= 2.9.0` (PostgreSQL relational persistence)
  - `pydantic >= 2.12.0` (Shared contract validation)
  - `pyyaml >= 6.0.3` (Configuration loading)

---

## 2. Python Environment Installation

Install standard dependencies:
```bash
pip install -r requirements.txt
pip install -r requirements-dev.txt
```

Verify `psutil` installation:
```bash
python -c "import psutil; print('psutil version:', psutil.__version__)"
```

---

## 3. OS System Diagnostics Verification

### 3.1 Linux / WSL2 Verification
On Linux and WSL2 environments, verify OS metric hooks:
```bash
# Check /proc virtual filesystem
cat /proc/stat | grep "^cpu "
cat /proc/meminfo | head -n 5

# Check vmstat
vmstat 1 3

# Check iostat (if sysstat package is installed)
which iostat >/dev/null 2>&1 && iostat -d 1 2 || echo "iostat not installed (optional)"
```

### 3.2 Host Observations (Actual Verification)
- **Host**: Windows 11 64-bit (`win32`), Python 3.12.10.
- **WSL2 Status**: Not installed on current host (`wsl.exe` reports subsystem not installed).
- **Fallback / Portability**: `psutil` handles platform abstraction transparently, using native Windows performance counters (`psutil.cpu_percent()`, `psutil.virtual_memory()`, `psutil.disk_io_counters()`, and `psutil.cpu_stats().ctx_switches`). On Linux/WSL2, `psutil` queries `/proc/stat` and `/proc/diskstats`.

---

## 4. PostgreSQL Persistence Setup

The OS monitoring subsystem persists time-series telemetry into the `system_metrics` table defined in `database/schema.sql`.

### Connection Configuration
The database parameters are read from environment variables (with defaults):
```bash
export POSTGRES_HOST=localhost
export POSTGRES_PORT=5432
export POSTGRES_DB=optidbx
export POSTGRES_USER=postgres
export POSTGRES_PASSWORD=postgres
```

### Table Schema (`system_metrics`)
```sql
CREATE TABLE IF NOT EXISTS system_metrics (
    id BIGSERIAL PRIMARY KEY,
    experiment_id INT REFERENCES experiment_runs(id) ON DELETE CASCADE,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    cpu_percent NUMERIC(5, 2) NOT NULL,
    memory_percent NUMERIC(5, 2) NOT NULL,
    disk_read_bytes BIGINT DEFAULT 0,
    disk_write_bytes BIGINT DEFAULT 0,
    context_switches BIGINT DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_sys_metrics_exp_time ON system_metrics(experiment_id, timestamp);
```

### Offline Resilience (In-Memory Ring Buffer)
If PostgreSQL is unreachable, the collector does not crash. It logs a warning and stores records in an in-memory ring buffer (capacity: 120 samples = 10 minutes at 5s intervals). When PostgreSQL reconnects, buffered items are flushed automatically.

---

## 5. Health Check Diagnostic CLI

Run the health check at any time to verify system metrics and database connectivity:
```bash
python -m os_monitor.health
# or
python os_monitor/health.py
```

Expected output:
```text
========================================
   OptiDBX OS Monitor Health Check
   Developer 3: Aryaman Singh
========================================
Platform:         Windows 11 (Python 3.12.10)
psutil:           OK (v7.2.2)
CPU Telemetry:    OK (28.4%)
Memory Telemetry: OK (46.2%)
Disk I/O:         OK (read=0B, write=0B)
Context Switches: OK (12 switches)
/proc filesystem: NOT APPLICABLE (Running on Windows (non-Linux, /proc not available))
Storage:          OK (Connected; system_metrics verified) [or NOT AVAILABLE]
========================================
```
