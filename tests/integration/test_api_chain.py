"""
Integration Tests: Backend API Chain
=====================================
Tests the TASI index API pipeline end-to-end using FastAPI TestClient.

Covers:
  - GET /api/v1/charts/tasi/index with valid period -> response schema
  - GET /api/v1/charts/tasi/index with invalid period -> 400/422
  - GET /api/v1/charts/tasi/health -> enriched response
  - Mock yfinance failure -> circuit breaker fallback
  - Rate limiting -> 429

Markers:
  - integration: requires full app assembly (no external services)
"""

from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest

# Ensure project root on sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def tasi_app():
    """Create a minimal FastAPI app with just the TASI router."""
    from fastapi import FastAPI
    from api.routes.tasi_index import router

    app = FastAPI()
    app.include_router(router)
    return app


@pytest.fixture(scope="module")
def tasi_client(tasi_app):
    """TestClient for TASI endpoints."""
    from fastapi.testclient import TestClient

    return TestClient(tasi_app)


@pytest.fixture(autouse=True)
def _clear_tasi_cache():
    """Clear TASI cache between tests for isolation."""
    import services.tasi_index as mod

    mod._cache.clear()
    # Reset circuit breaker
    mod._consecutive_failures = 0
    mod._circuit_open_until = 0.0
    yield
    mod._cache.clear()


# ---------------------------------------------------------------------------
# TASI Index -- Valid periods
# ---------------------------------------------------------------------------


class TestTASIIndexValidPeriods:
    """Test GET /api/v1/charts/tasi/index with valid periods."""

    @pytest.mark.integration
    def test_default_period_returns_200(self, tasi_client):
        with patch.dict("sys.modules", {"yfinance": None}):
            resp = tasi_client.get("/api/v1/charts/tasi/index")
        assert resp.status_code == 200

    @pytest.mark.integration
    def test_response_schema_has_required_fields(self, tasi_client):
        with patch.dict("sys.modules", {"yfinance": None}):
            resp = tasi_client.get("/api/v1/charts/tasi/index")
        body = resp.json()
        required = {"data", "source", "last_updated", "symbol", "period", "count"}
        assert required.issubset(body.keys()), f"Missing: {required - set(body.keys())}"

    @pytest.mark.integration
    def test_count_matches_data_length(self, tasi_client):
        with patch.dict("sys.modules", {"yfinance": None}):
            resp = tasi_client.get("/api/v1/charts/tasi/index")
        body = resp.json()
        assert body["count"] == len(body["data"])
        assert body["count"] > 0

    @pytest.mark.integration
    def test_data_points_have_ohlcv_keys(self, tasi_client):
        with patch.dict("sys.modules", {"yfinance": None}):
            resp = tasi_client.get("/api/v1/charts/tasi/index")
        body = resp.json()
        point = body["data"][0]
        for key in ("time", "open", "high", "low", "close", "volume"):
            assert key in point, f"Missing OHLCV key: {key}"

    @pytest.mark.integration
    def test_explicit_period_3mo(self, tasi_client):
        with patch.dict("sys.modules", {"yfinance": None}):
            resp = tasi_client.get("/api/v1/charts/tasi/index?period=3mo")
        assert resp.status_code == 200
        body = resp.json()
        assert body["period"] == "3mo"

    @pytest.mark.integration
    @pytest.mark.parametrize("period", ["1mo", "3mo", "6mo", "1y", "2y", "5y"])
    def test_all_valid_periods(self, tasi_client, period):
        with patch.dict("sys.modules", {"yfinance": None}):
            resp = tasi_client.get(f"/api/v1/charts/tasi/index?period={period}")
        assert resp.status_code == 200
        body = resp.json()
        assert body["period"] == period
        assert body["count"] > 0


# ---------------------------------------------------------------------------
# TASI Index -- Invalid periods
# ---------------------------------------------------------------------------


class TestTASIIndexInvalidPeriods:
    """Test GET /api/v1/charts/tasi/index with invalid periods."""

    @pytest.mark.integration
    def test_invalid_period_returns_400(self, tasi_client):
        resp = tasi_client.get("/api/v1/charts/tasi/index?period=invalid")
        assert resp.status_code == 400

    @pytest.mark.integration
    def test_invalid_period_has_detail(self, tasi_client):
        resp = tasi_client.get("/api/v1/charts/tasi/index?period=bogus")
        body = resp.json()
        assert "detail" in body
        assert "bogus" in body["detail"].lower()

    @pytest.mark.integration
    @pytest.mark.parametrize("bad_period", ["10y", "1d", "1w", "abc", ""])
    def test_various_invalid_periods(self, tasi_client, bad_period):
        resp = tasi_client.get(f"/api/v1/charts/tasi/index?period={bad_period}")
        assert resp.status_code in (400, 422), (
            f"Expected 400/422, got {resp.status_code}"
        )


# ---------------------------------------------------------------------------
# TASI Health
# ---------------------------------------------------------------------------


class TestTASIHealth:
    """Test GET /api/v1/charts/tasi/health."""

    @pytest.mark.integration
    def test_health_returns_200(self, tasi_client):
        resp = tasi_client.get("/api/v1/charts/tasi/health")
        assert resp.status_code == 200

    @pytest.mark.integration
    def test_health_has_status_and_message(self, tasi_client):
        resp = tasi_client.get("/api/v1/charts/tasi/health")
        body = resp.json()
        assert "status" in body
        assert "message" in body
        assert body["status"] in ("ok", "degraded")

    @pytest.mark.integration
    def test_health_does_not_expose_internals(self, tasi_client):
        resp = tasi_client.get("/api/v1/charts/tasi/health")
        body = resp.json()
        forbidden = {
            "yfinance_available",
            "cache_status",
            "cache_age_seconds",
            "circuit_state",
            "consecutive_failures",
        }
        exposed = forbidden & set(body.keys())
        assert exposed == set(), f"Leaks internal fields: {exposed}"


# ---------------------------------------------------------------------------
# Circuit breaker (mock yfinance failure)
# ---------------------------------------------------------------------------


class TestCircuitBreaker:
    """Test that repeated yfinance failures trip the circuit breaker."""

    @pytest.mark.integration
    def test_circuit_breaker_opens_after_threshold(self, tasi_client):
        """After CIRCUIT_BREAKER_THRESHOLD failures, circuit should open."""
        import services.tasi_index as mod

        mock_yf = MagicMock()
        mock_ticker = MagicMock()
        mock_ticker.history.side_effect = ConnectionError("yfinance network error")
        mock_yf.Ticker.return_value = mock_ticker

        with patch.dict("sys.modules", {"yfinance": mock_yf}):
            # Fire enough requests to trip the circuit breaker
            for _ in range(mod.CIRCUIT_BREAKER_THRESHOLD + 1):
                mod._cache.clear()
                resp = tasi_client.get("/api/v1/charts/tasi/index")
                assert resp.status_code == 200  # always 200 (falls back to mock)

        # Circuit should now be open
        cb_status = mod.get_circuit_breaker_status()
        assert cb_status["circuit_state"] == "open"
        assert cb_status["consecutive_failures"] >= mod.CIRCUIT_BREAKER_THRESHOLD

    @pytest.mark.integration
    def test_fallback_to_mock_on_yfinance_failure(self, tasi_client):
        """When yfinance fails, the endpoint returns mock data (not an error)."""
        mock_yf = MagicMock()
        mock_ticker = MagicMock()
        mock_ticker.history.side_effect = RuntimeError("test failure")
        mock_yf.Ticker.return_value = mock_ticker

        with patch.dict("sys.modules", {"yfinance": mock_yf}):
            import services.tasi_index as mod

            mod._cache.clear()
            resp = tasi_client.get("/api/v1/charts/tasi/index")

        assert resp.status_code == 200
        body = resp.json()
        assert body["source"] in ("mock", "cached")


# ---------------------------------------------------------------------------
# Rate limiting
# ---------------------------------------------------------------------------


class TestRateLimiting:
    """Test rate limiter middleware returns 429 when limit is exceeded."""

    @pytest.mark.integration
    @pytest.mark.slow
    def test_rate_limit_returns_429(self):
        """Create an app with a very low rate limit and verify 429."""
        from fastapi import FastAPI
        from fastapi.testclient import TestClient
        from middleware.rate_limit import RateLimitMiddleware

        app = FastAPI()

        @app.get("/test")
        async def test_endpoint():
            return {"ok": True}

        # Very low limit: 3 requests per minute
        app.add_middleware(RateLimitMiddleware, requests_per_minute=3)
        client = TestClient(app)

        statuses = []
        for _ in range(6):
            resp = client.get("/test")
            statuses.append(resp.status_code)

        assert 429 in statuses, f"Expected at least one 429, got: {statuses}"

    @pytest.mark.integration
    def test_rate_limit_skip_paths(self):
        """Verify skip_paths bypass rate limiting."""
        from fastapi import FastAPI
        from fastapi.testclient import TestClient
        from middleware.rate_limit import RateLimitMiddleware

        app = FastAPI()

        @app.get("/health")
        async def health():
            return {"status": "ok"}

        app.add_middleware(
            RateLimitMiddleware, requests_per_minute=2, skip_paths=["/health"]
        )
        client = TestClient(app)

        # Should never get 429 for skipped path
        for _ in range(10):
            resp = client.get("/health")
            assert resp.status_code == 200
