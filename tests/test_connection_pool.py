"""
Connection Pool Tests
=====================
Tests for database.pool module (PostgreSQL connection pooling).

All tests use mocked psycopg2 -- no real database required.
"""

import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


@pytest.fixture(autouse=True)
def reset_pool():
    """Reset the pool module's global state before each test."""
    import database.pool as pool_mod

    pool_mod._pool = None
    yield
    pool_mod._pool = None


class TestInitPool:
    """Tests for pool initialization."""

    @patch("database.pool.ThreadedConnectionPool")
    def test_init_pool_creates_pool(self, mock_pool_cls):
        from database.pool import init_pool, is_pool_initialized

        mock_settings = MagicMock()
        mock_settings.pg_host = "localhost"
        mock_settings.pg_port = 5432
        mock_settings.pg_database = "testdb"
        mock_settings.pg_user = "testuser"
        mock_settings.pg_password = "testpass"

        init_pool(mock_settings, min_connections=1, max_connections=5)

        mock_pool_cls.assert_called_once_with(
            minconn=1,
            maxconn=5,
            host="localhost",
            port=5432,
            dbname="testdb",
            user="testuser",
            password="testpass",
        )
        assert is_pool_initialized() is True

    @patch("database.pool.ThreadedConnectionPool")
    def test_init_pool_skips_if_already_initialized(self, mock_pool_cls):
        from database.pool import init_pool

        mock_settings = MagicMock()
        mock_settings.pg_host = "localhost"
        mock_settings.pg_port = 5432
        mock_settings.pg_database = "testdb"
        mock_settings.pg_user = "testuser"
        mock_settings.pg_password = "testpass"

        # First call
        init_pool(mock_settings)
        # Second call should skip
        init_pool(mock_settings)

        assert mock_pool_cls.call_count == 1

    @patch("database.pool.ThreadedConnectionPool")
    def test_init_pool_failure_leaves_pool_none(self, mock_pool_cls):
        import psycopg2
        from database.pool import init_pool, is_pool_initialized

        mock_pool_cls.side_effect = psycopg2.Error("Connection refused")
        mock_settings = MagicMock()
        mock_settings.pg_host = "badhost"
        mock_settings.pg_port = 5432
        mock_settings.pg_database = "testdb"
        mock_settings.pg_user = "testuser"
        mock_settings.pg_password = "testpass"

        with pytest.raises(psycopg2.Error):
            init_pool(mock_settings)

        assert is_pool_initialized() is False


class TestGetConnection:
    """Tests for the get_connection context manager."""

    def test_get_connection_raises_without_init(self):
        from database.pool import get_connection

        with pytest.raises(RuntimeError, match="not initialized"):
            with get_connection():
                pass

    @patch("database.pool.ThreadedConnectionPool")
    def test_get_connection_returns_and_commits(self, mock_pool_cls):
        from database.pool import init_pool, get_connection

        mock_pool_instance = MagicMock()
        mock_conn = MagicMock()
        mock_pool_instance.getconn.return_value = mock_conn
        mock_pool_cls.return_value = mock_pool_instance

        mock_settings = MagicMock()
        mock_settings.pg_host = "localhost"
        mock_settings.pg_port = 5432
        mock_settings.pg_database = "testdb"
        mock_settings.pg_user = "testuser"
        mock_settings.pg_password = "testpass"

        init_pool(mock_settings)

        with get_connection() as conn:
            assert conn is mock_conn

        # Verify commit was called on clean exit
        mock_conn.commit.assert_called_once()
        # Verify connection was returned to pool
        mock_pool_instance.putconn.assert_called_once_with(mock_conn)

    @patch("database.pool.ThreadedConnectionPool")
    def test_get_connection_rollback_on_exception(self, mock_pool_cls):
        from database.pool import init_pool, get_connection

        mock_pool_instance = MagicMock()
        mock_conn = MagicMock()
        mock_pool_instance.getconn.return_value = mock_conn
        mock_pool_cls.return_value = mock_pool_instance

        mock_settings = MagicMock()
        mock_settings.pg_host = "localhost"
        mock_settings.pg_port = 5432
        mock_settings.pg_database = "testdb"
        mock_settings.pg_user = "testuser"
        mock_settings.pg_password = "testpass"

        init_pool(mock_settings)

        with pytest.raises(ValueError):
            with get_connection() as _conn:
                raise ValueError("Test error")

        # Verify rollback was called (not commit)
        mock_conn.rollback.assert_called_once()
        mock_conn.commit.assert_not_called()
        # Connection should still be returned to pool
        mock_pool_instance.putconn.assert_called_once_with(mock_conn)


class TestGetPoolConnection:
    """Tests for get_pool_connection (raw connection)."""

    def test_get_pool_connection_raises_without_init(self):
        from database.pool import get_pool_connection

        with pytest.raises(RuntimeError, match="not initialized"):
            get_pool_connection()

    @patch("database.pool.ThreadedConnectionPool")
    def test_get_pool_connection_wraps_close(self, mock_pool_cls):
        from database.pool import init_pool, get_pool_connection

        mock_pool_instance = MagicMock()
        mock_conn = MagicMock()
        _original_close = mock_conn.close
        mock_pool_instance.getconn.return_value = mock_conn
        mock_pool_cls.return_value = mock_pool_instance

        mock_settings = MagicMock()
        mock_settings.pg_host = "localhost"
        mock_settings.pg_port = 5432
        mock_settings.pg_database = "testdb"
        mock_settings.pg_user = "testuser"
        mock_settings.pg_password = "testpass"

        init_pool(mock_settings)
        conn = get_pool_connection()

        # close() should have been replaced
        conn.close()

        # Should return to pool instead of truly closing
        mock_pool_instance.putconn.assert_called_once_with(mock_conn)


class TestClosePool:
    """Tests for close_pool."""

    @patch("database.pool.ThreadedConnectionPool")
    def test_close_pool(self, mock_pool_cls):
        from database.pool import init_pool, close_pool, is_pool_initialized

        mock_pool_instance = MagicMock()
        mock_pool_cls.return_value = mock_pool_instance

        mock_settings = MagicMock()
        mock_settings.pg_host = "localhost"
        mock_settings.pg_port = 5432
        mock_settings.pg_database = "testdb"
        mock_settings.pg_user = "testuser"
        mock_settings.pg_password = "testpass"

        init_pool(mock_settings)
        assert is_pool_initialized() is True

        close_pool()
        mock_pool_instance.closeall.assert_called_once()
        assert is_pool_initialized() is False

    def test_close_pool_when_not_initialized(self):
        from database.pool import close_pool, is_pool_initialized

        # Should not raise
        close_pool()
        assert is_pool_initialized() is False

    @patch("database.pool.ThreadedConnectionPool")
    def test_close_pool_handles_exception(self, mock_pool_cls):
        from database.pool import init_pool, close_pool, is_pool_initialized

        mock_pool_instance = MagicMock()
        mock_pool_instance.closeall.side_effect = Exception("close error")
        mock_pool_cls.return_value = mock_pool_instance

        mock_settings = MagicMock()
        mock_settings.pg_host = "localhost"
        mock_settings.pg_port = 5432
        mock_settings.pg_database = "testdb"
        mock_settings.pg_user = "testuser"
        mock_settings.pg_password = "testpass"

        init_pool(mock_settings)
        # Should not raise even if closeall fails
        close_pool()
        assert is_pool_initialized() is False
