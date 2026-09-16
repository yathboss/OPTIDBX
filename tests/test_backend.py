"""Unit tests for OptiDBX FastAPI Backend Endpoints."""
import unittest
from fastapi.testclient import TestClient
from backend.main import app


class TestOptiDBXBackend(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_health_endpoint(self):
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})

    def test_current_metrics_contract(self):
        response = self.client.get("/metrics/current")
        self.assertEqual(response.status_code, 200)
        data = response.json()

        # Check top-level contract
        self.assertIn("timestamp", data)
        self.assertIn("os", data)
        self.assertIn("db", data)

        # Check OS telemetry fields (Aryaman's contract)
        os = data["os"]
        self.assertIn("cpu_percent", os)
        self.assertIn("memory_percent", os)
        self.assertIn("disk_read_bytes", os)
        self.assertIn("disk_write_bytes", os)
        self.assertIn("context_switches", os)
        self.assertIsInstance(os["cpu_percent"], (int, float))

        # Check DB telemetry fields (Kartikeya's contract)
        db = data["db"]
        self.assertIn("query_latency_ms", db)
        self.assertIn("throughput_tps", db)
        self.assertIn("temp_files_bytes", db)
        self.assertIn("active_workers", db)
        self.assertIsInstance(db["query_latency_ms"], (int, float))

    def test_metrics_history(self):
        response = self.client.get("/metrics/history?limit=10")
        self.assertEqual(response.status_code, 200)
        items = response.json()
        self.assertIsInstance(items, list)
        self.assertEqual(len(items), 10)
        self.assertIn("os", items[0])
        self.assertIn("db", items[0])

    def test_tuner_status(self):
        response = self.client.get("/tuner/status")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("mode", data)
        self.assertIn("state", data)
        self.assertIn("detected_bottleneck", data)
        self.assertIn("reason", data)
        self.assertIn("recommended_action", data)
        self.assertIn("observation_remaining_seconds", data)
        self.assertIn("cooldown_remaining_seconds", data)

    def test_set_tuner_mode(self):
        response = self.client.post("/tuner/mode", json={"mode": "auto"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["mode"], "auto")

        # Switch back to recommendation
        response = self.client.post("/tuner/mode", json={"mode": "recommendation"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["mode"], "recommendation")

    def test_tuning_history(self):
        # Both /tuning/history and /tuner/history should work
        for path in ["/tuning/history", "/tuner/history"]:
            response = self.client.get(path)
            self.assertEqual(response.status_code, 200)
            items = response.json()
            self.assertIsInstance(items, list)
            self.assertGreater(len(items), 0)
            first = items[0]
            self.assertIn("timestamp", first)
            self.assertIn("bottleneck", first)
            self.assertIn("parameter", first)
            self.assertIn("old_value", first)
            self.assertIn("new_value", first)
            self.assertIn("status", first)
            self.assertIn("reason", first)

    def test_experiments_endpoints(self):
        response = self.client.get("/experiments")
        self.assertEqual(response.status_code, 200)
        items = response.json()
        self.assertIsInstance(items, list)
        self.assertGreater(len(items), 0)

        # Test single experiment detail
        exp_id = items[0]["id"]
        detail_res = self.client.get(f"/experiments/{exp_id}")
        self.assertEqual(detail_res.status_code, 200)
        detail = detail_res.json()
        self.assertEqual(detail["id"], exp_id)
        self.assertIn("before_metrics", detail)
        self.assertIn("overall_result", detail)


if __name__ == "__main__":
    unittest.main()

