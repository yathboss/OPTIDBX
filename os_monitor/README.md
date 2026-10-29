# OptiDBX Operating System Telemetry Subsystem (`os_monitor`)

**Developer 3:** Aryaman Singh — OS & Telemetry Engineer  
**Project:** OptiDBX — Adaptive OS–DBMS Co-Tuning System for PostgreSQL  
**Phase:** Phase 2 — Real OS Telemetry and Experiment Integration  
**Status:** Implementation specification for the Phase 2 MVP

---

## 1. Overview

The `os_monitor` package is responsible for collecting operating-system telemetry for OptiDBX. It continuously observes system resource utilization and provides structured measurements to the Autotuner engine, backend API, and dashboard.

The subsystem monitors four primary operating-system metrics:

- CPU utilization percentage
- Physical memory utilization percentage
- Disk read and write activity
- System-wide context-switch activity

Telemetry is collected at a configurable interval, with a default sampling interval of **5 seconds**. Each sample is timestamped, normalized to a consistent data format, and associated with the active experiment when applicable.

The collected information is stored in PostgreSQL through the `system_metrics` persistence layer. If database persistence temporarily fails, the subsystem may retain samples in a bounded in-memory buffer, provided that fallback behavior is implemented and enabled.

The monitor is designed to be non-invasive. It observes resource usage without changing CPU affinity, process priority, memory configuration, or other operating-system settings.

Its primary responsibility is to provide accurate, reliable, and explainable telemetry that helps the Autotuner determine whether the system is experiencing a performance bottleneck.

## 2. Objectives and Responsibilities

The subsystem has the following objectives:

1. Collect OS metrics periodically without requiring manual intervention.
2. Normalize measurements into the shared `OSMetrics` data model.
3. Calculate disk I/O and context-switch activity over individual sampling intervals.
4. Associate telemetry with the appropriate experiment.
5. Persist measurements for historical analysis and performance evaluation.
6. Provide the latest sample and recent telemetry history to other components.
7. Handle collection failures, configuration errors, and temporary database outages.
8. Support controlled startup and shutdown of the background collector.
9. Expose truthful diagnostic information about collection and persistence health.
10. Supply reliable evidence for detecting CPU and parallelism bottlenecks.

The subsystem does not independently detect all performance bottlenecks or choose tuning actions. Those responsibilities belong to the Autotuner engine, which combines operating-system telemetry with PostgreSQL metrics.

## 3. Package Structure

The `os_monitor` package is organized into the following modules:

```text
os_monitor/
├── __init__.py
├── collector.py
├── cpu.py
├── memory.py
├── disk.py
├── context_switch.py
├── storage.py
├── health.py
└── README.md
```

### 3.1 Module Responsibilities

**`__init__.py` — Public API**

Exports the supported interfaces required by other project components. These may include the collector class, experiment-binding functions, and latest-sample or history accessors.

**`collector.py` — Collection Orchestration**

Coordinates periodic metric collection, timestamps samples, associates experiment identifiers, and sends the resulting records to the storage layer.

It also manages the collector lifecycle, including starting, stopping, and handling background-thread failures.

**`cpu.py` — CPU Monitoring**

Collects the system-wide CPU utilization percentage. The implementation must document the selected measurement library and account for its initial sampling behavior.

**`memory.py` — Memory Monitoring**

Collects the percentage of physical memory currently in use. The measurement should use a consistent system-level definition rather than an undocumented mixture of used and available memory.

**`disk.py` — Disk I/O Monitoring**

Reads cumulative disk counters and calculates read and write byte deltas between consecutive successful samples.

**`context_switch.py` — Context-Switch Monitoring**

Collects cumulative system-wide context-switch counters and converts them into interval activity.

**`storage.py` — Telemetry Persistence**

Writes telemetry to PostgreSQL, provides access to recent samples, and optionally maintains a bounded in-memory buffer when database persistence is unavailable.

**`health.py` — Diagnostics**

Provides a command-line diagnostic that reports whether configuration loading, metric collection, and optional database persistence are functioning.

**`README.md` — Documentation**

Documents installation requirements, configuration, usage, metric semantics, integration contracts, troubleshooting, and testing.

## 4. Configuration

The collection interval is configured centrally in `config/config.yaml`.

```yaml
monitoring:
  interval_seconds: 5
```

The collector should read this setting through the project's shared configuration loader instead of implementing an unrelated configuration mechanism.

If the configuration file is absent, the documented default is 5 seconds. The implementation should validate the configured interval and reject invalid values, such as zero or negative intervals.

Configuration behavior should follow these rules:

- A valid positive interval is used for subsequent collection cycles.
- A missing configuration file results in the documented default.
- An invalid interval produces a clear diagnostic and a safe fallback or startup failure, according to the project's configuration policy.
- The resolved configuration should be visible in diagnostic output.
- Configuration paths should be resolved consistently from the repository root or an explicitly configured location.

The collector must not silently claim that a custom configuration has been loaded when it is actually using defaults.

## 5. Telemetry Collection and Normalization

The collector produces records compatible with the shared `autotuner.models.OSMetrics` model.

A representative serialized sample is:

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

The values are illustrative and do not represent live measurements.

### 5.1 Timestamp

Every sample must contain a timestamp representing when the measurements were collected.

- Timestamps should be timezone-aware and normalized to UTC.
- Database timestamps should use a consistent representation, preferably PostgreSQL `TIMESTAMPTZ`.
- Serialization should preserve the UTC offset or use an explicit UTC representation.
- Timestamps should be generated consistently so that OS and PostgreSQL telemetry can be correlated.

### 5.2 CPU Utilization

CPU utilization is represented as a percentage between 0 and 100 for the system as a whole.

The implementation should use a documented system-level CPU measurement method. If `psutil.cpu_percent()` is used with a non-blocking interval, its first call may return a meaningless initial value because no previous measurement interval exists.

The collector must account for this warm-up behavior. An invalid initial measurement should not be interpreted as proof that the CPU is idle.

### 5.3 Memory Utilization

Memory utilization is represented as a percentage between 0 and 100.

When using `psutil.virtual_memory().percent`, the reported value follows the library's definition of memory utilization. The documentation should not equate it automatically with the percentage of all installed RAM that is occupied by application processes.

Memory pressure should be evaluated by the Autotuner using multiple relevant measurements, rather than relying exclusively on this percentage.

### 5.4 Disk I/O Activity

Disk counters are generally cumulative. Therefore, the subsystem must calculate interval activity from consecutive readings:

`interval_read_bytes = current_read_bytes - previous_read_bytes`

`interval_write_bytes = current_write_bytes - previous_write_bytes`

The resulting values represent bytes transferred during the sampling interval, not lifetime totals.

The first successful counter reading establishes the baseline. The first interval delta is zero when zero is used to represent unavailable prior activity.

If counters decrease because of a reset or another discontinuity, the collector must establish a new baseline rather than emitting a negative I/O value.

The implementation must also document whether it uses system-wide disk counters or counters for selected devices. Device scope must remain consistent between readings.

### 5.5 Context-Switch Activity

Context-switch activity is calculated from a cumulative system-wide counter:

`interval_context_switches = current_context_switches - previous_context_switches`

For example, if the previous reading is 120,000 and the current reading is 122,410, the interval activity is 2,410 context switches.

The first reading establishes a baseline. If the counter resets or decreases, the collector must reinitialize its baseline and avoid negative deltas.

The metric represents system-wide activity, not the number of context switches caused exclusively by PostgreSQL.

## 6. Collection Lifecycle

The collector should follow a predictable lifecycle.

1. Load and validate the monitoring configuration.
2. Initialize metric collectors and counter baselines.
3. Initialize storage and diagnostic state.
4. Start the background collection process.
5. Read the current OS metrics at the configured interval.
6. Calculate interval deltas for disk I/O and context switches.
7. Construct a normalized telemetry record.
8. Associate the record with the active experiment, if one exists.
9. Store the record and update the latest-sample state.
10. Make the sample available to the Autotuner and backend.
11. Repeat until a shutdown request is received.

The collection loop should use controlled scheduling to avoid unnecessary timing drift. Collection or database operations must not cause overlapping cycles.

If a cycle takes longer than the configured interval, the collector should avoid launching duplicate cycles to compensate. Any missed or delayed samples should be handled predictably and reported through diagnostics where appropriate.

A single transient collection failure should not necessarily terminate the entire monitoring process. However, repeated failures must be observable rather than silently ignored.

## 7. Experiment Integration

OptiDBX uses experiment identifiers to connect telemetry with individual workload runs.

The subsystem should support binding an active experiment:

```python
set_active_experiment(experiment_id=1)
```

Each sample should capture the active experiment identifier at a clearly defined point in the collection cycle. This prevents a sample from being assigned inconsistently if the active experiment changes during collection.

The implementation should define how it handles the following cases:

- No experiment is active.
- An experiment starts while monitoring is already running.
- An experiment ends while monitoring continues.
- The active experiment changes during collection.
- An experiment identifier is invalid or does not exist.

If no experiment is active, the system may store the sample with a nullable experiment identifier, provided that the database schema permits it.

The OS monitor should not automatically create, start, or stop experiments unless that behavior is explicitly assigned to its API.

## 8. PostgreSQL Persistence and Buffering

The `storage.py` module is responsible for persisting normalized telemetry into the `system_metrics` table.

The table should contain the fields required by the shared data contract, including:

- Timestamp
- CPU utilization
- Memory utilization
- Disk read bytes
- Disk write bytes
- Interval context switches
- Experiment identifier, where applicable

The actual column names and data types must match the existing database schema and migration files. The monitor should not introduce a second incompatible definition of the same telemetry table.

### 8.1 Persistence Requirements

The storage layer should:

- Use parameterized database operations.
- Handle database connection and write failures explicitly.
- Avoid blocking the collection loop indefinitely on a database operation.
- Preserve timestamp and metric types consistently.
- Report persistence failures through diagnostics or logging.
- Avoid duplicate initialization or uncontrolled schema changes.

### 8.2 In-Memory Fallback

If fallback buffering is implemented, it should be bounded to prevent unbounded memory growth during prolonged database outages.

The implementation should define what happens when the buffer becomes full, whether retrying is supported, and how buffered records are flushed after recovery.

An in-memory buffer is not durable storage. Samples may be lost if the process terminates before they are persisted.

Consequently, the monitor must distinguish between a sample being collected successfully and a sample being stored successfully.

## 9. Public API and Usage

A representative programmatic interface is:

```python
from os_monitor import (
    OSMetricsCollector,
    set_active_experiment,
    get_latest_os_metrics,
    get_os_metrics_history,
)

collector = OSMetricsCollector()
collector.start()

set_active_experiment(experiment_id=1)

latest = get_latest_os_metrics()

if latest is not None:
    print(f"CPU utilization: {latest.cpu_percent}%")
    print(f"Memory utilization: {latest.memory_percent}%")
    print(f"Context switches: {latest.context_switches}")

collector.stop()
```

This example assumes that the listed functions are exported by `os_monitor.__init__` and that the collector supports the documented lifecycle.

The implementation should also define:

- What the latest-sample function returns before the first valid sample.
- Whether history contains in-memory samples, persisted samples, or both.
- How history limits and ordering are handled.
- Whether returned objects are immutable or copied before being exposed.
- Whether API access is safe while the background collector is updating its state.

Shared state should be protected appropriately so that concurrent collection and retrieval do not produce inconsistent results.

## 10. Health Checks and Command-Line Execution

The health-check utility should provide actionable diagnostics without claiming more than it verifies.

Run the health check from the repository root:

```bash
python -m os_monitor.health
```

A direct invocation may also be supported:

```bash
python os_monitor/health.py
```

However, direct execution must be tested against the package's actual import structure. Module execution is the preferred documented entry point when package imports are required.

The health check should report relevant information such as:

- Whether the monitoring configuration loaded.
- The resolved sampling interval.
- Whether the OS metric APIs are accessible.
- Whether a valid sample was collected.
- Whether counter baselines were initialized.
- Whether PostgreSQL connectivity is available, if database checking is enabled.
- Whether telemetry persistence succeeded.

The health check should return a nonzero exit status when a required operation fails. Optional dependencies, such as database connectivity for an OS-only diagnostic, should be clearly distinguished from mandatory checks.

The continuous collector CLI should support a clean shutdown when interrupted, including stopping its background thread and closing owned resources.

## 11. Autotuner and Dashboard Integration

The OS monitor supplies evidence to the Autotuner; it does not make tuning decisions by itself.

For the Phase 2 CPU/parallelism scenario, the Autotuner can combine:

- High CPU utilization
- Increased system-wide context-switch activity
- High PostgreSQL parallel activity
- Increasing query latency

A single high CPU reading should not automatically trigger a tuning action. The project's detection policy requires three consecutive problematic readings, collected at five-second intervals, before confirming a sustained bottleneck.

The monitor should provide timestamps and consistent metric values so the Autotuner can correlate OS telemetry with database telemetry.

The backend and dashboard may consume the latest sample to display CPU, memory, disk activity, and context switches. Historical records should support before-and-after comparisons during tuning experiments.

If the monitor is delayed or unhealthy, the Autotuner should not treat stale values as fresh observations. Sample age and collection health should be considered before any tuning action is authorized.

## 12. Error Handling and Reliability

The following conditions should be handled explicitly:

**Metric collection failure:** Record the failure, preserve the last valid sample where appropriate, and continue only when recovery is safe.

**Counter reset:** Reinitialize the affected counter baseline and avoid negative deltas.

**Database outage:** Report persistence failure and use bounded buffering only if configured.

**Invalid configuration:** Apply the documented fallback policy or stop startup with a clear error.

**Experiment-binding error:** Reject or report invalid identifiers according to the shared experiment contract.

**Collector shutdown:** Stop the background process cleanly and prevent new collection cycles after shutdown.

**Stale telemetry:** Expose the age of the latest valid sample so downstream components can distinguish current measurements from outdated ones.

Logging should be informative without producing excessive output every five seconds. Repeated errors should be visible, but logs should avoid unnecessary duplication.

## 13. Testing Strategy

Run the OS monitor tests:

```bash
python -m pytest tests/test_os_monitor.py -v
```

Run the broader unit-test suite:

```bash
python -m pytest \
  tests/test_config_and_models.py \
  tests/test_autotuner_mock.py \
  tests/test_collector_unit.py \
  tests/test_evaluator.py \
  tests/test_os_monitor.py -v
```

The test suite should cover the following areas.

### Metric Tests

- CPU values are represented using the expected percentage format.
- Memory utilization is read correctly.
- Disk read and write deltas are calculated correctly.
- Context-switch deltas are calculated correctly.
- First readings initialize baselines without producing negative activity.
- Counter resets are handled safely.

### Collector Tests

- The configured interval is respected.
- Missing configuration uses the documented default.
- Invalid configuration is handled predictably.
- Collection starts and stops correctly.
- Repeated collection failures do not remain silent.
- Concurrent readers receive consistent latest-sample and history data.

### Persistence Tests

- Valid records are written using the shared schema.
- Database errors are surfaced.
- Buffer limits are respected when buffering is enabled.
- Recovery behavior is tested if retrying and flushing are implemented.

### Integration Tests

- Experiment identifiers are attached correctly.
- Samples are compatible with `OSMetrics`.
- The Autotuner can consume the collected records.
- Stale telemetry can be identified.
- The diagnostic CLI returns appropriate exit codes.

Unit tests should mock operating-system counters and database dependencies where necessary. Separate integration tests should verify behavior against the actual supported environment.

## 14. Phase 2 Acceptance Criteria

The subsystem is ready for Phase 2 integration when:

- [ ] The collector starts and stops reliably.
- [ ] CPU and memory utilization are collected successfully.
- [ ] Disk I/O and context-switch interval deltas are correct.
- [ ] Samples use timezone-aware UTC timestamps.
- [ ] The default sampling interval is five seconds.
- [ ] Configuration loading and fallback behavior are tested.
- [ ] Telemetry conforms to the shared `OSMetrics` contract.
- [ ] Experiment association follows a documented lifecycle.
- [ ] PostgreSQL persistence works with the existing `system_metrics` schema.
- [ ] Database and collection failures are observable.
- [ ] The latest-sample API handles missing and stale data safely.
- [ ] Health-check diagnostics reflect actual subsystem status.
- [ ] The OS monitor tests pass.
- [ ] The Autotuner and backend can consume the telemetry without schema changes or type mismatches.

## 15. Scope and Future Improvements

Phase 2 focuses on reliable telemetry collection and experiment integration. It does not require machine-learning-based bottleneck detection, automatic OS resource modification, or advanced kernel-level monitoring.

Potential future improvements include more detailed per-process or per-device telemetry, richer diagnostics, improved buffering and recovery, and lower-overhead collection methods.

OS-level tuning actions, such as CPU affinity changes, process-priority adjustments, and cgroup CPU limits, should remain separate from this monitoring package. Any future integration must use explicit permissions, predefined safe limits, and the project's existing observe–evaluate–keep-or-rollback workflow.

## Conclusion

The `os_monitor` subsystem provides the operating-system telemetry foundation for OptiDBX. By collecting normalized CPU, memory, disk I/O, and context-switch measurements, it enables the Autotuner to correlate system resource conditions with PostgreSQL performance.

Correct counter handling, consistent timestamps, experiment association, reliable persistence, and truthful health reporting are essential. These requirements help ensure that tuning decisions are based on valid measurements rather than stale, incomplete, or incorrectly interpreted telemetry.
