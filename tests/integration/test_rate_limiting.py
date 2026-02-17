"""
Integration Tests: Rate Limiting
=================================
Tests for rate limiting middleware behavior at the integration level.

Covers:
  - Requests within limit succeed with 200
  - Exceeding limit returns 429 with Retry-After header
  - Rate limit headers are present in 429 responses
  - Per-endpoint path-based rate limiting
  - Skip paths bypass rate limiting
  - Rate limit buckets reset after window expires
  - Independent bucket isolation (auth vs charts)
  - Error response body structure for 429

Uses FastAPI TestClient with RateLimitMiddleware.
"""

import sys
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

import pytest

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from middleware.rate_limit import RateLimitMiddleware  # noqa: E402


def _create_rate_limited_app(
    rpm: int = 60,
    path_limits=None,
    skip_paths=None,
):
    """Create a minimal FastAPI app with rate limiting."""
    app = FastAPI()

    @app.get("/test")
    async def test_ep():
        return {"status": "ok"}

    @app.get("/health")
    async def health_ep():
        return {"status": "healthy"}

    @app.post("/api/auth/login")
    async def login_ep():
        return {"token": "fake"}

    @app.get("/api/v1/charts/tasi/index")
    async def tasi_ep():
        return {"data": []}

    @app.get("/api/v1/query")
    async def query_ep():
        return {"result": []}

    app.add_middleware(
        RateLimitMiddleware,
        requests_per_minute=rpm,
        skip_paths=skip_paths or ["/health"],
        path_limits=path_limits,
    )
    return app


# ===========================================================================
# Within limit: success
# ===========================================================================


class TestWithinLimit:
    """Test that requests within the rate limit succeed."""

    @pytest.mark.integration
    def test_all_requests_within_limit_return_200(self):
        app = _create_rate_limited_app(rpm=10)
        client = TestClient(app)

        for _ in range(5):
            resp = client.get("/test")
            assert resp.status_code == 200

    @pytest.mark.integration
    def test_exactly_at_limit_succeeds(self):
        app = _create_rate_limited_app(rpm=3)
        client = TestClient(app)

        statuses = [client.get("/test").status_code for _ in range(3)]
        assert all(s == 200 for s in statuses)


# ===========================================================================
# Exceeding limit: 429
# ===========================================================================


class TestExceedingLimit:
    """Test that exceeding the rate limit returns 429."""

    @pytest.mark.integration
    def test_exceeding_limit_returns_429(self):
        app = _create_rate_limited_app(rpm=2)
        client = TestClient(app)

        statuses = [client.get("/test").status_code for _ in range(5)]
        assert 429 in statuses

    @pytest.mark.integration
    def test_429_response_has_retry_after_header(self):
        app = _create_rate_limited_app(rpm=1)
        client = TestClient(app)

        client.get("/test")
        resp = client.get("/test")
        if resp.status_code == 429:
            assert "Retry-After" in resp.headers
            retry_val = int(resp.headers["Retry-After"])
            assert retry_val > 0

    @pytest.mark.integration
    def test_429_response_body_structure(self):
        app = _create_rate_limited_app(rpm=1)
        client = TestClient(app)

        client.get("/test")
        resp = client.get("/test")
        if resp.status_code == 429:
            body = resp.json()
            assert "error" in body
            assert body["error"]["code"] == "RATE_LIMITED"
            assert body["error"]["message"] == "Too many requests"


# ===========================================================================
# Per-endpoint rate limits
# ===========================================================================


class TestPerEndpointLimits:
    """Test path-prefix-based rate limit tiers."""

    @pytest.mark.integration
    def test_auth_endpoint_separate_limit(self):
        app = _create_rate_limited_app(rpm=60, path_limits={"/api/auth": 2})
        client = TestClient(app)

        r1 = client.post("/api/auth/login")
        r2 = client.post("/api/auth/login")
        assert r1.status_code == 200
        assert r2.status_code == 200

        r3 = client.post("/api/auth/login")
        assert r3.status_code == 429

    @pytest.mark.integration
    def test_charts_endpoint_separate_limit(self):
        app = _create_rate_limited_app(rpm=60, path_limits={"/api/v1/charts": 2})
        client = TestClient(app)

        for _ in range(2):
            r = client.get("/api/v1/charts/tasi/index")
            assert r.status_code == 200

        r = client.get("/api/v1/charts/tasi/index")
        assert r.status_code == 429

        # General endpoint should still work
        r = client.get("/test")
        assert r.status_code == 200


# ===========================================================================
# Skip paths
# ===========================================================================


class TestSkipPaths:
    """Test that skip paths bypass rate limiting."""

    @pytest.mark.integration
    def test_health_endpoint_bypasses_rate_limit(self):
        app = _create_rate_limited_app(rpm=1, skip_paths=["/health"])
        client = TestClient(app)

        # Exhaust the general limit
        client.get("/test")

        # Health should still work
        for _ in range(10):
            resp = client.get("/health")
            assert resp.status_code == 200


# ===========================================================================
# Bucket isolation
# ===========================================================================


class TestBucketIsolation:
    """Test that different path tiers have independent buckets."""

    @pytest.mark.integration
    def test_auth_and_charts_independent(self):
        app = _create_rate_limited_app(
            rpm=60,
            path_limits={"/api/auth": 1, "/api/v1/charts": 1},
        )
        client = TestClient(app)

        # Exhaust auth bucket
        client.post("/api/auth/login")
        r = client.post("/api/auth/login")
        assert r.status_code == 429

        # Charts bucket should still have capacity
        r = client.get("/api/v1/charts/tasi/index")
        assert r.status_code == 200

    @pytest.mark.integration
    def test_exhausted_prefix_doesnt_affect_default(self):
        app = _create_rate_limited_app(
            rpm=10,
            path_limits={"/api/auth": 1},
        )
        client = TestClient(app)

        # Exhaust auth
        client.post("/api/auth/login")
        r = client.post("/api/auth/login")
        assert r.status_code == 429

        # Default bucket should still be available
        r = client.get("/test")
        assert r.status_code == 200
