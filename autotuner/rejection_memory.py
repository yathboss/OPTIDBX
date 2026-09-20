"""Remember parallelism reductions that proved ineffective, per workload condition.

Avoids repeatedly applying the same reduction that already failed to help under
comparable conditions, while allowing reconsideration when conditions materially
change (a different condition signature) or after a configured time-to-live.

Session-scoped and in-memory; not persisted across API restarts by design.
Uses telemetry-sample UTC timestamps so recording and expiry share one clock.
"""

import logging
import threading

logger = logging.getLogger(__name__)


def condition_signature(active_workers, cpu_percent):
    """Coarse bucket of workload conditions: tolerant of noise, sensitive to real shifts."""
    workers_band = int(active_workers) // 4  # 0-3, 4-7, 8-11, ...
    cpu_band = min(9, max(0, int(cpu_percent) // 10))  # CPU decile, clamped
    return f"w{workers_band}:c{cpu_band}"


class RejectedReductionMemory:
    def __init__(self, ttl_seconds):
        self.ttl_seconds = ttl_seconds
        self._entries = {}  # (transition, signature) -> (recorded_at, count, reason)
        self._lock = threading.Lock()

    def record(self, transition, signature, reason, now):
        """Note that reducing old->new under this signature was rolled back for performance."""
        key = (tuple(transition), signature)
        with self._lock:
            previous = self._entries.get(key)
            count = previous[1] + 1 if previous else 1
            self._entries[key] = (now, count, reason)
        logger.info(
            "Remembered ineffective reduction %s under %s (%dx)",
            transition,
            signature,
            count,
            extra={"event": "reduction_rejected_recorded"},
        )

    def is_suppressed(self, transition, signature, now):
        """Return (suppressed, human_reason) for this transition under this signature."""
        key = (tuple(transition), signature)
        with self._lock:
            entry = self._entries.get(key)
            if entry is None:
                return False, None
            recorded_at, count, _ = entry
            elapsed = (now - recorded_at).total_seconds()
            if elapsed < 0 or elapsed > self.ttl_seconds:
                del self._entries[key]  # Expired or clock reset: reconsider.
                return False, None
            remaining = int(self.ttl_seconds - elapsed)
            old, new = transition
            reason = (
                f"Skipped reducing {old}->{new}: ineffective under comparable conditions "
                f"{count}x; reconsider in ~{remaining}s or if load changes materially."
            )
            return True, reason

    def snapshot(self):
        """Read-only view for status/reporting, keyed by a readable string."""
        with self._lock:
            return {
                f"{old}->{new}@{signature}": {"count": count, "reason": reason}
                for ((old, new), signature), (_, count, reason) in self._entries.items()
            }
