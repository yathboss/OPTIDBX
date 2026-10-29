"""Bounded client-observed timings, independent of PostgreSQL statistics traffic."""

import math
import threading
from array import array
from collections import deque


def percentile(values, fraction):
    if not values:
        return None
    ordered = sorted(values)
    index = (len(ordered) - 1) * fraction
    low = int(index)
    high = min(low + 1, len(ordered) - 1)
    return ordered[low] + (ordered[high] - ordered[low]) * (index - low)


class QueryMeasurements:
    def __init__(self, start, duration, capacity=250000):
        self.start, self.end = start, start + duration
        self.capacity = capacity
        self.latencies = array("d")
        self.successes = self.errors = self.timeouts = 0
        self.overflow = False
        self.lock = threading.Lock()

    def record(self, started, finished, *, error=False, timeout=False):
        if not self.start <= started <= finished <= self.end:
            return
        if not math.isfinite(finished - started):
            return
        with self.lock:
            if error:
                self.errors += 1
                self.timeouts += int(timeout)
            else:
                self.successes += 1
                if len(self.latencies) < self.capacity:
                    self.latencies.append((finished - started) * 1000)
                else:
                    self.overflow = True

    def summary(self, now):
        with self.lock:
            elapsed = max(0, min(now, self.end) - self.start)
            return {
                "successful_queries": self.successes,
                "errors": self.errors,
                "timeouts": self.timeouts,
                "elapsed_seconds": elapsed,
                "throughput_qps": self.successes / elapsed if elapsed else None,
                "median_latency_ms": percentile(self.latencies, 0.5),
                "p95_latency_ms": percentile(self.latencies, 0.95),
                "overflow": self.overflow,
                "error_rate": self.errors / max(1, self.successes + self.errors),
            }


class RollingQueryLog:
    """Monotonic-timestamped owned-query timings, queryable by arbitrary time window.

    The action lifecycle uses this to judge KEEP/ROLLBACK from real owned-workload
    latency (median/p95) and throughput (QPS) rather than database-wide telemetry,
    comparing a pre-apply baseline window against the post-apply observation window.
    Bounded by capacity; the oldest samples are dropped, so query recent windows only.
    """

    def __init__(self, capacity=250000):
        if type(capacity) is not int or capacity < 1:
            raise ValueError("Query log capacity must be positive")
        self.capacity = capacity
        # Each entry: (started, finished, latency_ms_or_None, ok, timeout).
        self.entries = deque(maxlen=capacity)
        self.dropped = 0
        self.dropped_until = float("-inf")
        self.first_started = None
        self.lock = threading.Lock()

    def earliest(self):
        """First query start in this unchanged-setting epoch, even after eviction."""
        with self.lock:
            return self.first_started

    def reset(self):
        """Called while queries are drained after apply/restore; require a fresh baseline."""
        with self.lock:
            self.entries.clear()
            self.dropped = 0
            self.dropped_until = float("-inf")
            self.first_started = None

    def record(self, started, finished, *, error=False, timeout=False):
        if not started <= finished or not math.isfinite(finished - started):
            return
        with self.lock:
            if len(self.entries) == self.capacity:
                self.dropped += 1  # An older sample is about to be evicted.
                self.dropped_until = max(self.dropped_until, self.entries[0][1])
            self.first_started = started if self.first_started is None else min(self.first_started, started)
            latency = None if error else (finished - started) * 1000
            self.entries.append((started, finished, latency, not error, bool(timeout)))

    def window(self, start, end):
        """Only queries executed wholly inside the window count (as in paired benchmarks)."""
        if not math.isfinite(start) or not math.isfinite(end) or end <= start:
            return None
        with self.lock:
            rows = [entry for entry in self.entries if start <= entry[0] <= entry[1] <= end]
            # The requested window may predate retained history if capacity overflowed.
            truncated = self.dropped_until >= start
        if not rows:
            return None
        latencies = [latency for _, _, latency, ok, _ in rows if ok and latency is not None]
        successes = sum(1 for row in rows if row[3])
        errors = sum(1 for row in rows if not row[3])
        timeouts = sum(1 for row in rows if row[4])
        duration = end - start
        return {
            "successful_queries": successes,
            "errors": errors,
            "timeouts": timeouts,
            "elapsed_seconds": duration,
            "qps": successes / duration if duration > 0 else None,
            "median_latency_ms": percentile(latencies, 0.5),
            "p95_latency_ms": percentile(latencies, 0.95),
            "error_rate": errors / max(1, successes + errors),
            "truncated": truncated,
        }
