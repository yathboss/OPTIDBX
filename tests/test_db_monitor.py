#!/usr/bin/env python3
"""
OptiDBX Phase-1 Integration Test
Verifies end-to-end flow:
1. Verifies DB connection & health
2. Starts an experiment session
3. Launches standard workload
4. Collects DB metrics every 5 seconds
5. Persists metrics into db_metrics table
6. Verifies rows exist in db_metrics
7. Closes experiment run cleanly
"""

import os
import sys
import time
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from db_monitor.health import check_db_health
from db_monitor.collector import DBMetricsCollector
from db_monitor.storage import (
    start_experiment,
    end_experiment,
    get_recent_db_metrics,
)
from workload.run_workload import run_workload, find_pgbench


def run_integration_test(sample_count: int = 3, interval_sec: int = 5):
    print("==================================================")
    print("   OptiDBX Phase-1 DB Monitor Integration Test")
    print("==================================================")

    # 1. Health check
    print("\n[Step 1/5] Checking Database Health...")
    if not check_db_health():
        print("[Error] Database health check failed. Aborting test.")
        return False

    # 2. Start Experiment Run
    print("\n[Step 2/5] Starting Experiment Session...")
    exp_id = start_experiment(
        workload_type="LOW",
        notes="Automated Phase-1 telemetry verification test",
    )
    print(f"Experiment ID: {exp_id}")

    # 3. Launch Standard Workload
    print("\n[Step 3/5] Starting Standard Workload (LOW profile)...")
    workload_proc = None
    try:
        workload_proc = run_workload(
            profile_name="LOW",
            duration_sec=30,
            async_mode=True,
        )
        print("Workload running in background.")
    except Exception as w_err:
        print(f"[Warning] Could not start pgbench directly: {w_err}")
        print("Proceeding with baseline database activity...")

    # 4. Collect & Store DB Telemetry Samples
    print(f"\n[Step 4/5] Collecting {sample_count} DB metric samples every {interval_sec} seconds...")
    collector = DBMetricsCollector()
    collected_samples = []

    def handle_sample(sample):
        collected_samples.append(sample)
        idx = len(collected_samples)
        print(f"\nDB Metric Sample {idx}")
        print(f"Latency: {sample['query_latency_ms']} ms")
        print(f"Throughput: {sample['throughput_tps']} TPS")
        print(f"Temp Files: {sample['temp_files_bytes']} bytes")
        print(f"Active Workers: {sample['active_workers']}")

    collector.start_monitoring(
        interval_seconds=interval_sec,
        max_samples=sample_count,
        experiment_id=exp_id,
        save_to_db=True,
        on_sample=handle_sample,
    )

    # Clean up workload if still running
    if workload_proc and workload_proc.poll() is None:
        try:
            workload_proc.terminate()
        except Exception:
            pass

    # 5. Verify Rows in db_metrics
    print("\n[Step 5/5] Verifying telemetry rows in db_metrics table...")
    stored_rows = get_recent_db_metrics(experiment_id=exp_id, limit=sample_count)
    print(f"Retrieved {len(stored_rows)} rows for Experiment #{exp_id}.")

    for r in stored_rows:
        print(
            f"  - Record #{r['id']} | TS: {r['timestamp']} | "
            f"TPS: {r['throughput_tps']} | Lat: {r['query_latency_ms']}ms | "
            f"Temp: {r['temp_files_bytes']}B | Workers: {r['active_workers']}"
        )

    # Conclude experiment
    end_experiment(exp_id, status="COMPLETED", notes=f"Test completed with {len(stored_rows)} samples.")

    print("\n==================================================")
    if len(stored_rows) >= sample_count:
        print(f"[SUCCESS] Saved {len(stored_rows)} DB metric samples successfully.")
        print("OptiDBX Phase-1 criteria fulfilled!")
        print("==================================================")
        return True
    else:
        print(f"[FAILURE] Expected {sample_count} samples, found {len(stored_rows)}.")
        print("==================================================")
        return False


if __name__ == "__main__":
    success = run_integration_test(sample_count=3, interval_sec=5)
    sys.exit(0 if success else 1)

