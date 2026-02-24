"""
Tests for backend/routes/health.py

Covers: liveness, readiness, and basic metrics endpoints,
record_request counter, and dependency check helpers.
"""

import sys
import time
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


def _create_health_app():
    """Create a minimal FastAPI app with the health router mounted."""
    from backend.routes.health import router

    app = FastAPI()
    app.include_router(router)
    return app


# ---------------------------------------------------------------------------
# Pydantic response models
# ---------------------------------------------------------------------------


class TestResponseModels:
    """Tests for the Pydantic response model schemas."""

    def test_liveness_response_defaults(self):
        from backend.routes.health import LivenessResponse

        resp = LivenessResponse(uptime_seconds=42.5)
        assert resp.status == "alive"
        assert resp.uptime_seconds == 42.5

    def test_component_readiness_defaults(self):
        from backend.routes.health import ComponentReadiness

        cr = ComponentReadiness(name="db", ready=True)
        assert cr.latency_ms is None
        assert cr.message == ""

    def test_component_readiness_with_all_fields(self):
        from backend.routes.health import ComponentReadiness

        cr = ComponentReadiness(
            name="redis", ready=False, latency_ms=3.14, message="timeout"
        )
        assert cr.name == "redis"
        assert cr.ready is False
        assert cr.latency_ms == 3.14
        assert cr.message == "timeout"

    def test_readiness_response(self):
        from backend.routes.health import ReadinessResponse, ComponentReadiness

        comp = ComponentReadiness(name="db", ready=True)
        resp = ReadinessResponse(status="ready", components=[comp])
        assert resp.status == "ready"
        assert len(resp.components) == 1

    def test_circuit_breaker_metric(self):
        from backend.routes.health import CircuitBreakerMetric

        cb = CircuitBreakerMetric(
            name="yfinance",
            state="closed",
            failure_count=0,
            total_failures=5,
            total_successes=100,
            total_rejected=2,
        )
        assert cb.name == "yfinance"
        assert cb.state == "closed"

    def test_basic_metrics_response(self):
        from backend.routes.health import BasicMetricsResponse

        resp = BasicMetricsResponse(
            uptime_seconds=100.0,
            total_requests=50,
            total_errors=3,
            error_rate=0.06,
        )
        assert resp.circuit_breakers == []
        assert resp.error_rate == 0.06


# ---------------------------------------------------------------------------
# record_request
# ---------------------------------------------------------------------------


class TestRecordRequest:
    """Tests for the record_request() counter function."""

    def test_record_request_increments_counter(self):
        import backend.routes.health as mod

        original_req = mod._REQUEST_COUNTER
        original_err = mod._ERROR_COUNTER

        mod.record_request()
        assert mod._REQUEST_COUNTER == original_req + 1
        assert mod._ERROR_COUNTER == original_err

    def test_record_request_with_error(self):
        import backend.routes.health as mod

        original_req = mod._REQUEST_COUNTER
        original_err = mod._ERROR_COUNTER

        mod.record_request(is_error=True)
        assert mod._REQUEST_COUNTER == original_req + 1
        assert mod._ERROR_COUNTER == original_err + 1


# ---------------------------------------------------------------------------
# GET /health (liveness)
# ---------------------------------------------------------------------------


class TestLivenessEndpoint:
    """Tests for GET /health endpoint."""

    def test_liveness_returns_200(self):
        app = _create_health_app()
        client = TestClient(app)
        response = client.get("/health")
        assert response.status_code == 200

    def test_liveness_response_shape(self):
        app = _create_health_app()
        client = TestClient(app)
        data = client.get("/health").json()
        assert data["status"] == "alive"
        assert "uptime_seconds" in data
        assert isinstance(data["uptime_seconds"], (int, float))

    def test_liveness_uptime_is_positive(self):
        app = _create_health_app()
        client = TestClient(app)
        data = client.get("/health").json()
        assert data["uptime_seconds"] >= 0


# ---------------------------------------------------------------------------
# GET /ready (readiness)
# ---------------------------------------------------------------------------


class TestReadinessEndpoint:
    """Tests for GET /ready endpoint."""

    def _mock_check(self, name, ready, message="ok"):
        from backend.routes.health import ComponentReadiness

        return ComponentReadiness(
            name=name, ready=ready, latency_ms=1.0, message=message
        )

    def test_readiness_all_healthy_returns_200(self):
        app = _create_health_app()
        client = TestClient(app)

        db_ok = self._mock_check("database", True, "sqlite connected")
        redis_ok = self._mock_check("redis", True, "connected")
        llm_ok = self._mock_check("vanna_llm", True, "api key set")

        with (
            patch(
                "backend.routes.health._check_database",
                return_value=db_ok,
            ),
            patch(
                "backend.routes.health._check_redis",
                return_value=redis_ok,
            ),
            patch(
                "backend.routes.health._check_llm",
                return_value=llm_ok,
            ),
        ):
            response = client.get("/ready")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ready"
        assert len(data["components"]) == 3

    def test_readiness_db_down_returns_503(self):
        app = _create_health_app()
        client = TestClient(app)

        db_down = self._mock_check("database", False, "connection refused")
        redis_ok = self._mock_check("redis", True)
        llm_ok = self._mock_check("vanna_llm", True)

        with (
            patch(
                "backend.routes.health._check_database",
                return_value=db_down,
            ),
            patch(
                "backend.routes.health._check_redis",
                return_value=redis_ok,
            ),
            patch(
                "backend.routes.health._check_llm",
                return_value=llm_ok,
            ),
        ):
            response = client.get("/ready")

        assert response.status_code == 503
        data = response.json()
        assert data["status"] == "not_ready"

    def test_readiness_redis_down_returns_503(self):
        app = _create_health_app()
        client = TestClient(app)

        db_ok = self._mock_check("database", True)
        redis_down = self._mock_check("redis", False, "not reachable")
        llm_ok = self._mock_check("vanna_llm", True)

        with (
            patch(
                "backend.routes.health._check_database",
                return_value=db_ok,
            ),
            patch(
                "backend.routes.health._check_redis",
                return_value=redis_down,
            ),
            patch(
                "backend.routes.health._check_llm",
                return_value=llm_ok,
            ),
        ):
            response = client.get("/ready")

        assert response.status_code == 503

    def test_readiness_llm_down_returns_503(self):
        app = _create_health_app()
        client = TestClient(app)

        db_ok = self._mock_check("database", True)
        redis_ok = self._mock_check("redis", True)
        llm_down = self._mock_check("vanna_llm", False, "no api key")

        with (
            patch(
                "backend.routes.health._check_database",
                return_value=db_ok,
            ),
            patch(
                "backend.routes.health._check_redis",
                return_value=redis_ok,
            ),
            patch(
                "backend.routes.health._check_llm",
                return_value=llm_down,
            ),
        ):
            response = client.get("/ready")

        assert response.status_code == 503

    def test_readiness_all_down_returns_503(self):
        app = _create_health_app()
        client = TestClient(app)

        db_down = self._mock_check("database", False)
        redis_down = self._mock_check("redis", False)
        llm_down = self._mock_check("vanna_llm", False)

        with (
            patch(
                "backend.routes.health._check_database",
                return_value=db_down,
            ),
            patch(
                "backend.routes.health._check_redis",
                return_value=redis_down,
            ),
            patch(
                "backend.routes.health._check_llm",
                return_value=llm_down,
            ),
        ):
            response = client.get("/ready")

        assert response.status_code == 503
        data = response.json()
        assert data["status"] == "not_ready"
        assert len(data["components"]) == 3


# ---------------------------------------------------------------------------
# Dependency check helpers (_check_database, _check_redis, _check_llm)
# ---------------------------------------------------------------------------


class TestCheckDatabaseHelper:
    """Tests for the _check_database async helper."""

    @pytest.mark.asyncio
    async def test_check_database_healthy(self):
        from backend.routes.health import _check_database

        mock_result = MagicMock()
        mock_result.status.value = "healthy"
        # Make the HealthStatus enum comparison work
        from services.health_service import HealthStatus

        mock_result.status = HealthStatus.HEALTHY
        mock_result.message = "sqlite connected"

        with patch(
            "services.health_service.check_database", return_value=mock_result
        ):
            result = await _check_database()

        assert result.name == "database"
        assert result.ready is True
        assert result.latency_ms is not None

    @pytest.mark.asyncio
    async def test_check_database_unhealthy(self):
        from backend.routes.health import _check_database
        from services.health_service import HealthStatus

        mock_result = MagicMock()
        mock_result.status = HealthStatus.UNHEALTHY
        mock_result.message = "connection refused"

        with patch(
            "services.health_service.check_database", return_value=mock_result
        ):
            result = await _check_database()

        assert result.name == "database"
        assert result.ready is False

    @pytest.mark.asyncio
    async def test_check_database_exception(self):
        from backend.routes.health import _check_database

        with patch(
            "services.health_service.check_database",
            side_effect=Exception("import error"),
        ):
            result = await _check_database()

        assert result.name == "database"
        assert result.ready is False
        assert "import error" in result.message


class TestCheckRedisHelper:
    """Tests for the _check_redis async helper."""

    @pytest.mark.asyncio
    async def test_check_redis_healthy(self):
        from backend.routes.health import _check_redis
        from services.health_service import HealthStatus

        mock_result = MagicMock()
        mock_result.status = HealthStatus.HEALTHY
        mock_result.message = "connected"

        with patch(
            "services.health_service.check_redis", return_value=mock_result
        ):
            result = await _check_redis()

        assert result.name == "redis"
        assert result.ready is True

    @pytest.mark.asyncio
    async def test_check_redis_degraded_is_ready(self):
        from backend.routes.health import _check_redis
        from services.health_service import HealthStatus

        mock_result = MagicMock()
        mock_result.status = HealthStatus.DEGRADED
        mock_result.message = "cache disabled"

        with patch(
            "services.health_service.check_redis", return_value=mock_result
        ):
            result = await _check_redis()

        # DEGRADED != UNHEALTHY, so ready=True
        assert result.ready is True

    @pytest.mark.asyncio
    async def test_check_redis_unhealthy_not_ready(self):
        from backend.routes.health import _check_redis
        from services.health_service import HealthStatus

        mock_result = MagicMock()
        mock_result.status = HealthStatus.UNHEALTHY
        mock_result.message = "connection refused"

        with patch(
            "services.health_service.check_redis", return_value=mock_result
        ):
            result = await _check_redis()

        assert result.ready is False

    @pytest.mark.asyncio
    async def test_check_redis_exception(self):
        from backend.routes.health import _check_redis

        with patch(
            "services.health_service.check_redis",
            side_effect=RuntimeError("no redis module"),
        ):
            result = await _check_redis()

        assert result.ready is False
        assert "no redis module" in result.message


class TestCheckLlmHelper:
    """Tests for the _check_llm async helper."""

    @pytest.mark.asyncio
    async def test_check_llm_healthy(self):
        from backend.routes.health import _check_llm
        from services.health_service import HealthStatus

        mock_result = MagicMock()
        mock_result.status = HealthStatus.HEALTHY
        mock_result.message = "provider=anthropic"

        with patch(
            "services.health_service.check_llm", return_value=mock_result
        ):
            result = await _check_llm()

        assert result.name == "vanna_llm"
        assert result.ready is True

    @pytest.mark.asyncio
    async def test_check_llm_degraded_not_ready(self):
        from backend.routes.health import _check_llm
        from services.health_service import HealthStatus

        mock_result = MagicMock()
        mock_result.status = HealthStatus.DEGRADED
        mock_result.message = "no api key"

        with patch(
            "services.health_service.check_llm", return_value=mock_result
        ):
            result = await _check_llm()

        # DEGRADED != HEALTHY, so ready=False
        assert result.ready is False

    @pytest.mark.asyncio
    async def test_check_llm_exception(self):
        from backend.routes.health import _check_llm

        with patch(
            "services.health_service.check_llm",
            side_effect=Exception("settings error"),
        ):
            result = await _check_llm()

        assert result.ready is False
        assert "settings error" in result.message


# ---------------------------------------------------------------------------
# GET /metrics/basic
# ---------------------------------------------------------------------------


class TestMetricsEndpoint:
    """Tests for GET /metrics/basic endpoint."""

    def test_metrics_returns_200(self):
        app = _create_health_app()
        client = TestClient(app)

        response = client.get("/metrics/basic")
        assert response.status_code == 200

    def test_metrics_response_shape(self):
        app = _create_health_app()
        client = TestClient(app)

        response = client.get("/metrics/basic")
        data = response.json()

        assert "uptime_seconds" in data
        assert "total_requests" in data
        assert "total_errors" in data
        assert "error_rate" in data
        assert "circuit_breakers" in data

    def test_metrics_uptime_positive(self):
        app = _create_health_app()
        client = TestClient(app)

        data = client.get("/metrics/basic").json()
        assert data["uptime_seconds"] >= 0

    def test_metrics_error_rate_zero_when_no_requests(self):
        import backend.routes.health as mod

        # Reset counters
        original_req = mod._REQUEST_COUNTER
        original_err = mod._ERROR_COUNTER
        mod._REQUEST_COUNTER = 0
        mod._ERROR_COUNTER = 0

        try:
            app = _create_health_app()
            client = TestClient(app)
            data = client.get("/metrics/basic").json()
            assert data["error_rate"] == 0.0
        finally:
            mod._REQUEST_COUNTER = original_req
            mod._ERROR_COUNTER = original_err

    def test_metrics_with_circuit_breaker_stats(self):
        app = _create_health_app()
        client = TestClient(app)

        mock_stats = MagicMock()
        mock_stats.name = "yfinance"
        mock_stats.state.value = "closed"
        mock_stats.failure_count = 0
        mock_stats.total_failures = 5
        mock_stats.total_successes = 100
        mock_stats.total_rejected = 2

        # get_all_stats is imported inside the endpoint function body,
        # so patch the source module
        with patch(
            "backend.services.resilience.circuit_breaker.get_all_stats",
            return_value=[mock_stats],
        ):
            response = client.get("/metrics/basic")

        data = response.json()
        assert len(data["circuit_breakers"]) == 1
        assert data["circuit_breakers"][0]["name"] == "yfinance"
        assert data["circuit_breakers"][0]["state"] == "closed"

    def test_metrics_circuit_breaker_import_error_handled(self):
        app = _create_health_app()
        client = TestClient(app)

        # The import of get_all_stats inside the endpoint should handle ImportError
        response = client.get("/metrics/basic")
        assert response.status_code == 200
        data = response.json()
        assert data["circuit_breakers"] == []
