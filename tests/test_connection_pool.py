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
        # Verify connection was returned to pool (with unique key)
        mock_pool_instance.putconn.assert_called_once()
        call_args = mock_pool_instance.putconn.call_args
        assert call_args[0][0] is mock_conn

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
        # Connection should still be returned to pool (with unique key)
        mock_pool_instance.putconn.assert_called_once()
        call_args = mock_pool_instance.putconn.call_args
        assert call_args[0][0] is mock_conn


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

        # close() on wrapper should return to pool
        conn.close()

        # Should return to pool instead of truly closing (with unique key)
        mock_pool_instance.putconn.assert_called_once()
        call_args = mock_pool_instance.putconn.call_args
        assert call_args[0][0] is mock_conn


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


# ===========================================================================
# SQLitePool tests (services/sqlite_pool.py)
# ===========================================================================

import sqlite3  # noqa: E402
import threading  # noqa: E402

from services.sqlite_pool import SQLitePool, init_pool as sqlite_init_pool, get_pool  # noqa: E402


class TestSQLitePoolCreation:
    """Test SQLitePool initialization."""

    def test_creates_pool_with_default_size(self, tmp_path):
        db_path = str(tmp_path / "test.db")
        pool = SQLitePool(db_path)
        assert pool.pool_size == 5
        # Should have 5 connections in the queue
        assert pool._pool.qsize() == 5

    def test_creates_pool_with_custom_size(self, tmp_path):
        db_path = str(tmp_path / "test.db")
        pool = SQLitePool(db_path, pool_size=3)
        assert pool.pool_size == 3
        assert pool._pool.qsize() == 3

    def test_connections_are_sqlite(self, tmp_path):
        db_path = str(tmp_path / "test.db")
        pool = SQLitePool(db_path, pool_size=1)
        conn = pool.acquire()
        assert isinstance(conn, sqlite3.Connection)
        pool.release(conn)

    def test_connections_have_row_factory(self, tmp_path):
        db_path = str(tmp_path / "test.db")
        pool = SQLitePool(db_path, pool_size=1)
        conn = pool.acquire()
        assert conn.row_factory is sqlite3.Row
        pool.release(conn)

    def test_wal_mode_enabled(self, tmp_path):
        db_path = str(tmp_path / "test.db")
        pool = SQLitePool(db_path, pool_size=1)
        conn = pool.acquire()
        mode = conn.execute("PRAGMA journal_mode").fetchone()[0]
        assert mode == "wal"
        pool.release(conn)


class TestSQLitePoolAcquireRelease:
    """Test acquire/release cycle."""

    def test_acquire_and_release(self, tmp_path):
        db_path = str(tmp_path / "test.db")
        pool = SQLitePool(db_path, pool_size=2)

        conn1 = pool.acquire()
        assert pool._pool.qsize() == 1

        conn2 = pool.acquire()
        assert pool._pool.qsize() == 0

        pool.release(conn1)
        assert pool._pool.qsize() == 1

        pool.release(conn2)
        assert pool._pool.qsize() == 2

    def test_acquire_timeout_raises(self, tmp_path):
        db_path = str(tmp_path / "test.db")
        pool = SQLitePool(db_path, pool_size=1)

        # Exhaust the pool
        conn = pool.acquire()
        with pytest.raises(RuntimeError, match="pool exhausted"):
            pool.acquire(timeout=0.1)
        pool.release(conn)

    def test_connection_context_manager(self, tmp_path):
        db_path = str(tmp_path / "test.db")
        pool = SQLitePool(db_path, pool_size=2)

        with pool.connection() as conn:
            assert isinstance(conn, sqlite3.Connection)
            assert pool._pool.qsize() == 1

        # After exiting context, connection returned to pool
        assert pool._pool.qsize() == 2

    def test_context_manager_releases_on_exception(self, tmp_path):
        db_path = str(tmp_path / "test.db")
        pool = SQLitePool(db_path, pool_size=1)

        with pytest.raises(ValueError):
            with pool.connection() as _:
                raise ValueError("test error")

        # Connection should still be returned to pool
        assert pool._pool.qsize() == 1


class TestSQLitePoolConcurrency:
    """Test thread-safety of SQLitePool."""

    def test_concurrent_acquire_release(self, tmp_path):
        db_path = str(tmp_path / "test.db")
        pool = SQLitePool(db_path, pool_size=3)
        errors = []

        def worker():
            try:
                conn = pool.acquire(timeout=5)
                conn.execute("SELECT 1")
                pool.release(conn)
            except Exception as e:
                errors.append(e)

        threads = [threading.Thread(target=worker) for _ in range(10)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=10)

        assert errors == []
        assert pool._pool.qsize() == 3


class TestSQLitePoolDataPersistence:
    """Test that connections from the pool share the same database."""

    def test_data_visible_across_connections(self, tmp_path):
        db_path = str(tmp_path / "test.db")
        pool = SQLitePool(db_path, pool_size=2)

        conn1 = pool.acquire()
        conn1.execute("CREATE TABLE t (id INTEGER)")
        conn1.execute("INSERT INTO t VALUES (42)")
        conn1.commit()
        pool.release(conn1)

        conn2 = pool.acquire()
        row = conn2.execute("SELECT id FROM t").fetchone()
        assert row["id"] == 42
        pool.release(conn2)


# ---------------------------------------------------------------------------
# Module-level init_pool / get_pool
# ---------------------------------------------------------------------------


class TestSQLitePoolModuleFunctions:
    """Test services.sqlite_pool module-level functions."""

    @pytest.fixture(autouse=True)
    def reset_sqlite_pool(self):
        """Reset the module global before/after each test."""
        import services.sqlite_pool as mod

        original = mod._pool
        mod._pool = None
        yield
        mod._pool = original

    def test_get_pool_raises_before_init(self):
        with pytest.raises(RuntimeError, match="not initialized"):
            get_pool()

    def test_init_and_get_pool(self, tmp_path):
        db_path = str(tmp_path / "test.db")
        sqlite_init_pool(db_path, pool_size=2)
        pool = get_pool()
        assert isinstance(pool, SQLitePool)
        assert pool.pool_size == 2

    def test_init_pool_custom_size(self, tmp_path):
        db_path = str(tmp_path / "test.db")
        sqlite_init_pool(db_path, pool_size=7)
        pool = get_pool()
        assert pool.pool_size == 7
