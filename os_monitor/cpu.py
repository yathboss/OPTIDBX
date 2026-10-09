"""
OptiDBX OS Telemetry - CPU Metric Extractor
Developer 3: Aryaman Singh (OS & Telemetry Engineer)

Collects overall system CPU utilization percentage.
Shared contract field: cpu_percent (float, 0.0 to 100.0).
"""

import logging
from typing import Optional
import psutil

logger = logging.getLogger("optidbx.os_monitor.cpu")

_cpu_initialized: bool = False


def init_cpu() -> None:
    """
    Warm-up psutil CPU baseline.
    Calling psutil.cpu_percent(interval=None) primes the internal counter
    so subsequent calls measure the exact elapsed interval.
    """
    global _cpu_initialized
    try:
        psutil.cpu_percent(interval=None)
        _cpu_initialized = True
        logger.debug("CPU monitor primed successfully.")
    except Exception as exc:
        logger.warning(f"Failed to prime CPU monitor: {exc}")


def get_cpu_percent(interval: Optional[float] = None) -> float:
    """
    Return overall system CPU utilization percentage.
    If interval is None and init_cpu() was called, returns CPU usage since the last call.
    If interval is provided, blocks for that duration (used during standalone verification).
    """
    global _cpu_initialized
    if not _cpu_initialized and interval is None:
        init_cpu()

    try:
        val = psutil.cpu_percent(interval=interval)
        if val is None or not isinstance(val, (int, float)):
            raise ValueError(f"psutil returned non-numeric CPU reading: {val}")

        # Ensure valid range
        val = float(val)
        if val < 0.0 or val > 100.0:
            logger.warning(f"CPU percent out of bounds ({val}), clamping to [0.0, 100.0]")
            val = max(0.0, min(100.0, val))

        return round(val, 2)
    except Exception as exc:
        logger.error(f"Error collecting CPU telemetry: {exc}")
        raise RuntimeError(f"CPU telemetry unavailable: {exc}") from exc
