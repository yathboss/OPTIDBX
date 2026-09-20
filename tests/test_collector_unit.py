"""
OptiDBX DBMS Collector Unit Tests
Validates schema compliance, workload profiles, and configuration without requiring active PostgreSQL.
"""

import unittest
from pathlib import Path
import yaml

from workload.profiles import get_profile, DEFAULT_PROFILES
from db_monitor.collector import load_config_interval


class TestDBMSFoundation(unittest.TestCase):
    def test_workload_profiles_exist(self):
        """Ensure standard profiles LOW, MEDIUM, HIGH are defined."""
        self.assertIn("LOW", DEFAULT_PROFILES)
        self.assertIn("MEDIUM", DEFAULT_PROFILES)
        self.assertIn("HIGH", DEFAULT_PROFILES)

        low = get_profile("LOW")
        self.assertIn("clients", low)
        self.assertIn("threads", low)
        self.assertIn("duration_seconds", low)
        self.assertGreater(low["clients"], 0)

        high = get_profile("HIGH")
        self.assertGreater(high["clients"], low["clients"])

    def test_config_yaml_loading(self):
        """Verify config/config.yaml is valid YAML and defines expected intervals."""
        config_path = Path(__file__).resolve().parent.parent / "config" / "config.yaml"
        self.assertTrue(config_path.exists(), "config.yaml must exist")

        with open(config_path, "r", encoding="utf-8") as f:
            cfg = yaml.safe_load(f)

        self.assertIn("system", cfg)
        self.assertEqual(cfg["system"]["metric_interval_seconds"], 5)
        self.assertEqual(cfg["system"]["observation_window_seconds"], 30)

        interval = load_config_interval(default=10)
        self.assertEqual(interval, 5)

    def test_schema_sql_contains_required_tables(self):
        """Verify database/schema.sql contains the 4 Phase-1 tables."""
        schema_path = Path(__file__).resolve().parent.parent / "database" / "schema.sql"
        self.assertTrue(schema_path.exists(), "database/schema.sql must exist")

        with open(schema_path, "r", encoding="utf-8") as f:
            content = f.read().lower()

        self.assertIn("create table if not exists experiment_runs", content)
        self.assertIn("create table if not exists db_metrics", content)
        self.assertIn("create table if not exists system_metrics", content)
        self.assertIn("create table if not exists tuning_actions", content)

        # Check required fields
        self.assertIn("query_latency_ms", content)
        self.assertIn("throughput_tps", content)
        self.assertIn("temp_files_bytes", content)
        self.assertIn("active_workers", content)


if __name__ == "__main__":
    unittest.main()

