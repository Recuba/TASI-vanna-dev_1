"""
Tests for backend/services/resilience/ module.
Covers: circuit_breaker, degradation, retry, timeout_manager, config.
"""

import asyncio
import sys
from pathlib import Path
from unittest.mock import patch

import pytest

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from backend.services.resilience.circuit_breaker import (  # noqa: E402
    CircuitBreaker,
    CircuitBreakerOpen,
    CircuitState,
    CircuitStats,
    _registry,
    get_all_stats,
    get_or_create,
    get_registry,
)
from backend.services.resilience.config import (  # noqa: E402
    ResilienceConfig,
    get_resilience_config,
)
from backend.services.resilience.degradation import (  # noqa: E402
    DegradationManager,
    create_default_manager,
)
from backend.services.resilience.retry import with_retry, with_timeout  # noqa: E402
from backend.services.resilience.timeout_manager import (  # noqa: E402
    QueryTimeoutConfig,
    QueryTimeoutManager,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def cb():
    """Circuit breaker with low thresholds for faster testing."""
    return CircuitBreaker(
        name="test-service",
        failure_threshold=3,
        recovery_timeout=1.0,
        half_open_max_calls=2,
        success_threshold=2,
    )


@pytest.fixture()
def degradation_mgr():
    """Fresh DegradationManager."""
    return DegradationManager()


@pytest.fixture()
def timeout_mgr():
    """QueryTimeoutManager with tight thresholds."""
    return QueryTimeoutManager(
        QueryTimeoutConfig(
            default_timeout=2.0,
            slow_query_threshold=0.5,
            max_timeout=5.0,
            cancel_on_timeout=False,
        )
    )


@pytest.fixture(autouse=True)
def _clear_cb_registry():
    """Clear the global circuit breaker registry between tests."""
    _registry.clear()
    yield
    _registry.clear()


# ---------------------------------------------------------------------------
# Helper callables
# ---------------------------------------------------------------------------


async def _succeed(value="ok"):
    return value


async def _fail(exc=None):
    raise exc or RuntimeError("boom")


def _sync_succeed(value="ok"):
    return value


def _sync_fail():
    raise RuntimeError("sync boom")


# ===========================================================================
# CircuitBreaker tests
# ===========================================================================


class TestCircuitBreakerStates:
    """Test circuit breaker state transitions."""

    @pytest.mark.asyncio
    async def test_initial_state_is_closed(self, cb):
        assert cb.state == CircuitState.CLOSED

    @pytest.mark.asyncio
    async def test_successful_call_stays_closed(self, cb):
        result = await cb.call(_succeed, "hello")
        assert result == "hello"
        assert cb.state == CircuitState.CLOSED
        stats = cb.get_stats()
        assert stats.total_successes == 1
        assert stats.failure_count == 0

    @pytest.mark.asyncio
    async def test_failure_below_threshold_stays_closed(self, cb):
        for _ in range(cb.failure_threshold - 1):
            with pytest.raises(RuntimeError):
                await cb.call(_fail)
        assert cb.state == CircuitState.CLOSED
        assert cb._failure_count == cb.failure_threshold - 1

    @pytest.mark.asyncio
    async def test_failure_at_threshold_opens_circuit(self, cb):
        for _ in range(cb.failure_threshold):
            with pytest.raises(RuntimeError):
                await cb.call(_fail)
        assert cb._state == CircuitState.OPEN

    @pytest.mark.asyncio
    async def test_open_circuit_rejects_calls(self, cb):
        # Open the circuit
        for _ in range(cb.failure_threshold):
            with pytest.raises(RuntimeError):
                await cb.call(_fail)

        with pytest.raises(CircuitBreakerOpen) as exc_info:
            await cb.call(_succeed)
        assert exc_info.value.name == "test-service"
        assert exc_info.value.retry_after >= 0

    @pytest.mark.asyncio
    async def test_open_to_half_open_after_recovery_timeout(self, cb):
        # Open the circuit
        for _ in range(cb.failure_threshold):
            with pytest.raises(RuntimeError):
                await cb.call(_fail)

        assert cb._state == CircuitState.OPEN

        # Mock time.monotonic to simulate passage of recovery_timeout
        original_opened_at = cb._opened_at
        with patch("backend.services.resilience.circuit_breaker.time") as mock_time:
            mock_time.monotonic.return_value = (
                original_opened_at + cb.recovery_timeout + 1
            )
            assert cb.state == CircuitState.HALF_OPEN

    @pytest.mark.asyncio
    async def test_half_open_success_closes_circuit(self, cb):
        # Open the circuit
        for _ in range(cb.failure_threshold):
            with pytest.raises(RuntimeError):
                await cb.call(_fail)

        # Wait for recovery timeout
        await asyncio.sleep(cb.recovery_timeout + 0.1)

        # Successful probe calls should close the circuit
        for _ in range(cb.success_threshold):
            result = await cb.call(_succeed, "recovered")
            assert result == "recovered"

        assert cb._state == CircuitState.CLOSED

    @pytest.mark.asyncio
    async def test_half_open_failure_reopens_circuit(self, cb):
        # Open the circuit
        for _ in range(cb.failure_threshold):
            with pytest.raises(RuntimeError):
                await cb.call(_fail)

        # Wait for recovery timeout
        await asyncio.sleep(cb.recovery_timeout + 0.1)

        # A failure in half-open re-opens immediately
        with pytest.raises(RuntimeError):
            await cb.call(_fail)

        assert cb._state == CircuitState.OPEN

    @pytest.mark.asyncio
    async def test_success_resets_failure_count(self, cb):
        # Rack up some failures (below threshold)
        for _ in range(cb.failure_threshold - 1):
            with pytest.raises(RuntimeError):
                await cb.call(_fail)

        assert cb._failure_count == cb.failure_threshold - 1

        # A success should reset the counter
        await cb.call(_succeed)
        assert cb._failure_count == 0
        assert cb.state == CircuitState.CLOSED


class TestCircuitBreakerSyncCalls:
    """Test that sync callables work through the circuit breaker."""

    @pytest.mark.asyncio
    async def test_sync_success(self, cb):
        result = await cb.call(_sync_succeed, "sync-ok")
        assert result == "sync-ok"

    @pytest.mark.asyncio
    async def test_sync_failure(self, cb):
        with pytest.raises(RuntimeError, match="sync boom"):
            await cb.call(_sync_fail)
        stats = cb.get_stats()
        assert stats.total_failures == 1


class TestCircuitBreakerReset:
    """Test manual reset."""

    @pytest.mark.asyncio
    async def test_manual_reset(self, cb):
        for _ in range(cb.failure_threshold):
            with pytest.raises(RuntimeError):
                await cb.call(_fail)
        assert cb._state == CircuitState.OPEN

        await cb.reset()
        assert cb._state == CircuitState.CLOSED
        assert cb._failure_count == 0


class TestCircuitBreakerStats:
    """Test statistics reporting."""

    @pytest.mark.asyncio
    async def test_stats_reflect_activity(self, cb):
        await cb.call(_succeed)
        with pytest.raises(RuntimeError):
            await cb.call(_fail)

        stats = cb.get_stats()
        assert isinstance(stats, CircuitStats)
        assert stats.name == "test-service"
        assert stats.total_successes == 1
        assert stats.total_failures == 1

    @pytest.mark.asyncio
    async def test_rejected_count(self, cb):
        for _ in range(cb.failure_threshold):
            with pytest.raises(RuntimeError):
                await cb.call(_fail)

        with pytest.raises(CircuitBreakerOpen):
            await cb.call(_succeed)

        stats = cb.get_stats()
        assert stats.total_rejected == 1


class TestCircuitBreakerRegistry:
    """Test global registry functions."""

    def test_get_or_create_new(self):
        breaker = get_or_create("svc-a", failure_threshold=2)
        assert breaker.name == "svc-a"
        assert breaker.failure_threshold == 2

    def test_get_or_create_existing(self):
        b1 = get_or_create("svc-b")
        b2 = get_or_create("svc-b", failure_threshold=99)
        assert b1 is b2
        # Original threshold preserved
        assert b1.failure_threshold == 5

    def test_get_all_stats(self):
        get_or_create("x")
        get_or_create("y")
        stats = get_all_stats()
        assert len(stats) == 2
        names = {s.name for s in stats}
        assert names == {"x", "y"}

    def test_get_registry(self):
        get_or_create("reg-test")
        reg = get_registry()
        assert "reg-test" in reg
        # Should be a copy
        reg["new"] = None
        assert "new" not in _registry


# ===========================================================================
# Degradation Manager tests
# ===========================================================================


class TestDegradationManager:
    """Test graceful degradation."""

    @pytest.mark.asyncio
    async def test_successful_call_no_fallback(self, degradation_mgr):
        result = await degradation_mgr.execute_with_fallback(
            service="test-svc",
            func=_succeed,
            value="primary",
        )
        assert result == "primary"
        assert not degradation_mgr.is_degraded("test-svc")

    @pytest.mark.asyncio
    async def test_failure_without_fallback_raises(self, degradation_mgr):
        with pytest.raises(RuntimeError, match="boom"):
            await degradation_mgr.execute_with_fallback(
                service="no-fallback",
                func=_fail,
            )

    @pytest.mark.asyncio
    async def test_failure_with_fallback(self, degradation_mgr):
        degradation_mgr.register_fallback(
            service="test-svc",
            fallback=lambda *a, **kw: {"degraded": True},
            description="static fallback",
        )

        result = await degradation_mgr.execute_with_fallback(
            service="test-svc",
            func=_fail,
        )
        assert result == {"degraded": True}
        assert degradation_mgr.is_degraded("test-svc")
        assert degradation_mgr.total_fallback_calls == 1

    @pytest.mark.asyncio
    async def test_recovery_clears_degraded_state(self, degradation_mgr):
        degradation_mgr.register_fallback(
            service="test-svc",
            fallback=lambda *a, **kw: "fallback",
        )

        # Fail first
        await degradation_mgr.execute_with_fallback(
            service="test-svc",
            func=_fail,
        )
        assert degradation_mgr.is_degraded("test-svc")

        # Succeed next
        result = await degradation_mgr.execute_with_fallback(
            service="test-svc",
            func=_succeed,
            value="recovered",
        )
        assert result == "recovered"
        assert not degradation_mgr.is_degraded("test-svc")

    @pytest.mark.asyncio
    async def test_async_fallback(self, degradation_mgr):
        async def async_fallback(*a, **kw):
            return "async-fallback-result"

        degradation_mgr.register_fallback(
            service="async-svc",
            fallback=async_fallback,
        )

        result = await degradation_mgr.execute_with_fallback(
            service="async-svc",
            func=_fail,
        )
        assert result == "async-fallback-result"

    @pytest.mark.asyncio
    async def test_fallback_failure_raises_original(self, degradation_mgr):
        def bad_fallback(*a, **kw):
            raise ValueError("fallback also broke")

        degradation_mgr.register_fallback(
            service="bad-svc",
            fallback=bad_fallback,
        )

        with pytest.raises(RuntimeError, match="boom"):
            await degradation_mgr.execute_with_fallback(
                service="bad-svc",
                func=_fail,
            )

    @pytest.mark.asyncio
    async def test_multiple_failures_increment_count(self, degradation_mgr):
        degradation_mgr.register_fallback(
            service="counting-svc",
            fallback=lambda *a, **kw: None,
        )

        for _ in range(3):
            await degradation_mgr.execute_with_fallback(
                service="counting-svc",
                func=_fail,
            )

        assert degradation_mgr.total_fallback_calls == 3
        degraded = degradation_mgr.get_degraded_services()
        assert len(degraded) == 1
        assert degraded[0]["fallback_invocations"] == 3

    def test_get_stats(self, degradation_mgr):
        degradation_mgr.register_fallback(
            service="stats-svc",
            fallback=lambda: None,
        )
        stats = degradation_mgr.get_stats()
        assert "registered_fallbacks" in stats
        assert "stats-svc" in stats["registered_fallbacks"]
        assert stats["total_fallback_calls"] == 0


class TestDefaultManager:
    """Test create_default_manager factory."""

    def test_creates_with_standard_fallbacks(self):
        mgr = create_default_manager()
        stats = mgr.get_stats()
        names = set(stats["registered_fallbacks"])
        assert names == {"anthropic_llm", "yfinance", "redis"}

    @pytest.mark.asyncio
    async def test_anthropic_fallback_returns_error(self):
        mgr = create_default_manager()
        result = await mgr.execute_with_fallback(
            service="anthropic_llm",
            func=_fail,
        )
        assert result["degraded"] is True
        assert "unavailable" in result["error"].lower()

    @pytest.mark.asyncio
    async def test_yfinance_fallback_returns_error(self):
        mgr = create_default_manager()
        result = await mgr.execute_with_fallback(
            service="yfinance",
            func=_fail,
        )
        assert result["degraded"] is True

    @pytest.mark.asyncio
    async def test_redis_fallback_returns_none(self):
        mgr = create_default_manager()
        result = await mgr.execute_with_fallback(
            service="redis",
            func=_fail,
        )
        assert result is None


# ===========================================================================
# Retry decorator tests
# ===========================================================================


class TestWithRetry:
    """Test the with_retry decorator."""

    @pytest.mark.asyncio
    async def test_succeeds_first_attempt(self):
        call_count = 0

        @with_retry(max_attempts=3, base_delay=0.01)
        async def good():
            nonlocal call_count
            call_count += 1
            return "ok"

        result = await good()
        assert result == "ok"
        assert call_count == 1

    @pytest.mark.asyncio
    async def test_retries_on_failure_then_succeeds(self):
        call_count = 0

        @with_retry(max_attempts=3, base_delay=0.01, jitter=False)
        async def flaky():
            nonlocal call_count
            call_count += 1
            if call_count < 3:
                raise ConnectionError("transient")
            return "recovered"

        result = await flaky()
        assert result == "recovered"
        assert call_count == 3

    @pytest.mark.asyncio
    async def test_exhausts_retries(self):
        @with_retry(max_attempts=2, base_delay=0.01)
        async def always_fail():
            raise ConnectionError("permanent")

        with pytest.raises(ConnectionError, match="permanent"):
            await always_fail()

    @pytest.mark.asyncio
    async def test_non_retryable_exception_propagates(self):
        call_count = 0

        @with_retry(
            max_attempts=3,
            base_delay=0.01,
            retryable_exceptions=(ConnectionError,),
        )
        async def bad():
            nonlocal call_count
            call_count += 1
            raise ValueError("not retryable")

        with pytest.raises(ValueError, match="not retryable"):
            await bad()
        # Should only have been called once
        assert call_count == 1

    @pytest.mark.asyncio
    async def test_on_retry_callback(self):
        retries = []

        def on_retry_cb(attempt, exc, delay):
            retries.append((attempt, str(exc), delay))

        @with_retry(max_attempts=3, base_delay=0.01, jitter=False, on_retry=on_retry_cb)
        async def flaky():
            if len(retries) < 2:
                raise RuntimeError("oops")
            return "ok"

        result = await flaky()
        assert result == "ok"
        assert len(retries) == 2
        assert retries[0][0] == 1  # first retry attempt number
        assert retries[1][0] == 2

    @pytest.mark.asyncio
    async def test_backoff_respects_max_delay(self):
        """Verify that delay is capped at max_delay."""
        delays = []

        def capture_delay(attempt, exc, delay):
            delays.append(delay)

        @with_retry(
            max_attempts=5,
            base_delay=1.0,
            max_delay=3.0,
            exponential_base=2.0,
            jitter=False,
            on_retry=capture_delay,
        )
        async def always_fail():
            raise RuntimeError("fail")

        with pytest.raises(RuntimeError):
            await always_fail()

        # With base=1, exp_base=2, no jitter: delays = [1, 2, 3(capped), 3(capped)]
        for d in delays:
            assert d <= 3.0


# ===========================================================================
# with_timeout decorator tests
# ===========================================================================


class TestWithTimeout:
    """Test the with_timeout decorator."""

    @pytest.mark.asyncio
    async def test_completes_within_timeout(self):
        @with_timeout(2.0)
        async def fast():
            return "done"

        result = await fast()
        assert result == "done"

    @pytest.mark.asyncio
    async def test_exceeds_timeout(self):
        @with_timeout(0.1)
        async def slow():
            await asyncio.sleep(5)
            return "never"

        with pytest.raises(asyncio.TimeoutError):
            await slow()

    @pytest.mark.asyncio
    async def test_custom_timeout_message(self):
        @with_timeout(0.1, timeout_message="Custom timeout hit")
        async def slow():
            await asyncio.sleep(5)

        with pytest.raises(asyncio.TimeoutError, match="Custom timeout hit"):
            await slow()


# ===========================================================================
# QueryTimeoutManager tests
# ===========================================================================


class TestQueryTimeoutManager:
    """Test the query timeout manager."""

    @pytest.mark.asyncio
    async def test_async_query_succeeds(self, timeout_mgr):
        result = await timeout_mgr.execute_with_timeout(
            func=_succeed,
            value="data",
            query_label="test-query",
        )
        assert result == "data"
        assert timeout_mgr.total_queries == 1
        assert timeout_mgr.timeout_count == 0

    @pytest.mark.asyncio
    async def test_sync_query_succeeds(self, timeout_mgr):
        result = await timeout_mgr.execute_with_timeout(
            func=_sync_succeed,
            value="sync-data",
            query_label="sync-query",
        )
        assert result == "sync-data"
        assert timeout_mgr.total_queries == 1

    @pytest.mark.asyncio
    async def test_query_times_out(self, timeout_mgr):
        async def slow_query():
            await asyncio.sleep(10)

        with pytest.raises(asyncio.TimeoutError):
            await timeout_mgr.execute_with_timeout(
                func=slow_query,
                timeout=0.1,
                query_label="slow-select",
            )
        assert timeout_mgr.timeout_count == 1

    @pytest.mark.asyncio
    async def test_slow_query_logging(self, timeout_mgr):
        """Queries slower than threshold are counted as slow."""

        async def medium_query():
            await asyncio.sleep(0.6)
            return "medium"

        result = await timeout_mgr.execute_with_timeout(
            func=medium_query,
            query_label="medium-query",
        )
        assert result == "medium"
        assert timeout_mgr.slow_query_count == 1

    @pytest.mark.asyncio
    async def test_timeout_clamped_to_max(self, timeout_mgr):
        """Custom timeout is clamped to max_timeout."""

        async def fast():
            return "fast"

        # Request 999s timeout, but max is 5s
        result = await timeout_mgr.execute_with_timeout(
            func=fast,
            timeout=999.0,
            query_label="clamped",
        )
        assert result == "fast"

    def test_get_stats(self, timeout_mgr):
        stats = timeout_mgr.get_stats()
        assert stats["total_queries"] == 0
        assert stats["config"]["default_timeout"] == 2.0
        assert stats["config"]["max_timeout"] == 5.0

    def test_default_config(self):
        mgr = QueryTimeoutManager()
        stats = mgr.get_stats()
        assert stats["config"]["default_timeout"] == 30.0
        assert stats["config"]["slow_query_threshold"] == 5.0


# ===========================================================================
# ResilienceConfig tests
# ===========================================================================


class TestResilienceConfig:
    """Test configuration loading."""

    def test_defaults(self):
        config = ResilienceConfig()
        assert config.cb_failure_threshold == 5
        assert config.cb_recovery_timeout == 30.0
        assert config.retry_max_attempts == 3
        assert config.retry_base_delay == 1.0
        assert config.query_timeout == 30.0
        assert config.degradation_enabled is True

    def test_env_override(self, monkeypatch):
        monkeypatch.setenv("RESILIENCE_CB_FAILURE_THRESHOLD", "10")
        monkeypatch.setenv("RESILIENCE_RETRY_MAX_ATTEMPTS", "5")
        config = ResilienceConfig()
        assert config.cb_failure_threshold == 10
        assert config.retry_max_attempts == 5

    def test_singleton_caching(self):
        import backend.services.resilience.config as config_mod

        # Reset singleton
        config_mod._config = None
        c1 = get_resilience_config()
        c2 = get_resilience_config()
        assert c1 is c2
        config_mod._config = None  # clean up


# ===========================================================================
# Module __init__ re-exports
# ===========================================================================


class TestModuleExports:
    """Verify that __init__.py re-exports are accessible."""

    def test_all_exports(self):
        import backend.services.resilience as resilience

        expected = [
            "CircuitBreaker",
            "CircuitBreakerOpen",
            "CircuitState",
            "CircuitStats",
            "DegradationManager",
            "QueryTimeoutConfig",
            "QueryTimeoutManager",
            "ResilienceConfig",
            "create_default_manager",
            "get_all_stats",
            "get_or_create",
            "get_registry",
            "get_resilience_config",
            "with_retry",
            "with_timeout",
        ]
        for name in expected:
            assert hasattr(resilience, name), f"Missing export: {name}"
