"""Shared in-process lease: DB observation/cooldown and manual OS actions cannot overlap.

Run one API worker. The lease is deliberately held through recovery failures.
"""

import threading


class ActionGate:
    def __init__(self):
        self._lock = threading.Lock()
        self._owner = None

    @property
    def busy(self):
        with self._lock:
            return self._owner is not None

    def acquire(self, owner):
        with self._lock:
            if self._owner is not None:
                raise ValueError("Another action or unresolved recovery owns the action gate")
            self._owner = owner

    def release(self, owner):
        with self._lock:
            if self._owner != owner:
                raise ValueError("Action lease owner mismatch")
            self._owner = None


GLOBAL_ACTION_GATE = ActionGate()
