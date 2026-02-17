"""
Tests for backend/services/cache/ module.
Covers: query_cache, compression, maintenance, models, db_pool, config.
Skips: redis_client (requires Redis server).
"""

import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import msgpack  # noqa: E402

from backend.services.cache.compression import (  # noqa: E402
    compress_bytes,
    compress_large_response,
    decompress_bytes,
)
from backend.services.cache.config import CacheConfig  # noqa: E402
from backend.services.cache.db_pool import DatabasePoolManager  # noqa: E402
from backend.services.cache.models import CachedResult, PoolConfig, PoolStats, TTLTier  # noqa: E402
from backend.services.cache.query_cache import (  # noqa: E402
    QueryCache,
    _make_key,
    _normalize_sql,
    classify_tier,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_redis():
    """Return a mock RedisManager with async helpers."""
    redis = MagicMock()
    redis.get = AsyncMock(return_value=None)
    redis.set = AsyncMock(return_value=True)
    redis.delete = AsyncMock(return_value=1)
    redis.health_check = AsyncMock(return_value={"status": "healthy"})
    return redis


@pytest.fixture
def query_cache(mock_redis):
    """Return a QueryCache wired to the mock RedisManager."""
    return QueryCache(mock_redis, enabled=True)


@pytest.fixture
def disabled_cache(mock_redis):
    """Return a disabled QueryCache."""
    return QueryCache(mock_redis, enabled=False)


# =====================================================================
# Models
# =====================================================================


class TestTTLTier:
    def test_market_ttl(self):
        assert TTLTier.MARKET.ttl_seconds == 60

    def test_historical_ttl(self):
        assert TTLTier.HISTORICAL.ttl_seconds == 3600

    def test_schema_ttl(self):
        assert TTLTier.SCHEMA.ttl_seconds == 86400

    def test_enum_values(self):
        assert TTLTier.MARKET.value == "market"
        assert TTLTier.HISTORICAL.value == "historical"
        assert TTLTier.SCHEMA.value == "schema"


class TestCachedResult:
    def test_create_minimal(self):
        cr = CachedResult(
            query_hash="abc123",
            sql="SELECT 1",
            data=[{"col": 1}],
            tier=TTLTier.MARKET,
            ttl=60,
        )
        assert cr.query_hash == "abc123"
        assert cr.row_count == 0  # default
        assert cr.compressed is False
        assert cr.created_at is not None

    def test_create_full(self):
        cr = CachedResult(
            query_hash="abc123",
            sql="SELECT * FROM companies",
            data=[{"ticker": "2222"}],
            tier=TTLTier.HISTORICAL,
            ttl=3600,
            row_count=1,
            compressed=True,
        )
        assert cr.tier == TTLTier.HISTORICAL
        assert cr.row_count == 1
        assert cr.compressed is True

    def test_model_dump_json(self):
        cr = CachedResult(
            query_hash="h", sql="s", data=[], tier=TTLTier.SCHEMA, ttl=86400
        )
        d = cr.model_dump(mode="json")
        assert d["tier"] == "schema"
        assert isinstance(d["created_at"], str)


class TestPoolStats:
    def test_defaults(self):
        ps = PoolStats()
        assert ps.pool_size == 0
        assert ps.checked_out == 0
        assert ps.overflow == 0
        assert ps.checked_in == 0

    def test_custom_values(self):
        ps = PoolStats(pool_size=10, checked_out=3, overflow=1, checked_in=6)
        assert ps.pool_size == 10
        assert ps.checked_out == 3


class TestPoolConfig:
    def test_defaults(self):
        pc = PoolConfig()
        assert pc.pool_size == 5
        assert pc.max_overflow == 10
        assert pc.pool_timeout == 30
        assert pc.pool_recycle == 1800
        assert pc.echo is False
        assert "sqlite" in pc.url

    def test_custom(self):
        pc = PoolConfig(url="postgresql+asyncpg://localhost/test", pool_size=20)
        assert pc.pool_size == 20
        assert "postgresql" in pc.url


# =====================================================================
# Config
# =====================================================================


class TestCacheConfig:
    def test_defaults(self):
        # Construct with explicit values to avoid picking up env vars
        cfg = CacheConfig(
            _env_file=None,
            enabled=False,
            redis_url="redis://localhost:6379/0",
            default_ttl=300,
        )
        assert cfg.enabled is False
        assert cfg.redis_url == "redis://localhost:6379/0"
        assert cfg.default_ttl == 300
        assert cfg.market_ttl == 60
        assert cfg.historical_ttl == 3600
        assert cfg.schema_ttl == 86400
        assert cfg.compression_threshold == 1024
        assert cfg.compression_level == 6
        assert cfg.warm_on_startup is False
        assert cfg.maintenance_interval == 300

    def test_env_prefix(self):
        with patch.dict(
            "os.environ", {"CACHE_ENABLED": "true", "CACHE_DEFAULT_TTL": "999"}
        ):
            cfg = CacheConfig(_env_file=None)
            assert cfg.enabled is True
            assert cfg.default_ttl == 999


# =====================================================================
# Compression
# =====================================================================


class TestCompression:
    def test_compress_decompress_roundtrip(self):
        original = b"Hello, world! " * 100
        compressed = compress_bytes(original)
        decompressed = decompress_bytes(compressed)
        assert decompressed == original

    def test_compress_reduces_size(self):
        original = b"A" * 10000
        compressed = compress_bytes(original)
        assert len(compressed) < len(original)

    def test_compress_level(self):
        data = b"test data " * 500
        fast = compress_bytes(data, level=1)
        best = compress_bytes(data, level=9)
        # Both should decompress to the same thing
        assert decompress_bytes(fast) == data
        assert decompress_bytes(best) == data

    def test_compress_large_response_below_threshold(self):
        small = b"tiny"
        result, was_compressed = compress_large_response(small, threshold=1024)
        assert result == small
        assert was_compressed is False

    def test_compress_large_response_above_threshold(self):
        large = b"X" * 5000
        result, was_compressed = compress_large_response(large, threshold=1024)
        assert was_compressed is True
        assert decompress_bytes(result) == large

    def test_compress_large_response_incompressible(self):
        """If compressed is not smaller, returns the original."""
        # Random-ish bytes that don't compress well and are just barely
        # over threshold
        import os

        random_data = os.urandom(1025)
        result, was_compressed = compress_large_response(random_data, threshold=1024)
        # gzip of random data is typically larger; should return original
        assert was_compressed is False
        assert result == random_data

    def test_compress_empty_bytes(self):
        compressed = compress_bytes(b"")
        decompressed = decompress_bytes(compressed)
        assert decompressed == b""


# =====================================================================
# Query Cache helpers
# =====================================================================


class TestNormalizeSql:
    def test_lowercases(self):
        assert _normalize_sql("SELECT * FROM T") == "select * from t"

    def test_collapses_whitespace(self):
        assert _normalize_sql("SELECT   *  \n FROM   t") == "select * from t"

    def test_strips(self):
        assert _normalize_sql("  SELECT 1  ") == "select 1"


class TestMakeKey:
    def test_prefix(self):
        key = _make_key("SELECT 1")
        assert key.startswith("raid:qcache:")

    def test_deterministic(self):
        assert _make_key("SELECT 1") == _make_key("SELECT 1")

    def test_normalized(self):
        """Same logical query with different whitespace gives the same key."""
        assert _make_key("SELECT 1") == _make_key("  select   1  ")


class TestClassifyTier:
    def test_schema_queries(self):
        assert (
            classify_tier("SELECT * FROM information_schema.columns") == TTLTier.SCHEMA
        )
        assert classify_tier("SELECT * FROM sqlite_master") == TTLTier.SCHEMA
        assert classify_tier("DESCRIBE companies") == TTLTier.SCHEMA
        assert classify_tier("SHOW TABLES") == TTLTier.SCHEMA
        assert classify_tier("SELECT * FROM pg_catalog.pg_tables") == TTLTier.SCHEMA

    def test_historical_queries(self):
        assert (
            classify_tier("SELECT * FROM balance_sheet WHERE ticker='2222'")
            == TTLTier.HISTORICAL
        )
        assert classify_tier("SELECT * FROM income_statement") == TTLTier.HISTORICAL
        assert classify_tier("SELECT * FROM cash_flow") == TTLTier.HISTORICAL
        assert classify_tier("SELECT * FROM financial_summary") == TTLTier.HISTORICAL
        assert (
            classify_tier("SELECT * FROM t WHERE period_type='annual'")
            == TTLTier.HISTORICAL
        )

    def test_market_queries(self):
        assert classify_tier("SELECT * FROM market_data") == TTLTier.MARKET
        assert classify_tier("SELECT * FROM companies") == TTLTier.MARKET
        assert (
            classify_tier("SELECT ticker, close_price FROM market_data")
            == TTLTier.MARKET
        )


# =====================================================================
# QueryCache
# =====================================================================


class TestQueryCache:
    @pytest.mark.asyncio
    async def test_get_cache_miss(self, query_cache, mock_redis):
        mock_redis.get.return_value = None
        result = await query_cache.get("SELECT 1")
        assert result is None
        assert query_cache.miss_count == 1
        assert query_cache.hit_count == 0

    @pytest.mark.asyncio
    async def test_get_cache_hit(self, query_cache, mock_redis):
        envelope = {
            "query_hash": "abc",
            "sql": "SELECT 1",
            "data": [{"col": 1}],
            "tier": "market",
            "ttl": 60,
        }
        packed = msgpack.packb(envelope, use_bin_type=True)
        mock_redis.get.return_value = packed

        result = await query_cache.get("SELECT 1")
        assert result == [{"col": 1}]
        assert query_cache.hit_count == 1
        assert query_cache.miss_count == 0

    @pytest.mark.asyncio
    async def test_get_disabled(self, disabled_cache):
        result = await disabled_cache.get("SELECT 1")
        assert result is None

    @pytest.mark.asyncio
    async def test_get_redis_error(self, query_cache, mock_redis):
        mock_redis.get.side_effect = ConnectionError("down")
        result = await query_cache.get("SELECT 1")
        assert result is None
        assert query_cache.miss_count == 1

    @pytest.mark.asyncio
    async def test_get_deserialize_error(self, query_cache, mock_redis):
        mock_redis.get.return_value = b"not-valid-msgpack"
        result = await query_cache.get("SELECT 1")
        assert result is None
        assert query_cache.miss_count == 1

    @pytest.mark.asyncio
    async def test_set_success(self, query_cache, mock_redis):
        ok = await query_cache.set("SELECT 1", [{"col": 1}])
        assert ok is True
        mock_redis.set.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_set_disabled(self, disabled_cache):
        ok = await disabled_cache.set("SELECT 1", [])
        assert ok is False

    @pytest.mark.asyncio
    async def test_set_with_explicit_tier(self, query_cache, mock_redis):
        ok = await query_cache.set("SELECT 1", [], tier=TTLTier.SCHEMA)
        assert ok is True
        # Verify the TTL passed to Redis matches SCHEMA tier
        call_args = mock_redis.set.call_args
        assert call_args.kwargs.get("ttl") == 86400

    @pytest.mark.asyncio
    async def test_set_redis_error(self, query_cache, mock_redis):
        mock_redis.set.side_effect = ConnectionError("down")
        ok = await query_cache.set("SELECT 1", [])
        assert ok is False

    @pytest.mark.asyncio
    async def test_invalidate_success(self, query_cache, mock_redis):
        mock_redis.delete.return_value = 1
        ok = await query_cache.invalidate("SELECT 1")
        assert ok is True

    @pytest.mark.asyncio
    async def test_invalidate_miss(self, query_cache, mock_redis):
        mock_redis.delete.return_value = 0
        ok = await query_cache.invalidate("SELECT 1")
        assert ok is False

    @pytest.mark.asyncio
    async def test_invalidate_disabled(self, disabled_cache):
        ok = await disabled_cache.invalidate("SELECT 1")
        assert ok is False

    @pytest.mark.asyncio
    async def test_invalidate_redis_error(self, query_cache, mock_redis):
        mock_redis.delete.side_effect = ConnectionError("down")
        ok = await query_cache.invalidate("SELECT 1")
        assert ok is False

    def test_stats(self, query_cache):
        stats = query_cache.stats()
        assert stats["enabled"] is True
        assert stats["hits"] == 0
        assert stats["misses"] == 0
        assert stats["hit_rate"] == 0.0

    def test_hit_rate_calculation(self, query_cache):
        query_cache._hits = 3
        query_cache._misses = 7
        assert query_cache.hit_rate == pytest.approx(0.3)


# =====================================================================
# CacheMaintenance
# =====================================================================


class TestCacheMaintenance:
    @pytest.fixture
    def maintenance(self, mock_redis, query_cache):
        from backend.services.cache.maintenance import CacheMaintenance

        return CacheMaintenance(mock_redis, query_cache)

    @pytest.mark.asyncio
    async def test_warm_cache_no_execute_fn(self, maintenance):
        result = await maintenance.warm_cache(execute_fn=None)
        assert result["warmed"] == 0
        assert result["skipped"] > 0
        assert result["errors"] == []

    @pytest.mark.asyncio
    async def test_warm_cache_with_execute_fn(self, maintenance, mock_redis):
        execute_fn = AsyncMock(return_value=[{"col": 1}])
        result = await maintenance.warm_cache(execute_fn=execute_fn)
        assert result["warmed"] == 3  # 3 warm-up queries
        assert result["errors"] == []
        assert execute_fn.await_count == 3

    @pytest.mark.asyncio
    async def test_warm_cache_partial_failure(self, maintenance, mock_redis):
        call_count = 0

        async def flaky_fn(sql):
            nonlocal call_count
            call_count += 1
            if call_count == 2:
                raise RuntimeError("DB error")
            return [{"col": 1}]

        result = await maintenance.warm_cache(execute_fn=flaky_fn)
        assert result["warmed"] == 2
        assert len(result["errors"]) == 1

    @pytest.mark.asyncio
    async def test_cleanup_expired_healthy(self, maintenance, mock_redis):
        mock_redis.health_check.return_value = {"status": "healthy"}
        result = await maintenance.cleanup_expired()
        assert result["status"] == "ok"
        assert "elapsed_ms" in result

    @pytest.mark.asyncio
    async def test_cleanup_expired_redis_down(self, maintenance, mock_redis):
        mock_redis.health_check.side_effect = ConnectionError("down")
        result = await maintenance.cleanup_expired()
        assert result["status"] == "error"
        assert "error" in result

    @pytest.mark.asyncio
    async def test_get_cache_stats(self, maintenance, mock_redis):
        mock_redis.health_check.return_value = {
            "status": "healthy",
            "latency_ms": 1.0,
        }
        result = await maintenance.get_cache_stats()
        assert "cache" in result
        assert "redis" in result
        assert result["cache"]["enabled"] is True


# =====================================================================
# DatabasePoolManager
# =====================================================================


class TestDatabasePoolManager:
    def test_init_default_config(self):
        mgr = DatabasePoolManager()
        assert mgr.engine is None

    def test_init_custom_config(self):
        cfg = PoolConfig(url="sqlite+aiosqlite:///test.db", pool_size=20)
        mgr = DatabasePoolManager(config=cfg)
        assert mgr._config.pool_size == 20

    def test_get_session_before_connect(self):
        mgr = DatabasePoolManager()
        with pytest.raises(RuntimeError, match="connect.*must be called"):
            mgr.get_session()

    def test_pool_stats_no_engine(self):
        mgr = DatabasePoolManager()
        stats = mgr.pool_stats()
        assert stats.pool_size == 0
        assert stats.checked_out == 0

    @pytest.mark.asyncio
    async def test_health_check_no_engine(self):
        mgr = DatabasePoolManager()
        result = await mgr.health_check()
        assert result["status"] == "unhealthy"
        assert "error" in result

    @pytest.mark.asyncio
    async def test_connect_disconnect_lifecycle(self):
        mgr = DatabasePoolManager()
        mock_engine = MagicMock()
        mock_engine.dispose = AsyncMock()
        mock_session_factory = MagicMock()

        with (
            patch(
                "backend.services.cache.db_pool.create_async_engine",
                return_value=mock_engine,
            ),
            patch(
                "backend.services.cache.db_pool.sessionmaker",
                return_value=mock_session_factory,
            ),
        ):
            await mgr.connect()
            assert mgr.engine is not None

            # Double connect is a no-op
            await mgr.connect()
            assert mgr.engine is mock_engine

        await mgr.disconnect()
        assert mgr.engine is None
        mock_engine.dispose.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_disconnect_without_connect(self):
        mgr = DatabasePoolManager()
        # Should not raise
        await mgr.disconnect()
        assert mgr.engine is None

    @pytest.mark.asyncio
    async def test_health_check_connected(self):
        mgr = DatabasePoolManager()
        mock_engine = MagicMock()
        mock_engine.dispose = AsyncMock()
        mock_engine.pool = MagicMock()

        mock_conn = AsyncMock()
        mock_conn.execute = AsyncMock()
        mock_ctx = AsyncMock()
        mock_ctx.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_ctx.__aexit__ = AsyncMock(return_value=False)
        mock_engine.connect.return_value = mock_ctx

        with (
            patch(
                "backend.services.cache.db_pool.create_async_engine",
                return_value=mock_engine,
            ),
            patch(
                "backend.services.cache.db_pool.sessionmaker",
                return_value=MagicMock(),
            ),
        ):
            await mgr.connect()

        result = await mgr.health_check()
        assert result["status"] == "healthy"
        assert "latency_ms" in result
        assert "pool" in result

        await mgr.disconnect()

    @pytest.mark.asyncio
    async def test_pool_stats_with_non_queue_pool(self):
        mgr = DatabasePoolManager()
        mock_engine = MagicMock()
        mock_engine.dispose = AsyncMock()
        # Use a non-QueuePool pool type
        mock_engine.pool = MagicMock(spec=[])  # no QueuePool methods

        with (
            patch(
                "backend.services.cache.db_pool.create_async_engine",
                return_value=mock_engine,
            ),
            patch(
                "backend.services.cache.db_pool.sessionmaker",
                return_value=MagicMock(),
            ),
        ):
            await mgr.connect()

        stats = mgr.pool_stats()
        assert stats.pool_size == mgr._config.pool_size

        await mgr.disconnect()

    @pytest.mark.asyncio
    async def test_get_session_after_connect(self):
        mgr = DatabasePoolManager()
        mock_engine = MagicMock()
        mock_engine.dispose = AsyncMock()
        mock_session = MagicMock()
        mock_session_factory = MagicMock(return_value=mock_session)

        with (
            patch(
                "backend.services.cache.db_pool.create_async_engine",
                return_value=mock_engine,
            ),
            patch(
                "backend.services.cache.db_pool.sessionmaker",
                return_value=mock_session_factory,
            ),
        ):
            await mgr.connect()

        session = mgr.get_session()
        assert session is mock_session

        await mgr.disconnect()
