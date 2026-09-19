"""Bounded client-observed timings, independent of PostgreSQL statistics traffic."""
import math
import threading
from array import array


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
        self.latencies = array('d')
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
            return {'successful_queries': self.successes, 'errors': self.errors,
                    'timeouts': self.timeouts, 'elapsed_seconds': elapsed,
                    'throughput_qps': self.successes / elapsed if elapsed else None,
                    'median_latency_ms': percentile(self.latencies, .5),
                    'p95_latency_ms': percentile(self.latencies, .95), 'overflow': self.overflow,
                    'error_rate': self.errors / max(1, self.successes + self.errors)}
