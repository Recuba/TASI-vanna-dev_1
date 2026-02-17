"""
Tests for:
  - backend/services/cache/redis_client.py  (RedisManager)
  - ingestion/scheduler.py                  (scheduler jobs + main)

All Redis operations are mocked — no live Redis server is required.
"""

from __future__ import annotations

import signal
import sys
from datetime import date, timedelta
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from redis.exceptions import (  # noqa: E402
    ConnectionError as RedisConnectionError,
    RedisError,
)

from backend.services.cache.redis_client import (  # noqa: E402
    RedisManager,
    _DEFAULT_DECODE_RESPONSES,
    _DEFAULT_MAX_CONNECTIONS,
    _DEFAULT_RETRY_ON_TIMEOUT,
    _DEFAULT_SOCKET_CONNECT_TIMEOUT,
    _DEFAULT_SOCKET_TIMEOUT,
    _DEFAULT_URL,
)


# ===========================================================================
# Helpers / fixtures
# ===========================================================================


def _make_manager(**kwargs) -> RedisManager:
    """Return a RedisManager with an optional override for any constructor arg."""
    return RedisManager(**kwargs)


def _mock_pool_and_client():
    """Return (mock_pool, mock_client) pair suitable for patching."""
    mock_pool = MagicMock()
    mock_pool.aclose = AsyncMock()

    mock_client = MagicMock()
    mock_client.ping = AsyncMock(return_value=True)
    mock_client.get = AsyncMock(return_value=None)
    mock_client.set = AsyncMock(return_value=True)
    mock_client.setex = AsyncMock(return_value=True)
    mock_client.delete = AsyncMock(return_value=1)
    mock_client.exists = AsyncMock(return_value=0)
    mock_client.info = AsyncMock(return_value={"used_memory_human": "2.00M"})
    mock_client.aclose = AsyncMock()

    return mock_pool, mock_client


# ===========================================================================
# RedisManager — Initialisation
# ===========================================================================


class TestRedisManagerInit:
    def test_defaults(self):
        mgr = _make_manager()
        assert mgr._url == _DEFAULT_URL
        assert mgr._password is None
        assert mgr._max_connections == _DEFAULT_MAX_CONNECTIONS
        assert mgr._socket_timeout == _DEFAULT_SOCKET_TIMEOUT
        assert mgr._socket_connect_timeout == _DEFAULT_SOCKET_CONNECT_TIMEOUT
        assert mgr._retry_on_timeout == _DEFAULT_RETRY_ON_TIMEOUT
        assert mgr._decode_responses == _DEFAULT_DECODE_RESPONSES
        assert mgr._pool is None
        assert mgr._client is None
        assert mgr._connected is False

    def test_custom_url(self):
        mgr = _make_manager(url="redis://myhost:6380/1")
        assert mgr._url == "redis://myhost:6380/1"

    def test_custom_password(self):
        mgr = _make_manager(password="secret")
        assert mgr._password == "secret"

    def test_custom_max_connections(self):
        mgr = _make_manager(max_connections=5)
        assert mgr._max_connections == 5

    def test_is_connected_false_initially(self):
        mgr = _make_manager()
        assert mgr.is_connected is False


# ===========================================================================
# RedisManager — connect()
# ===========================================================================


class TestRedisManagerConnect:
    @pytest.mark.asyncio
    async def test_connect_sets_connected(self):
        mgr = _make_manager()
        mock_pool, mock_client = _mock_pool_and_client()

        with (
            patch(
                "backend.services.cache.redis_client.ConnectionPool.from_url",
                return_value=mock_pool,
            ),
            patch(
                "backend.services.cache.redis_client.Redis",
                return_value=mock_client,
            ),
        ):
            await mgr.connect()

        assert mgr.is_connected is True
        assert mgr._client is mock_client
        assert mgr._pool is mock_pool
        mock_client.ping.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_connect_idempotent(self):
        """Calling connect() a second time when already connected is a no-op."""
        mgr = _make_manager()
        mock_pool, mock_client = _mock_pool_and_client()

        with (
            patch(
                "backend.services.cache.redis_client.ConnectionPool.from_url",
                return_value=mock_pool,
            ),
            patch(
                "backend.services.cache.redis_client.Redis",
                return_value=mock_client,
            ),
        ):
            await mgr.connect()
            await mgr.connect()  # second call

        # ping should only have been called once (first connect)
        mock_client.ping.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_connect_failure_raises(self):
        """connect() propagates RedisError and leaves _connected=False."""
        mgr = _make_manager()

        with patch(
            "backend.services.cache.redis_client.ConnectionPool.from_url",
            side_effect=RedisError("refused"),
        ):
            with pytest.raises(RedisError):
                await mgr.connect()

        assert mgr.is_connected is False

    @pytest.mark.asyncio
    async def test_connect_ping_failure_raises(self):
        """connect() raises when ping fails."""
        mgr = _make_manager()
        mock_pool, mock_client = _mock_pool_and_client()
        mock_client.ping.side_effect = RedisConnectionError("timeout")

        with (
            patch(
                "backend.services.cache.redis_client.ConnectionPool.from_url",
                return_value=mock_pool,
            ),
            patch(
                "backend.services.cache.redis_client.Redis",
                return_value=mock_client,
            ),
        ):
            with pytest.raises(RedisConnectionError):
                await mgr.connect()

        assert mgr.is_connected is False


# ===========================================================================
# RedisManager — disconnect()
# ===========================================================================


class TestRedisManagerDisconnect:
    @pytest.mark.asyncio
    async def test_disconnect_after_connect(self):
        mgr = _make_manager()
        mock_pool, mock_client = _mock_pool_and_client()

        with (
            patch(
                "backend.services.cache.redis_client.ConnectionPool.from_url",
                return_value=mock_pool,
            ),
            patch(
                "backend.services.cache.redis_client.Redis",
                return_value=mock_client,
            ),
        ):
            await mgr.connect()

        await mgr.disconnect()

        assert mgr.is_connected is False
        assert mgr._client is None
        assert mgr._pool is None
        mock_client.aclose.assert_awaited_once()
        mock_pool.aclose.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_disconnect_without_connect_is_safe(self):
        """disconnect() on a fresh manager must not raise."""
        mgr = _make_manager()
        await mgr.disconnect()  # should not raise
        assert mgr.is_connected is False

    @pytest.mark.asyncio
    async def test_disconnect_client_error_swallowed(self):
        """RedisError during aclose is logged but not re-raised."""
        mgr = _make_manager()
        mock_pool, mock_client = _mock_pool_and_client()
        mock_client.aclose.side_effect = RedisError("close failed")

        with (
            patch(
                "backend.services.cache.redis_client.ConnectionPool.from_url",
                return_value=mock_pool,
            ),
            patch(
                "backend.services.cache.redis_client.Redis",
                return_value=mock_client,
            ),
        ):
            await mgr.connect()

        await mgr.disconnect()  # should not raise
        assert mgr.is_connected is False


# ===========================================================================
# RedisManager — get / set / delete / exists
# ===========================================================================


class TestRedisManagerCoreOps:
    @pytest_asyncio.fixture
    async def connected_mgr(self):
        """Return a RedisManager that is already connected (mocked)."""
        mgr = _make_manager()
        mock_pool, mock_client = _mock_pool_and_client()

        with (
            patch(
                "backend.services.cache.redis_client.ConnectionPool.from_url",
                return_value=mock_pool,
            ),
            patch(
                "backend.services.cache.redis_client.Redis",
                return_value=mock_client,
            ),
        ):
            await mgr.connect()

        mgr._mock_client = mock_client  # expose for assertions
        return mgr

    @pytest.mark.asyncio
    async def test_get_existing_key(self, connected_mgr):
        connected_mgr._mock_client.get.return_value = b"value"
        result = await connected_mgr.get("mykey")
        assert result == b"value"
        connected_mgr._mock_client.get.assert_awaited_with("mykey")

    @pytest.mark.asyncio
    async def test_get_missing_key(self, connected_mgr):
        connected_mgr._mock_client.get.return_value = None
        result = await connected_mgr.get("missing")
        assert result is None

    @pytest.mark.asyncio
    async def test_get_reconnects_on_connection_error(self, connected_mgr):
        """get() automatically reconnects on RedisConnectionError."""
        call_count = 0
        original_client = connected_mgr._mock_client

        async def _get_side_effect(key):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise RedisConnectionError("lost")
            return b"recovered"

        original_client.get.side_effect = _get_side_effect

        # After the first failure, _ensure_connection will reconnect by
        # calling disconnect+connect; we patch connect to keep the same client.
        with patch.object(
            connected_mgr, "connect", new_callable=AsyncMock
        ) as mock_connect:
            with patch.object(connected_mgr, "disconnect", new_callable=AsyncMock):
                # After reconnect, _connected and _client must be valid again
                async def _fake_connect():
                    connected_mgr._connected = True
                    connected_mgr._client = original_client

                mock_connect.side_effect = _fake_connect
                result = await connected_mgr.get("mykey")

        assert result == b"recovered"

    @pytest.mark.asyncio
    async def test_set_without_ttl(self, connected_mgr):
        connected_mgr._mock_client.set.return_value = True
        result = await connected_mgr.set("k", b"v")
        assert result is True
        connected_mgr._mock_client.set.assert_awaited_with("k", b"v")

    @pytest.mark.asyncio
    async def test_set_with_ttl(self, connected_mgr):
        connected_mgr._mock_client.setex.return_value = True
        result = await connected_mgr.set("k", b"v", ttl=60)
        assert result is True
        connected_mgr._mock_client.setex.assert_awaited_with("k", 60, b"v")

    @pytest.mark.asyncio
    async def test_set_string_value(self, connected_mgr):
        connected_mgr._mock_client.set.return_value = True
        result = await connected_mgr.set("k", "string_value")
        assert result is True

    @pytest.mark.asyncio
    async def test_delete_single_key(self, connected_mgr):
        connected_mgr._mock_client.delete.return_value = 1
        result = await connected_mgr.delete("k1")
        assert result == 1

    @pytest.mark.asyncio
    async def test_delete_multiple_keys(self, connected_mgr):
        connected_mgr._mock_client.delete.return_value = 3
        result = await connected_mgr.delete("k1", "k2", "k3")
        assert result == 3

    @pytest.mark.asyncio
    async def test_delete_no_keys_returns_zero(self, connected_mgr):
        result = await connected_mgr.delete()
        assert result == 0
        connected_mgr._mock_client.delete.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_exists_key_present(self, connected_mgr):
        connected_mgr._mock_client.exists.return_value = 1
        result = await connected_mgr.exists("k")
        assert result == 1

    @pytest.mark.asyncio
    async def test_exists_no_keys_returns_zero(self, connected_mgr):
        result = await connected_mgr.exists()
        assert result == 0
        connected_mgr._mock_client.exists.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_set_reconnects_on_connection_error(self, connected_mgr):
        """set() retries after a RedisConnectionError."""
        original_client = connected_mgr._mock_client
        call_count = 0

        async def _set_side_effect(key, value):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise RedisConnectionError("lost")
            return True

        original_client.set.side_effect = _set_side_effect

        with patch.object(
            connected_mgr, "connect", new_callable=AsyncMock
        ) as mock_connect:
            with patch.object(connected_mgr, "disconnect", new_callable=AsyncMock):

                async def _fake_connect():
                    connected_mgr._connected = True
                    connected_mgr._client = original_client

                mock_connect.side_effect = _fake_connect
                result = await connected_mgr.set("k", b"v")

        assert result is True


# ===========================================================================
# RedisManager — health_check()
# ===========================================================================


class TestRedisManagerHealthCheck:
    @pytest.mark.asyncio
    async def test_health_check_healthy(self):
        mgr = _make_manager()
        mock_pool, mock_client = _mock_pool_and_client()
        mock_client.info.return_value = {"used_memory_human": "4.00M"}

        with (
            patch(
                "backend.services.cache.redis_client.ConnectionPool.from_url",
                return_value=mock_pool,
            ),
            patch(
                "backend.services.cache.redis_client.Redis",
                return_value=mock_client,
            ),
        ):
            await mgr.connect()

        result = await mgr.health_check()

        assert result["status"] == "healthy"
        assert result["connected"] is True
        assert "latency_ms" in result
        assert result["used_memory"] == "4.00M"
        assert result["pool_max_connections"] == _DEFAULT_MAX_CONNECTIONS

    @pytest.mark.asyncio
    async def test_health_check_unhealthy_on_redis_error(self):
        mgr = _make_manager()
        mock_pool, mock_client = _mock_pool_and_client()
        mock_client.ping.side_effect = RedisError("server gone")

        with (
            patch(
                "backend.services.cache.redis_client.ConnectionPool.from_url",
                return_value=mock_pool,
            ),
            patch(
                "backend.services.cache.redis_client.Redis",
                return_value=mock_client,
            ),
        ):
            # connect() will raise, so we manually inject a broken state
            try:
                await mgr.connect()
            except RedisError:
                pass

        # Manually set a broken client so health_check exercises the error path
        mgr._client = mock_client
        mgr._connected = True

        result = await mgr.health_check()

        assert result["status"] == "unhealthy"
        assert result["connected"] is False
        assert "error" in result

    @pytest.mark.asyncio
    async def test_health_check_not_connected(self):
        """health_check() when never connected returns unhealthy."""
        mgr = _make_manager()

        # _ensure_connection will try to reconnect, which will fail because
        # we never called connect() and ConnectionPool.from_url will error.
        with patch(
            "backend.services.cache.redis_client.ConnectionPool.from_url",
            side_effect=RedisError("refused"),
        ):
            result = await mgr.health_check()

        assert result["status"] == "unhealthy"
        assert "error" in result


# ===========================================================================
# ingestion/scheduler — helper functions and jobs
# ===========================================================================


class TestGetPgConn:
    def test_raises_if_psycopg2_missing(self):
        """_get_pg_conn raises ImportError when psycopg2 is None."""
        from ingestion import scheduler as sched_module

        original = sched_module.psycopg2
        try:
            sched_module.psycopg2 = None
            with pytest.raises(ImportError, match="psycopg2"):
                sched_module._get_pg_conn()
        finally:
            sched_module.psycopg2 = original

    def test_uses_env_vars(self):
        import ingestion.scheduler as sched_module

        mock_conn = MagicMock()
        with (
            patch.dict(
                "os.environ",
                {
                    "PG_HOST": "myhost",
                    "PG_PORT": "5433",
                    "PG_DBNAME": "mydb",
                    "PG_USER": "myuser",
                    "PG_PASSWORD": "mypass",
                },
            ),
            patch.object(sched_module, "psycopg2") as mock_psycopg2,
        ):
            mock_psycopg2.connect.return_value = mock_conn
            result = sched_module._get_pg_conn()

        mock_psycopg2.connect.assert_called_once_with(
            host="myhost",
            port=5433,
            dbname="mydb",
            user="myuser",
            password="mypass",
        )
        assert result is mock_conn


class TestJobLoadPrices:
    def test_success_path(self):
        """job_load_prices() runs loader and closes connection."""
        import ingestion.scheduler as sched_module

        mock_conn = MagicMock()
        mock_loader = MagicMock()
        mock_loader.load_all_prices.return_value = 42
        mock_loader.stats = {"tickers_processed": 10, "tickers_failed": 0}

        with (
            patch.object(sched_module, "_get_pg_conn", return_value=mock_conn),
            patch("ingestion.scheduler.PriceLoader", return_value=mock_loader),
            patch("ingestion.scheduler.IngestionConfig", return_value=MagicMock()),
        ):
            sched_module.job_load_prices()

        mock_loader.load_all_prices.assert_called_once()
        args = mock_loader.load_all_prices.call_args[0]
        from_date, to_date = args[0], args[1]
        assert isinstance(from_date, date)
        assert isinstance(to_date, date)
        assert to_date - from_date == timedelta(days=3)
        mock_conn.close.assert_called_once()

    def test_date_range_is_last_3_days(self):
        """The from_date should be today - 3 days."""
        import ingestion.scheduler as sched_module

        mock_conn = MagicMock()
        mock_loader = MagicMock()
        mock_loader.load_all_prices.return_value = 0
        mock_loader.stats = {"tickers_processed": 0, "tickers_failed": 0}

        captured = {}

        def _capture(from_date, to_date):
            captured["from_date"] = from_date
            captured["to_date"] = to_date
            return 0

        mock_loader.load_all_prices.side_effect = _capture

        with (
            patch.object(sched_module, "_get_pg_conn", return_value=mock_conn),
            patch("ingestion.scheduler.PriceLoader", return_value=mock_loader),
            patch("ingestion.scheduler.IngestionConfig", return_value=MagicMock()),
        ):
            sched_module.job_load_prices()

        assert captured["to_date"] == date.today()
        assert captured["from_date"] == date.today() - timedelta(days=3)

    def test_connection_closed_on_exception(self):
        """Even when an exception occurs, the connection is closed."""
        import ingestion.scheduler as sched_module

        mock_conn = MagicMock()

        with (
            patch.object(sched_module, "_get_pg_conn", return_value=mock_conn),
            patch(
                "ingestion.scheduler.PriceLoader",
                side_effect=RuntimeError("boom"),
            ),
            patch("ingestion.scheduler.IngestionConfig", return_value=MagicMock()),
        ):
            # Should not raise (errors are caught internally)
            sched_module.job_load_prices()

        mock_conn.close.assert_called_once()

    def test_pg_conn_failure_is_handled(self):
        """If _get_pg_conn raises, the job logs but does not propagate."""
        import ingestion.scheduler as sched_module

        with patch.object(
            sched_module,
            "_get_pg_conn",
            side_effect=Exception("cannot connect"),
        ):
            # job_load_prices catches all exceptions
            sched_module.job_load_prices()  # must not raise


class TestJobProcessXbrl:
    def test_skips_when_no_filings_dir(self, tmp_path):
        """If the filings directory does not exist, the job exits early."""
        import ingestion.scheduler as sched_module

        mock_conn = MagicMock()

        with (
            patch.object(sched_module, "_get_pg_conn", return_value=mock_conn),
            patch.object(sched_module, "PROJECT_DIR", tmp_path),
        ):
            sched_module.job_process_xbrl()

        # Should not try to connect to DB since we exit early
        mock_conn.close.assert_not_called()

    def test_skips_unsupported_files(self, tmp_path):
        """Files without supported extensions are ignored."""
        import ingestion.scheduler as sched_module

        filings_dir = tmp_path / "data" / "filings"
        filings_dir.mkdir(parents=True)
        (filings_dir / "readme.txt").write_text("ignore me")

        mock_conn = MagicMock()

        with (
            patch.object(sched_module, "_get_pg_conn", return_value=mock_conn),
            patch.object(sched_module, "PROJECT_DIR", tmp_path),
        ):
            sched_module.job_process_xbrl()

        mock_conn.close.assert_called_once()

    def test_skips_files_without_sr_ticker(self, tmp_path):
        """Files whose names don't contain '.SR' are skipped with a warning."""
        import ingestion.scheduler as sched_module

        filings_dir = tmp_path / "data" / "filings"
        filings_dir.mkdir(parents=True)
        (filings_dir / "nonticker.xml").write_text("<xbrl/>")

        mock_conn = MagicMock()

        with (
            patch.object(sched_module, "_get_pg_conn", return_value=mock_conn),
            patch.object(sched_module, "PROJECT_DIR", tmp_path),
        ):
            sched_module.job_process_xbrl()

        mock_conn.close.assert_called_once()

    def test_processes_valid_filing(self, tmp_path):
        """A valid '.SR' filing is processed through the full pipeline."""
        import ingestion.scheduler as sched_module

        filings_dir = tmp_path / "data" / "filings"
        filings_dir.mkdir(parents=True)
        filing_file = filings_dir / "2222.SR_annual.xml"
        filing_file.write_text("<xbrl/>")

        mock_conn = MagicMock()
        mock_processor = MagicMock()
        mock_processor.process_filing.return_value = [{"fact": "data"}]
        mock_processor.errors = []

        # XBRLProcessor is imported locally inside job_process_xbrl, so patch
        # it on the ingestion.xbrl_processor module where it is defined.
        mock_xbrl_module = MagicMock()
        mock_xbrl_module.XBRLProcessor.return_value = mock_processor
        mock_xbrl_module.insert_facts.return_value = 5
        mock_xbrl_module.create_filing.return_value = 1
        mock_xbrl_module.mark_filing_complete = MagicMock()

        with patch.object(sched_module, "_get_pg_conn", return_value=mock_conn):
            with patch.object(sched_module, "PROJECT_DIR", tmp_path):
                with patch.dict(
                    "sys.modules", {"ingestion.xbrl_processor": mock_xbrl_module}
                ):
                    sched_module.job_process_xbrl()

        mock_conn.close.assert_called_once()

    def test_connection_closed_on_exception(self, tmp_path):
        """DB connection is closed even when the job body raises."""
        import ingestion.scheduler as sched_module

        filings_dir = tmp_path / "data" / "filings"
        filings_dir.mkdir(parents=True)

        mock_conn = MagicMock()

        with (
            patch.object(sched_module, "_get_pg_conn", return_value=mock_conn),
            patch.object(sched_module, "PROJECT_DIR", tmp_path),
            # Force an error during iteration
            patch.object(
                sched_module.Path,
                "iterdir",
                side_effect=PermissionError("denied"),
            ),
        ):
            sched_module.job_process_xbrl()

        mock_conn.close.assert_called_once()


# ===========================================================================
# ingestion/scheduler — main()
# ===========================================================================


class TestSchedulerMain:
    def test_exits_if_apscheduler_missing(self):
        """main() prints an error and exits(1) when APScheduler is unavailable."""
        import ingestion.scheduler as sched_module

        original = sched_module.BlockingScheduler
        try:
            sched_module.BlockingScheduler = None
            with pytest.raises(SystemExit) as exc_info:
                sched_module.main()
            assert exc_info.value.code == 1
        finally:
            sched_module.BlockingScheduler = original

    def test_adds_price_and_xbrl_jobs(self):
        """main() registers both scheduled jobs before starting."""
        import ingestion.scheduler as sched_module

        mock_scheduler = MagicMock()

        with (
            patch.object(
                sched_module, "BlockingScheduler", return_value=mock_scheduler
            ),
            patch.object(sched_module, "CronTrigger", return_value=MagicMock()),
            patch("signal.signal"),
        ):
            mock_scheduler.start.side_effect = KeyboardInterrupt()
            sched_module.main()

        assert mock_scheduler.add_job.call_count == 2
        job_ids = {c.kwargs["id"] for c in mock_scheduler.add_job.call_args_list}
        assert "price_loader" in job_ids
        assert "xbrl_processor" in job_ids

    def test_registers_signal_handlers(self):
        """main() installs SIGINT and SIGTERM handlers."""
        import ingestion.scheduler as sched_module

        mock_scheduler = MagicMock()

        with (
            patch.object(
                sched_module, "BlockingScheduler", return_value=mock_scheduler
            ),
            patch.object(sched_module, "CronTrigger", return_value=MagicMock()),
            patch("signal.signal") as mock_signal,
        ):
            mock_scheduler.start.side_effect = SystemExit(0)
            sched_module.main()

        registered_signals = {c.args[0] for c in mock_signal.call_args_list}
        assert signal.SIGINT in registered_signals
        assert signal.SIGTERM in registered_signals

    def test_signal_handler_shuts_down_scheduler(self):
        """The signal handler calls scheduler.shutdown(wait=False)."""
        import ingestion.scheduler as sched_module

        mock_scheduler = MagicMock()
        captured_handler = {}

        def _capture_signal(signum, handler):
            captured_handler[signum] = handler

        with (
            patch.object(
                sched_module, "BlockingScheduler", return_value=mock_scheduler
            ),
            patch.object(sched_module, "CronTrigger", return_value=MagicMock()),
            patch("signal.signal", side_effect=_capture_signal),
        ):
            mock_scheduler.start.side_effect = KeyboardInterrupt()
            sched_module.main()

        # Invoke the SIGINT handler and verify shutdown is called
        handler = captured_handler.get(signal.SIGINT)
        assert handler is not None
        handler(signal.SIGINT, None)
        mock_scheduler.shutdown.assert_called_with(wait=False)

    def test_keyboard_interrupt_handled_gracefully(self):
        """KeyboardInterrupt from scheduler.start() does not propagate."""
        import ingestion.scheduler as sched_module

        mock_scheduler = MagicMock()

        with (
            patch.object(
                sched_module, "BlockingScheduler", return_value=mock_scheduler
            ),
            patch.object(sched_module, "CronTrigger", return_value=MagicMock()),
            patch("signal.signal"),
        ):
            mock_scheduler.start.side_effect = KeyboardInterrupt()
            # Should NOT raise
            sched_module.main()

    def test_system_exit_handled_gracefully(self):
        """SystemExit from scheduler.start() does not propagate."""
        import ingestion.scheduler as sched_module

        mock_scheduler = MagicMock()

        with (
            patch.object(
                sched_module, "BlockingScheduler", return_value=mock_scheduler
            ),
            patch.object(sched_module, "CronTrigger", return_value=MagicMock()),
            patch("signal.signal"),
        ):
            mock_scheduler.start.side_effect = SystemExit(0)
            # Should NOT raise
            sched_module.main()

    def test_price_loader_job_cron_trigger(self):
        """Price loader uses hour=17, minute=0 cron trigger."""
        import ingestion.scheduler as sched_module

        mock_scheduler = MagicMock()
        cron_calls = []

        def _capture_cron(**kwargs):
            cron_calls.append(kwargs)
            return MagicMock()

        with (
            patch.object(
                sched_module, "BlockingScheduler", return_value=mock_scheduler
            ),
            patch.object(sched_module, "CronTrigger", side_effect=_capture_cron),
            patch("signal.signal"),
        ):
            mock_scheduler.start.side_effect = KeyboardInterrupt()
            sched_module.main()

        assert any(c.get("hour") == 17 and c.get("minute") == 0 for c in cron_calls)

    def test_xbrl_processor_job_cron_trigger(self):
        """XBRL processor uses day_of_week='fri', hour=20 cron trigger."""
        import ingestion.scheduler as sched_module

        mock_scheduler = MagicMock()
        cron_calls = []

        def _capture_cron(**kwargs):
            cron_calls.append(kwargs)
            return MagicMock()

        with (
            patch.object(
                sched_module, "BlockingScheduler", return_value=mock_scheduler
            ),
            patch.object(sched_module, "CronTrigger", side_effect=_capture_cron),
            patch("signal.signal"),
        ):
            mock_scheduler.start.side_effect = KeyboardInterrupt()
            sched_module.main()

        assert any(
            c.get("day_of_week") == "fri" and c.get("hour") == 20 for c in cron_calls
        )
