"""
OptiDBX OS Telemetry - Context Switch Metric Extractor
Developer 3: Aryaman Singh (OS & Telemetry Engineer)

Collects interval context-switch activity.
Shared contract field: context_switches (int, non-negative interval delta).

IMPORTANT:
This field represents the number of context switches occurring strictly during
the sampling interval, NOT the machine's lifetime cumulative total.
"""

import logging
from typing import Optional
import psutil

logger = logging.getLogger("optidbx.os_monitor.context_switch")


class ContextSwitchTracker:
    """
    Tracks cumulative context switches and computes interval deltas.
    Uses psutil.cpu_stats().ctx_switches, which is cross-platform across
    Linux, WSL2, and Windows.
    """

    def __init__(self):
        self.interval_valid = False
        self._prev_ctx_switches: Optional[int] = None

    def reset(self) -> None:
        """Reset internal counter state."""
        self._prev_ctx_switches = None
        self.interval_valid = False

    def get_context_switches_delta(self) -> int:
        """
        Calculate context switches since the previous sample.

        Returns:
            int: Number of context switches during the interval.

        Behavior:
            - On the very first sample (no prior baseline), returns 0 and records baseline.
            - On subsequent samples, returns (current_ctx - prev_ctx).
            - If counters reset or a negative delta occurs, resets the baseline,
              clamps delta to 0, and logs a warning.
        """
        try:
            self.interval_valid = False
            stats = psutil.cpu_stats()
            if stats is None or not hasattr(stats, "ctx_switches"):
                logger.warning("psutil.cpu_stats() has no ctx_switches attribute.")
                return 0

            curr_cs = int(stats.ctx_switches)

            if self._prev_ctx_switches is None:
                # First sample: establish baseline, return 0 delta
                self._prev_ctx_switches = curr_cs
                logger.debug(f"Established context switch baseline: {curr_cs}")
                return 0

            delta = curr_cs - self._prev_ctx_switches
            self.interval_valid = delta >= 0

            if delta < 0:
                logger.warning(
                    f"Negative context switches delta detected ({delta}). "
                    f"Previous={self._prev_ctx_switches}, Current={curr_cs}. Resetting baseline."
                )
                delta = 0

            self._prev_ctx_switches = curr_cs
            return int(delta)

        except Exception as exc:
            logger.error(f"Error collecting context switch telemetry: {exc}")
            raise RuntimeError(f"Context switch telemetry unavailable: {exc}") from exc


_default_cs_tracker = ContextSwitchTracker()


def get_context_switches_delta() -> int:
    """Convenience function using the default singleton tracker."""
    return _default_cs_tracker.get_context_switches_delta()
