"""
Tests for backend/middleware/ module.
Covers: cost_controller, rate_limiter, rate_limit_config, rate_limit_middleware,
        models, register, and __init__ exports.
"""

import sys
import time
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from backend.middleware.cost_controller import (  # noqa: E402
    CostController,
    CostLimitConfig,
    UsageSummary,
)
from backend.middleware.models import RateLimitResult  # noqa: E402
from backend.middleware.rate_limit_config import (  # noqa: E402
    EndpointRateLimit,
    RateLimitConfig,
)
from backend.middleware.rate_limit_middleware import RateLimitMiddleware  # noqa: E402
from backend.middleware.rate_limiter import RateLimiter  # noqa: E402
from backend.middleware.register import (  # noqa: E402
    get_cost_controller,
    get_rate_limiter,
    register_middleware,
    shutdown_middleware,
)


# ---------------------------------------------------------------------------
# Models


class TestRateLimitResult:
    """Tests for the RateLimitResult Pydantic model."""

    def test_create_allowed_result(self):
        result = RateLimitResult(
            allowed=True,
            limit=60,
            remaining=59,
            reset_after=60,
            identifier="user:123",
            bucket="_default",
        )
        assert result.allowed is True
        assert result.limit == 60
        assert result.remaining == 59
        assert result.reset_after == 60
        assert result.identifier == "user:123"
        assert result.bucket == "_default"

    def test_create_denied_result(self):
        result = RateLimitResult(
            allowed=False,
            limit=10,
            remaining=0,
            reset_after=30,
            identifier="ip:192.168.1.1",
            bucket="/api/auth",
        )
        assert result.allowed is False
        assert result.remaining == 0

    def test_default_bucket(self):
        result = RateLimitResult(
            allowed=True,
            limit=60,
            remaining=59,
            reset_after=60,
            identifier="ip:10.0.0.1",
        )
        assert result.bucket == "_default"

    def test_remaining_cannot_be_negative(self):
        with pytest.raises(Exception):
            RateLimitResult(
                allowed=True,
                limit=60,
                remaining=-1,
                reset_after=60,
                identifier="u",
            )

    def test_reset_after_cannot_be_negative(self):
        with pytest.raises(Exception):
            RateLimitResult(
                allowed=True,
                limit=60,
                remaining=0,
                reset_after=-5,
                identifier="u",
            )


# ---------------------------------------------------------------------------
# RateLimiter (in-memory mode)
# ---------------------------------------------------------------------------


class TestRateLimiterInMemory:
    """Tests for RateLimiter using in-memory backend (no Redis)."""

    def test_init_no_redis(self):
        limiter = RateLimiter(redis_url=None)
        assert limiter._redis is None
        assert limiter.is_redis_available is False

    def test_first_request_allowed(self):
        limiter = RateLimiter()
        result = limiter.check("user:1", limit=5, window=60)
        assert result.allowed is True
        assert result.remaining == 4
        assert result.identifier == "user:1"

    def test_requests_within_limit(self):
        limiter = RateLimiter()
        for i in range(5):
            result = limiter.check("user:2", limit=5, window=60)
        assert result.allowed is True
        assert result.remaining == 0

    def test_request_exceeds_limit(self):
        limiter = RateLimiter()
        for _ in range(5):
            limiter.check("user:3", limit=5, window=60)
        result = limiter.check("user:3", limit=5, window=60)
        assert result.allowed is False
        assert result.remaining == 0
        assert result.reset_after >= 1

    def test_different_identifiers_isolated(self):
        limiter = RateLimiter()
        for _ in range(5):
            limiter.check("user:a", limit=5, window=60)
        # user:a is exhausted
        result_a = limiter.check("user:a", limit=5, window=60)
        assert result_a.allowed is False
        # user:b is fresh
        result_b = limiter.check("user:b", limit=5, window=60)
        assert result_b.allowed is True

    def test_different_buckets_isolated(self):
        limiter = RateLimiter()
        for _ in range(3):
            limiter.check("user:x", limit=3, window=60, bucket="api")
        result_api = limiter.check("user:x", limit=3, window=60, bucket="api")
        assert result_api.allowed is False
        # Different bucket is fresh
        result_auth = limiter.check("user:x", limit=3, window=60, bucket="auth")
        assert result_auth.allowed is True

    def test_window_expiry(self):
        limiter = RateLimiter()
        # Fill up the limit
        for _ in range(3):
            limiter.check("user:expire", limit=3, window=1)
        result = limiter.check("user:expire", limit=3, window=1)
        assert result.allowed is False

        # Wait for window to expire
        time.sleep(1.1)
        result = limiter.check("user:expire", limit=3, window=1)
        assert result.allowed is True

    def test_cleanup_runs_at_interval(self):
        limiter = RateLimiter()
        limiter._check_count = 499  # next check triggers cleanup
        # Add a stale entry manually
        limiter._requests["rl:_default:stale"] = MagicMock()
        limiter._requests["rl:_default:stale"].__bool__ = MagicMock(return_value=False)
        limiter._requests["rl:_default:stale"].__len__ = MagicMock(return_value=0)
        limiter._requests["rl:_default:stale"].__getitem__ = MagicMock(return_value=0)

        result = limiter.check("user:cleanup", limit=100, window=60)
        assert result.allowed is True
        assert limiter._check_count == 500

    def test_close_without_redis(self):
        limiter = RateLimiter()
        # Should not raise
        limiter.close()
        assert limiter._redis is None

    def test_redis_init_failure_falls_back_to_memory(self):
        limiter = RateLimiter(redis_url="redis://invalid-host:9999/1")
        assert limiter._redis is None
        assert limiter.is_redis_available is False
        # Should still work via in-memory
        result = limiter.check("user:fallback", limit=10, window=60)
        assert result.allowed is True


# ---------------------------------------------------------------------------
# CostController (in-memory mode)
# ---------------------------------------------------------------------------


class TestUsageSummary:
    """Tests for the UsageSummary model."""

    def test_defaults(self):
        s = UsageSummary(user_id="u1")
        assert s.daily_input_tokens == 0
        assert s.daily_output_tokens == 0
        assert s.daily_cost_usd == 0.0
        assert s.monthly_input_tokens == 0
        assert s.monthly_output_tokens == 0
        assert s.monthly_cost_usd == 0.0


class TestCostLimitConfig:
    """Tests for the CostLimitConfig model."""

    def test_defaults(self):
        cfg = CostLimitConfig()
        assert cfg.daily_cost_limit_usd == 0.0
        assert cfg.monthly_cost_limit_usd == 0.0
        assert cfg.daily_token_limit == 0

    def test_custom_limits(self):
        cfg = CostLimitConfig(
            daily_cost_limit_usd=5.0,
            monthly_cost_limit_usd=50.0,
            daily_token_limit=100000,
        )
        assert cfg.daily_cost_limit_usd == 5.0
        assert cfg.monthly_cost_limit_usd == 50.0
        assert cfg.daily_token_limit == 100000

    def test_negative_values_rejected(self):
        with pytest.raises(Exception):
            CostLimitConfig(daily_cost_limit_usd=-1.0)


class TestCostControllerInMemory:
    """Tests for CostController using in-memory backend."""

    def test_init_no_redis(self):
        cc = CostController()
        assert cc._redis is None

    def test_record_and_get_usage(self):
        cc = CostController()
        cc.record_cost("user:1", input_tokens=1000, output_tokens=500)
        usage = cc.get_usage("user:1")
        assert usage.user_id == "user:1"
        assert usage.daily_input_tokens == 1000
        assert usage.daily_output_tokens == 500
        assert usage.monthly_input_tokens == 1000
        assert usage.monthly_output_tokens == 500

    def test_cost_calculation(self):
        cc = CostController(input_cost_per_m=3.0, output_cost_per_m=15.0)
        cc.record_cost("user:cost", input_tokens=1_000_000, output_tokens=1_000_000)
        usage = cc.get_usage("user:cost")
        # 1M input * $3/M + 1M output * $15/M = $18
        assert usage.daily_cost_usd == 18.0
        assert usage.monthly_cost_usd == 18.0

    def test_accumulate_costs(self):
        cc = CostController()
        cc.record_cost("user:acc", input_tokens=100, output_tokens=50)
        cc.record_cost("user:acc", input_tokens=200, output_tokens=100)
        usage = cc.get_usage("user:acc")
        assert usage.daily_input_tokens == 300
        assert usage.daily_output_tokens == 150

    def test_no_usage_returns_zeros(self):
        cc = CostController()
        usage = cc.get_usage("user:nonexistent")
        assert usage.daily_input_tokens == 0
        assert usage.daily_output_tokens == 0
        assert usage.daily_cost_usd == 0.0

    def test_check_limits_no_limits_configured(self):
        cc = CostController()
        allowed, reason = cc.check_limits("user:nolimit")
        assert allowed is True
        assert reason == ""

    def test_check_limits_daily_token_exceeded(self):
        cc = CostController(limits=CostLimitConfig(daily_token_limit=1000))
        cc.record_cost("user:tk", input_tokens=800, output_tokens=300)
        allowed, reason = cc.check_limits("user:tk")
        assert allowed is False
        assert "Daily token limit exceeded" in reason

    def test_check_limits_daily_cost_exceeded(self):
        cc = CostController(
            limits=CostLimitConfig(daily_cost_limit_usd=0.01),
            input_cost_per_m=3.0,
            output_cost_per_m=15.0,
        )
        # Record enough to exceed $0.01
        cc.record_cost("user:dc", input_tokens=10000, output_tokens=5000)
        allowed, reason = cc.check_limits("user:dc")
        assert allowed is False
        assert "Daily cost limit exceeded" in reason

    def test_check_limits_monthly_cost_exceeded(self):
        cc = CostController(
            limits=CostLimitConfig(monthly_cost_limit_usd=0.001),
            input_cost_per_m=3.0,
            output_cost_per_m=15.0,
        )
        cc.record_cost("user:mc", input_tokens=10000, output_tokens=5000)
        allowed, reason = cc.check_limits("user:mc")
        assert allowed is False
        assert "Monthly cost limit exceeded" in reason

    def test_check_limits_within_limits(self):
        cc = CostController(
            limits=CostLimitConfig(
                daily_token_limit=100000,
                daily_cost_limit_usd=10.0,
                monthly_cost_limit_usd=100.0,
            )
        )
        cc.record_cost("user:ok", input_tokens=100, output_tokens=50)
        allowed, reason = cc.check_limits("user:ok")
        assert allowed is True
        assert reason == ""

    def test_close_without_redis(self):
        cc = CostController()
        cc.close()
        assert cc._redis is None

    def test_redis_init_failure_falls_back(self):
        cc = CostController(redis_url="redis://invalid-host:9999/1")
        assert cc._redis is None
        # Should still work in-memory
        cc.record_cost("user:fb", input_tokens=100, output_tokens=50)
        usage = cc.get_usage("user:fb")
        assert usage.daily_input_tokens == 100

    def test_daily_key_format(self):
        key = CostController._daily_key("user:123")
        assert key.startswith("cost:daily:")
        assert key.endswith(":user:123")

    def test_monthly_key_format(self):
        key = CostController._monthly_key("user:123")
        assert key.startswith("cost:monthly:")
        assert key.endswith(":user:123")


# ---------------------------------------------------------------------------
# RateLimitConfig
# ---------------------------------------------------------------------------


class TestEndpointRateLimit:
    """Tests for the EndpointRateLimit model."""

    def test_create(self):
        rule = EndpointRateLimit(
            path_prefix="/api/v1/query",
            limit=50,
            window=3600,
            description="LLM query",
        )
        assert rule.path_prefix == "/api/v1/query"
        assert rule.limit == 50
        assert rule.window == 3600
        assert rule.description == "LLM query"

    def test_default_description(self):
        rule = EndpointRateLimit(path_prefix="/test", limit=10, window=60)
        assert rule.description == ""


class TestRateLimitConfig:
    """Tests for the RateLimitConfig settings model."""

    def test_defaults(self):
        with patch.dict("os.environ", {}, clear=False):
            cfg = RateLimitConfig(
                _env_file=None,
            )
        assert cfg.default_limit == 60
        assert cfg.default_window == 60
        assert cfg.enabled is True

    def test_skip_paths_set_empty(self):
        cfg = RateLimitConfig(_env_file=None, skip_paths="")
        assert cfg.skip_paths_set == set()

    def test_skip_paths_set_parsed(self):
        cfg = RateLimitConfig(_env_file=None, skip_paths="/custom/path, /another/path")
        assert cfg.skip_paths_set == {"/custom/path", "/another/path"}

    def test_endpoint_rules_default(self):
        cfg = RateLimitConfig(_env_file=None)
        rules = cfg.endpoint_rules
        assert len(rules) == 4
        prefixes = [r.path_prefix for r in rules]
        assert "/api/v1/query" in prefixes
        assert "/api/auth" in prefixes
        assert "/api/v1/export" in prefixes
        assert "/api/v1" in prefixes

    def test_to_path_limits(self):
        cfg = RateLimitConfig(_env_file=None)
        path_limits = cfg.to_path_limits()
        assert "/api/v1/query" in path_limits
        assert path_limits["/api/v1/query"] == (50, 3600)
        assert path_limits["/api/auth"] == (20, 60)

    def test_log_config_does_not_raise(self):
        cfg = RateLimitConfig(_env_file=None)
        cfg.log_config()  # Should not raise


# ---------------------------------------------------------------------------
# RateLimitMiddleware
# ---------------------------------------------------------------------------


class TestRateLimitMiddleware:
    """Tests for the FastAPI RateLimitMiddleware."""

    def _make_request(self, path="/api/v1/test", client_host="127.0.0.1", auth=None):
        request = MagicMock()
        request.url.path = path
        request.client.host = client_host
        request.headers = {}
        if auth:
            request.headers["authorization"] = auth
        request.state = MagicMock(spec=[])
        return request

    def _make_middleware(self, limiter=None, path_limits=None, skip_paths=None):
        if limiter is None:
            limiter = RateLimiter()
        app = MagicMock()
        mw = RateLimitMiddleware(
            app,
            limiter=limiter,
            default_limit=5,
            default_window=60,
            skip_paths=skip_paths,
            path_limits=path_limits,
        )
        return mw

    def test_skip_health_path(self):
        mw = self._make_middleware()
        assert "/health" in mw.skip_paths
        assert "/health/live" in mw.skip_paths
        assert "/health/ready" in mw.skip_paths
        assert "/docs" in mw.skip_paths

    def test_custom_skip_paths_merged(self):
        mw = self._make_middleware(skip_paths={"/custom/skip"})
        assert "/custom/skip" in mw.skip_paths
        # Built-in skips still present
        assert "/health" in mw.skip_paths

    def test_resolve_limit_default(self):
        mw = self._make_middleware()
        bucket, limit, window = mw._resolve_limit("/some/random/path")
        assert bucket == "_default"
        assert limit == 5
        assert window == 60

    def test_resolve_limit_longest_match(self):
        path_limits = {
            "/api/v1": (100, 3600),
            "/api/v1/query": (10, 3600),
        }
        mw = self._make_middleware(path_limits=path_limits)
        bucket, limit, window = mw._resolve_limit("/api/v1/query/test")
        assert bucket == "/api/v1/query"
        assert limit == 10

    def test_extract_identifier_from_ip(self):
        mw = self._make_middleware()
        request = self._make_request(client_host="10.0.0.1")
        ident = mw._extract_identifier(request)
        assert ident == "ip:10.0.0.1"

    def test_extract_identifier_no_client(self):
        mw = self._make_middleware()
        request = self._make_request()
        request.client = None
        ident = mw._extract_identifier(request)
        assert ident == "ip:unknown"

    def test_extract_identifier_invalid_bearer(self):
        mw = self._make_middleware()
        request = self._make_request(auth="Bearer invalid-token")
        ident = mw._extract_identifier(request)
        # Falls back to IP since token decode will fail
        assert ident.startswith("ip:")

    @pytest.mark.asyncio
    async def test_dispatch_skip_path(self):
        mw = self._make_middleware()
        request = self._make_request(path="/health")
        call_next = AsyncMock()
        call_next.return_value = MagicMock()
        await mw.dispatch(request, call_next)
        call_next.assert_awaited_once_with(request)

    @pytest.mark.asyncio
    async def test_dispatch_allowed_sets_headers(self):
        mw = self._make_middleware()
        request = self._make_request()

        response = MagicMock()
        response.headers = {}
        call_next = AsyncMock(return_value=response)

        result = await mw.dispatch(request, call_next)
        assert "X-RateLimit-Limit" in result.headers
        assert "X-RateLimit-Remaining" in result.headers

    @pytest.mark.asyncio
    async def test_dispatch_returns_429_when_exceeded(self):
        limiter = RateLimiter()
        mw = self._make_middleware(limiter=limiter)

        for _ in range(5):
            request = self._make_request(client_host="1.2.3.4")
            call_next = AsyncMock(return_value=MagicMock(headers={}))
            await mw.dispatch(request, call_next)

        # 6th request should be denied
        request = self._make_request(client_host="1.2.3.4")
        call_next = AsyncMock()
        response = await mw.dispatch(request, call_next)
        assert response.status_code == 429
        call_next.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_dispatch_path_specific_limits(self):
        path_limits = {"/api/auth": (2, 60)}
        limiter = RateLimiter()
        mw = self._make_middleware(limiter=limiter, path_limits=path_limits)

        for _ in range(2):
            req = self._make_request(path="/api/auth/login", client_host="5.5.5.5")
            await mw.dispatch(req, AsyncMock(return_value=MagicMock(headers={})))

        # 3rd request to /api/auth should be denied
        req = self._make_request(path="/api/auth/login", client_host="5.5.5.5")
        resp = await mw.dispatch(req, AsyncMock())
        assert resp.status_code == 429


# ---------------------------------------------------------------------------
# register module
# ---------------------------------------------------------------------------


class TestRegisterModule:
    """Tests for the middleware registration module."""

    def test_get_rate_limiter_before_register(self):
        # Reset module state
        import backend.middleware.register as reg

        reg._rate_limiter = None
        assert get_rate_limiter() is None

    def test_get_cost_controller_before_register(self):
        import backend.middleware.register as reg

        reg._cost_controller = None
        assert get_cost_controller() is None

    def test_shutdown_when_none(self):
        import backend.middleware.register as reg

        reg._rate_limiter = None
        reg._cost_controller = None
        # Should not raise
        shutdown_middleware()

    @patch.dict(
        "os.environ",
        {"RATELIMIT_ENABLED": "false"},
        clear=False,
    )
    def test_register_disabled(self):
        import backend.middleware.register as reg

        reg._rate_limiter = None
        reg._cost_controller = None
        app = MagicMock(spec=["add_middleware"])
        register_middleware(app)
        app.add_middleware.assert_not_called()
        assert reg._rate_limiter is None

    @patch.dict(
        "os.environ",
        {
            "RATELIMIT_ENABLED": "true",
            "RATELIMIT_REDIS_URL": "redis://invalid:9999/1",
        },
        clear=False,
    )
    def test_register_enabled_with_fallback(self):
        import backend.middleware.register as reg

        reg._rate_limiter = None
        reg._cost_controller = None
        app = MagicMock()
        register_middleware(app)
        assert reg._rate_limiter is not None
        assert reg._cost_controller is not None
        app.add_middleware.assert_called_once()
        # Cleanup
        shutdown_middleware()


# ---------------------------------------------------------------------------
# __init__ exports
# ---------------------------------------------------------------------------
class TestModuleExports:
    """Verify that the public API is exported from backend.middleware."""

    def test_all_exports(self):
        import backend.middleware as bm

        expected = [
            "CostController",
            "CostLimitConfig",
            "EndpointRateLimit",
            "RateLimitConfig",
            "RateLimiter",
            "RateLimitMiddleware",
            "RateLimitResult",
            "UsageSummary",
            "get_cost_controller",
            "get_rate_limiter",
            "register_middleware",
            "shutdown_middleware",
        ]
        for name in expected:
            assert hasattr(bm, name), f"Missing export: {name}"
