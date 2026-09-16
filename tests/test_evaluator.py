"""Unit tests for Performance Evaluator."""
import unittest
from experiments.evaluator import evaluate_tuning_action, PerformanceEvaluator
from experiments.metrics import ResultStatus, WorkloadMetrics


class TestPerformanceEvaluator(unittest.TestCase):
    def setUp(self):
        self.evaluator = PerformanceEvaluator(
            latency_threshold_pct=5.0,
            throughput_threshold_pct=5.0,
        )

    def test_latency_improvement(self):
        # Latency drops from 250 to 180 (-28%), throughput goes up from 500 to 620 (+24%)
        res = evaluate_tuning_action(
            before_latency=250.0,
            after_latency=180.0,
            before_throughput=500.0,
            after_throughput=620.0,
            before_cpu=85.0,
            after_cpu=70.0,
        )
        self.assertEqual(res.overall_result, ResultStatus.IMPROVED)
        self.assertLess(res.latency_change_percent, -20.0)
        self.assertGreater(res.throughput_change_percent, 20.0)

    def test_throughput_improvement_only(self):
        # Throughput increases by 20% while latency stays virtually flat (+1%)
        res = evaluate_tuning_action(
            before_latency=100.0,
            after_latency=101.0,
            before_throughput=500.0,
            after_throughput=600.0,
            before_cpu=70.0,
            after_cpu=72.0,
        )
        self.assertEqual(res.overall_result, ResultStatus.IMPROVED)

    def test_performance_degradation(self):
        # Latency spikes from 100 to 150 (+50%), throughput drops from 500 to 350 (-30%)
        res = evaluate_tuning_action(
            before_latency=100.0,
            after_latency=150.0,
            before_throughput=500.0,
            after_throughput=350.0,
            before_cpu=70.0,
            after_cpu=95.0,
        )
        self.assertEqual(res.overall_result, ResultStatus.DEGRADED)
        self.assertGreater(res.latency_change_percent, 40.0)
        self.assertLess(res.throughput_change_percent, -25.0)

    def test_inconclusive_result(self):
        # Minor fluctuations (<5%) within noise range
        res = evaluate_tuning_action(
            before_latency=100.0,
            after_latency=102.0,
            before_throughput=500.0,
            after_throughput=495.0,
            before_cpu=70.0,
            after_cpu=71.0,
        )
        self.assertEqual(res.overall_result, ResultStatus.INCONCLUSIVE)


if __name__ == "__main__":
    unittest.main()

