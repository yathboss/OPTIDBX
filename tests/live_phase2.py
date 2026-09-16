"""Opt-in real PostgreSQL/OS integration run, using the existing workload runner.

Run on the database host: python -m tests.live_phase2 --scenario normal|parallel.
Requires existing pgbench tables, pg_stat_statements, and database/schema.sql.
No PostgreSQL parameter is changed. Normal uses standard LOW; parallel uses the
existing runner's MEDIUM profile with a read-only analytical SQL fixture.
"""

import argparse
import json
import subprocess
import time
from pathlib import Path

from autotuner.runtime import AutotunerRuntime
from config.config_loader import load_config
from db_monitor.collector import DBMetricsCollector
from db_monitor.storage import end_experiment, get_connection, save_recommendation, start_experiment
from workload.run_workload import run_workload


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--scenario", choices=["normal", "parallel"], required=True)
    parser.add_argument("--config")
    parser.add_argument("--expect", choices=["NONE", "CPU_PARALLELISM"])
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    config = load_config(args.config)
    before = DBMetricsCollector().get_current_parallelism()
    if before is None:
        raise RuntimeError("Cannot read PostgreSQL parallelism; check connection environment")
    experiment = start_experiment(f"PHASE2_{args.scenario.upper()}")
    runtime = AutotunerRuntime(
        config, recommendation_store=save_recommendation, experiment_id=experiment
    )
    script = Path(__file__).resolve().parents[1] / "experiments" / "phase2_analytical.sql"
    proc = None
    results = []
    succeeded = False
    try:
        duration = max(35, int(config.monitoring.interval_seconds * 8))
        proc = run_workload(
            "LOW" if args.scenario == "normal" else "MEDIUM",
            duration_sec=duration,
            async_mode=True,
            script_path=None if args.scenario == "normal" else str(script),
        )
        deadline = time.monotonic() + duration
        runtime.prime()
        while len(results) < 5 and time.monotonic() < deadline:
            time.sleep(config.monitoring.interval_seconds)
            if proc.poll() is not None:
                raise RuntimeError("pgbench exited before the monitoring run completed")
            result = runtime.tick()
            status = runtime.get_status().model_dump(mode="json")
            print(json.dumps(status), flush=True)
            if result is not None:
                pair = runtime.get_history(1)[0]
                results.append({"status": status, "telemetry": pair.model_dump(mode="json")})
        after = DBMetricsCollector().get_current_parallelism()
        # Exercise the actual FastAPI adapter with this live runtime, without
        # starting a second collector or fabricating any metric values.
        from fastapi.testclient import TestClient

        from backend.main import app
        from backend.services.live_runtime import get_runtime

        app.dependency_overrides[get_runtime] = lambda: runtime
        try:
            client = TestClient(app)
            response = client.get("/tuner/live-status")
            assert response.status_code == 200
            assert response.json()["timestamp"] == results[-1]["status"]["timestamp"]
            assert client.get("/metrics/current").status_code == 200
        finally:
            app.dependency_overrides.clear()
        conn = get_connection()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT status, old_value, new_value FROM tuning_actions "
                    "WHERE experiment_id = %s ORDER BY id",
                    (experiment,),
                )
                saved_actions = cur.fetchall()
        finally:
            conn.close()
        assert all(row[0] == "RECOMMENDED" for row in saved_actions)
        payload = {
            "scenario": args.scenario,
            "experiment_id": experiment,
            "thresholds": config.thresholds.model_dump(),
            "parallelism_before": before,
            "parallelism_after": after,
            "samples": results,
            "saved_actions": saved_actions,
            "api_verified": True,
        }
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
        assert len(results) >= 3, "fewer than three valid real intervals"
        assert before == after, "PostgreSQL setting changed during the run"
        if args.expect == "NONE":
            assert all(r["status"]["detected_bottleneck"] == "NONE" for r in results)
        elif args.expect == "CPU_PARALLELISM":
            confirmed = [r for r in results if r["status"]["detected_bottleneck"] == args.expect]
            assert confirmed, "real workload did not sustain all configured thresholds"
            assert (
                confirmed[0]["status"]["consecutive_bad_readings"]
                >= config.monitoring.consecutive_bad_readings
            )
            assert confirmed[0]["status"]["recommended_action"]["new_value"] < before
            assert confirmed[0]["status"]["persistence_status"] == "SAVED"
            assert saved_actions, "recommendation was not found in PostgreSQL"
        succeeded = True
    finally:
        runtime.stop()
        if proc is not None:
            # Let the bounded workload finish normally; no leaked client processes.
            try:
                stdout, stderr = proc.communicate(timeout=45)
            except subprocess.TimeoutExpired:
                proc.terminate()
                stdout, stderr = proc.communicate(timeout=5)
            if proc.returncode != 0:
                succeeded = False
                print(stderr)
        end_experiment(experiment, status="COMPLETED" if succeeded else "FAILED")
    if not succeeded:
        raise RuntimeError("live integration failed")


if __name__ == "__main__":
    main()
