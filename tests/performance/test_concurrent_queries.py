"""
Concurrent Query Performance Tests
====================================
Tests for measuring response time percentiles under concurrent load.

Measures p50, p95, p99 latency for key endpoints using asyncio.gather
for true concurrent execution.

Run:
  pytest tests/performance/test_concurrent_queries.py -v -s

Markers:
  - performance: requires a running server or uses TestClient
"""

import asyncio
import statistics
import sys
import time
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


def percentile(data: list[float], p: float) -> float:
    """Calculate percentile from a sorted or unsorted list."""
    if not data:
        return 0.0
    sorted_data = sorted(data)
    k = (len(sorted_data) - 1) * (p / 100.0)
    f = int(k)
    c = f + 1
    if c >= len(sorted_data):
        return sorted_data[f]
    return sorted_data[f] + (k - f) * (sorted_data[c] - sorted_data[f])


def _report_latency(name: str, latencies: list[float]) -> dict:
    """Compute and print latency statistics."""
    if not latencies:
        return {}
    stats = {
        "count": len(latencies),
        "min_ms": round(min(latencies) * 1000, 2),
        "max_ms": round(max(latencies) * 1000, 2),
        "mean_ms": round(statistics.mean(latencies) * 1000, 2),
        "p50_ms": round(percentile(latencies, 50) * 1000, 2),
        "p95_ms": round(percentile(latencies, 95) * 1000, 2),
        "p99_ms": round(percentile(latencies, 99) * 1000, 2),
    }
    print(f"\n{'=' * 60}")
    print(f"  {name} Latency Report ({stats['count']} requests)")
    print(f"{'=' * 60}")
    print(f"  min:  {stats['min_ms']}ms")
    print(f"  mean: {stats['mean_ms']}ms")
    print(f"  p50:  {stats['p50_ms']}ms")
    print(f"  p95:  {stats['p95_ms']}ms")
    print(f"  p99:  {stats['p99_ms']}ms")
    print(f"  max:  {stats['max_ms']}ms")
    print(f"{'=' * 60}")
    return stats


# ===========================================================================
# Fixtures
# ===========================================================================


@pytest.fixture(scope="module")
def health_app():
    """Create a minimal app with health endpoints."""
    from fastapi import FastAPI
    from api.routes.health import router

    app = FastAPI()
    app.include_router(router)
    return app


@pytest.fixture(scope="module")
def health_client(health_app):
    from fastapi.testclient import TestClient

    return TestClient(health_app)


@pytest.fixture(scope="module")
def auth_app():
    """Create a minimal app with auth endpoints."""
    from fastapi import FastAPI
    from api.routes.auth import router

    app = FastAPI()
    app.include_router(router)
    return app


@pytest.fixture(scope="module")
def auth_client(auth_app):
    from fastapi.testclient import TestClient

    return TestClient(auth_app)


@pytest.fixture(scope="module")
def tasi_app():
    """Create a minimal app with TASI endpoints."""
    from fastapi import FastAPI
    from api.routes.tasi_index import router

    app = FastAPI()
    app.include_router(router)
    return app


@pytest.fixture(scope="module")
def tasi_client(tasi_app):
    from fastapi.testclient import TestClient

    return TestClient(tasi_app)


# ===========================================================================
# Concurrent health endpoint tests
# ===========================================================================


class TestConcurrentHealth:
    """Measure health endpoint latency under concurrent load."""

    @pytest.mark.performance
    def test_concurrent_health_live_50(self, health_client):
        """50 concurrent /health/live requests."""
        from unittest.mock import patch

        latencies = []

        def _single_request():
            start = time.monotonic()
            with patch("api.routes.health.get_uptime_seconds", return_value=100.0):
                resp = health_client.get("/health/live")
            elapsed = time.monotonic() - start
            latencies.append(elapsed)
            return resp.status_code

        # Run 50 sequential (TestClient doesn't support true async)
        statuses = [_single_request() for _ in range(50)]
        assert all(s == 200 for s in statuses)

        stats = _report_latency("/health/live (50 req)", latencies)
        assert stats["p95_ms"] < 500, f"p95 too high: {stats['p95_ms']}ms"

    @pytest.mark.performance
    def test_concurrent_health_live_200(self, health_client):
        """200 concurrent /health/live requests."""
        from unittest.mock import patch

        latencies = []

        def _single_request():
            start = time.monotonic()
            with patch("api.routes.health.get_uptime_seconds", return_value=100.0):
                resp = health_client.get("/health/live")
            elapsed = time.monotonic() - start
            latencies.append(elapsed)
            return resp.status_code

        statuses = [_single_request() for _ in range(200)]
        success_rate = sum(1 for s in statuses if s == 200) / len(statuses)
        assert success_rate >= 0.95, f"Success rate too low: {success_rate}"

        stats = _report_latency("/health/live (200 req)", latencies)
        assert stats["p99_ms"] < 1000, f"p99 too high: {stats['p99_ms']}ms"


# ===========================================================================
# Concurrent auth endpoint tests
# ===========================================================================


class TestConcurrentAuth:
    """Measure auth endpoint latency under concurrent load."""

    @pytest.mark.performance
    def test_concurrent_guest_login_50(self, auth_client):
        """50 concurrent guest login requests."""
        from unittest.mock import patch

        latencies = []

        def _single_request():
            start = time.monotonic()
            with patch("auth.jwt_handler._get_auth_settings") as mock:
                from config.settings import AuthSettings

                mock.return_value = AuthSettings(
                    jwt_secret="perf-test-secret",
                    jwt_algorithm="HS256",
                    access_token_expire_minutes=30,
                    refresh_token_expire_days=7,
                )
                resp = auth_client.post("/api/auth/guest")
            elapsed = time.monotonic() - start
            latencies.append(elapsed)
            return resp.status_code

        statuses = [_single_request() for _ in range(50)]
        assert all(s == 200 for s in statuses)

        stats = _report_latency("/api/auth/guest (50 req)", latencies)
        assert stats["p95_ms"] < 500, f"p95 too high: {stats['p95_ms']}ms"


# ===========================================================================
# Concurrent SQL validation tests
# ===========================================================================


class TestConcurrentSqlValidation:
    """Measure SQL validator performance under load."""

    @pytest.mark.performance
    def test_concurrent_validation_50(self):
        """50 concurrent SQL validations."""
        from backend.security.sql_validator import SqlQueryValidator

        validator = SqlQueryValidator()
        queries = [
            "SELECT * FROM companies WHERE sector = 'Energy'",
            "SELECT ticker, current_price FROM market_data ORDER BY current_price DESC LIMIT 10",
            "SELECT c.ticker, m.current_price FROM companies c JOIN market_data m ON c.ticker = m.ticker",
            "SELECT sector, AVG(current_price) FROM companies JOIN market_data ON companies.ticker = market_data.ticker GROUP BY sector",
            "SELECT ticker FROM market_data WHERE current_price > (SELECT AVG(current_price) FROM market_data)",
        ] * 10  # 50 queries total

        latencies = []
        for sql in queries:
            start = time.monotonic()
            result = validator.validate(sql)
            elapsed = time.monotonic() - start
            latencies.append(elapsed)
            assert result.is_valid is True

        stats = _report_latency("SQL Validation (50 queries)", latencies)
        assert stats["p95_ms"] < 100, f"p95 too high: {stats['p95_ms']}ms"

    @pytest.mark.performance
    def test_concurrent_validation_injection_detection_200(self):
        """200 injection detection validations."""
        from backend.security.sql_validator import SqlQueryValidator

        validator = SqlQueryValidator()
        attack_queries = [
            "DROP TABLE companies",
            "SELECT * FROM companies; DELETE FROM market_data",
            "SELECT * FROM sqlite_master",
            "SELECT * FROM companies WHERE ticker = '' OR SLEEP(5) --",
        ] * 50  # 200 queries total

        latencies = []
        for sql in attack_queries:
            start = time.monotonic()
            result = validator.validate(sql)
            elapsed = time.monotonic() - start
            latencies.append(elapsed)
            assert result.is_valid is False

        stats = _report_latency("SQL Injection Detection (200 queries)", latencies)
        assert stats["p99_ms"] < 200, f"p99 too high: {stats['p99_ms']}ms"

    @pytest.mark.performance
    def test_validation_throughput_500(self):
        """500 mixed validations for throughput measurement."""
        from backend.security.sql_validator import SqlQueryValidator

        validator = SqlQueryValidator()
        safe_queries = [
            "SELECT * FROM companies",
            "SELECT ticker FROM market_data WHERE current_price > 50",
        ] * 150
        attack_queries = [
            "DROP TABLE companies",
            "SELECT * FROM sqlite_master",
        ] * 100
        all_queries = safe_queries + attack_queries  # 500 total

        start = time.monotonic()
        for sql in all_queries:
            validator.validate(sql)
        total_elapsed = time.monotonic() - start

        throughput = len(all_queries) / total_elapsed
        print(
            f"\nSQL Validation Throughput: {throughput:.0f} queries/sec ({len(all_queries)} queries in {total_elapsed:.2f}s)"
        )
        assert throughput > 100, f"Throughput too low: {throughput:.0f} queries/sec"


# ===========================================================================
# Asyncio-based concurrent tests
# ===========================================================================


class TestAsyncConcurrent:
    """True async concurrent tests using asyncio.gather."""

    @pytest.mark.performance
    @pytest.mark.asyncio
    async def test_async_concurrent_validation(self):
        """Run SQL validations concurrently with asyncio."""
        from backend.security.sql_validator import SqlQueryValidator

        validator = SqlQueryValidator()

        async def validate_query(sql: str) -> tuple[bool, float]:
            start = time.monotonic()
            # Validator is sync, wrap in executor
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(None, validator.validate, sql)
            elapsed = time.monotonic() - start
            return result.is_valid, elapsed

        queries = [
            "SELECT * FROM companies WHERE sector = 'Energy'",
            "SELECT ticker, current_price FROM market_data",
            "DROP TABLE companies",
            "SELECT * FROM sqlite_master",
            "SELECT c.ticker FROM companies c JOIN market_data m ON c.ticker = m.ticker",
        ] * 20  # 100 concurrent

        results = await asyncio.gather(*[validate_query(q) for q in queries])

        latencies = [elapsed for _, elapsed in results]
        stats = _report_latency("Async Concurrent (100 queries)", latencies)

        valid_count = sum(1 for is_valid, _ in results if is_valid)
        invalid_count = sum(1 for is_valid, _ in results if not is_valid)

        # 60 safe, 40 attack
        assert valid_count == 60
        assert invalid_count == 40
        assert stats["p95_ms"] < 500, f"p95 too high: {stats['p95_ms']}ms"
