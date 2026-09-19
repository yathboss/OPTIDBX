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


@pytest.fixture
def benchmark(tmp_path, monkeypatch):
    import threading
    from types import SimpleNamespace
    from unittest.mock import MagicMock, Mock
    from config.config_loader import load_config
    from experiments.benchmark import BenchmarkService
    from experiments.evidence import EvidenceStore
    runtime = SimpleNamespace(config=load_config(), _lock=threading.RLock(),
        lifecycle=SimpleNamespace(status=lambda: {'state':'MONITORING', 'recovery_required':False}),
        engine=Mock(), _history=[], set_mode=Mock(), get_action_history=lambda: [])
    manager = SimpleNamespace(lock=threading.RLock(), runtime=runtime, running=False,
        connections=[], reservation=None, error=None, experiment_id=0)
    starts = []
    def start(profile, duration, **kwargs):
        starts.append((profile, duration, kwargs))
        manager.running = True
        manager.experiment_id += 1
        manager.measurements = SimpleNamespace(end=0, summary=lambda now: rows()[0]['metrics'])
    manager.start = start
    manager.stop = Mock(side_effect=lambda **kwargs: setattr(manager, 'running', False))
    manager.status = lambda: {'measurements': {}}
    conn = MagicMock()
    conn.cursor.return_value.__enter__.return_value.fetchone.return_value = ('PG test', 'test_db', 100)
    monkeypatch.setattr('db_monitor.storage.get_connection', lambda: conn)
    service = BenchmarkService(manager, EvidenceStore(tmp_path))
    monkeypatch.setattr(service, '_wait', lambda *args: None)
    return service, manager, starts


def test_runner_freezes_settings_and_records_every_pair(benchmark):
    service, manager, starts = benchmark
    service.start({'repetitions': 2})
    service.thread.join(5)
    result = service.status()
    assert result['status'] == 'COMPLETED'
    assert len(result['runs']) == 4
    assert len(starts) == 4
    assert all(s[2]['initial_parallelism'] == 2 for s in starts)
    assert manager.reservation is None
    assert service.store.get(result['id'])['runs'] == result['runs']


def test_storage_failure_never_starts_workload_or_shows_running(benchmark, monkeypatch):
    from unittest.mock import Mock
    service, manager, starts = benchmark
    monkeypatch.setattr(service.store, 'save', Mock(side_effect=OSError('disk full')))
    with pytest.raises(OSError):
        service.start({})
    assert not starts
    assert manager.reservation is None
    assert service.status()['status'] == 'FAILED'


def test_cancel_preserves_partial_run_and_releases_control(benchmark, monkeypatch):
    service, manager, starts = benchmark
    def cancel_wait(*args):
        service.cancel()
        raise InterruptedError('cancelled')
    monkeypatch.setattr(service, '_wait', cancel_wait)
    service.start({})
    service.thread.join(5)
    record = service.status()
    assert record['status'] == 'CANCELLED'
    assert record['runs'][0]['status'] == 'CANCELLED'
    assert manager.reservation is None
    assert not manager.running


def test_restart_marks_unfinished_evidence_interrupted(benchmark):
    from experiments.benchmark import BenchmarkService
    service, manager, starts = benchmark
    service.store.save({'id':'old', 'status':'RUNNING', 'runs':[]})
    BenchmarkService(manager, service.store)
    assert service.store.get('old')['status'] == 'INTERRUPTED'
