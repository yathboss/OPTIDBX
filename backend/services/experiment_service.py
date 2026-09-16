"""Experiment service abstraction.

Phase 1 provides mock experiment runs and evaluations.
Later, this connects to Kartikeya's PostgreSQL experiment_runs and evaluation tables.
"""
from typing import List, Optional
from datetime import datetime, timezone, timedelta
from backend.models.experiment import ExperimentItem, ExperimentDetailResponse


class ExperimentService:
    def __init__(self):
        now = datetime.now(timezone.utc)
        self._experiments = [
            ExperimentDetailResponse(
                id="exp-001",
                name="TPC-B Mixed Workload (Scale 50)",
                workload_type="mixed",
                status="completed",
                created_at=(now - timedelta(hours=2)).isoformat(),
                duration_seconds=300,
                before_metrics={
                    "query_latency_ms": 210.4,
                    "throughput_tps": 410.0,
                    "cpu_percent": 84.5,
                },
                after_metrics={
                    "query_latency_ms": 142.1,
                    "throughput_tps": 560.2,
                    "cpu_percent": 68.0,
                },
                overall_result="IMPROVED",
            ),
            ExperimentDetailResponse(
                id="exp-002",
                name="Heavy Hash-Aggregate Spill Test",
                workload_type="analytical",
                status="completed",
                created_at=(now - timedelta(hours=4)).isoformat(),
                duration_seconds=180,
                before_metrics={
                    "query_latency_ms": 450.0,
                    "throughput_tps": 120.0,
                    "cpu_percent": 75.0,
                },
                after_metrics={
                    "query_latency_ms": 210.0,
                    "throughput_tps": 230.0,
                    "cpu_percent": 62.0,
                },
                overall_result="IMPROVED",
            ),
            ExperimentDetailResponse(
                id="exp-003",
                name="High-Concurrency OLTP Spike",
                workload_type="write_heavy",
                status="running",
                created_at=(now - timedelta(minutes=15)).isoformat(),
                duration_seconds=900,
                before_metrics={
                    "query_latency_ms": 180.0,
                    "throughput_tps": 650.0,
                    "cpu_percent": 91.0,
                },
                after_metrics=None,
                overall_result=None,
            ),
        ]

    def list_experiments(self) -> List[ExperimentItem]:
        return [
            ExperimentItem(
                id=exp.id,
                name=exp.name,
                workload_type=exp.workload_type,
                status=exp.status,
                created_at=exp.created_at,
                duration_seconds=exp.duration_seconds,
            )
            for exp in self._experiments
        ]

    def get_experiment(self, exp_id: str) -> Optional[ExperimentDetailResponse]:
        for exp in self._experiments:
            if exp.id == exp_id:
                return exp
        return None


_experiment_service_instance = ExperimentService()


def get_experiment_service() -> ExperimentService:
    return _experiment_service_instance

