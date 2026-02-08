"""
Cache Module Tests
==================
Tests for cache.redis_client and cache.decorators modules.

All tests use mocked Redis -- no running Redis server required.
"""

import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


@pytest.fixture(autouse=True)
def reset_redis_client():
    """Reset the redis_client module's global state before each test."""
    import cache.redis_client as rc

    rc._redis_client = None
    yield
    rc._redis_client = None


# ===========================================================================
# redis_client tests
# ===========================================================================


class TestRedisClientInit:
    """Tests for init_redis, close_redis, is_redis_available."""

    def test_init_redis_success(self):
        import cache.redis_client as rc

        mock_redis_module = MagicMock()
        mock_client = MagicMock()
        mock_redis_module.Redis.from_url.return_value = mock_client
        mock_client.ping.return_value = True

        with patch.dict("sys.modules", {"redis": mock_redis_module}):
            rc.init_redis("redis://localhost:6379/0")

        mock_redis_module.Redis.from_url.assert_called_once()
        assert rc.is_redis_available() is True
        assert rc.get_redis() is mock_client

    def test_init_redis_skips_if_already_initialized(self):
        import cache.redis_client as rc

        mock_redis_module = MagicMock()
        mock_client = MagicMock()
        mock_redis_module.Redis.from_url.return_value = mock_client
        mock_client.ping.return_value = True

        with patch.dict("sys.modules", {"redis": mock_redis_module}):
            rc.init_redis("redis://localhost:6379/0")
            rc.init_redis("redis://localhost:6379/0")

        assert mock_redis_module.Redis.from_url.call_count == 1

    def test_init_redis_failure_leaves_client_none(self):
        import cache.redis_client as rc

        mock_redis_module = MagicMock()
        mock_redis_module.Redis.from_url.side_effect = Exception("Connection refused")

        with patch.dict("sys.modules", {"redis": mock_redis_module}):
            rc.init_redis("redis://badhost:6379/0")

        assert rc.is_redis_available() is False

    def test_is_redis_available_when_not_initialized(self):
        from cache.redis_client import is_redis_available

        assert is_redis_available() is False

    def test_close_redis_when_not_initialized(self):
        from cache.redis_client import close_redis, is_redis_available

        close_redis()  # Should not raise
        assert is_redis_available() is False

    def test_close_redis_when_initialized(self):
        import cache.redis_client as rc

        mock_client = MagicMock()
        rc._redis_client = mock_client

        rc.close_redis()

        mock_client.close.assert_called_once()
        assert rc._redis_client is None


# ===========================================================================
# Cache operation tests (cache_get, cache_set, cache_delete)
# ===========================================================================


class TestCacheOperations:
    """Tests for cache_get, cache_set, cache_delete."""

    def test_cache_get_returns_none_when_not_initialized(self):
        from cache.redis_client import cache_get

        result = cache_get("some-key")
        assert result is None

    def test_cache_set_returns_false_when_not_initialized(self):
        from cache.redis_client import cache_set

        result = cache_set("key", "value")
        assert result is False

    def test_cache_delete_returns_false_when_not_initialized(self):
        from cache.redis_client import cache_delete

        result = cache_delete("key")
        assert result is False

    def test_cache_set_and_get(self):
        import cache.redis_client as rc

        mock_client = MagicMock()
        store = {}

        def mock_setex(key, ttl, value):
            store[key] = value

        def mock_get(key):
            return store.get(key)

        mock_client.setex = MagicMock(side_effect=mock_setex)
        mock_client.get = MagicMock(side_effect=mock_get)
        rc._redis_client = mock_client

        result = rc.cache_set("test-key", "test-value", ttl=300)
        assert result is True

        retrieved = rc.cache_get("test-key")
        assert retrieved == "test-value"

    def test_cache_delete_existing_key(self):
        import cache.redis_client as rc

        mock_client = MagicMock()
        mock_client.delete.return_value = 1
        rc._redis_client = mock_client

        result = rc.cache_delete("some-key")
        assert result is True

    def test_cache_delete_nonexistent_key(self):
        import cache.redis_client as rc

        mock_client = MagicMock()
        mock_client.delete.return_value = 0
        rc._redis_client = mock_client

        result = rc.cache_delete("missing-key")
        assert result is False

    def test_cache_get_handles_exception(self):
        import cache.redis_client as rc

        mock_client = MagicMock()
        mock_client.get.side_effect = Exception("Redis error")
        rc._redis_client = mock_client

        result = rc.cache_get("key")
        assert result is None

    def test_cache_set_handles_exception(self):
        import cache.redis_client as rc

        mock_client = MagicMock()
        mock_client.setex.side_effect = Exception("Redis error")
        rc._redis_client = mock_client

        result = rc.cache_set("key", "value")
        assert result is False

    def test_cache_invalidate_pattern_when_not_initialized(self):
        from cache.redis_client import cache_invalidate_pattern

        result = cache_invalidate_pattern("news:*")
        assert result == 0

    def test_cache_invalidate_pattern(self):
        import cache.redis_client as rc

        mock_client = MagicMock()
        mock_client.scan.return_value = (0, ["news:1", "news:2"])
        mock_client.delete.return_value = 2
        rc._redis_client = mock_client

        count = rc.cache_invalidate_pattern("news:*")
        assert count == 2


# ===========================================================================
# Cache decorator tests
# ===========================================================================


class TestCachedDecorator:
    """Tests for the @cached decorator."""

    def test_cached_bypasses_when_redis_unavailable(self):
        from cache.decorators import cached

        call_count = 0

        @cached(ttl=60, key_prefix="test")
        def my_func(x):
            nonlocal call_count
            call_count += 1
            return x * 2

        # Redis is not initialized, so decorator should be a no-op
        result = my_func(5)
        assert result == 10
        assert call_count == 1

        # Call again - should execute function again (no cache)
        result = my_func(5)
        assert result == 10
        assert call_count == 2

    def test_cached_returns_from_cache_on_hit(self):
        import cache.redis_client as rc
        from cache.decorators import cached

        mock_client = MagicMock()
        mock_client.ping.return_value = True
        rc._redis_client = mock_client

        store = {}

        def mock_get(key):
            return store.get(key)

        def mock_setex(key, ttl, value):
            store[key] = value

        mock_client.get = MagicMock(side_effect=mock_get)
        mock_client.setex = MagicMock(side_effect=mock_setex)

        call_count = 0

        @cached(ttl=60, key_prefix="myprefix")
        def expensive_func(x):
            nonlocal call_count
            call_count += 1
            return {"result": x * 2}

        with patch("cache.decorators._is_cache_enabled", return_value=True):
            # First call: should execute function and cache
            result1 = expensive_func(5)
            assert result1 == {"result": 10}
            assert call_count == 1

            # Second call: should return from cache
            result2 = expensive_func(5)
            assert result2 == {"result": 10}
            assert call_count == 1  # Not called again

    def test_cached_different_args_different_keys(self):
        import cache.redis_client as rc
        from cache.decorators import cached

        mock_client = MagicMock()
        mock_client.ping.return_value = True
        rc._redis_client = mock_client

        store = {}

        def mock_get(key):
            return store.get(key)

        def mock_setex(key, ttl, value):
            store[key] = value

        mock_client.get = MagicMock(side_effect=mock_get)
        mock_client.setex = MagicMock(side_effect=mock_setex)

        call_count = 0

        @cached(ttl=60, key_prefix="test")
        def func(x):
            nonlocal call_count
            call_count += 1
            return x + 1

        with patch("cache.decorators._is_cache_enabled", return_value=True):
            func(1)
            func(2)
            assert call_count == 2  # Different args = different cache keys

    def test_cached_handles_non_serializable_gracefully(self):
        from cache.decorators import cached

        @cached(ttl=60, key_prefix="test")
        def func():
            return {"data": "value"}

        # Even if cache fails, function should still return
        result = func()
        assert result == {"data": "value"}


class TestBuildKey:
    """Tests for cache key generation."""

    def test_build_key_deterministic(self):
        from cache.decorators import _build_key

        key1 = _build_key("prefix", "func", (1, 2), {"k": "v"})
        key2 = _build_key("prefix", "func", (1, 2), {"k": "v"})
        assert key1 == key2

    def test_build_key_different_for_different_args(self):
        from cache.decorators import _build_key

        key1 = _build_key("prefix", "func", (1,), {})
        key2 = _build_key("prefix", "func", (2,), {})
        assert key1 != key2

    def test_build_key_format(self):
        from cache.decorators import _build_key

        key = _build_key("news", "get_latest", (10,), {})
        assert key.startswith("news:get_latest:")
        assert len(key.split(":")) == 3

    def test_build_key_different_prefix(self):
        from cache.decorators import _build_key

        key1 = _build_key("news", "func", (1,), {})
        key2 = _build_key("reports", "func", (1,), {})
        assert key1 != key2
