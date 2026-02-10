"""
TASI Index Endpoint Tests
=========================
HTTP-level tests for the TASI index API routes using FastAPI TestClient.

Tests:
  - GET /api/v1/charts/tasi/index (default period)
  - GET /api/v1/charts/tasi/index?period=3mo
  - GET /api/v1/charts/tasi/index?period=invalid -> 400
  - GET /api/v1/charts/tasi/health
  - Response schema validation
"""

import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient


def _create_test_app() -> FastAPI:
    """Create a minimal FastAPI app with just the TASI router."""
    from api.routes.tasi_index import router

    app = FastAPI()
    app.include_router(router)
    return app


class TestTASIIndexEndpoint(unittest.TestCase):
    """Test GET /api/v1/charts/tasi/index."""

    @classmethod
    def setUpClass(cls):
        cls.app = _create_test_app()
        cls.client = TestClient(cls.app)

    def setUp(self):
        import services.tasi_index as mod
        mod._cache.clear()

    def test_default_period_returns_200(self):
        with patch.dict("sys.modules", {"yfinance": None}):
            resp = self.client.get("/api/v1/charts/tasi/index")

        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertEqual(body["period"], "1y")
        self.assertIn(body["source"], ("real", "mock", "cached"))

    def test_explicit_period_3mo(self):
        with patch.dict("sys.modules", {"yfinance": None}):
            resp = self.client.get("/api/v1/charts/tasi/index?period=3mo")

        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertEqual(body["period"], "3mo")

    def test_invalid_period_returns_400(self):
        resp = self.client.get("/api/v1/charts/tasi/index?period=invalid")
        self.assertEqual(resp.status_code, 400)
        body = resp.json()
        self.assertIn("detail", body)
        self.assertIn("invalid", body["detail"].lower())

    def test_response_has_all_required_fields(self):
        with patch.dict("sys.modules", {"yfinance": None}):
            resp = self.client.get("/api/v1/charts/tasi/index")

        body = resp.json()
        required_fields = {"data", "source", "last_updated", "symbol", "period", "count"}
        self.assertTrue(required_fields.issubset(body.keys()),
                        f"Missing fields: {required_fields - set(body.keys())}")

    def test_data_points_have_ohlcv_keys(self):
        with patch.dict("sys.modules", {"yfinance": None}):
            resp = self.client.get("/api/v1/charts/tasi/index")

        body = resp.json()
        self.assertGreater(body["count"], 0)
        self.assertEqual(body["count"], len(body["data"]))
        point = body["data"][0]
        for key in ("time", "open", "high", "low", "close", "volume"):
            self.assertIn(key, point)

    def test_count_matches_data_length(self):
        with patch.dict("sys.modules", {"yfinance": None}):
            resp = self.client.get("/api/v1/charts/tasi/index?period=1mo")

        body = resp.json()
        self.assertEqual(body["count"], len(body["data"]))

    def test_all_valid_periods_return_200(self):
        from services.tasi_index import VALID_PERIODS

        with patch.dict("sys.modules", {"yfinance": None}):
            for period in VALID_PERIODS:
                resp = self.client.get(f"/api/v1/charts/tasi/index?period={period}")
                self.assertEqual(resp.status_code, 200, f"Failed for period={period}")

    def test_response_content_type_is_json(self):
        with patch.dict("sys.modules", {"yfinance": None}):
            resp = self.client.get("/api/v1/charts/tasi/index")

        self.assertIn("application/json", resp.headers.get("content-type", ""))


class TestTASIHealthEndpoint(unittest.TestCase):
    """Test GET /api/v1/charts/tasi/health."""

    @classmethod
    def setUpClass(cls):
        cls.app = _create_test_app()
        cls.client = TestClient(cls.app)

    def setUp(self):
        import services.tasi_index as mod
        mod._cache.clear()

    def test_health_returns_200(self):
        resp = self.client.get("/api/v1/charts/tasi/health")
        self.assertEqual(resp.status_code, 200)

    def test_health_has_required_fields(self):
        """Sanitized health response exposes only status and message."""
        resp = self.client.get("/api/v1/charts/tasi/health")
        body = resp.json()
        required = {"status", "message"}
        self.assertTrue(required.issubset(body.keys()),
                        f"Missing: {required - set(body.keys())}")

    def test_health_does_not_expose_internals(self):
        """Sanitized health response must NOT leak infrastructure details."""
        resp = self.client.get("/api/v1/charts/tasi/health")
        body = resp.json()
        forbidden = {"yfinance_available", "cache_status", "cache_age_seconds",
                     "circuit_state", "consecutive_failures",
                     "circuit_open_remaining_seconds"}
        exposed = forbidden & set(body.keys())
        self.assertEqual(exposed, set(),
                         f"Health endpoint leaks internal fields: {exposed}")

    def test_health_status_ok_on_fresh_cache(self):
        # Populate cache by calling the index endpoint
        with patch.dict("sys.modules", {"yfinance": None}):
            self.client.get("/api/v1/charts/tasi/index")

        resp = self.client.get("/api/v1/charts/tasi/health")
        body = resp.json()
        self.assertEqual(body["status"], "ok")
        self.assertIn("normally", body["message"])

    def test_health_status_values(self):
        resp = self.client.get("/api/v1/charts/tasi/health")
        body = resp.json()
        self.assertIn(body["status"], ("ok", "degraded"))

    def test_health_message_is_string(self):
        resp = self.client.get("/api/v1/charts/tasi/health")
        body = resp.json()
        self.assertIsInstance(body["message"], str)
        self.assertGreater(len(body["message"]), 0)


class TestTASIResponseModels(unittest.TestCase):
    """Test Pydantic response model construction."""

    def test_ohlcv_point_model(self):
        from api.routes.tasi_index import TASIOHLCVPoint

        pt = TASIOHLCVPoint(
            time="2025-01-15",
            open=11500.0,
            high=11550.0,
            low=11480.0,
            close=11520.0,
            volume=150000000,
        )
        self.assertEqual(pt.time, "2025-01-15")
        self.assertEqual(pt.close, 11520.0)

    def test_index_response_model(self):
        from api.routes.tasi_index import TASIIndexResponse, TASIOHLCVPoint

        resp = TASIIndexResponse(
            data=[TASIOHLCVPoint(
                time="2025-01-15", open=11500.0, high=11550.0,
                low=11480.0, close=11520.0, volume=150000000,
            )],
            source="mock",
            last_updated="2025-01-15T12:00:00Z",
            symbol="^TASI",
            period="1y",
            count=1,
        )
        self.assertEqual(resp.count, 1)
        self.assertEqual(resp.source, "mock")

    def test_health_response_model(self):
        from api.routes.tasi_index import TASIHealthResponse

        resp = TASIHealthResponse(
            status="ok",
            message="TASI data pipeline operating normally.",
        )
        self.assertEqual(resp.status, "ok")
        self.assertIn("normally", resp.message)

    def test_health_response_model_degraded(self):
        from api.routes.tasi_index import TASIHealthResponse

        resp = TASIHealthResponse(
            status="degraded",
            message="Data source temporarily unavailable; serving cached data.",
        )
        self.assertEqual(resp.status, "degraded")
        self.assertIn("unavailable", resp.message)


if __name__ == "__main__":
    unittest.main()
