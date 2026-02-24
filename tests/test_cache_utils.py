"""
Tests for services/cache_utils.py
==================================
Covers TTLCache (put/get/expiry/eviction), the @cache_response decorator
(sync + async), Redis integration, and Redis failure fallback.
"""

import sys
import time
from pathlib import Path
from unittest.mock import MagicMock

import pytest

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from services.cache_utils import TTLCache, _make_key, cache_response, configure_redis  # noqa: E402


# ---------------------------------------------------------------------------
# Fixture: reset module-level globals between tests
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def _reset_cache_utils_globals():
    """Reset the module-level singleton cache and Redis client after each test."""
    import services.cache_utils as cu

    original_client = cu._redis_client
    original_fail_count = cu._redis_fail_count
    cu._redis_client = None
    cu._redis_fail_count = 0
    # Clear the in-memory fallback cache
    cu._fallback_cache._store.clear()
    yield
    cu._redis_client = original_client
    cu._redis_fail_count = original_fail_count


# ===========================================================================
# TTLCache direct tests
# ===========================================================================


class TestTTLCache:
    """Unit tests for the TTLCache class."""

    def test_put_and_get(self):
        cache = TTLCache(default_ttl=60, max_entries=100)
        cache.put("k1", {"data": 42})
        assert cache.get("k1") == {"data": 42}

    def test_get_missing_key_returns_none(self):
        cache = TTLCache()
        assert cache.get("nonexistent") is None

    def test_put_overwrites_existing(self):
        cache = TTLCache(default_ttl=60)
        cache.put("k1", "old")
        cache.put("k1", "new")
        assert cache.get("k1") == "new"

    def test_expiry_returns_none(self):
        cache = TTLCache(default_ttl=1)
        cache.put("k1", "val", ttl=0)
        # Entry has ttl=0, so any positive monotonic delta makes it expired
        # We need to wait just a tiny bit so time.monotonic() moves forward
        time.sleep(0.01)
        assert cache.get("k1") is None

    def test_custom_ttl_per_entry(self):
        cache = TTLCache(default_ttl=300)
        cache.put("short", "val", ttl=0)
        cache.put("long", "val", ttl=9999)
        time.sleep(0.01)
        assert cache.get("short") is None
        assert cache.get("long") == "val"

    def test_lru_eviction_when_max_entries_exceeded(self):
        cache = TTLCache(default_ttl=300, max_entries=3)
        cache.put("a", 1)
        cache.put("b", 2)
        cache.put("c", 3)
        # Adding a 4th should evict the oldest ("a")
        cache.put("d", 4)
        assert cache.get("a") is None
        assert cache.get("b") == 2
        assert cache.get("d") == 4

    def test_lru_access_refreshes_position(self):
        cache = TTLCache(default_ttl=300, max_entries=3)
        cache.put("a", 1)
        cache.put("b", 2)
        cache.put("c", 3)
        # Access "a" to move it to end (most recently used)
        cache.get("a")
        # Now insert "d" -- should evict "b" (least recently used)
        cache.put("d", 4)
        assert cache.get("a") == 1
        assert cache.get("b") is None

    def test_put_moves_existing_key_to_end(self):
        cache = TTLCache(default_ttl=300, max_entries=3)
        cache.put("a", 1)
        cache.put("b", 2)
        cache.put("c", 3)
        # Re-put "a" to move it to end
        cache.put("a", 10)
        # Insert "d" -- should evict "b"
        cache.put("d", 4)
        assert cache.get("a") == 10
        assert cache.get("b") is None

    def test_expired_entry_deleted_on_get(self):
        cache = TTLCache(default_ttl=300)
        cache.put("k1", "val", ttl=0)
        time.sleep(0.01)
        # The expired get should remove it from the store
        assert cache.get("k1") is None
        assert "k1" not in cache._store


# ===========================================================================
# _make_key tests
# ===========================================================================


class TestMakeKey:
    """Tests for the cache key builder."""

    def test_deterministic(self):
        def my_func():
            pass

        k1 = _make_key(my_func, (1, 2), {"x": "y"})
        k2 = _make_key(my_func, (1, 2), {"x": "y"})
        assert k1 == k2

    def test_different_args_different_keys(self):
        def my_func():
            pass

        k1 = _make_key(my_func, (1,), {})
        k2 = _make_key(my_func, (2,), {})
        assert k1 != k2

    def test_different_kwargs_different_keys(self):
        def my_func():
            pass

        k1 = _make_key(my_func, (), {"a": 1})
        k2 = _make_key(my_func, (), {"a": 2})
        assert k1 != k2

    def test_includes_module_and_qualname(self):
        def my_func():
            pass

        key = _make_key(my_func, (), {})
        assert my_func.__module__ in key
        assert my_func.__qualname__ in key

    def test_kwargs_sorted(self):
        def my_func():
            pass

        k1 = _make_key(my_func, (), {"b": 2, "a": 1})
        k2 = _make_key(my_func, (), {"a": 1, "b": 2})
        assert k1 == k2


# ===========================================================================
# configure_redis tests
# ===========================================================================


class TestConfigureRedis:
    """Tests for the configure_redis function."""

    def test_configure_with_client(self):
        import services.cache_utils as cu

        mock_client = MagicMock()
        configure_redis(mock_client)
        assert cu._redis_client is mock_client

    def test_configure_with_none_clears_client(self):
        import services.cache_utils as cu

        cu._redis_client = MagicMock()
        configure_redis(None)
        assert cu._redis_client is None


# ===========================================================================
# @cache_response decorator -- sync
# ===========================================================================


class TestCacheResponseSync:
    """Tests for @cache_response with sync functions."""

    def test_caches_return_value(self):
        call_count = 0

        @cache_response(ttl=300)
        def compute(x):
            nonlocal call_count
            call_count += 1
            return x * 2

        assert compute(5) == 10
        assert compute(5) == 10  # cached
        assert call_count == 1

    def test_different_args_not_shared(self):
        call_count = 0

        @cache_response(ttl=300)
        def compute(x):
            nonlocal call_count
            call_count += 1
            return x + 1

        compute(1)
        compute(2)
        assert call_count == 2

    def test_preserves_function_name(self):
        @cache_response(ttl=60)
        def my_named_function():
            return 1

        assert my_named_function.__name__ == "my_named_function"

    def test_works_with_kwargs(self):
        call_count = 0

        @cache_response(ttl=300)
        def compute(a, b=10):
            nonlocal call_count
            call_count += 1
            return a + b

        assert compute(1, b=20) == 21
        assert compute(1, b=20) == 21
        assert call_count == 1

        assert compute(1, b=30) == 31
        assert call_count == 2


# ===========================================================================
# @cache_response decorator -- async
# ===========================================================================


class TestCacheResponseAsync:
    """Tests for @cache_response with async functions."""

    @pytest.mark.asyncio
    async def test_caches_async_return_value(self):
        call_count = 0

        @cache_response(ttl=300)
        async def fetch(ticker):
            nonlocal call_count
            call_count += 1
            return {"price": 42.0}

        r1 = await fetch("2222.SR")
        r2 = await fetch("2222.SR")
        assert r1 == {"price": 42.0}
        assert r2 == {"price": 42.0}
        assert call_count == 1

    @pytest.mark.asyncio
    async def test_async_different_args(self):
        call_count = 0

        @cache_response(ttl=300)
        async def fetch(ticker):
            nonlocal call_count
            call_count += 1
            return ticker

        await fetch("A")
        await fetch("B")
        assert call_count == 2

    @pytest.mark.asyncio
    async def test_async_preserves_function_name(self):
        @cache_response(ttl=60)
        async def my_async_func():
            return 1

        assert my_async_func.__name__ == "my_async_func"


# ===========================================================================
# Redis integration path
# ===========================================================================


class TestCacheResponseWithRedis:
    """Tests for @cache_response when Redis client is configured."""

    def test_redis_stores_and_retrieves(self, mock_redis):

        configure_redis(mock_redis)

        call_count = 0

        @cache_response(ttl=120)
        def get_data():
            nonlocal call_count
            call_count += 1
            return {"result": "ok"}

        r1 = get_data()
        assert r1 == {"result": "ok"}
        assert call_count == 1

        # Redis mock stores the value; next call should hit Redis
        r2 = get_data()
        assert r2 == {"result": "ok"}
        assert call_count == 1  # not called again

        # Verify Redis was actually called
        assert mock_redis.setex.called
        assert mock_redis.get.called

    def test_redis_failure_falls_back_to_memory(self):

        failing_redis = MagicMock()
        failing_redis.get.side_effect = ConnectionError("Redis down")
        failing_redis.setex.side_effect = ConnectionError("Redis down")
        configure_redis(failing_redis)

        call_count = 0

        @cache_response(ttl=300)
        def compute():
            nonlocal call_count
            call_count += 1
            return "fallback"

        # First call: Redis fails, function executes, stored in memory
        r1 = compute()
        assert r1 == "fallback"
        assert call_count == 1

        # Second call: Redis GET fails, but in-memory fallback has it
        r2 = compute()
        assert r2 == "fallback"
        assert call_count == 1  # still cached in memory

    def test_redis_fail_count_increments(self):
        import services.cache_utils as cu

        failing_redis = MagicMock()
        failing_redis.get.side_effect = ConnectionError("down")
        failing_redis.setex.side_effect = ConnectionError("down")
        configure_redis(failing_redis)

        @cache_response(ttl=300)
        def compute():
            return "val"

        # Each call increments fail count (get fails + set fails)
        compute()
        assert cu._redis_fail_count > 0

    def test_redis_fail_warning_after_threshold(self):
        import services.cache_utils as cu

        failing_redis = MagicMock()
        failing_redis.get.side_effect = ConnectionError("down")
        failing_redis.setex.side_effect = ConnectionError("down")
        configure_redis(failing_redis)

        @cache_response(ttl=300)
        def compute(x):
            return x

        # Call enough times to exceed the warning threshold
        for i in range(5):
            compute(i)

        assert cu._redis_fail_count >= cu._REDIS_WARN_THRESHOLD

    def test_redis_success_resets_fail_count(self, mock_redis):
        import services.cache_utils as cu

        cu._redis_fail_count = 5
        configure_redis(mock_redis)

        @cache_response(ttl=300)
        def compute():
            return "val"

        compute()
        # After a successful Redis set, fail count should reset
        assert cu._redis_fail_count == 0
