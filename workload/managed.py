"""An explicitly owned group of workload sessions; never targets external pgbench.

Actions pause admission and drain in-flight queries before verifying every session.
The owner must execute queries through this group and must not reconnect sessions.
"""

import threading
import time
from contextlib import contextmanager

from workload.measurements import RollingQueryLog


class BoundWorkloadGroup:
    def __init__(self, sessions, *, workload_id):
        if not sessions or not workload_id:
            raise ValueError("A named, nonempty workload group is required")
        self.sessions = tuple(sessions)
        self.workload_id = workload_id
        self._condition = threading.Condition()
        self._action_lock = threading.RLock()
        self._paused = False
        self._active = 0
        # Client-observed timings the lifecycle reads to judge KEEP/ROLLBACK on the
        # owned workload itself, excluding the one-off action-barrier wait below.
        self.performance = RollingQueryLog()
        self._cached = self.read()

    def capabilities(self):
        members = [s.capabilities() for s in self.sessions]
        return {
            "available": all(m["available"] for m in members),
            "scope": "bound_workload_group",
            "workload_id": self.workload_id,
            "sessions": members,
        }

    @contextmanager
    def _exclusive(self):
        with self._action_lock:
            with self._condition:
                self._paused = True
                drained = self._condition.wait_for(lambda: self._active == 0, timeout=10)
                if not drained:
                    self._paused = False
                    self._condition.notify_all()
                    raise ValueError("Workload queries did not drain within 10 seconds")
            try:
                yield
            finally:
                with self._condition:
                    self._paused = False
                    self._condition.notify_all()

    def _read_all(self):
        values = {session.read() for session in self.sessions}
        if len(values) != 1:
            self._cached = None
            raise ValueError("Workload sessions have inconsistent parallelism")
        self._cached = values.pop()
        return self._cached

    def read(self):
        with self._exclusive():
            return self._read_all()

    def try_read(self):
        # This is the last verified value, not a blocking read behind a query.
        # apply/restore always re-read all effective settings before accepting it.
        with self._condition:
            return None if self._paused else self._cached

    def apply(self, old, new):
        with self._exclusive():
            if self._read_all() != old:
                raise ValueError("Workload setting changed since recommendation")
            self._cached = None
            for session in self.sessions:
                session.apply(old, new)
            if self._read_all() != new:
                raise ValueError("Group apply verification failed")
            self.performance.reset()

    def restore(self, old, applied):
        with self._exclusive():
            self._cached = None
            errors = []
            for session in self.sessions:
                try:
                    session.restore(old, applied)
                except Exception as exc:
                    errors.append(exc)
            if errors:
                raise ValueError("One or more workload sessions could not be restored") from errors[
                    0
                ]
            if self._read_all() != old:
                raise ValueError("Group restore verification failed")
            self.performance.reset()

    def earliest(self):
        return self.performance.earliest()

    def window(self, start, end):
        """Owned-workload latency/throughput summary over a monotonic time window."""
        return self.performance.window(start, end)

    def execute(self, index, query):
        with self._condition:
            if not self._condition.wait_for(lambda: not self._paused, timeout=15):
                raise ValueError("Workload action barrier timed out")
            self._active += 1
        # Time only the query round trip, not the admission barrier above.
        started = time.monotonic()
        try:
            result = self.sessions[index].execute_workload(query)
            self.performance.record(started, time.monotonic())
            return result
        except Exception as exc:
            self.performance.record(
                started,
                time.monotonic(),
                error=True,
                timeout=getattr(exc, "pgcode", None) == "57014",
            )
            raise
        finally:
            with self._condition:
                self._active -= 1
                self._condition.notify_all()
