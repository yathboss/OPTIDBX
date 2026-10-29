# OptiDBX Dashboard Architecture & Component Guide

## 1. Overview

The OptiDBX Dashboard is an operational interface built with **React 18** and bundled with **Vite**. It provides real-time observability and closed-loop control over PostgreSQL and Linux OS metrics, paired with safe autotuning action approvals and rollbacks.

```
+-----------------------------------------------------------------------+
|                              Header                                   |
|   [Brand] [Navigation Tabs: Evidence, Dashboard, Trends, Tuning]      |
|   [Export Data] [Safe V1 Badge] [ConnectionStatusBadge]               |
+-----------------------------------------------------------------------+
|                           TopSummary                                  |
|   Bottleneck Status | Active Recommendation | Mode (Rec/Auto)         |
+-----------------------------------------------------------------------+
|                         ActionControls Bar                            |
|   [Approve Action] [Rollback] [Mode Toggle] [Workload Selector]       |
+-----------------------------------------------------------------------+
|                       Memory Safety Panel                             |
|   RAM Usage | Swap Pressure | work_mem Admission Control Status       |
+-----------------------------------------------------------------------+
|                      Live Telemetry Grids                             |
|   OS Metrics: CPU, RAM, Disk I/O, Scheduler Context Switches          |
|   DBMS Metrics: Query Latency, TPS Throughput, Temp Spills, Workers   |
+-----------------------------------------------------------------------+
|                      TimeSeriesChart (History)                        |
|   Rolling window of CPU, Latency, TPS, and Spill Bytes                |
+-----------------------------------------------------------------------+
```

---

## 2. Component Hierarchy

- **`App.jsx`**: Root orchestrator. Manages active view tabs, 5-second polling timer, mutation locks, and global hotkeys.
- **`Header.jsx`**: Brand identity, primary navigation tabs, export trigger, and `ConnectionStatusBadge`.
- **`ConnectionStatusBadge.jsx`**: Live network state indicator (Active, Waiting, Offline) with response latency.
- **`TopSummary.jsx`**: High-level banner highlighting active bottlenecks, recommendation status, and auto-tuning safety state.
- **`ActionControls.jsx`**: Action execution bar enforcing safety constraints (approvals, rollbacks, and mode switches).
- **`MemorySafetyPanel.jsx`**: Host RAM and swap inspection panel that governs admission control for memory-expanding recommendations.
- **`MetricCard.jsx`**: Telemetry card with color severity indicators (`normal`, `warning`, `critical`), units, and educational viva tooltips.
- **`TimeSeriesChart.jsx`**: Canvas-rendered historical telemetry curves showing trend transitions.
- **`ExportModal.jsx`**: Evidence export dialog enabling instantaneous CSV and JSON downloads of telemetry and tuning actions.
- **`ShortcutsModal.jsx`**: Keyboard hotkey overlay (`?`, `1`-`5`, `R`, `E`, `Esc`).

---

## 3. State Management & Lifecycle

### 3.1 Polling & Mutex Locks
To avoid network spam and race conditions during tuning transitions:
1. **`fetching.current` Ref**: Guarantees that only one telemetry poll runs at any instant.
2. **`mutating.current` Ref**: Disables user interaction buttons during an ongoing approve, rollback, or mode change API call.
3. **HTTP 503 Handling**: Gracefully transitions the UI into a `Waiting for Telemetry` priming state when collectors are initializing without throwing console errors.

### 3.2 Action Safety Rules (`actionState.mjs`)
Tuning buttons are gated by deterministic preconditions:
- **`canApply`**: Requires `telemetry_available == true`, state `RECOMMENDATION_READY`, finite `new_value`, and `memory_safety.safe_for_memory_increase == true`.
- **`canRollback`**: Available when an action was applied and remains in `ACTION_APPLIED`, `OBSERVING`, `KEEP`, or `ROLLBACK_FAILED`.
- **`inLifecycle`**: Disables mode toggling while an action is actively being observed or cooling down.

---

## 4. Telemetry Analytics & Formatters

- **`dashboard/src/utils/formatters.mjs`**: Safe formatting routines for bytes (`formatBytes`, `formatBytesToMB`), percentages, latencies, and transactions per second.
- **`dashboard/src/utils/analytics.mjs`**: Threshold severity mapping, moving averages, disk spill detection, and composite memory risk scoring.
- **`dashboard/src/utils/exportTelemetry.mjs`**: Deterministic CSV escaping and RFC-compliant serialization for offline benchmark reviews.
