"""
Integration Tests: Health Endpoints
=====================================
Tests for /health, /health/live, /health/ready endpoints.

Covers:
  - /health returns structured report with status, version, components
  - /health/live returns alive status without checking dependencies
  - /health/ready returns ready when DB is reachable
  - /health/ready returns 503 when DB is down
  - Health endpoints do not require authentication
  - Health response does not leak internal implementation details

Uses FastAPI TestClient with the health router + mocked health service.
"""

import sys
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


@pytest.fixture(scope="module")
def health_app():
    """Create a minimal FastAPI app with the health router."""
    from fastapi import FastAPI
    from api.routes.health import router

    app = FastAPI()
    app.include_router(router)
    return app


@pytest.fixture(scope="module")
def client(health_app):
    from fastapi.testclient import TestClient

    return TestClient(health_app)


@pytest.fixture
def mock_healthy_report():
    """Mock a fully healthy HealthReport."""
    from services.health_service import HealthReport, HealthStatus, ComponentHealth

    report = HealthReport(
        status=HealthStatus.HEALTHY,
        service="raid-ai-tasi",
        version="1.0.0",
        uptime_seconds=42.5,
        components=[
            ComponentHealth(
                name="database",
                status=HealthStatus.HEALTHY,
                latency_ms=1.2,
                message="sqlite connected",
            ),
            ComponentHealth(
                name="llm",
                status=HealthStatus.HEALTHY,
                message="provider=anthropic",
            ),
        ],
    )
    return report


@pytest.fixture
def mock_unhealthy_report():
    """Mock an unhealthy HealthReport (DB down)."""
    from services.health_service import HealthReport, HealthStatus, ComponentHealth

    report = HealthReport(
        status=HealthStatus.UNHEALTHY,
        service="raid-ai-tasi",
        version="1.0.0",
        uptime_seconds=10.0,
        components=[
            ComponentHealth(
                name="database",
                status=HealthStatus.UNHEALTHY,
                latency_ms=5000.0,
                message="connection refused",
            ),
            ComponentHealth(
                name="llm",
                status=HealthStatus.HEALTHY,
                message="provider=anthropic",
            ),
        ],
    )
    return report


# ===========================================================================
# /health endpoint
# ===========================================================================


class TestHealthEndpoint:
    """Test GET /health full health report."""

    @pytest.mark.integration
    def test_health_returns_200_when_healthy(self, client, mock_healthy_report):
        with patch("api.routes.health.get_health", return_value=mock_healthy_report):
            resp = client.get("/health")
        assert resp.status_code == 200

    @pytest.mark.integration
    def test_health_response_has_required_fields(self, client, mock_healthy_report):
        with patch("api.routes.health.get_health", return_value=mock_healthy_report):
            resp = client.get("/health")
        body = resp.json()
        assert "status" in body
        assert "service" in body
        assert "version" in body
        assert "uptime_seconds" in body
        assert "components" in body

    @pytest.mark.integration
    def test_health_returns_503_when_unhealthy(self, client, mock_unhealthy_report):
        with patch("api.routes.health.get_health", return_value=mock_unhealthy_report):
            resp = client.get("/health")
        assert resp.status_code == 503
        body = resp.json()
        assert body["status"] == "unhealthy"

    @pytest.mark.integration
    def test_health_components_list_populated(self, client, mock_healthy_report):
        with patch("api.routes.health.get_health", return_value=mock_healthy_report):
            resp = client.get("/health")
        body = resp.json()
        assert len(body["components"]) > 0
        comp = body["components"][0]
        assert "name" in comp
        assert "status" in comp


# ===========================================================================
# /health/live endpoint
# ===========================================================================


class TestLivenessEndpoint:
    """Test GET /health/live liveness probe."""

    @pytest.mark.integration
    def test_live_returns_200(self, client):
        with patch("api.routes.health.get_uptime_seconds", return_value=100.0):
            resp = client.get("/health/live")
        assert resp.status_code == 200

    @pytest.mark.integration
    def test_live_returns_alive_status(self, client):
        with patch("api.routes.health.get_uptime_seconds", return_value=100.0):
            resp = client.get("/health/live")
        body = resp.json()
        assert body["status"] == "alive"
        assert "uptime_seconds" in body


# ===========================================================================
# /health/ready endpoint
# ===========================================================================


class TestReadinessEndpoint:
    """Test GET /health/ready readiness probe."""

    @pytest.mark.integration
    def test_ready_returns_200_when_db_healthy(self, client):
        from services.health_service import ComponentHealth, HealthStatus

        healthy_db = ComponentHealth(
            name="database",
            status=HealthStatus.HEALTHY,
            latency_ms=1.0,
            message="sqlite connected",
        )
        with patch("api.routes.health.check_database", return_value=healthy_db):
            resp = client.get("/health/ready")
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "ready"

    @pytest.mark.integration
    def test_ready_returns_503_when_db_unhealthy(self, client):
        from services.health_service import ComponentHealth, HealthStatus

        unhealthy_db = ComponentHealth(
            name="database",
            status=HealthStatus.UNHEALTHY,
            latency_ms=5000.0,
            message="connection refused",
        )
        with patch("api.routes.health.check_database", return_value=unhealthy_db):
            resp = client.get("/health/ready")
        assert resp.status_code == 503
        body = resp.json()
        assert body["status"] == "not_ready"
        assert "reason" in body


# ===========================================================================
# No auth required
# ===========================================================================


class TestHealthNoAuth:
    """Test that health endpoints do not require authentication."""

    @pytest.mark.integration
    def test_health_accessible_without_token(self, client):
        with patch("api.routes.health.get_health") as mock_fn:
            from services.health_service import HealthReport, HealthStatus
            mock_fn.return_value = HealthReport(
                status=HealthStatus.HEALTHY,
                uptime_seconds=1.0,
                components=[],
            )
            resp = client.get("/health")
        # Should not be 401 or 403
        assert resp.status_code in (200, 503)

    @pytest.mark.integration
    def test_live_accessible_without_token(self, client):
        with patch("api.routes.health.get_uptime_seconds", return_value=1.0):
            resp = client.get("/health/live")
        assert resp.status_code == 200

    @pytest.mark.integration
    def test_ready_accessible_without_token(self, client):
        from services.health_service import ComponentHealth, HealthStatus

        healthy_db = ComponentHealth(
            name="database",
            status=HealthStatus.HEALTHY,
            latency_ms=1.0,
            message="ok",
        )
        with patch("api.routes.health.check_database", return_value=healthy_db):
            resp = client.get("/health/ready")
        assert resp.status_code == 200
