"""
OptiDBX Operating System Monitoring & Telemetry Layer
Developer 3: Aryaman Singh (OS & Telemetry Engineer)

Exposes high-level OS monitoring interfaces for Autotuner (Yatharth)
and Dashboard/Backend (Shivansh).
"""

from os_monitor.collector import (
    OSMetricsCollector,
    get_global_collector,
    set_active_experiment,
    load_monitoring_interval,
)
from os_monitor.storage import (
    save_system_metrics,
    get_latest_os_metrics,
    get_os_metrics_history,
)
from os_monitor.cpu import get_cpu_percent
from os_monitor.memory import get_memory_percent
from os_monitor.disk import get_disk_io_deltas, DiskTracker
from os_monitor.context_switch import get_context_switches_delta, ContextSwitchTracker

__all__ = [
    "OSMetricsCollector",
    "get_global_collector",
    "set_active_experiment",
    "load_monitoring_interval",
    "save_system_metrics",
    "get_latest_os_metrics",
    "get_os_metrics_history",
    "get_cpu_percent",
    "get_memory_percent",
    "get_disk_io_deltas",
    "DiskTracker",
    "get_context_switches_delta",
    "ContextSwitchTracker",
]
