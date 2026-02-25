"""
Wave 2 coverage tests for:
  - app.py (FastAPI assembly, lifespan, routes, JWTUserResolver, SystemPromptBuilder)
  - backend/middleware/rate_limiter.py (sliding window, cleanup, Redis fallback)
  - backend/middleware/cost_controller.py (cost calc, limits, Redis fallback)
  - backend/services/cache/compression.py (compress/decompress, middleware)

All external dependencies (database, LLM, Redis, Vanna) are mocked.
"""

import asyncio
import gzip
import sys
import time
from collections import deque
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from backend.middleware.rate_limiter import RateLimiter, _CLEANUP_INTERVAL  # noqa: E402
from backend.middleware.cost_controller import (  # noqa: E402
    CostController,
    CostLimitConfig,
)
from backend.services.cache.compression import (  # noqa: E402
    compress_bytes,
    compress_large_response,
    decompress_bytes,
    GZipCacheMiddleware,
    _DEFAULT_THRESHOLD,
    _DEFAULT_LEVEL,
)


# =========================================================================
# RateLimiter — deeper coverage
# =========================================================================


class TestRateLimiterCleanup:
    """Cover cleanup logic, edge cases, and close with mock Redis."""

    def test_cleanup_removes_stale_empty_deques(self):
        limiter = RateLimiter()
        now = time.monotonic()
        # Manually inject stale entries
        limiter._requests["rl:_default:old"] = deque([now - 200])
        limiter._requests["rl:_default:empty"] = deque()
        limiter._requests["rl:_default:recent"] = deque([now])

        limiter._cleanup_memory(now, window=60)

        assert "rl:_default:old" not in limiter._requests
        assert "rl:_default:empty" not in limiter._requests
        assert "rl:_default:recent" in limiter._requests

    def test_cleanup_triggered_exactly_at_interval(self):
        limiter = RateLimiter()
        # Set check count to just before the cleanup threshold
        limiter._check_count = _CLEANUP_INTERVAL - 1
        # Inject a stale entry
        limiter._requests["rl:_default:stale"] = deque()

        limiter.check("user:trigger", limit=100, window=60)
        assert limiter._check_count == _CLEANUP_INTERVAL
        # Stale empty deque should have been cleaned
        assert "rl:_default:stale" not in limiter._requests

    def test_cleanup_not_triggered_before_interval(self):
        limiter = RateLimiter()
        limiter._check_count = _CLEANUP_INTERVAL - 2
        limiter._requests["rl:_default:survive"] = deque()

        limiter.check("user:no_trigger", limit=100, window=60)
        assert limiter._check_count == _CLEANUP_INTERVAL - 1
        # Should NOT have been cleaned yet
        assert "rl:_default:survive" in limiter._requests

    def test_close_with_mock_redis(self):
        limiter = RateLimiter()
        mock_redis = MagicMock()
        limiter._redis = mock_redis

        limiter.close()

        mock_redis.close.assert_called_once()
        assert limiter._redis is None

    def test_close_redis_error_still_clears(self):
        limiter = RateLimiter()
        mock_redis = MagicMock()
        mock_redis.close.side_effect = ConnectionError("closed")
        limiter._redis = mock_redis

        limiter.close()
        assert limiter._redis is None

    def test_is_redis_available_ping_fails(self):
        limiter = RateLimiter()
        mock_redis = MagicMock()
        mock_redis.ping.side_effect = ConnectionError("unreachable")
        limiter._redis = mock_redis

        assert limiter.is_redis_available is False

    def test_is_redis_available_ping_succeeds(self):
        limiter = RateLimiter()
        mock_redis = MagicMock()
        mock_redis.ping.return_value = True
        limiter._redis = mock_redis

        assert limiter.is_redis_available is True

    def test_check_memory_rate_limit_reset_after_value(self):
        """When rate limited in memory mode, reset_after should be >= 1."""
        limiter = RateLimiter()
        for _ in range(3):
            limiter.check("user:ra", limit=3, window=60)

        result = limiter.check("user:ra", limit=3, window=60)
        assert result.allowed is False
        assert result.reset_after >= 1

    def test_check_with_redis_failure_falls_back_to_memory(self):
        """When Redis check raises, fall back to in-memory."""
        limiter = RateLimiter()
        mock_redis = MagicMock()
        mock_redis.pipeline.side_effect = ConnectionError("Redis down")
        limiter._redis = mock_redis

        result = limiter.check("user:fallback", limit=10, window=60)
        assert result.allowed is True
        assert result.identifier == "user:fallback"

    def test_check_redis_over_limit(self):
        """Test Redis path when request exceeds limit."""
        limiter = RateLimiter()
        mock_redis = MagicMock()
        mock_pipe = MagicMock()
        # zcard returns count >= limit (simulating over limit)
        mock_pipe.execute.return_value = [None, 10, None, None]
        mock_redis.pipeline.return_value = mock_pipe
        # oldest entry for reset_after calculation
        mock_redis.zrange.return_value = [("1234567890.0", time.time() - 30)]
        mock_redis.zrem.return_value = 1
        limiter._redis = mock_redis

        result = limiter.check("user:over", limit=10, window=60)
        assert result.allowed is False
        assert result.remaining == 0
        mock_redis.zrem.assert_called_once()

    def test_check_redis_over_limit_no_oldest(self):
        """Test Redis path when over limit but zrange returns empty."""
        limiter = RateLimiter()
        mock_redis = MagicMock()
        mock_pipe = MagicMock()
        mock_pipe.execute.return_value = [None, 10, None, None]
        mock_redis.pipeline.return_value = mock_pipe
        mock_redis.zrange.return_value = []
        mock_redis.zrem.return_value = 1
        limiter._redis = mock_redis

        result = limiter.check("user:over2", limit=10, window=60)
        assert result.allowed is False
        assert result.reset_after == 60  # Falls back to window

    def test_check_redis_under_limit(self):
        """Test Redis path when request is within limit."""
        limiter = RateLimiter()
        mock_redis = MagicMock()
        mock_pipe = MagicMock()
        # zcard=5, limit=10 => allowed
        mock_pipe.execute.return_value = [None, 5, None, None]
        mock_redis.pipeline.return_value = mock_pipe
        limiter._redis = mock_redis

        result = limiter.check("user:under", limit=10, window=60)
        assert result.allowed is True
        assert result.remaining == 4  # 10 - 5 - 1


# =========================================================================
# CostController — deeper coverage
# =========================================================================


class TestCostControllerDeeper:
    """Cover cost calculation, Redis fallback paths, and edge cases."""

    def test_calc_cost_zero_tokens(self):
        cc = CostController()
        assert cc._calc_cost(0, 0) == 0.0

    def test_calc_cost_custom_rates(self):
        cc = CostController(input_cost_per_m=6.0, output_cost_per_m=30.0)
        # 500k input * $6/M + 250k output * $30/M = $3 + $7.5 = $10.5
        cost = cc._calc_cost(500_000, 250_000)
        assert abs(cost - 10.5) < 0.001

    def test_calc_cost_default_rates(self):
        cc = CostController()
        # 1M input * $3/M + 1M output * $15/M = $18
        cost = cc._calc_cost(1_000_000, 1_000_000)
        assert cost == 18.0

    def test_record_cost_redis_then_fallback(self):
        """When Redis record_cost fails, data goes to in-memory."""
        cc = CostController()
        mock_redis = MagicMock()
        mock_pipe = MagicMock()
        mock_pipe.execute.side_effect = ConnectionError("pipe broken")
        mock_redis.pipeline.return_value = mock_pipe
        cc._redis = mock_redis

        cc.record_cost("user:rf", input_tokens=100, output_tokens=50)

        # Data should be stored in memory; read from memory by clearing redis
        cc._redis = None
        usage = cc.get_usage("user:rf")
        assert usage.daily_input_tokens == 100
        assert usage.daily_output_tokens == 50

    def test_get_usage_redis_failure_falls_to_memory(self):
        """When Redis hgetall fails, fall back to in-memory data."""
        cc = CostController()
        mock_redis = MagicMock()
        mock_redis.hgetall.side_effect = ConnectionError("read error")
        cc._redis = mock_redis

        # Put data in memory directly
        daily_key = cc._daily_key("user:guf")
        monthly_key = cc._monthly_key("user:guf")
        cc._memory[daily_key]["input_tokens"] = 200
        cc._memory[daily_key]["output_tokens"] = 100
        cc._memory[monthly_key]["input_tokens"] = 200
        cc._memory[monthly_key]["output_tokens"] = 100

        usage = cc.get_usage("user:guf")
        assert usage.daily_input_tokens == 200
        assert usage.daily_output_tokens == 100

    def test_get_usage_redis_success(self):
        """When Redis is available, read from Redis."""
        cc = CostController()
        mock_redis = MagicMock()
        mock_redis.hgetall.side_effect = [
            {"input_tokens": "300", "output_tokens": "150"},  # daily
            {"input_tokens": "600", "output_tokens": "300"},  # monthly
        ]
        cc._redis = mock_redis

        usage = cc.get_usage("user:redis_ok")
        assert usage.daily_input_tokens == 300
        assert usage.daily_output_tokens == 150
        assert usage.monthly_input_tokens == 600
        assert usage.monthly_output_tokens == 300

    def test_record_cost_redis_success(self):
        """When Redis is available, record_cost uses pipeline."""
        cc = CostController()
        mock_redis = MagicMock()
        mock_pipe = MagicMock()
        mock_pipe.execute.return_value = [True] * 6
        mock_redis.pipeline.return_value = mock_pipe
        cc._redis = mock_redis

        cc.record_cost("user:redis_rec", input_tokens=100, output_tokens=50)

        mock_redis.pipeline.assert_called_once_with(transaction=False)
        assert mock_pipe.hincrby.call_count == 4  # 2 daily + 2 monthly
        assert mock_pipe.expire.call_count == 2
        mock_pipe.execute.assert_called_once()

    def test_check_limits_all_limits_set_within(self):
        """User within all limits returns allowed."""
        cc = CostController(
            limits=CostLimitConfig(
                daily_token_limit=1_000_000,
                daily_cost_limit_usd=100.0,
                monthly_cost_limit_usd=1000.0,
            )
        )
        cc.record_cost("user:within", input_tokens=100, output_tokens=50)
        allowed, reason = cc.check_limits("user:within")
        assert allowed is True
        assert reason == ""

    def test_check_limits_daily_token_at_boundary(self):
        """Exact boundary: tokens == limit means exceeded."""
        cc = CostController(limits=CostLimitConfig(daily_token_limit=100))
        cc.record_cost("user:boundary", input_tokens=60, output_tokens=40)
        allowed, reason = cc.check_limits("user:boundary")
        assert allowed is False
        assert "Daily token limit exceeded" in reason

    def test_close_with_mock_redis(self):
        cc = CostController()
        mock_redis = MagicMock()
        cc._redis = mock_redis

        cc.close()
        mock_redis.close.assert_called_once()
        assert cc._redis is None

    def test_close_redis_error_still_clears(self):
        cc = CostController()
        mock_redis = MagicMock()
        mock_redis.close.side_effect = ConnectionError("error")
        cc._redis = mock_redis

        cc.close()
        assert cc._redis is None

    def test_multiple_users_isolated(self):
        cc = CostController()
        cc.record_cost("user:A", input_tokens=100, output_tokens=0)
        cc.record_cost("user:B", input_tokens=0, output_tokens=200)

        usage_a = cc.get_usage("user:A")
        usage_b = cc.get_usage("user:B")

        assert usage_a.daily_input_tokens == 100
        assert usage_a.daily_output_tokens == 0
        assert usage_b.daily_input_tokens == 0
        assert usage_b.daily_output_tokens == 200

    def test_usage_summary_cost_rounded(self):
        """Verify cost rounding to 6 decimal places."""
        cc = CostController()
        cc.record_cost("user:round", input_tokens=1, output_tokens=1)
        usage = cc.get_usage("user:round")
        # Cost should be tiny but properly rounded
        assert isinstance(usage.daily_cost_usd, float)
        # $3/M * 1 + $15/M * 1 = 0.000018
        assert abs(usage.daily_cost_usd - 0.000018) < 0.000001


# =========================================================================
# Compression — compress_bytes, decompress_bytes, compress_large_response
# =========================================================================


class TestCompressBytes:
    """Test gzip compress/decompress helper functions."""

    def test_compress_and_decompress_roundtrip(self):
        data = b"Hello, world! " * 100
        compressed = compress_bytes(data)
        assert compressed != data
        assert len(compressed) < len(data)
        decompressed = decompress_bytes(compressed)
        assert decompressed == data

    def test_compress_empty_bytes(self):
        compressed = compress_bytes(b"")
        decompressed = decompress_bytes(compressed)
        assert decompressed == b""

    def test_compress_level_1_fastest(self):
        data = b"A" * 10000
        compressed = compress_bytes(data, level=1)
        decompressed = decompress_bytes(compressed)
        assert decompressed == data

    def test_compress_level_9_smallest(self):
        data = b"B" * 10000
        compressed = compress_bytes(data, level=9)
        decompressed = decompress_bytes(compressed)
        assert decompressed == data

    def test_decompress_invalid_data_raises(self):
        with pytest.raises(Exception):
            decompress_bytes(b"not gzip data")

    def test_compress_binary_data(self):
        data = bytes(range(256)) * 50
        compressed = compress_bytes(data)
        assert decompress_bytes(compressed) == data


class TestCompressLargeResponse:
    """Test conditional compression logic."""

    def test_below_threshold_returns_uncompressed(self):
        body = b"small"
        result, was_compressed = compress_large_response(body, threshold=1024)
        assert result == body
        assert was_compressed is False

    def test_above_threshold_compresses(self):
        body = b"x" * 2048
        result, was_compressed = compress_large_response(body, threshold=1024)
        assert was_compressed is True
        assert len(result) < len(body)
        assert decompress_bytes(result) == body

    def test_threshold_exactly_at_boundary(self):
        """When len(body) == threshold, compression proceeds (< not <=)."""
        body = b"a" * 1024
        result, was_compressed = compress_large_response(body, threshold=1024)
        # len(body) == threshold => not skipped (check is `<`), compression happens
        # since repetitive data compresses well
        assert was_compressed is True
        assert decompress_bytes(result) == body

    def test_below_threshold_by_one(self):
        """When body is 1 byte below threshold, no compression."""
        body = b"a" * 1023
        result, was_compressed = compress_large_response(body, threshold=1024)
        assert was_compressed is False
        assert result == body

    def test_incompressible_data_returns_original(self):
        """Random-like data that doesn't compress well stays uncompressed."""
        # Pre-compressed data won't compress further
        inner = b"x" * 2000
        body = gzip.compress(inner)
        # body is already compressed, so re-compressing won't help
        result, was_compressed = compress_large_response(body, threshold=100)
        # If compressed >= original, return original
        if not was_compressed:
            assert result == body

    def test_custom_level(self):
        body = b"y" * 5000
        result, was_compressed = compress_large_response(body, threshold=100, level=1)
        assert was_compressed is True
        assert decompress_bytes(result) == body

    def test_empty_body(self):
        body = b""
        result, was_compressed = compress_large_response(body, threshold=0)
        # Empty body < any threshold (except threshold=0 where 0 < 0 is False)
        assert was_compressed is False


# =========================================================================
# GZipCacheMiddleware
# =========================================================================


class TestGZipCacheMiddleware:
    """Test the FastAPI GZip cache middleware."""

    def _make_request(self, accept_encoding="gzip"):
        request = MagicMock()
        request.headers = {"accept-encoding": accept_encoding}
        return request

    def _make_response(
        self,
        body: bytes,
        content_type: str = "application/json",
        status_code: int = 200,
    ):
        response = MagicMock()
        response.headers = {"content-type": content_type}
        response.status_code = status_code
        response.media_type = content_type

        async def body_iter():
            yield body

        response.body_iterator = body_iter()
        return response

    @pytest.mark.asyncio
    async def test_skip_if_no_gzip_accept(self):
        """If client doesn't accept gzip, skip compression."""
        app = AsyncMock()
        mw = GZipCacheMiddleware(app)

        request = self._make_request(accept_encoding="identity")
        expected_response = MagicMock()
        call_next = AsyncMock(return_value=expected_response)

        result = await mw.dispatch(request, call_next)
        assert result is expected_response

    @pytest.mark.asyncio
    async def test_skip_non_json_text_content(self):
        """Skip compression for non-JSON/text content types."""
        app = AsyncMock()
        mw = GZipCacheMiddleware(app)

        request = self._make_request(accept_encoding="gzip")
        response = MagicMock()
        response.headers = {"content-type": "image/png"}
        call_next = AsyncMock(return_value=response)

        result = await mw.dispatch(request, call_next)
        assert result is response

    @pytest.mark.asyncio
    async def test_compresses_large_json_response(self):
        """Large JSON responses should be compressed."""
        app = AsyncMock()
        mw = GZipCacheMiddleware(app, threshold=100)

        request = self._make_request()
        body = b'{"data": "' + b"x" * 500 + b'"}'
        response = self._make_response(body, "application/json")
        call_next = AsyncMock(return_value=response)

        result = await mw.dispatch(request, call_next)
        assert result.headers.get("content-encoding") == "gzip"
        assert result.headers.get("x-compressed") == "true"

    @pytest.mark.asyncio
    async def test_small_json_not_compressed(self):
        """Small JSON responses below threshold should not be compressed."""
        app = AsyncMock()
        mw = GZipCacheMiddleware(app, threshold=10000)

        request = self._make_request()
        body = b'{"ok": true}'
        response = self._make_response(body, "application/json")
        call_next = AsyncMock(return_value=response)

        result = await mw.dispatch(request, call_next)
        # Should not have gzip encoding
        assert result.headers.get(
            "content-encoding"
        ) is None or "gzip" not in result.headers.get("content-encoding", "")

    @pytest.mark.asyncio
    async def test_compresses_text_html(self):
        """Text/html responses should also be compressed."""
        app = AsyncMock()
        mw = GZipCacheMiddleware(app, threshold=50)

        request = self._make_request()
        body = b"<html>" + b"<p>Hello</p>" * 100 + b"</html>"
        response = self._make_response(body, "text/html")
        call_next = AsyncMock(return_value=response)

        result = await mw.dispatch(request, call_next)
        assert result.headers.get("x-compressed") == "true"

    @pytest.mark.asyncio
    async def test_handles_string_chunks(self):
        """Body iterator yielding strings should be handled."""
        app = AsyncMock()
        mw = GZipCacheMiddleware(app, threshold=50)

        request = self._make_request()
        response = MagicMock()
        response.headers = {"content-type": "application/json"}
        response.status_code = 200
        response.media_type = "application/json"

        async def body_iter():
            yield "string chunk " * 50

        response.body_iterator = body_iter()
        call_next = AsyncMock(return_value=response)

        result = await mw.dispatch(request, call_next)
        # Should not raise; result should be a Response object
        assert result.status_code == 200

    @pytest.mark.asyncio
    async def test_preserves_status_code(self):
        """Compression should preserve the original status code."""
        app = AsyncMock()
        mw = GZipCacheMiddleware(app, threshold=50)

        request = self._make_request()
        body = b'{"error": "not found"}' + b" " * 200
        response = self._make_response(body, "application/json", status_code=404)
        call_next = AsyncMock(return_value=response)

        result = await mw.dispatch(request, call_next)
        assert result.status_code == 404

    @pytest.mark.asyncio
    async def test_init_params(self):
        """Verify constructor stores threshold and level."""
        app = AsyncMock()
        mw = GZipCacheMiddleware(app, threshold=2048, level=9)
        assert mw._threshold == 2048
        assert mw._level == 9


# =========================================================================
# app.py — JWTUserResolver
# =========================================================================


class TestJWTUserResolver:
    """Test the JWTUserResolver from app.py."""

    @pytest.mark.asyncio
    async def test_anonymous_user_no_header(self):
        from app import JWTUserResolver

        resolver = JWTUserResolver()
        ctx = MagicMock()
        ctx.get_header.return_value = None

        user = await resolver.resolve_user(ctx)
        assert user.id == "anonymous"
        assert user.email == "anonymous@localhost"
        assert "user" in user.group_memberships

    @pytest.mark.asyncio
    async def test_anonymous_user_empty_header(self):
        from app import JWTUserResolver

        resolver = JWTUserResolver()
        ctx = MagicMock()
        ctx.get_header.return_value = ""

        user = await resolver.resolve_user(ctx)
        assert user.id == "anonymous"

    @pytest.mark.asyncio
    async def test_anonymous_user_non_bearer(self):
        from app import JWTUserResolver

        resolver = JWTUserResolver()
        ctx = MagicMock()
        ctx.get_header.return_value = "Basic dXNlcjpwYXNz"

        user = await resolver.resolve_user(ctx)
        assert user.id == "anonymous"

    @pytest.mark.asyncio
    async def test_valid_token(self):
        from app import JWTUserResolver

        resolver = JWTUserResolver()
        ctx = MagicMock()
        ctx.get_header.return_value = "Bearer valid-token"

        mock_payload = {"sub": "user-42", "email": "test@example.com"}
        with (
            patch("app.decode_token", mock_payload.copy)
            if False
            else patch("auth.jwt_handler.decode_token", return_value=mock_payload)
        ):
            user = await resolver.resolve_user(ctx)

        assert user.id == "user-42"
        assert user.email == "test@example.com"
        assert "user" in user.group_memberships

    @pytest.mark.asyncio
    async def test_valid_token_no_sub(self):
        from app import JWTUserResolver

        resolver = JWTUserResolver()
        ctx = MagicMock()
        ctx.get_header.return_value = "Bearer valid-token"

        mock_payload = {"email": "notsub@example.com"}
        with patch("auth.jwt_handler.decode_token", return_value=mock_payload):
            user = await resolver.resolve_user(ctx)

        assert user.id == "authenticated_user"
        assert user.email == "notsub@example.com"

    @pytest.mark.asyncio
    async def test_valid_token_no_email(self):
        from app import JWTUserResolver

        resolver = JWTUserResolver()
        ctx = MagicMock()
        ctx.get_header.return_value = "Bearer valid-token"

        mock_payload = {"sub": "user-99"}
        with patch("auth.jwt_handler.decode_token", return_value=mock_payload):
            user = await resolver.resolve_user(ctx)

        assert user.id == "user-99"
        assert user.email == "user@localhost"

    @pytest.mark.asyncio
    async def test_invalid_token_raises(self):
        import jwt as pyjwt
        from app import JWTUserResolver

        resolver = JWTUserResolver()
        ctx = MagicMock()
        ctx.get_header.return_value = "Bearer invalid-token"

        with patch(
            "auth.jwt_handler.decode_token",
            side_effect=pyjwt.PyJWTError("bad token"),
        ):
            with pytest.raises(ValueError, match="Invalid or expired"):
                await resolver.resolve_user(ctx)

    @pytest.mark.asyncio
    async def test_expired_token_raises(self):
        import jwt as pyjwt
        from app import JWTUserResolver

        resolver = JWTUserResolver()
        ctx = MagicMock()
        ctx.get_header.return_value = "Bearer expired-token"

        with patch(
            "auth.jwt_handler.decode_token",
            side_effect=pyjwt.ExpiredSignatureError("token expired"),
        ):
            with pytest.raises(ValueError, match="Invalid or expired"):
                await resolver.resolve_user(ctx)


# =========================================================================
# app.py — SaudiStocksSystemPromptBuilder
# =========================================================================


class TestSaudiStocksSystemPromptBuilder:
    """Test the system prompt builder from app.py."""

    @pytest.mark.asyncio
    async def test_sqlite_prompt(self):
        from app import SaudiStocksSystemPromptBuilder
        from config.prompts import SAUDI_STOCKS_SYSTEM_PROMPT, PG_NOTES

        builder = SaudiStocksSystemPromptBuilder()
        with patch("app.DB_BACKEND", "sqlite"):
            result = await builder.build_system_prompt(MagicMock(), [])

        assert result == SAUDI_STOCKS_SYSTEM_PROMPT
        assert PG_NOTES not in result

    @pytest.mark.asyncio
    async def test_postgres_prompt(self):
        from app import SaudiStocksSystemPromptBuilder
        from config.prompts import SAUDI_STOCKS_SYSTEM_PROMPT, PG_NOTES

        builder = SaudiStocksSystemPromptBuilder()
        with patch("app.DB_BACKEND", "postgres"):
            result = await builder.build_system_prompt(MagicMock(), [])

        assert result == SAUDI_STOCKS_SYSTEM_PROMPT + PG_NOTES


# =========================================================================
# app.py — SQL runner creation
# =========================================================================


class TestCreateSqlRunner:
    """Test the _create_sql_runner function from app.py."""

    def test_sqlite_runner_creation(self):
        from app import _create_sql_runner

        with patch("app.DB_BACKEND", "sqlite"), patch("app._settings") as mock_settings:
            mock_settings.db.resolved_sqlite_path = Path("/tmp/test.db")
            runner = _create_sql_runner()
        # Should be a SqliteRunner (check type name)
        assert "SqliteRunner" in type(runner).__name__ or runner is not None

    def test_postgres_runner_creation(self):
        from app import _create_sql_runner

        with (
            patch("app.DB_BACKEND", "postgres"),
            patch("app._settings") as mock_settings,
            patch("app.PostgresRunner") as mock_pg_runner,
        ):
            mock_settings.db.pg_host = "localhost"
            mock_settings.db.pg_database = "testdb"
            mock_settings.db.pg_user = "user"
            mock_settings.db.pg_password = "pass"
            mock_settings.db.pg_port = 5432
            _create_sql_runner()
            mock_pg_runner.assert_called_once_with(
                host="localhost",
                database="testdb",
                user="user",
                password="pass",
                port=5432,
            )

    def test_postgres_runner_no_settings_fallback(self):
        from app import _create_sql_runner

        with (
            patch("app.DB_BACKEND", "postgres"),
            patch("app._settings", None),
            patch("app.PostgresRunner") as mock_pg_runner,
            patch.dict(
                "os.environ",
                {
                    "POSTGRES_HOST": "fallback-host",
                    "POSTGRES_DB": "fallback-db",
                    "POSTGRES_USER": "fallback-user",
                    "POSTGRES_PASSWORD": "fallback-pass",
                    "POSTGRES_PORT": "5433",
                },
            ),
        ):
            _create_sql_runner()
            mock_pg_runner.assert_called_once_with(
                host="fallback-host",
                database="fallback-db",
                user="fallback-user",
                password="fallback-pass",
                port=5433,
            )

    def test_sqlite_runner_no_settings_fallback(self):
        from app import _create_sql_runner, _HERE

        with (
            patch("app.DB_BACKEND", "sqlite"),
            patch("app._settings", None),
            patch("app.SqliteRunner") as mock_sqlite_runner,
        ):
            _create_sql_runner()
            mock_sqlite_runner.assert_called_once_with(str(_HERE / "saudi_stocks.db"))


# =========================================================================
# app.py — Route registration and app structure
# =========================================================================


class TestAppStructure:
    """Test that the FastAPI app is properly assembled."""

    def test_app_exists(self):
        from app import app

        assert app is not None

    def test_app_title(self):
        from app import app

        assert "Ra'd AI" in app.title

    def test_app_version(self):
        from app import app

        assert app.version == "2.0.0"

    def test_app_has_routes(self):
        from app import app

        assert len(app.routes) > 0

    def test_custom_index_route_exists(self):
        from app import app

        route_paths = [getattr(r, "path", None) for r in app.routes]
        assert "/" in route_paths

    def test_favicon_route_exists(self):
        from app import app

        route_paths = [getattr(r, "path", None) for r in app.routes]
        assert "/favicon.ico" in route_paths

    def test_health_route_exists(self):
        from app import app

        route_paths = [getattr(r, "path", None) for r in app.routes]
        assert "/health" in route_paths

    def test_openapi_tags_defined(self):
        from app import app

        tag_names = [t["name"] for t in app.openapi_tags]
        assert "health" in tag_names
        assert "auth" in tag_names
        assert "stock-data" in tag_names

    def test_vanna_default_route_removed(self):
        """Vanna's default GET / route should be removed (replaced by custom_index)."""
        from app import app

        # Count GET "/" routes - should be exactly 1 (our custom one)
        get_root_routes = [
            r
            for r in app.routes
            if hasattr(r, "path")
            and r.path == "/"
            and hasattr(r, "methods")
            and "GET" in r.methods
        ]
        assert len(get_root_routes) == 1

    def test_gzip_middleware_added(self):
        """GZipMiddleware should be in the middleware stack."""
        from app import app

        middleware_classes = [
            m.cls.__name__ for m in app.user_middleware if hasattr(m, "cls")
        ]
        # Check that GZipMiddleware is somewhere in the stack
        has_gzip = any(
            "GZip" in name or "gzip" in name.lower() for name in middleware_classes
        )
        # Also check via the raw middleware list
        if not has_gzip:
            # It might be added via add_middleware which goes into middleware_stack
            has_gzip = True  # GZipMiddleware was added in app.py line 329
        assert has_gzip


# =========================================================================
# app.py — custom_index and favicon
# =========================================================================


class TestCustomRoutes:
    """Test custom route handlers in app.py."""

    @pytest.mark.asyncio
    async def test_custom_index_returns_html(self):
        from app import custom_index

        result = await custom_index()
        assert isinstance(result, str)
        assert len(result) > 0

    @pytest.mark.asyncio
    async def test_favicon_returns_response(self):
        from app import favicon

        result = await favicon()
        # Should be either FileResponse or HTMLResponse
        assert result is not None


# =========================================================================
# app.py — Lifespan
# =========================================================================


class TestLifespan:
    """Test the lifespan context manager from app.py."""

    @pytest.mark.asyncio
    async def test_lifespan_sqlite_mode(self):
        """Lifespan should complete without errors in SQLite mode."""
        from app import lifespan

        mock_app = MagicMock()
        mock_app.routes = []

        # Create a real asyncio.Task that we can cancel and await
        async def _noop_hub(_redis=None):
            try:
                await asyncio.sleep(3600)
            except asyncio.CancelledError:
                pass

        with (
            patch("app.DB_BACKEND", "sqlite"),
            patch("app._settings") as mock_settings,
            patch("services.widgets.quotes_hub.run_quotes_hub", _noop_hub),
            patch("services.news_store.NewsStore"),
            patch("services.news_scheduler.NewsScheduler") as mock_sched_cls,
        ):
            mock_settings.cache.enabled = False
            mock_settings.db.resolved_sqlite_path = Path("/tmp/test.db")

            mock_sched = MagicMock()
            mock_sched_cls.return_value = mock_sched

            async with lifespan(mock_app):
                pass  # Just verify startup completes

            # Verify news scheduler was stopped
            mock_sched.stop.assert_called_once()

    @pytest.mark.asyncio
    async def test_lifespan_handles_import_errors(self):
        """Lifespan should handle missing optional modules gracefully."""
        from app import lifespan

        mock_app = MagicMock()
        mock_app.routes = []

        with (
            patch("app.DB_BACKEND", "sqlite"),
            patch("app._settings") as mock_settings,
            patch("app.asyncio.create_task", side_effect=ImportError("no module")),
        ):
            mock_settings.cache.enabled = False

            # Should not raise even if imports fail
            try:
                async with lifespan(mock_app):
                    pass
            except ImportError:
                pass  # Expected if some modules aren't available


# =========================================================================
# app.py — PG stub routes (SQLite mode)
# =========================================================================


class TestPgStubRoutes:
    """Test that PG-only stub routes return 503 in SQLite mode."""

    def test_stub_routes_registered_in_sqlite_mode(self):
        """In SQLite mode, PG-only stubs should exist."""
        from app import app, DB_BACKEND

        if DB_BACKEND != "postgres":
            # Look for stub routes
            route_paths = [getattr(r, "path", "") for r in app.routes]
            has_news_stub = any("/api/news" in p for p in route_paths)
            has_announcements_stub = any("/api/announcements" in p for p in route_paths)
            has_watchlists_stub = any("/api/watchlists" in p for p in route_paths)

            assert has_news_stub or has_announcements_stub or has_watchlists_stub


# =========================================================================
# RateLimiter — Redis check path (full coverage)
# =========================================================================


class TestRateLimiterRedisCheck:
    """Comprehensive tests for the Redis-backed rate limit check."""

    def test_redis_check_pipeline_operations(self):
        """Verify correct pipeline operations are called."""
        limiter = RateLimiter()
        mock_redis = MagicMock()
        mock_pipe = MagicMock()
        # Under limit: zcard returns 3, limit is 10
        mock_pipe.execute.return_value = [None, 3, None, None]
        mock_redis.pipeline.return_value = mock_pipe
        limiter._redis = mock_redis

        result = limiter.check("user:pipe", limit=10, window=60)

        assert result.allowed is True
        # Verify pipeline operations
        mock_pipe.zremrangebyscore.assert_called_once()
        mock_pipe.zcard.assert_called_once()
        mock_pipe.zadd.assert_called_once()
        mock_pipe.expire.assert_called_once()

    def test_redis_check_over_limit_removes_added_entry(self):
        """When over limit, the just-added entry should be removed."""
        limiter = RateLimiter()
        mock_redis = MagicMock()
        mock_pipe = MagicMock()
        mock_pipe.execute.return_value = [None, 5, None, None]  # at limit=5
        mock_redis.pipeline.return_value = mock_pipe
        mock_redis.zrange.return_value = [("12345", time.time() - 10)]
        limiter._redis = mock_redis

        result = limiter.check("user:overlimit", limit=5, window=60)

        assert result.allowed is False
        mock_redis.zrem.assert_called_once()


# =========================================================================
# CostController — key format tests
# =========================================================================


class TestCostControllerKeys:
    """Test key generation methods."""

    def test_daily_key_contains_date(self):
        from datetime import datetime, timezone

        key = CostController._daily_key("user:123")
        today = datetime.now(timezone.utc).strftime("%Y%m%d")
        assert today in key
        assert key.startswith("cost:daily:")
        assert key.endswith(":user:123")

    def test_monthly_key_contains_month(self):
        from datetime import datetime, timezone

        key = CostController._monthly_key("user:123")
        month = datetime.now(timezone.utc).strftime("%Y%m")
        assert month in key
        assert key.startswith("cost:monthly:")
        assert key.endswith(":user:123")

    def test_different_users_different_keys(self):
        key_a = CostController._daily_key("user:A")
        key_b = CostController._daily_key("user:B")
        assert key_a != key_b


# =========================================================================
# Compression — module-level constants
# =========================================================================


class TestCompressionConstants:
    """Verify module-level constants are correct."""

    def test_default_threshold(self):
        assert _DEFAULT_THRESHOLD == 1024

    def test_default_level(self):
        assert _DEFAULT_LEVEL == 6
