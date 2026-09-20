"""Browser-readable control conflicts and comparison ownership contracts."""

from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient


@pytest.mark.parametrize("origin", ["http://localhost:3000", "http://127.0.0.1:3000"])
@pytest.mark.parametrize("path", ["/workload/start", "/workload/stop", "/tuner/mode"])
def test_comparison_conflict_is_readable_by_trusted_browser(monkeypatch, origin, path):
    from backend.main import app

    monkeypatch.setattr(
        "backend.services.workload_service.service_for_runtime",
        lambda runtime: SimpleNamespace(manager=SimpleNamespace(reservation="active-study")),
    )
    response = TestClient(app).post(path, headers={"Origin": origin}, json={})
    assert response.status_code == 409
    assert "Cancel the comparison" in response.json()["detail"]
    assert response.headers.get("access-control-allow-origin") == origin


def test_workload_status_exposes_comparison_ownership_between_runs():
    from backend.services.workload_service import WorkloadService

    runtime = SimpleNamespace(
        lifecycle=SimpleNamespace(status=lambda: {"recovery_required": False})
    )
    service = WorkloadService(runtime)
    service.manager.reservation = "active-study"
    assert service.get_status().model_dump()["benchmark_id"] == "active-study"
    assert not service.get_status().running
    service.manager.reservation = None
    assert service.get_status().model_dump()["benchmark_id"] is None


def test_untrusted_origin_still_cannot_mutate():
    from backend.main import app

    response = TestClient(app).post(
        "/tuner/mode", headers={"Origin": "https://untrusted.invalid"}, json={"mode": "auto"}
    )
    assert response.status_code == 403
    assert "access-control-allow-origin" not in response.headers
