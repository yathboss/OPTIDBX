"""Bound, time-limited analytical workloads for the local safe V1 demo."""

import logging
import random
import threading
import time
from datetime import UTC, datetime

from actions.db_actions.parallelism import BoundWorkloadSession
from workload import queries
from workload.managed import BoundWorkloadGroup
from workload.measurements import QueryMeasurements

logger = logging.getLogger(__name__)


class ManagedWorkload:
    def __init__(self, runtime):
        self.runtime = runtime
        self.lock = threading.RLock()
        self.stop_event = threading.Event()
        self.connections = []
        self.workers = []
        self.group = None
        self.running = False
        self.profile = None
        self.workload_type = None
        self.initial_parallelism = None
        self.initial_work_mem_mb = None
        self.max_aid = None
        self.experiment_id = None
        self.started_at = None
        self.error = None
        self.duration = None
        self.completed_queries = 0
        self._counter_lock = threading.Lock()
        self.measurements = None
        self.reservation = None

    def status(self):
        with self._counter_lock:
            completed = self.completed_queries
        return dict(
            benchmark_id=self.reservation,
            running=self.running,
            profile=self.profile,
            workload_type=self.workload_type,
            initial_parallelism=self.initial_parallelism,
            initial_work_mem_mb=self.initial_work_mem_mb,
            experiment_id=self.experiment_id,
            started_at=self.started_at,
            details=self.error or "Owned workload sessions; external pgbench is not controlled",
            error=self.error,
            clients=len(self.connections),
            completed_queries=completed,
            duration_seconds=self.duration,
            recovery_required=self.runtime.lifecycle.status()["recovery_required"],
            measurements=self.measurements.summary(time.monotonic()) if self.measurements else None,
        )

    def start(
        self,
        profile,
        duration_seconds,
        *,
        owner=None,
        workload_type="ANALYTICAL",
        initial_parallelism=None,
        initial_work_mem_mb=None,
        warmup_seconds=0,
    ):
        from db_monitor.storage import end_experiment, get_connection, start_experiment

        with self.lock:
            if self.reservation is not None and self.reservation != owner:
                raise ValueError("A benchmark owns the workload; cancel it before manual control")
            if initial_parallelism is not None and (
                type(initial_parallelism) is not int
                or initial_parallelism
                not in self.runtime.config.safe_values.max_parallel_workers_per_gather
            ):
                raise ValueError("Initial parallelism is outside the configured whitelist")
            if initial_work_mem_mb is not None and (
                type(initial_work_mem_mb) is not int
                or initial_work_mem_mb not in self.runtime.config.safe_values.work_mem_mb
            ):
                raise ValueError("Initial work_mem is outside the configured whitelist")
            if workload_type not in queries.WORKLOAD_TYPES:
                raise ValueError("Choose a workload type: " + ", ".join(queries.WORKLOAD_TYPES))
            if (
                profile not in ("LOW", "MEDIUM", "HIGH")
                or type(duration_seconds) is not int
                or not 30 <= duration_seconds <= 600
            ):
                raise ValueError("Choose LOW/MEDIUM/HIGH and a duration from 30 to 600 seconds")
            if self.running or self.connections:
                raise ValueError("A workload is already running or awaiting recovery")
            if self.runtime.lifecycle.status()["state"] != "MONITORING":
                raise ValueError("Wait for cooldown or resolve action recovery before starting")
            self.runtime.stop()
            self.runtime.flush_telemetry()
            self.error = None
            self.profile, self.duration = profile, duration_seconds
            self.workload_type = workload_type
            self.initial_parallelism = initial_parallelism
            self.initial_work_mem_mb = initial_work_mem_mb
            self.max_aid = None
            self.experiment_id = None
            self.completed_queries = 0
            try:
                count = self.runtime.config.workload.get("managed_clients", {}).get(profile)
                if type(count) is not int or not 1 <= count <= 16:
                    raise ValueError("Configure 1 to 16 managed clients for this profile")
                for index in range(count):
                    conn = get_connection()
                    self.connections.append(conn)
                    conn.autocommit = True
                    with conn.cursor() as cur:
                        cur.execute("SELECT to_regclass('public.pgbench_accounts')")
                        if cur.fetchone()[0] is None:
                            raise ValueError(
                                "Initialize pgbench_accounts in the dedicated demo database first"
                            )
                        if self.max_aid is None:
                            cur.execute("SELECT max(aid) FROM pgbench_accounts")
                            self.max_aid = cur.fetchone()[0]
                            if not self.max_aid:
                                raise ValueError("pgbench_accounts is empty; initialize it first")
                        cur.execute(
                            "SELECT set_config('application_name', %s, false)",
                            (f"optidbx-owned-{index}",),
                        )
                        if initial_parallelism is not None:
                            cur.execute(
                                "SELECT set_config('max_parallel_workers_per_gather', %s, false)",
                                (str(initial_parallelism),),
                            )
                        if initial_work_mem_mb is not None:
                            cur.execute(
                                "SELECT set_config('work_mem', %s, false)",
                                (f"{initial_work_mem_mb}MB",),
                            )
                            cur.execute(
                                "SELECT pg_size_bytes(current_setting('work_mem')) "
                                "= pg_size_bytes(%s)",
                                (f"{initial_work_mem_mb}MB",),
                            )
                            if not cur.fetchone()[0]:
                                raise ValueError("Initial work_mem verification failed")
                self.experiment_id = start_experiment(
                    profile,
                    f"Managed {workload_type.lower()} workload ({count} owned sessions)",
                )
                sessions = [
                    BoundWorkloadSession(
                        conn,
                        self.runtime.config.safe_values.max_parallel_workers_per_gather,
                        workload_id=f"experiment-{self.experiment_id}-{index}",
                    )
                    for index, conn in enumerate(self.connections)
                ]
                self.group = BoundWorkloadGroup(
                    sessions, workload_id=f"experiment-{self.experiment_id}"
                )
                if initial_parallelism is not None and self.group.read() != initial_parallelism:
                    raise ValueError("Initial workload setting verification failed")
                self.runtime.bind_workload(self.group, self.experiment_id)
                self.stop_event.clear()
                self.running = True
                self.started_at = datetime.now(UTC).isoformat()
                self.measurements = QueryMeasurements(
                    time.monotonic() + warmup_seconds, duration_seconds - warmup_seconds
                )
                self.workers = [
                    threading.Thread(
                        target=self._worker,
                        args=(index,),
                        daemon=True,
                        name=f"OwnedWorkload-{index}",
                    )
                    for index in range(count)
                ]
                for worker in self.workers:
                    worker.start()
                self.runtime.start()
                threading.Thread(
                    target=self._deadline,
                    args=(self.experiment_id, self.stop_event, self.duration, owner),
                    daemon=True,
                    name="WorkloadDeadline",
                ).start()
            except Exception:
                for conn in self.connections:
                    conn.close()
                self.connections = []
                if self.experiment_id is not None:
                    end_experiment(self.experiment_id, "FAILED")
                raise
            return self.status()

    def _worker(self, index):
        rng = random.Random(f"{self.experiment_id}-{index}")
        try:
            while not self.stop_event.is_set():
                query = queries.next_query(self.workload_type, self.max_aid, rng)
                started = time.monotonic()
                try:
                    self.group.execute(index, query)
                except Exception as exc:
                    self.measurements.record(
                        started,
                        time.monotonic(),
                        error=True,
                        timeout=getattr(exc, "pgcode", None) == "57014",
                    )
                    raise
                self.measurements.record(started, time.monotonic())
                with self._counter_lock:
                    self.completed_queries += 1
        except Exception as exc:
            self.error = f"Workload query failed: {type(exc).__name__}"
            logger.warning(self.error)
            self.stop_event.set()

    def _deadline(self, experiment_id, event, duration, owner=None):
        event.wait(duration)
        self.stop(expected_experiment=experiment_id, owner=owner)

    def stop(self, expected_experiment=None, *, owner=None):
        from db_monitor.storage import end_experiment

        with self.lock:
            if self.reservation is not None and self.reservation != owner:
                raise ValueError("A benchmark owns the workload; cancel it before manual control")
            if expected_experiment is not None and self.experiment_id != expected_experiment:
                return self.status()
            if not self.connections:
                return self.status()
            self.stop_event.set()
            self.runtime.stop()
            for worker in self.workers:
                if worker is not threading.current_thread():
                    worker.join(timeout=5)
            if any(worker.is_alive() for worker in self.workers):
                self.error = "Workload did not stop; sessions retained for recovery"
                return self.status()
            status = self.runtime.lifecycle.status()
            record = status["active_action"]
            if record and (record.get("outcome") == "KEEP" or status["recovery_required"]):
                try:
                    self.runtime.rollback(record["action"]["action_id"])
                    self.runtime.lifecycle.wait_idle()
                except (ValueError, TimeoutError) as exc:
                    self.error = f"Restore could not complete; sessions retained: {exc}"
                    return self.status()
            if self.runtime.lifecycle.status()["recovery_required"]:
                self.error = (
                    "Rollback unresolved; original sessions retained. Retry rollback then stop."
                )
                return self.status()
            self.runtime.flush_telemetry()
            for conn in self.connections:
                conn.close()
            self.connections = []
            self.running = False
            self.runtime.mode = "recommendation"
            try:
                end_experiment(self.experiment_id, "FAILED" if self.error else "COMPLETED")
            except Exception as exc:
                self.error = f"Experiment completion could not be persisted: {type(exc).__name__}"
            return self.status()
