"""Opt-in LOW/MEDIUM/HIGH OS sampling and persistence with the existing pgbench runner."""

import argparse
import json
import time
from pathlib import Path

from config.config_loader import load_config
from db_monitor.storage import end_experiment, start_experiment
from os_monitor.collector import OSMetricsCollector
from os_monitor.storage import get_os_metrics_history
from workload.run_workload import run_workload


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    cfg = load_config()
    results = []
    for profile in ("LOW", "MEDIUM", "HIGH"):
        experiment_id = start_experiment(f"OS_PHASE2_{profile}")
        proc = None
        success = False
        try:
            proc = run_workload(profile, duration_sec=20, async_mode=True)
            collector = OSMetricsCollector(cfg.monitoring.interval_seconds)
            collector.set_active_experiment(experiment_id)
            collector.warm_up()
            samples = []
            for _ in range(3):
                time.sleep(cfg.monitoring.interval_seconds)
                assert proc.poll() is None, "Workload ended early"
                samples.append(collector.run_once().model_dump(mode="json"))
            history = get_os_metrics_history(experiment_id, 10)
            assert len(history) == 3
            assert all(row.get("id") is not None for row in history), "Samples only buffered"
            results.append(
                {
                    "profile": profile,
                    "experiment_id": experiment_id,
                    "samples": samples,
                    "persisted_rows": len(history),
                }
            )
            success = True
        finally:
            if proc is not None:
                try:
                    _, stderr = proc.communicate(timeout=30)
                except Exception:
                    proc.terminate()
                    proc.communicate(timeout=5)
                    success = False
                    raise
                if proc.returncode != 0:
                    success = False
                    print(stderr)
            end_experiment(experiment_id, "COMPLETED" if success else "FAILED")
        if not success:
            raise RuntimeError(f"{profile} validation failed")
        print(f"{profile}: three real OS samples persisted", flush=True)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(results, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
