"""
OptiDBX Continuous OS Telemetry Collector
Developer 3: Aryaman Singh (OS & Telemetry Engineer)

Periodically samples system CPU, virtual memory, interval disk I/O deltas,
and interval context-switch deltas. Normalizes output into autotuner.models.OSMetrics,
attaches active experiment_id, and persists to PostgreSQL system_metrics.
"""

import os
import sys
import time
import logging
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Dict, Any

# Ensure project root is in sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import yaml
from autotuner.models import OSMetrics
from os_monitor.cpu import init_cpu, get_cpu_percent
from os_monitor.memory import get_memory_percent
from os_monitor.disk import DiskTracker
from os_monitor.context_switch import ContextSwitchTracker
from os_monitor.storage import save_system_metrics, get_latest_os_metrics

logger = logging.getLogger("optidbx.os_monitor")


def load_monitoring_interval(default: float = 5.0) -> float:
    """
    Load monitoring interval from config/config.yaml.
    Checks monitoring.interval_seconds, then system.metric_interval_seconds.
    """
    config_path = PROJECT_ROOT / "config" / "config.yaml"
    if config_path.exists():
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                data = yaml.safe_load(f)
                if isinstance(data, dict):
                    # Autotuner schema
                    if "monitoring" in data and "interval_seconds" in data["monitoring"]:
                        return float(data["monitoring"]["interval_seconds"])
                    # DB monitor schema
                    if "system" in data and "metric_interval_seconds" in data["system"]:
                        return float(data["system"]["metric_interval_seconds"])
        except Exception as exc:
            logger.warning(f"Could not load interval from {config_path}: {exc}. Using default {default}s.")
    return float(default)


class OSMetricsCollector:
    """
    Autonomous collector for OS telemetry.
    Computes interval-based deltas for disk and context switches.
    """

    def __init__(self, interval_seconds: Optional[float] = None):
        self.interval_seconds = (
            interval_seconds if interval_seconds is not None else load_monitoring_interval()
        )
        self.active_experiment_id: Optional[int] = None
        self._disk_tracker = DiskTracker()
        self._cs_tracker = ContextSwitchTracker()
        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._lock = threading.Lock()
        self._last_sample: Optional[OSMetrics] = None

        # Warm up baselines
        self.warm_up()

    def warm_up(self) -> None:
        """
        Prime CPU, disk, and context switch baselines.
        Ensures the first collected interval represents real interval deltas.
        """
        init_cpu()
        self._disk_tracker.reset()
        self._cs_tracker.reset()
        # Take baseline readings for cumulative counters
        self._disk_tracker.get_io_deltas()
        self._cs_tracker.get_context_switches_delta()
        logger.debug("OS collector baselines primed.")

    def set_active_experiment(self, experiment_id: Optional[int]) -> None:
        """Attach or clear active experiment ID."""
        with self._lock:
            self.active_experiment_id = experiment_id
            if experiment_id is not None:
                logger.info(f"Attached active experiment #{experiment_id} to OS telemetry.")
            else:
                logger.info("Cleared active experiment from OS telemetry.")

    def collect_sample(self) -> OSMetrics:
        """
        Collect a single normalized OSMetrics snapshot.

        Returns:
            OSMetrics: Contract-compliant Pydantic model with UTC timestamp,
                       cpu_percent, memory_percent, interval disk deltas,
                       and interval context switch delta.
        """
        now = datetime.now(timezone.utc)

        # Collect metrics safely
        cpu = get_cpu_percent()
        mem = get_memory_percent()
        read_bytes, write_bytes = self._disk_tracker.get_io_deltas()
        cs_delta = self._cs_tracker.get_context_switches_delta()
        if not self._disk_tracker.interval_valid or not self._cs_tracker.interval_valid:
            raise RuntimeError("OS counter interval unavailable or reset; baseline refreshed")

        sample = OSMetrics(
            timestamp=now,
            cpu_percent=cpu,
            memory_percent=mem,
            disk_read_bytes=read_bytes,
            disk_write_bytes=write_bytes,
            context_switches=cs_delta,
        )

        with self._lock:
            self._last_sample = sample

        return sample

    def run_once(self) -> OSMetrics:
        """Collect one sample, persist to database, and log."""
        sample = self.collect_sample()
        with self._lock:
            exp_id = self.active_experiment_id

        # Human-readable disk formatting for log
        read_mb = round(sample.disk_read_bytes / (1024 * 1024), 2)
        write_mb = round(sample.disk_write_bytes / (1024 * 1024), 2)

        # Format matching Prompt 20
        logger.info(
            f"{sample.timestamp.isoformat()} OS sample: "
            f"CPU={sample.cpu_percent}% "
            f"MEM={sample.memory_percent}% "
            f"READ={read_mb}MB "
            f"WRITE={write_mb}MB "
            f"CTX={sample.context_switches} "
            f"experiment_id={exp_id}"
        )

        # Persist to database
        row_id = save_system_metrics(sample, experiment_id=exp_id)
        if row_id is not None:
            logger.debug(f"Successfully stored OS metrics row #{row_id}.")
        else:
            logger.debug("OS metrics stored in buffer (DB offline).")

        return sample

    def _collection_loop(self) -> None:
        """Main continuous collection loop."""
        logger.info(
            f"OS Collector started with {self.interval_seconds}s interval "
            f"(Active experiment: {self.active_experiment_id})."
        )
        # CPU baselines are per-thread: prime here and wait one whole interval.
        self.warm_up()
        first_deadline = time.monotonic() + self.interval_seconds
        while self._running and time.monotonic() < first_deadline:
            time.sleep(min(0.1, max(0, first_deadline - time.monotonic())))
        while self._running:
            start_time = time.monotonic()
            try:
                self.run_once()
            except Exception as exc:
                logger.error(f"Error during OS sample collection: {exc}", exc_info=True)

            elapsed = time.monotonic() - start_time
            sleep_time = max(0.0, self.interval_seconds - elapsed)

            # Sleep in small increments to allow fast shutdown
            sleep_steps = int(sleep_time / 0.1)
            for _ in range(sleep_steps):
                if not self._running:
                    break
                time.sleep(0.1)
            remainder = sleep_time - (sleep_steps * 0.1)
            if self._running and remainder > 0:
                time.sleep(remainder)

        logger.info("OS Collector stopped.")

    def start(self) -> None:
        """Start collector in a background daemon thread."""
        if self._running:
            logger.warning("OS Collector is already running.")
            return

        self._running = True
        self._thread = threading.Thread(target=self._collection_loop, daemon=True, name="OSMetricsCollector")
        self._thread.start()

    def stop(self) -> None:
        """Stop background collector gracefully."""
        if not self._running:
            return
        self._running = False
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=self.interval_seconds + 1.0)
            self._thread = None


_global_collector: Optional[OSMetricsCollector] = None


def get_global_collector() -> OSMetricsCollector:
    """Singleton instance of OSMetricsCollector."""
    global _global_collector
    if _global_collector is None:
        _global_collector = OSMetricsCollector()
    return _global_collector


def set_active_experiment(experiment_id: Optional[int]) -> None:
    """Convenience module function to set active experiment."""
    get_global_collector().set_active_experiment(experiment_id)


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )
    print("Starting OptiDBX OS Metrics Collector (Ctrl+C to stop)...")
    collector = get_global_collector()
    try:
        collector.start()
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nStopping OS Collector...")
        collector.stop()
        print("Collector stopped.")
