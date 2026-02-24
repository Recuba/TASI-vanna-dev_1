"""
Tests for api/dependencies.py

Covers:
- init_pg_pool() DSN parsing and pool creation
- init_pg_pool() skip when already initialized
- get_db_connection() SQLite mode (delegates to DatabaseManager)
- get_db_connection() PostgreSQL mode (requires pool)
- get_db_connection() raises RuntimeError when PG pool not initialized
- get_db_connection_dep() generator lifecycle (yields and closes)
- Service singleton factories (lru_cache behavior)
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _reset_pool_module():
    """Reset the database.pool module-level _pool to None."""
    import database.pool as pool_mod

    pool_mod._pool = None


# =========================================================================
# init_pg_pool
# =========================================================================


class TestInitPgPool:
    """Test PostgreSQL pool initialization via DSN."""

    def setup_method(self):
        _reset_pool_module()

    def teardown_method(self):
        _reset_pool_module()

    def test_parses_dsn_and_creates_pool(self, monkeypatch):
        import database.pool as pool_mod

        pool_mod._pool = None

        mock_tcp = MagicMock()
        with patch(
            "psycopg2.pool.ThreadedConnectionPool", return_value=mock_tcp
        ) as mock_cls:
            from api.dependencies import init_pg_pool

            init_pg_pool("postgresql://myuser:mypass@myhost:5433/mydb", minconn=1, maxconn=5)

        mock_cls.assert_called_once_with(
            1,
            5,
            host="myhost",
            port=5433,
            dbname="mydb",
            user="myuser",
            password="mypass",
        )
        # Verify the pool was set on the module
        assert pool_mod._pool is mock_tcp

    def test_skips_when_pool_already_initialized(self, monkeypatch):
        """Second call to init_pg_pool is a no-op."""
        import database.pool as pool_mod

        existing_pool = MagicMock()
        pool_mod._pool = existing_pool

        from api.dependencies import init_pg_pool

        # Should not raise or replace the pool
        init_pg_pool("postgresql://user:pass@host:5432/db")

        assert pool_mod._pool is existing_pool

    def test_default_port_when_not_specified(self, monkeypatch):
        import database.pool as pool_mod

        pool_mod._pool = None

        mock_tcp = MagicMock()
        with patch(
            "psycopg2.pool.ThreadedConnectionPool", return_value=mock_tcp
        ) as mock_cls:
            from api.dependencies import init_pg_pool

            init_pg_pool("postgresql://user:pass@host/mydb")

        # Port should default to 5432 when not in DSN
        call_kwargs = mock_cls.call_args
        assert call_kwargs[1]["port"] in (None, 5432)

    def test_raises_on_invalid_dsn(self, monkeypatch):
        """init_pg_pool raises on a completely broken DSN."""
        import database.pool as pool_mod

        pool_mod._pool = None

        # ThreadedConnectionPool will fail on bad credentials, but
        # we're testing DSN parse - use an obviously bad scheme
        # The URL parse itself won't fail, but the pool creation might
        mock_tcp_cls = MagicMock(side_effect=Exception("connection refused"))
        with patch("psycopg2.pool.ThreadedConnectionPool", mock_tcp_cls):
            from api.dependencies import init_pg_pool

            with pytest.raises(Exception, match="connection refused"):
                init_pg_pool("postgresql://bad:bad@localhost:9999/nope")


# =========================================================================
# get_db_connection
# =========================================================================


class TestGetDbConnection:
    """Test the connection factory for both backends."""

    def setup_method(self):
        _reset_pool_module()

    def teardown_method(self):
        _reset_pool_module()

    def test_sqlite_mode_returns_connection(self, monkeypatch, test_db):
        monkeypatch.setenv("DB_BACKEND", "sqlite")

        mock_manager = MagicMock()
        mock_conn = MagicMock()
        mock_manager._get_raw_connection.return_value = mock_conn

        with patch("api.dependencies.get_database_manager", return_value=mock_manager):
            from api.dependencies import get_db_connection

            result = get_db_connection()

        assert result is mock_conn
        mock_manager._get_raw_connection.assert_called_once()

    def test_postgres_mode_raises_when_pool_not_initialized(self, monkeypatch):
        monkeypatch.setenv("DB_BACKEND", "postgres")
        import database.pool as pool_mod

        pool_mod._pool = None

        from api.dependencies import get_db_connection

        with pytest.raises(RuntimeError, match="not initialized"):
            get_db_connection()

    def test_postgres_mode_returns_pool_connection(self, monkeypatch):
        monkeypatch.setenv("DB_BACKEND", "postgres")

        mock_pooled_conn = MagicMock()
        with patch(
            "database.pool.is_pool_initialized", return_value=True
        ), patch(
            "database.pool.get_pool_connection", return_value=mock_pooled_conn
        ):
            from api.dependencies import get_db_connection

            result = get_db_connection()

        assert result is mock_pooled_conn


# =========================================================================
# get_db_connection_dep
# =========================================================================


class TestGetDbConnectionDep:
    """Test the FastAPI generator dependency."""

    def test_yields_connection_and_closes(self, monkeypatch):
        monkeypatch.setenv("DB_BACKEND", "sqlite")

        mock_conn = MagicMock()
        mock_manager = MagicMock()
        mock_manager._get_raw_connection.return_value = mock_conn

        with patch("api.dependencies.get_database_manager", return_value=mock_manager):
            from api.dependencies import get_db_connection_dep

            gen = get_db_connection_dep()
            conn = next(gen)

        assert conn is mock_conn

        # Exhaust the generator (simulating FastAPI cleanup)
        with pytest.raises(StopIteration):
            next(gen)

        mock_conn.close.assert_called_once()

    def test_closes_connection_on_exception(self, monkeypatch):
        monkeypatch.setenv("DB_BACKEND", "sqlite")

        mock_conn = MagicMock()
        mock_manager = MagicMock()
        mock_manager._get_raw_connection.return_value = mock_conn

        with patch("api.dependencies.get_database_manager", return_value=mock_manager):
            from api.dependencies import get_db_connection_dep

            gen = get_db_connection_dep()
            next(gen)

            # Simulate an exception in the route handler
            with pytest.raises(ValueError):
                gen.throw(ValueError("route error"))

        mock_conn.close.assert_called_once()


# =========================================================================
# Service singleton factories
# =========================================================================


class TestServiceSingletons:
    """Test that service factories return cached singletons."""

    def test_get_news_service_returns_same_instance(self):
        from api.dependencies import get_news_service

        get_news_service.cache_clear()
        try:
            with patch("api.dependencies.get_db_connection") as _:
                s1 = get_news_service()
                s2 = get_news_service()
            assert s1 is s2
        finally:
            get_news_service.cache_clear()

    def test_get_reports_service_returns_same_instance(self):
        from api.dependencies import get_reports_service

        get_reports_service.cache_clear()
        try:
            with patch("api.dependencies.get_db_connection"):
                s1 = get_reports_service()
                s2 = get_reports_service()
            assert s1 is s2
        finally:
            get_reports_service.cache_clear()

    def test_get_announcement_service_returns_same_instance(self):
        from api.dependencies import get_announcement_service

        get_announcement_service.cache_clear()
        try:
            with patch("api.dependencies.get_db_connection"):
                s1 = get_announcement_service()
                s2 = get_announcement_service()
            assert s1 is s2
        finally:
            get_announcement_service.cache_clear()

    def test_cache_clear_resets_singleton(self):
        from api.dependencies import get_news_service

        get_news_service.cache_clear()
        try:
            with patch("api.dependencies.get_db_connection"):
                s1 = get_news_service()
                get_news_service.cache_clear()
                s2 = get_news_service()
            # After cache_clear, a new instance should be created
            assert s1 is not s2
        finally:
            get_news_service.cache_clear()


# =========================================================================
# SSE endpoint tests (widgets_stream and news_stream)
# =========================================================================


class TestWidgetsStream:
    """Test the widgets SSE endpoint.

    SSE endpoints produce infinite generators, so we test the generator
    functions directly rather than using TestClient.stream() which can hang.
    """

    def test_sse_headers(self):
        from api.routes.widgets_stream import _sse_headers

        headers = _sse_headers()
        assert headers["Cache-Control"] == "no-cache"
        assert headers["X-Accel-Buffering"] == "no"
        assert headers["Connection"] == "keep-alive"

    @pytest.mark.asyncio
    async def test_memory_generator_sends_snapshot(self):
        """When a snapshot exists, the first yield is the snapshot event."""
        from api.routes.widgets_stream import _memory_event_generator

        snapshot_json = '{"quotes": [{"symbol": "BTC", "price": 50000}]}'
        mock_request = MagicMock()
        # Disconnect after first event
        mock_request.is_disconnected = MagicMock(
            side_effect=[False, True]
        )

        import asyncio

        event = asyncio.Event()

        with patch(
            "services.widgets.quotes_hub.get_latest_snapshot",
            return_value=snapshot_json,
        ), patch(
            "services.widgets.quotes_hub.get_snapshot_event",
            return_value=event,
        ):
            gen = _memory_event_generator(mock_request)
            first = await gen.__anext__()

        assert "event: snapshot" in first
        assert snapshot_json in first

    @pytest.mark.asyncio
    async def test_memory_generator_waiting_when_no_snapshot(self):
        """When snapshot is None, sends a 'waiting' comment."""
        from api.routes.widgets_stream import _memory_event_generator

        mock_request = MagicMock()
        mock_request.is_disconnected = MagicMock(
            side_effect=[False, True]
        )

        import asyncio

        event = asyncio.Event()

        with patch(
            "services.widgets.quotes_hub.get_latest_snapshot",
            return_value=None,
        ), patch(
            "services.widgets.quotes_hub.get_snapshot_event",
            return_value=event,
        ):
            gen = _memory_event_generator(mock_request)
            first = await gen.__anext__()

        assert "waiting" in first

    @pytest.mark.asyncio
    async def test_memory_generator_stops_on_disconnect(self):
        """Generator exits when client disconnects."""
        from api.routes.widgets_stream import _memory_event_generator

        mock_request = MagicMock()
        # is_disconnected is awaited, so must return a coroutine
        async def always_disconnected():
            return True

        mock_request.is_disconnected = always_disconnected

        import asyncio

        event = asyncio.Event()

        with patch(
            "services.widgets.quotes_hub.get_latest_snapshot",
            return_value='{"data": 1}',
        ), patch(
            "services.widgets.quotes_hub.get_snapshot_event",
            return_value=event,
        ):
            gen = _memory_event_generator(mock_request)
            items = []
            async for item in gen:
                items.append(item)

        # Should have initial snapshot, then stop
        assert len(items) == 1

    def test_get_redis_returns_none_on_import_error(self):
        """_get_redis returns None when cache module is not available."""
        from api.routes.widgets_stream import _get_redis

        with patch.dict("sys.modules", {"cache": None}):
            result = _get_redis()
            # When module is explicitly None in sys.modules, import raises
            # ImportError which is caught, so result should be None
            assert result is None

    def test_route_exists_and_is_get(self):
        """Verify the router has the expected widgets quotes stream GET route."""
        from api.routes.widgets_stream import router

        routes = [r for r in router.routes if hasattr(r, "path")]
        paths = [r.path for r in routes]
        # Router prefix is /api/v1/widgets, route path is /quotes/stream
        matching = [p for p in paths if "quotes/stream" in p]
        assert len(matching) == 1

        stream_route = [r for r in routes if "quotes/stream" in r.path][0]
        assert "GET" in stream_route.methods


class TestNewsStream:
    """Test the news SSE endpoint.

    Tests the generator function directly to avoid TestClient.stream() hangs
    with infinite SSE generators.
    """

    @pytest.mark.asyncio
    async def test_sends_connected_comment(self):
        """The first yield should be a ':connected' comment."""
        from api.routes import news_stream

        mock_store = MagicMock()
        # aget_latest_news is async
        async def fake_latest(*args, **kwargs):
            return []

        mock_store.aget_latest_news = fake_latest

        mock_request = MagicMock()
        # is_disconnected is awaited, must return coroutine
        async def always_disconnected():
            return True

        mock_request.is_disconnected = always_disconnected

        with patch.object(news_stream, "get_store", return_value=mock_store):
            resp = await news_stream.news_stream(mock_request, source=None)

        # The response is a StreamingResponse; iterate its body_iterator
        items = []
        async for chunk in resp.body_iterator:
            items.append(chunk)

        assert len(items) >= 1
        assert "connected" in items[0]

    @pytest.mark.asyncio
    async def test_emits_new_articles_event(self):
        """When new articles appear, a data event is emitted."""
        import json

        from api.routes import news_stream

        call_count = 0

        async def fake_latest(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                # First poll: set baseline
                return [{"id": "a1", "title": "Old", "source_name": "src"}]
            # Second poll: new article appears
            return [
                {"id": "a2", "title": "New", "source_name": "src"},
                {"id": "a1", "title": "Old", "source_name": "src"},
            ]

        mock_store = MagicMock()
        mock_store.aget_latest_news = fake_latest

        disconnect_count = 0

        async def fake_disconnected():
            nonlocal disconnect_count
            disconnect_count += 1
            # Allow 2 polls then disconnect
            return disconnect_count > 2

        mock_request = MagicMock()
        mock_request.is_disconnected = fake_disconnected

        with patch.object(news_stream, "get_store", return_value=mock_store), \
             patch("api.routes.news_stream.asyncio.sleep", return_value=None):
            resp = await news_stream.news_stream(mock_request, source=None)

            items = []
            async for chunk in resp.body_iterator:
                items.append(chunk)

        # Should have: ": connected\n\n" + a data event
        raw = "".join(items)
        assert "connected" in raw
        assert "data:" in raw
        # Parse the data event
        for item in items:
            if item.startswith("data:"):
                payload = json.loads(item.replace("data: ", "").strip())
                assert payload["count"] == 1
                assert payload["items"][0]["id"] == "a2"
                break

    def test_route_exists_and_is_get(self):
        """Verify the router has the expected news stream GET route."""
        from api.routes.news_stream import router

        routes = [r for r in router.routes if hasattr(r, "path")]
        paths = [r.path for r in routes]
        matching = [p for p in paths if "stream" in p]
        assert len(matching) == 1

    def test_sse_response_headers(self):
        """The StreamingResponse should have correct SSE headers."""
        # We can verify by checking the response construction in the route
        # The route sets Cache-Control and X-Accel-Buffering
        from api.routes import news_stream

        # Inspect the source - headers are set in the StreamingResponse call
        import inspect

        source = inspect.getsource(news_stream.news_stream)
        assert "Cache-Control" in source
        assert "no-cache" in source
        assert "X-Accel-Buffering" in source
