"""
OptiDBX OS Monitor Health & Environment Verification
Developer 3: Aryaman Singh (OS & Telemetry Engineer)

Validates environment capabilities, psutil telemetry sources, /proc accessibility,
and PostgreSQL system_metrics persistence.
Reports truthful status without fabricated results.
"""

import sys
import os
import platform
from pathlib import Path
from typing import Dict, Any

# Ensure project root is in sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


def check_psutil_import() -> Dict[str, Any]:
    """Verify psutil is installed and accessible."""
    try:
        import psutil
        return {
            "status": "OK",
            "version": getattr(psutil, "__version__", "unknown"),
        }
    except ImportError as exc:
        return {
            "status": "FAILED",
            "error": str(exc),
        }


def check_cpu_telemetry() -> Dict[str, Any]:
    """Verify real CPU telemetry reading."""
    try:
        from os_monitor.cpu import get_cpu_percent
        val = get_cpu_percent(interval=0.1)
        if 0.0 <= val <= 100.0:
            return {"status": "OK", "sample": f"{val}%"}
        return {"status": "OUT_OF_BOUNDS", "value": val}
    except Exception as exc:
        return {"status": "FAILED", "error": str(exc)}


def check_memory_telemetry() -> Dict[str, Any]:
    """Verify real memory telemetry reading."""
    try:
        from os_monitor.memory import get_memory_percent
        val = get_memory_percent()
        if 0.0 <= val <= 100.0:
            return {"status": "OK", "sample": f"{val}%"}
        return {"status": "OUT_OF_BOUNDS", "value": val}
    except Exception as exc:
        return {"status": "FAILED", "error": str(exc)}


def check_disk_telemetry() -> Dict[str, Any]:
    """Verify real disk I/O delta tracking."""
    try:
        from os_monitor.disk import DiskTracker
        tracker = DiskTracker()
        # First reading establishes baseline
        tracker.get_io_deltas()
        # Second reading computes delta
        read_b, write_b = tracker.get_io_deltas()
        return {
            "status": "OK",
            "sample_deltas": f"read={read_b}B, write={write_b}B",
        }
    except Exception as exc:
        return {"status": "FAILED", "error": str(exc)}


def check_context_switch_telemetry() -> Dict[str, Any]:
    """Verify real context-switch delta tracking."""
    try:
        from os_monitor.context_switch import ContextSwitchTracker
        tracker = ContextSwitchTracker()
        tracker.get_context_switches_delta()
        cs_delta = tracker.get_context_switches_delta()
        return {
            "status": "OK",
            "sample_delta": f"{cs_delta} switches",
        }
    except Exception as exc:
        return {"status": "FAILED", "error": str(exc)}


def check_proc_filesystem() -> Dict[str, Any]:
    """Check /proc accessibility (relevant on Linux/WSL2)."""
    proc_stat = Path("/proc/stat")
    if proc_stat.exists():
        try:
            with open(proc_stat, "r") as f:
                first_line = f.readline().strip()
            return {"status": "OK", "info": f"/proc/stat accessible ({first_line[:20]}...)"}
        except Exception as exc:
            return {"status": "ERROR", "error": str(exc)}
    else:
        # Truthful reporting on Windows host
        return {
            "status": "NOT APPLICABLE",
            "info": f"Running on {platform.system()} (non-Linux, /proc not available)",
        }


def check_postgres_storage() -> Dict[str, Any]:
    """Check PostgreSQL connectivity and system_metrics table."""
    try:
        from os_monitor.storage import get_db_connection
        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT table_name
                    FROM information_schema.tables
                    WHERE table_schema = 'public' AND table_name = 'system_metrics';
                    """
                )
                row = cur.fetchone()
                if row:
                    return {"status": "OK", "info": "Connected; system_metrics verified"}
                else:
                    return {"status": "PARTIAL", "info": "Connected; system_metrics table missing"}
        finally:
            conn.close()
    except Exception as exc:
        return {
            "status": "NOT AVAILABLE",
            "error": str(exc),
        }


def run_health_check() -> Dict[str, Any]:
    """Run all diagnostic checks and return complete health dictionary."""
    return {
        "platform": {
            "system": platform.system(),
            "release": platform.release(),
            "python_version": platform.python_version(),
        },
        "psutil": check_psutil_import(),
        "cpu": check_cpu_telemetry(),
        "memory": check_memory_telemetry(),
        "disk": check_disk_telemetry(),
        "context_switches": check_context_switch_telemetry(),
        "proc_fs": check_proc_filesystem(),
        "storage": check_postgres_storage(),
    }


def print_health_report() -> None:
    """Print human-readable health summary."""
    health = run_health_check()
    p = health["platform"]
    print("========================================")
    print("   OptiDBX OS Monitor Health Check")
    print("   Developer 3: Aryaman Singh")
    print("========================================")
    print(f"Platform:         {p['system']} {p['release']} (Python {p['python_version']})")
    print(f"psutil:           {health['psutil']['status']} (v{health['psutil'].get('version', '')})")
    print(f"CPU Telemetry:    {health['cpu']['status']} ({health['cpu'].get('sample', health['cpu'].get('error', ''))})")
    print(f"Memory Telemetry: {health['memory']['status']} ({health['memory'].get('sample', health['memory'].get('error', ''))})")
    print(f"Disk I/O:         {health['disk']['status']} ({health['disk'].get('sample_deltas', health['disk'].get('error', ''))})")
    print(f"Context Switches: {health['context_switches']['status']} ({health['context_switches'].get('sample_delta', health['context_switches'].get('error', ''))})")
    print(f"/proc filesystem: {health['proc_fs']['status']} ({health['proc_fs']['info']})")

    st = health["storage"]
    if st["status"] == "OK":
        print(f"Storage:          OK ({st['info']})")
    else:
        print(f"Storage:          NOT AVAILABLE ({st.get('error', st.get('info', ''))})")
    print("========================================")


if __name__ == "__main__":
    print_health_report()
