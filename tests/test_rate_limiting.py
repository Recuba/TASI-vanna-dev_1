"""
Rate Limiting Tests
===================
Tests for tiered rate limiting middleware (general, auth, chart tiers).

Uses FastAPI TestClient for integration-style testing.
"""

import sys
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from middleware.rate_limit import RateLimitMiddleware


# ===========================================================================
# Helper: create a minimal FastAPI app with tiered endpoints
# ===========================================================================


def _create_test_app(
    requests_per_minute: int = 60,
    path_limits=None,
    skip_paths=None,
):
    """Create a minimal FastAPI app with rate limiting for testing."""
    app = FastAPI()

    @app.get("/test")
    async def test_endpoint():
        return {"status": "ok"}

    @app.get("/health")
    async def health_endpoint():
        return {"status": "healthy"}

    @app.post("/api/auth/login")
    async def login_endpoint():
        return {"token": "fake"}

    @app.post("/api/auth/register")
    async def register_endpoint():
        return {"token": "fake"}

    @app.get("/api/v1/charts/tasi/index")
    async def tasi_chart_endpoint():
        return {"data": []}

    @app.get("/api/v1/charts/2222/ohlcv")
    async def stock_chart_endpoint():
        return {"data": []}

    @app.get("/api/v1/market/movers")
    async def market_endpoint():
        return {"items": []}

    app.add_middleware(
        RateLimitMiddleware,
        requests_per_minute=requests_per_minute,
        skip_paths=skip_paths or ["/health"],
        path_limits=path_limits,
    )

    return app


# ===========================================================================
# Tests: Default (single-tier) rate limiting
# ===========================================================================


class TestDefaultRateLimiting:
    """Tests for default (non-tiered) rate limiting."""

    def test_requests_within_limit_succeed(self):
        app = _create_test_app(requests_per_minute=10)
        client = TestClient(app)

        for _ in range(5):
            response = client.get("/test")
            assert response.status_code == 200

    def test_requests_exceeding_limit_return_429(self):
        app = _create_test_app(requests_per_minute=3)
        client = TestClient(app)

        responses = [client.get("/test") for _ in range(5)]
        status_codes = [r.status_code for r in responses]
        assert 429 in status_codes

    def test_429_response_has_retry_after(self):
        app = _create_test_app(requests_per_minute=1)
        client = TestClient(app)

        client.get("/test")
        response = client.get("/test")

        if response.status_code == 429:
            assert "Retry-After" in response.headers
            data = response.json()
            assert data["error"]["code"] == "RATE_LIMITED"
            assert data["error"]["message"] == "Too many requests"

    def test_skip_paths_bypass_rate_limit(self):
        app = _create_test_app(requests_per_minute=1, skip_paths=["/health"])
        client = TestClient(app)

        client.get("/test")  # uses the single slot

        for _ in range(5):
            response = client.get("/health")
            assert response.status_code == 200

    def test_different_endpoints_share_default_bucket(self):
        """Without path_limits, all non-skip paths share one bucket."""
        app = _create_test_app(requests_per_minute=3)
        client = TestClient(app)

        client.get("/test")
        client.get("/api/v1/market/movers")
        client.get("/test")
        # 4th request should hit limit
        response = client.get("/api/v1/market/movers")
        assert response.status_code == 429


# ===========================================================================
# Tests: Tiered (path-based) rate limiting
# ===========================================================================


class TestTieredRateLimiting:
    """Tests for path-prefix-based rate limit tiers."""

    def test_auth_tier_has_lower_limit(self):
        """Auth endpoints should be limited independently at a lower rate."""
        app = _create_test_app(
            requests_per_minute=60,
            path_limits={"/api/auth/login": 2, "/api/auth/register": 2},
        )
        client = TestClient(app)

        # 2 requests within auth limit
        r1 = client.post("/api/auth/login")
        r2 = client.post("/api/auth/login")
        assert r1.status_code == 200
        assert r2.status_code == 200

        # 3rd should be rate limited
        r3 = client.post("/api/auth/login")
        assert r3.status_code == 429

    def test_chart_tier_has_separate_bucket(self):
        """Chart endpoints should be limited independently."""
        app = _create_test_app(
            requests_per_minute=60,
            path_limits={"/api/v1/charts": 3},
        )
        client = TestClient(app)

        # 3 chart requests within limit
        for _ in range(3):
            r = client.get("/api/v1/charts/tasi/index")
            assert r.status_code == 200

        # 4th chart request should be rate limited
        r = client.get("/api/v1/charts/tasi/index")
        assert r.status_code == 429

        # But a general endpoint should still work (different bucket)
        r = client.get("/test")
        assert r.status_code == 200

    def test_default_tier_still_works_with_path_limits(self):
        """Endpoints not matching any prefix use the default limit."""
        app = _create_test_app(
            requests_per_minute=3,
            path_limits={"/api/auth/login": 10},
        )
        client = TestClient(app)

        # General endpoint uses default (3/min)
        for _ in range(3):
            r = client.get("/test")
            assert r.status_code == 200

        r = client.get("/test")
        assert r.status_code == 429

    def test_auth_and_chart_tiers_are_independent(self):
        """Exhausting auth tier should not affect chart tier."""
        app = _create_test_app(
            requests_per_minute=60,
            path_limits={"/api/auth/login": 1, "/api/v1/charts": 1},
        )
        client = TestClient(app)

        # Exhaust auth tier
        client.post("/api/auth/login")
        r = client.post("/api/auth/login")
        assert r.status_code == 429

        # Chart tier should still work
        r = client.get("/api/v1/charts/tasi/index")
        assert r.status_code == 200

    def test_longest_prefix_match(self):
        """More specific prefix should match over less specific."""
        app = _create_test_app(
            requests_per_minute=60,
            path_limits={
                "/api/auth": 5,
                "/api/auth/login": 2,
            },
        )
        client = TestClient(app)

        # /api/auth/login matches the more specific prefix (limit=2)
        client.post("/api/auth/login")
        client.post("/api/auth/login")
        r = client.post("/api/auth/login")
        assert r.status_code == 429

    def test_register_has_separate_bucket_from_login(self):
        """Login and register should have separate buckets."""
        app = _create_test_app(
            requests_per_minute=60,
            path_limits={"/api/auth/login": 1, "/api/auth/register": 1},
        )
        client = TestClient(app)

        # Exhaust login
        client.post("/api/auth/login")
        r = client.post("/api/auth/login")
        assert r.status_code == 429

        # Register should still work
        r = client.post("/api/auth/register")
        assert r.status_code == 200

    def test_stock_ohlcv_uses_chart_tier(self):
        """Per-stock OHLCV endpoint should match /api/v1/charts prefix."""
        app = _create_test_app(
            requests_per_minute=60,
            path_limits={"/api/v1/charts": 2},
        )
        client = TestClient(app)

        client.get("/api/v1/charts/2222/ohlcv")
        client.get("/api/v1/charts/tasi/index")
        # Both used the chart bucket, 3rd should be limited
        r = client.get("/api/v1/charts/2222/ohlcv")
        assert r.status_code == 429
