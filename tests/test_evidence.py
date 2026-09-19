"""Controlled data tests; they do not claim measured performance improvements."""
import pytest


def test_direct_measurements_exclude_warmup_and_monitor_transactions():
    from workload.measurements import QueryMeasurements
    metrics = QueryMeasurements(start=10, duration=10)
    metrics.record(9, 10.1)
    metrics.record(11, 11.1)
    metrics.record(12, 12.3)
    metrics.record(13, 13.5, error=True, timeout=True)
    result = metrics.summary(now=20)
    assert result['successful_queries'] == 2
    assert result['throughput_qps'] == pytest.approx(.2)
    assert result['p95_latency_ms'] == pytest.approx(290)
    assert result['errors'] == result['timeouts'] == 1
    assert result['median_latency_ms'] == pytest.approx(200)


def rows(qps=120, p95=100):
    return [{'pair': i, 'mode': mode, 'metrics': {
        'throughput_qps': 100 if mode == 'baseline' else qps,
        'p95_latency_ms': 100 if mode == 'baseline' else p95,
        'median_latency_ms': 80, 'successful_queries': 1000,
        'errors': 0, 'timeouts': 0, 'overflow': False, 'elapsed_seconds': 180},
        'actions': [] if mode == 'baseline' else [{'verified_applied_value': 1}],
        'status': 'COMPLETED'} for i in range(5) for mode in ('baseline', 'adaptive')]


def test_claim_requires_repeated_complete_runs_and_actual_action():
    from experiments.evidence import evaluate
    assert evaluate([], {})['verdict'] == 'NOT_EVALUATED'
    assert evaluate(rows()[:2], {'repetitions': 5})['verdict'] == 'INCONCLUSIVE'
    data = rows()
    for row in data:
        row['actions'] = []
    assert evaluate(data, {'repetitions': 5})['verdict'] == 'INCONCLUSIVE'


def test_pilot_never_claims_proof_and_regressions_are_visible():
    from experiments.evidence import evaluate
    data = rows()
    for row in data:
        row['metrics']['elapsed_seconds'] = 30
    assert evaluate(data, {'repetitions': 5, 'warmup_seconds': 30})['verdict'] == 'INCONCLUSIVE'
    assert evaluate(rows(qps=75, p95=130), {'repetitions': 5, 'warmup_seconds': 30})['verdict'] == 'REGRESSION_OBSERVED'


def test_repeated_improvement_and_uncertainty_are_explicit():
    from experiments.evidence import evaluate
    result = evaluate(rows(), {'repetitions': 5, 'warmup_seconds': 30})
    assert result['verdict'] == 'IMPROVEMENT_SUPPORTED'
    assert result['throughput_change']['mean_percent'] == pytest.approx(20)
    assert result['throughput_change']['interval_95'] == pytest.approx([20, 20])


def test_evidence_store_is_durable_and_rejects_traversal(tmp_path):
    from experiments.evidence import EvidenceStore
    store = EvidenceStore(tmp_path)
    record = {'id': 'test-id', 'status': 'RUNNING', 'runs': []}
    store.save(record)
    assert EvidenceStore(tmp_path).get('test-id') == record
    with pytest.raises(ValueError):
        store.get('../secret')


def test_evidence_api_empty_and_validation():
    from backend.main import app
    from fastapi.testclient import TestClient
    client = TestClient(app)
    assert client.post('/benchmarks/start', json={'profile': 'INVALID'}).status_code == 422
