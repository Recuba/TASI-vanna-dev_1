"""
pytest-compatible Load Tests
==============================
Functional load tests using FastAPI TestClient (no Locust / no live server).

These tests are intentionally separate from test_load.py because Locust
applies gevent monkey-patching at module import time, which is incompatible
with the threading model used by FastAPI's TestClient.

Markers:
  @pytest.mark.performance  — excluded from normal CI runs
  @pytest.mark.slow         — excluded from normal CI runs

Run these explicitly:
  pytest tests/performance/test_load_pytest.py -v -m performance
"""

import sys
import time
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


# ---------------------------------------------------------------------------
# Shared minimal FastAPI app
# ---------------------------------------------------------------------------


def _make_minimal_app():
    """Build a minimal self-contained FastAPI app for load testing.

    Uses only inline route definitions (no real route module imports) so
    startup is instant and there are no external dependencies.
    """
    from fastapi import FastAPI

    app = FastAPI()

    @app.get("/health/live")
    async def health_live():
        return {"status": "alive", "uptime_seconds": 42.0}

    @app.get("/health/ready")
    async def health_ready():
        return {"status": "ready"}

    @app.get("/api/v1/news/feed")
    async def news_feed():
        return {"articles": [], "total": 0, "limit": 20, "offset": 0}

    @app.post("/api/v1/screener/search")
    async def screener_search(body: dict):
        return {"results": [], "total": 0}

    return app


@pytest.fixture(scope="module")
def load_client():
    from fastapi.testclient import TestClient

    app = _make_minimal_app()
    return TestClient(app)


# ---------------------------------------------------------------------------
# 1. Concurrent health checks (simulated sequential)
# ---------------------------------------------------------------------------


@pytest.mark.performance
@pytest.mark.slow
def test_concurrent_health_checks(load_client):
    """Simulate 30 repeated /health/live requests; all must return 200.

    Uses a minimal self-contained ASGI app so no external deps are required.
    Validates that sequential repeated requests complete within latency bounds.
    """
    n_requests = 30
    latencies = []

    for _ in range(n_requests):
        start = time.monotonic()
        resp = load_client.get("/health/live")
        elapsed_ms = (time.monotonic() - start) * 1000
        latencies.append(elapsed_ms)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        data = resp.json()
        assert data["status"] == "alive"

    mean_ms = sum(latencies) / len(latencies)
    max_ms = max(latencies)

    # In-process TestClient should complete well under 200ms per call
    assert mean_ms < 200, f"Mean latency too high: {mean_ms:.1f}ms"
    assert max_ms < 1000, f"Max latency too high: {max_ms:.1f}ms"


# ---------------------------------------------------------------------------
# 2. Concurrent news feed requests (simulated sequential)
# ---------------------------------------------------------------------------


@pytest.mark.performance
@pytest.mark.slow
def test_concurrent_news_feed_requests(load_client):
    """Simulate 20 repeated GET /api/v1/news/feed requests; all must return 200.

    Uses a minimal self-contained endpoint that returns an empty article list,
    exercising the ASGI stack without requiring a real news database.
    """
    n_requests = 20
    latencies = []

    for _ in range(n_requests):
        start = time.monotonic()
        resp = load_client.get("/api/v1/news/feed")
        elapsed_ms = (time.monotonic() - start) * 1000
        latencies.append(elapsed_ms)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        data = resp.json()
        assert "articles" in data

    mean_ms = sum(latencies) / len(latencies)
    assert mean_ms < 200, f"Mean news feed latency too high: {mean_ms:.1f}ms"


# ---------------------------------------------------------------------------
# 3. Concurrent screener queries (simulated sequential)
# ---------------------------------------------------------------------------


@pytest.mark.performance
@pytest.mark.slow
def test_concurrent_screener_queries(load_client):
    """Simulate 20 repeated POST /api/v1/screener/search requests.

    Uses a minimal self-contained endpoint for latency measurement.
    Validates that the ASGI stack handles repeated POST requests within bounds.
    """
    payload = {"filters": {}, "limit": 10, "offset": 0}

    n_requests = 20
    latencies = []

    for _ in range(n_requests):
        start = time.monotonic()
        resp = load_client.post("/api/v1/screener/search", json=payload)
        elapsed_ms = (time.monotonic() - start) * 1000
        latencies.append(elapsed_ms)
        assert resp.status_code == 200, (
            f"Unexpected status {resp.status_code}: {resp.text[:200]}"
        )
        data = resp.json()
        assert "results" in data

    mean_ms = sum(latencies) / len(latencies)
    assert mean_ms < 200, f"Mean screener latency too high: {mean_ms:.1f}ms"
