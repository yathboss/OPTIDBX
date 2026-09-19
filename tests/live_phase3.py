"""Opt-in real platform validation on a disposable process / dedicated DB session.

No KEEP/performance claim. Run with --os-only as root to test reversible nice
changes, or without that flag as the PostgreSQL peer-authenticated user.
"""

import argparse
import json
import os
import subprocess
import sys
import threading
import time
from pathlib import Path

import psutil

from actions.guard import ActionGate
from actions.os_actions.process import ProcessActions
from config.config_loader import load_config
from os_monitor.collector import OSMetricsCollector


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--os-only", action="store_true")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    cfg = load_config()
    evidence = {
        "platform": sys.platform,
        "uid": os.getuid(),
        "claim": "Verified mechanics only; no performance improvement claim",
    }
    if not args.os_only:
        from actions.db_actions.parallelism import BoundWorkloadSession
        from db_monitor.storage import get_connection

        conn = get_connection()
        conn.autocommit = True
        adapter = BoundWorkloadSession(
            conn,
            cfg.safe_values.max_parallel_workers_per_gather,
            workload_id="phase3-disposable-validation",
        )
        old = adapter.read()
        new = cfg.safe_values.max_parallel_workers_per_gather[
            cfg.safe_values.max_parallel_workers_per_gather.index(old) - 1
        ]
        if old <= new:
            raise RuntimeError("No safe lower value for this live session")
        try:
            adapter.apply(old, new)
            observed = int(
                adapter.execute_workload(
                    "SELECT current_setting('max_parallel_workers_per_gather')"
                )[0][0]
            )
            assert observed == new
        finally:
            adapter.restore(old, new)
        restored = adapter.read()
        assert restored == old
        evidence["postgresql"] = {
            "old": old,
            "applied": observed,
            "restored": restored,
            "scope": adapter.capabilities(),
        }
        conn.close()
    else:
        child = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(30)"])
        samples, errors = [], []
        ready, stop = threading.Event(), threading.Event()
        process = psutil.Process(child.pid)
        created, cpus = process.create_time(), process.cpu_affinity()
        policy = cfg.os_actions.model_copy(
            update={"allowed_pids": (child.pid,), "allowed_cpu_ids": tuple(cpus)}
        )
        actions = ProcessActions(policy, gate=ActionGate())

        def sample_loop():
            try:
                collector = OSMetricsCollector(cfg.monitoring.interval_seconds)
                collector.warm_up()
                ready.set()
                while not stop.wait(cfg.monitoring.interval_seconds):
                    samples.append(collector.collect_sample().model_dump(mode="json"))
            except Exception as exc:
                errors.append(str(exc))

        thread = threading.Thread(target=sample_loop)
        thread.start()
        ready.wait(5)
        try:
            affinity = actions.apply(child.pid, created, "affinity", [cpus[0]])
            assert affinity["status"] == "APPLIED", affinity
            time.sleep(6)
            affinity_restored = actions.restore(affinity["action_id"])
            assert affinity_restored["status"] == "RESTORED", affinity_restored
            nice = actions.apply(child.pid, created, "nice", 5)
            assert nice["status"] == "APPLIED", nice
            time.sleep(5)
            nice_restored = actions.restore(nice["action_id"])
            assert nice_restored["status"] == "RESTORED", nice_restored
            assert process.cpu_affinity() == cpus
            assert process.nice() == nice["old_value"]
            assert len(samples) >= 2 and not errors
            evidence["os"] = {
                "affinity": affinity,
                "restore_affinity": affinity_restored,
                "nice": nice,
                "restore_nice": nice_restored,
                "telemetry_during_actions": samples,
                "capabilities": actions.capabilities(),
            }
        finally:
            stop.set()
            thread.join(5)
            child.terminate()
            child.wait(5)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(evidence, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(evidence))


if __name__ == "__main__":
    main()
