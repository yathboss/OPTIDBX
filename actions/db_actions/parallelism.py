"""Only an explicitly bound workload session can be tuned; never a monitor connection.

The owner must use execute_workload() or the same lock for workload SQL. It must
not reconnect, override GUCs, or share this session outside this adapter's lock.
No ALTER SYSTEM/ROLE/DATABASE and no pgbench session claims.
"""

import threading


class BoundWorkloadSession:
    parameter = "max_parallel_workers_per_gather"

    def __init__(self, connection, allowed_values, *, workload_id):
        if not workload_id or not connection.autocommit:
            raise ValueError("Bind a named, dedicated autocommit workload session")
        self.connection = connection
        self.allowed = tuple(allowed_values)
        self.workload_id = workload_id
        self.lock = threading.RLock()
        self.identity = self._identity()

    def _identity(self):
        with self.connection.cursor() as cur:
            cur.execute(
                "SELECT pg_backend_pid(), backend_start FROM pg_stat_activity "
                "WHERE pid = pg_backend_pid()"
            )
            row = cur.fetchone()
            if row is None:
                raise ValueError("Workload backend identity unavailable")
            return tuple(row)

    def _check(self):
        if self.connection.closed or not self.connection.autocommit:
            raise ValueError("Bound workload session is closed or changed transaction mode")
        if self._identity() != self.identity:
            raise ValueError("Workload session identity changed")

    def capabilities(self):
        return {
            "available": not bool(self.connection.closed),
            "scope": "bound_workload_session",
            "workload_id": self.workload_id,
            "backend_pid": self.identity[0],
            "backend_start": str(self.identity[1]),
        }

    def read(self):
        with self.lock:
            self._check()
            with self.connection.cursor() as cur:
                cur.execute("SELECT current_setting(%s)", (self.parameter,))
                return int(cur.fetchone()[0])

    def try_read(self):
        """Sampler never waits behind workload execution or an action."""
        if not self.lock.acquire(blocking=False):
            return None
        try:
            return self.read()
        finally:
            self.lock.release()

    def _write(self, value):
        if type(value) is not int or value not in self.allowed:
            raise ValueError("Value outside parallelism whitelist")
        with self.connection.cursor() as cur:
            cur.execute("SELECT set_config(%s, %s, false)", (self.parameter, str(value)))
        if self.read() != value:
            raise ValueError("Effective workload setting verification failed")

    def apply(self, old, new):
        with self.lock:
            if old not in self.allowed or self.allowed.index(old) == 0:
                raise ValueError("No safe lower value")
            if new != self.allowed[self.allowed.index(old) - 1] or self.read() != old:
                raise ValueError("Stale recommendation or invalid step")
            self._write(new)

    def restore(self, old, applied):
        with self.lock:
            current = self.read()
            if current == old:
                return
            if current != applied:
                raise ValueError("External setting change: refusing to overwrite it")
            self._write(old)

    def execute_workload(self, query, parameters=None):
        """Execute workload SQL on exactly the connection that is read and tuned."""
        with self.lock:
            self._check()
            with self.connection.cursor() as cur:
                cur.execute(query, parameters)
                return cur.fetchall() if cur.description else None
