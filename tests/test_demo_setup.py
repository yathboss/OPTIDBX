from types import SimpleNamespace

from fastapi.testclient import TestClient

from backend.main import app
from backend.services.live_runtime import get_runtime
from config.config_loader import load_config


def test_demo_setup_uses_shared_config_without_credentials():
    config = load_config()
    app.dependency_overrides[get_runtime] = lambda: SimpleNamespace(config=config)
    try:
        response = TestClient(app).get('/demo/setup')
        assert response.status_code == 200
        data = response.json()
        assert data['profiles']['MEDIUM'] == config.workload['managed_clients']['MEDIUM']
        assert data['observation_seconds'] == config.tuning.observation_window_seconds
        assert data['approved_values'] == list(config.safe_values.max_parallel_workers_per_gather)
        assert data['os']['automatic'] is False
        assert 'database' not in data
        assert 'password' not in response.text.lower()
    finally:
        app.dependency_overrides.clear()
