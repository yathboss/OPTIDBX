"""
OptiDBX OS Telemetry - Disk I/O Metric Extractor
Developer 3: Aryaman Singh (OS & Telemetry Engineer)

Collects interval disk read and write activity in bytes.
Shared contract fields:
- disk_read_bytes (int, non-negative interval delta)
- disk_write_bytes (int, non-negative interval delta)

IMPORTANT:
These fields represent activity strictly during the sampling interval,
NOT cumulative lifetime totals.
"""

import logging
from typing import Tuple, Optional
import psutil

logger = logging.getLogger("optidbx.os_monitor.disk")


class DiskTracker:
    """
    Tracks cumulative disk I/O counters and computes interval byte deltas.
    """

    def __init__(self):
        self._prev_read_bytes: Optional[int] = None
        self._prev_write_bytes: Optional[int] = None

    def reset(self) -> None:
        """Reset internal counter state."""
        self._prev_read_bytes = None
        self._prev_write_bytes = None

    def get_io_deltas(self) -> Tuple[int, int]:
        """
        Calculate disk read bytes and disk write bytes since the previous sample.

        Returns:
            Tuple[int, int]: (disk_read_bytes, disk_write_bytes)

        Behavior:
            - On the very first sample (no prior baseline), returns (0, 0) and records baseline.
            - On subsequent samples, returns (current_read - prev_read, current_write - prev_write).
            - If counters reset or a negative delta is detected (e.g., system reboot/overflow),
              resets the baseline, clamps the delta to 0, and logs a warning.
        """
        try:
            counters = psutil.disk_io_counters(perdisk=False)
            if counters is None:
                logger.warning("psutil.disk_io_counters() returned None (no disk devices found).")
                return 0, 0

            curr_read = int(counters.read_bytes)
            curr_write = int(counters.write_bytes)

            if self._prev_read_bytes is None or self._prev_write_bytes is None:
                # First sample: establish baseline, return 0 deltas
                self._prev_read_bytes = curr_read
                self._prev_write_bytes = curr_write
                logger.debug(f"Established disk baseline: read={curr_read}, write={curr_write}")
                return 0, 0

            read_delta = curr_read - self._prev_read_bytes
            write_delta = curr_write - self._prev_write_bytes

            # Handle counter resets or anomalies
            if read_delta < 0:
                logger.warning(
                    f"Negative disk read delta detected ({read_delta}). "
                    f"Previous={self._prev_read_bytes}, Current={curr_read}. Resetting baseline."
                )
                read_delta = 0

            if write_delta < 0:
                logger.warning(
                    f"Negative disk write delta detected ({write_delta}). "
                    f"Previous={self._prev_write_bytes}, Current={curr_write}. Resetting baseline."
                )
                write_delta = 0

            self._prev_read_bytes = curr_read
            self._prev_write_bytes = curr_write

            return int(read_delta), int(write_delta)

        except Exception as exc:
            logger.error(f"Error collecting disk telemetry: {exc}")
            raise RuntimeError(f"Disk telemetry unavailable: {exc}") from exc


_default_disk_tracker = DiskTracker()


def get_disk_io_deltas() -> Tuple[int, int]:
    """Convenience function using the default singleton tracker."""
    return _default_disk_tracker.get_io_deltas()
