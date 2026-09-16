"""
OptiDBX OS Telemetry - Memory Metric Extractor
Developer 3: Aryaman Singh (OS & Telemetry Engineer)

Collects system memory utilization percentage.
Shared contract field: memory_percent (float, 0.0 to 100.0).
"""

import logging
import psutil

logger = logging.getLogger("optidbx.os_monitor.memory")


def get_memory_percent() -> float:
    """
    Return overall system virtual memory utilization percentage.
    Utilizes psutil.virtual_memory().percent.
    """
    try:
        mem = psutil.virtual_memory()
        val = float(mem.percent)
        if val < 0.0 or val > 100.0:
            logger.warning(f"Memory percent out of bounds ({val}), clamping to [0.0, 100.0]")
            val = max(0.0, min(100.0, val))
        return round(val, 2)
    except Exception as exc:
        logger.error(f"Error collecting memory telemetry: {exc}")
        raise RuntimeError(f"Memory telemetry unavailable: {exc}") from exc
