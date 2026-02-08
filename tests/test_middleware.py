"""
Middleware Tests
================
Tests for CORS, rate limiting, request logging, and error handler middleware.

Uses FastAPI TestClient for integration-style testing of middleware behavior.
"""

import logging
import sys
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


# ===========================================================================
# Helper: create a minimal FastAPI app with a test endpoint
# ===========================================================================


def _create_test_app():
    """Create a minimal FastAPI app for middleware testing."""
    app = FastAPI()

    @app.get("/test")
    async def test_endpoint():
        return {"status": "ok"}

    @app.get("/health")
    async def health_endpoint():
        return {"status": "healthy"}

    @app.get("/error")
    async def error_endpoint():
        raise RuntimeError("Intentional test error")

    return app


# ===========================================================================
# CORS middleware tests
# ===========================================================================


class TestCORSMiddleware:
    """Tests for middleware.cors.setup_cors."""

    def test_cors_headers_present_for_allowed_origin(self):
        from middleware.cors import setup_cors

        app = _create_test_app()
        setup_cors(app, allowed_origins=["http://localhost:3000"])
        client = TestClient(app)

        response = client.get("/test", headers={"Origin": "http://localhost:3000"})
        assert response.status_code == 200
        assert "access-control-allow-origin" in response.headers

    def test_cors_preflight_request(self):
        from middleware.cors import setup_cors

        app = _create_test_app()
        setup_cors(app, allowed_origins=["http://localhost:3000"])
        client = TestClient(app)

        response = client.options(
            "/test",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "POST",
            },
        )
        assert response.status_code == 200
        assert "access-control-allow-methods" in response.headers

    def test_cors_allows_credentials(self):
        from middleware.cors import setup_cors

        app = _create_test_app()
        setup_cors(app, allowed_origins=["http://localhost:3000"])
        client = TestClient(app)

        response = client.get("/test", headers={"Origin": "http://localhost:3000"})
        assert response.headers.get("access-control-allow-credentials") == "true"


# ===========================================================================
# Rate limiting middleware tests
# ===========================================================================


class TestRateLimitMiddleware:
    """Tests for middleware.rate_limit.RateLimitMiddleware."""

    def test_requests_within_limit_succeed(self):
        from middleware.rate_limit import RateLimitMiddleware

        app = _create_test_app()
        app.add_middleware(RateLimitMiddleware, requests_per_minute=10)
        client = TestClient(app)

        for _ in range(5):
            response = client.get("/test")
            assert response.status_code == 200

    def test_requests_exceeding_limit_return_429(self):
        from middleware.rate_limit import RateLimitMiddleware

        app = _create_test_app()
        app.add_middleware(RateLimitMiddleware, requests_per_minute=3)
        client = TestClient(app)

        responses = []
        for _ in range(5):
            responses.append(client.get("/test"))

        status_codes = [r.status_code for r in responses]
        assert 429 in status_codes, "Should get 429 after exceeding rate limit"

    def test_rate_limit_429_response_format(self):
        from middleware.rate_limit import RateLimitMiddleware

        app = _create_test_app()
        app.add_middleware(RateLimitMiddleware, requests_per_minute=1)
        client = TestClient(app)

        client.get("/test")  # First request OK
        response = client.get("/test")  # Should be rate limited

        if response.status_code == 429:
            data = response.json()
            assert "detail" in data
            assert "Retry-After" in response.headers

    def test_skip_paths_bypass_rate_limit(self):
        from middleware.rate_limit import RateLimitMiddleware

        app = _create_test_app()
        app.add_middleware(
            RateLimitMiddleware,
            requests_per_minute=1,
            skip_paths=["/health"],
        )
        client = TestClient(app)

        # First request to /test uses the limit
        client.get("/test")

        # /health should bypass rate limiting
        for _ in range(5):
            response = client.get("/health")
            assert response.status_code == 200


# ===========================================================================
# Request logging middleware tests
# ===========================================================================


class TestRequestLoggingMiddleware:
    """Tests for middleware.request_logging.RequestLoggingMiddleware."""

    def test_requests_are_logged(self, caplog):
        from middleware.request_logging import RequestLoggingMiddleware

        app = _create_test_app()
        app.add_middleware(RequestLoggingMiddleware)
        client = TestClient(app)

        with caplog.at_level(logging.INFO, logger="tasi.access"):
            client.get("/test")

        assert any("/test" in record.message for record in caplog.records), (
            "Request to /test should be logged"
        )

    def test_log_contains_method_and_status(self, caplog):
        from middleware.request_logging import RequestLoggingMiddleware

        app = _create_test_app()
        app.add_middleware(RequestLoggingMiddleware)
        client = TestClient(app)

        with caplog.at_level(logging.INFO, logger="tasi.access"):
            client.get("/test")

        log_messages = [r.message for r in caplog.records]
        matching = [m for m in log_messages if "GET" in m and "200" in m]
        assert len(matching) > 0, "Log should contain GET method and 200 status"

    def test_log_contains_duration(self, caplog):
        from middleware.request_logging import RequestLoggingMiddleware

        app = _create_test_app()
        app.add_middleware(RequestLoggingMiddleware)
        client = TestClient(app)

        with caplog.at_level(logging.INFO, logger="tasi.access"):
            client.get("/test")

        log_messages = [r.message for r in caplog.records]
        matching = [m for m in log_messages if "ms" in m]
        assert len(matching) > 0, "Log should contain duration in ms"

    def test_skip_paths_not_logged(self, caplog):
        from middleware.request_logging import RequestLoggingMiddleware

        app = _create_test_app()
        app.add_middleware(RequestLoggingMiddleware, skip_paths=["/health"])
        client = TestClient(app)

        with caplog.at_level(logging.INFO, logger="tasi.access"):
            client.get("/health")

        health_logs = [r for r in caplog.records if "/health" in r.message]
        assert len(health_logs) == 0, "/health should not be logged"


# ===========================================================================
# Error handler middleware tests
# ===========================================================================


class TestErrorHandlerMiddleware:
    """Tests for middleware.error_handler.ErrorHandlerMiddleware."""

    def test_unhandled_exception_returns_500_json(self):
        from middleware.error_handler import ErrorHandlerMiddleware

        app = _create_test_app()
        app.add_middleware(ErrorHandlerMiddleware)
        client = TestClient(app, raise_server_exceptions=False)

        response = client.get("/error")
        assert response.status_code == 500
        data = response.json()
        assert data["detail"] == "Internal server error"
        assert data["code"] == "INTERNAL_ERROR"

    def test_normal_requests_pass_through(self):
        from middleware.error_handler import ErrorHandlerMiddleware

        app = _create_test_app()
        app.add_middleware(ErrorHandlerMiddleware)
        client = TestClient(app)

        response = client.get("/test")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}

    def test_error_handler_does_not_expose_traceback(self):
        from middleware.error_handler import ErrorHandlerMiddleware

        app = _create_test_app()
        app.add_middleware(ErrorHandlerMiddleware)
        client = TestClient(app, raise_server_exceptions=False)

        response = client.get("/error")
        body = response.text
        assert "Traceback" not in body
        assert "RuntimeError" not in body
        assert "Intentional test error" not in body
