"""Tests for services.db_compat – all public functions."""

from __future__ import annotations

import sqlite3
from unittest.mock import MagicMock, patch

import pytest

from services.db_compat import (
    _ALLOWED_DATETIME_COLUMNS,
    _INTERVAL_PATTERN,
    datetime_recent,
    fetchall_compat,
    fetchone_compat,
    get_read_connection,
    is_postgres,
    scalar_compat,
    table_exists,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


@pytest.fixture(params=[False, True], ids=["sqlite", "postgres"])
def backend(request, monkeypatch):
    """Run each test against both SQLite and PostgreSQL backends."""
    with patch("services.db_compat.is_postgres", return_value=request.param):
        yield request.param


# ---------------------------------------------------------------------------
# Valid inputs
# ---------------------------------------------------------------------------


class TestDatetimeRecentValid:
    """Ensure valid column + interval combinations produce correct SQL."""

    @pytest.mark.parametrize("column", sorted(_ALLOWED_DATETIME_COLUMNS))
    def test_valid_columns(self, column, backend):
        result = datetime_recent(column, "1 day")
        assert column in result

    @pytest.mark.parametrize(
        "interval",
        [
            "1 second",
            "30 seconds",
            "1 minute",
            "5 minutes",
            "1 hour",
            "24 hours",
            "1 day",
            "7 days",
            "1 week",
            "2 weeks",
            "1 month",
            "6 months",
            "1 year",
            "3 years",
        ],
    )
    def test_valid_intervals(self, interval, backend):
        result = datetime_recent("created_at", interval)
        assert "created_at" in result

    def test_sqlite_output_format(self):
        with patch("services.db_compat.is_postgres", return_value=False):
            result = datetime_recent("created_at", "1 day")
            assert result == "created_at > datetime('now', '-1 day')"

    def test_postgres_output_format(self):
        with patch("services.db_compat.is_postgres", return_value=True):
            result = datetime_recent("created_at", "1 day")
            assert result == "created_at > NOW() - INTERVAL '1 day'"


# ---------------------------------------------------------------------------
# Invalid column names
# ---------------------------------------------------------------------------


class TestDatetimeRecentInvalidColumn:
    """Ensure non-whitelisted columns are rejected."""

    @pytest.mark.parametrize(
        "column",
        [
            "id",
            "name",
            "1; DROP TABLE users--",
            "created_at; DROP TABLE--",
            "' OR 1=1 --",
            "",
            "CREATED_AT",
            "some_other_col",
        ],
    )
    def test_invalid_column_raises(self, column, backend):
        with pytest.raises(ValueError, match="not in allowed list"):
            datetime_recent(column, "1 day")


# ---------------------------------------------------------------------------
# Invalid intervals
# ---------------------------------------------------------------------------


class TestDatetimeRecentInvalidInterval:
    """Ensure malformed intervals are rejected."""

    @pytest.mark.parametrize(
        "interval",
        [
            "",
            "day",
            "1",
            "1day",
            "-1 day",
            "1 day; DROP TABLE users--",
            "1'; DROP TABLE--",
            "1 fortnight",
            "abc hours",
            "1 day 2 hours",
            "1\nday",
        ],
    )
    def test_invalid_interval_raises(self, interval, backend):
        with pytest.raises(ValueError, match="Invalid interval format"):
            datetime_recent("created_at", interval)


# ---------------------------------------------------------------------------
# SQL injection attempts
# ---------------------------------------------------------------------------


class TestDatetimeRecentInjection:
    """Verify that SQL injection payloads are blocked."""

    def test_column_injection(self, backend):
        with pytest.raises(ValueError):
            datetime_recent("1; DROP TABLE users--", "1 day")

    def test_interval_injection(self, backend):
        with pytest.raises(ValueError):
            datetime_recent("created_at", "1'; DROP TABLE users--")

    def test_union_injection_column(self, backend):
        with pytest.raises(ValueError):
            datetime_recent("created_at UNION SELECT * FROM users--", "1 day")

    def test_union_injection_interval(self, backend):
        with pytest.raises(ValueError):
            datetime_recent("created_at", "1 day' UNION SELECT--")


# ---------------------------------------------------------------------------
# Whitelist / pattern sanity checks
# ---------------------------------------------------------------------------


class TestWhitelistAndPattern:
    """Sanity-check the module-level constants."""

    def test_whitelist_is_frozenset(self):
        assert isinstance(_ALLOWED_DATETIME_COLUMNS, frozenset)

    def test_whitelist_not_empty(self):
        assert len(_ALLOWED_DATETIME_COLUMNS) > 0

    def test_pattern_accepts_singular_units(self):
        for unit in ("second", "minute", "hour", "day", "week", "month", "year"):
            assert _INTERVAL_PATTERN.match(f"1 {unit}")

    def test_pattern_accepts_plural_units(self):
        for unit in ("seconds", "minutes", "hours", "days", "weeks", "months", "years"):
            assert _INTERVAL_PATTERN.match(f"10 {unit}")

    def test_pattern_case_insensitive(self):
        assert _INTERVAL_PATTERN.match("1 DAY")
        assert _INTERVAL_PATTERN.match("1 Day")


# ---------------------------------------------------------------------------
# is_postgres()
# ---------------------------------------------------------------------------


class TestIsPostgres:
    """Test the is_postgres() helper."""

    def test_returns_false_for_sqlite(self):
        mock_settings = MagicMock()
        mock_settings.db.backend = "sqlite"
        with patch("services.db_compat.get_settings", return_value=mock_settings):
            assert is_postgres() is False

    def test_returns_true_for_postgres(self):
        mock_settings = MagicMock()
        mock_settings.db.backend = "postgres"
        with patch("services.db_compat.get_settings", return_value=mock_settings):
            assert is_postgres() is True


# ---------------------------------------------------------------------------
# get_read_connection() – SQLite path
# ---------------------------------------------------------------------------


class TestGetReadConnectionSQLite:
    """Test get_read_connection for the SQLite backend."""

    def test_returns_sqlite_connection(self, tmp_path):
        db_path = tmp_path / "test.db"
        # Create the DB file
        sqlite3.connect(str(db_path)).close()

        mock_settings = MagicMock()
        mock_settings.db.backend = "sqlite"
        mock_settings.db.resolved_sqlite_path = db_path

        with (
            patch("services.db_compat.is_postgres", return_value=False),
            patch("services.db_compat.get_settings", return_value=mock_settings),
        ):
            conn = get_read_connection()
            try:
                assert isinstance(conn, sqlite3.Connection)
                # Row factory should be set
                conn.execute("CREATE TABLE t (id INTEGER)")
                conn.execute("INSERT INTO t VALUES (1)")
                row = conn.execute("SELECT * FROM t").fetchone()
                assert row["id"] == 1
            finally:
                conn.close()

    def test_sqlite_fallback_when_settings_none(self, tmp_path, monkeypatch):
        """When settings is None, falls back to _SQLITE_PATH."""
        # We patch _SQLITE_PATH to point to a temp db
        db_path = str(tmp_path / "test.db")
        sqlite3.connect(db_path).close()

        with (
            patch("services.db_compat.is_postgres", return_value=False),
            patch("services.db_compat.get_settings", return_value=None),
            patch("services.db_compat._SQLITE_PATH", db_path),
        ):
            conn = get_read_connection()
            try:
                assert isinstance(conn, sqlite3.Connection)
            finally:
                conn.close()


class TestGetReadConnectionPostgres:
    """Test get_read_connection for the PostgreSQL backend (mocked)."""

    def test_uses_pool_when_available(self):
        mock_conn = MagicMock()
        with (
            patch("services.db_compat.is_postgres", return_value=True),
            patch(
                "services.db_compat.get_pool_connection",
                return_value=mock_conn,
                create=True,
            ),
            patch(
                "services.db_compat.is_pool_initialized", return_value=True, create=True
            ),
        ):
            # We need to patch the import inside the function
            import services.db_compat as mod

            with patch.object(mod, "is_postgres", return_value=True):
                with patch.dict(
                    "sys.modules",
                    {
                        "database.pool": MagicMock(
                            is_pool_initialized=MagicMock(return_value=True),
                            get_pool_connection=MagicMock(return_value=mock_conn),
                        )
                    },
                ):
                    conn = get_read_connection()
                    assert conn is mock_conn

    def test_falls_back_to_direct_when_pool_unavailable(self):
        mock_conn = MagicMock()
        mock_settings = MagicMock()
        mock_settings.db.pg_host = "localhost"
        mock_settings.db.pg_port = 5432
        mock_settings.db.pg_database = "testdb"
        mock_settings.db.pg_user = "user"
        mock_settings.db.pg_password = "pass"

        with (
            patch("services.db_compat.is_postgres", return_value=True),
            patch("services.db_compat.get_settings", return_value=mock_settings),
        ):
            # Make pool import raise ImportError
            with patch.dict("sys.modules", {"database.pool": None}):
                with patch("psycopg2.connect", return_value=mock_conn) as mock_connect:
                    conn = get_read_connection()
                    assert conn is mock_conn
                    mock_connect.assert_called_once()


# ---------------------------------------------------------------------------
# fetchall_compat / fetchone_compat / scalar_compat – SQLite
# ---------------------------------------------------------------------------


class TestFetchCompatSQLite:
    """Test compat fetch functions with real SQLite connections."""

    @pytest.fixture
    def conn(self):
        c = sqlite3.connect(":memory:")
        c.row_factory = sqlite3.Row
        c.execute("CREATE TABLE t (id INTEGER, name TEXT)")
        c.execute("INSERT INTO t VALUES (1, 'alice')")
        c.execute("INSERT INTO t VALUES (2, 'bob')")
        c.commit()
        yield c
        c.close()

    def test_fetchall_returns_dicts(self, conn):
        with patch("services.db_compat.is_postgres", return_value=False):
            rows = fetchall_compat(conn, "SELECT * FROM t ORDER BY id")
            assert len(rows) == 2
            assert rows[0] == {"id": 1, "name": "alice"}

    def test_fetchall_with_params(self, conn):
        with patch("services.db_compat.is_postgres", return_value=False):
            rows = fetchall_compat(conn, "SELECT * FROM t WHERE id = ?", (1,))
            assert len(rows) == 1

    def test_fetchall_empty_result(self, conn):
        with patch("services.db_compat.is_postgres", return_value=False):
            rows = fetchall_compat(conn, "SELECT * FROM t WHERE id = ?", (999,))
            assert rows == []

    def test_fetchone_returns_dict(self, conn):
        with patch("services.db_compat.is_postgres", return_value=False):
            row = fetchone_compat(conn, "SELECT * FROM t WHERE id = ?", (1,))
            assert row == {"id": 1, "name": "alice"}

    def test_fetchone_returns_none(self, conn):
        with patch("services.db_compat.is_postgres", return_value=False):
            row = fetchone_compat(conn, "SELECT * FROM t WHERE id = ?", (999,))
            assert row is None

    def test_scalar_returns_value(self, conn):
        with patch("services.db_compat.is_postgres", return_value=False):
            count = scalar_compat(conn, "SELECT COUNT(*) FROM t")
            assert count == 2

    def test_scalar_returns_none_for_empty(self, conn):
        with patch("services.db_compat.is_postgres", return_value=False):
            c = sqlite3.connect(":memory:")
            c.execute("CREATE TABLE empty_t (id INTEGER)")
            val = scalar_compat(c, "SELECT id FROM empty_t")
            assert val is None
            c.close()


class TestFetchCompatPostgres:
    """Test compat fetch functions with mocked PG connections."""

    def test_fetchall_pg(self):
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.fetchall.return_value = [{"id": 1}, {"id": 2}]
        mock_conn.cursor.return_value.__enter__ = MagicMock(return_value=mock_cursor)
        mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)

        with patch("services.db_compat.is_postgres", return_value=True):
            rows = fetchall_compat(mock_conn, "SELECT 1", ())
            assert len(rows) == 2

    def test_fetchone_pg_returns_dict(self):
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = {"id": 1, "name": "test"}
        mock_conn.cursor.return_value.__enter__ = MagicMock(return_value=mock_cursor)
        mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)

        with patch("services.db_compat.is_postgres", return_value=True):
            row = fetchone_compat(mock_conn, "SELECT 1", ())
            assert row == {"id": 1, "name": "test"}

    def test_fetchone_pg_returns_none(self):
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = None
        mock_conn.cursor.return_value.__enter__ = MagicMock(return_value=mock_cursor)
        mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)

        with patch("services.db_compat.is_postgres", return_value=True):
            row = fetchone_compat(mock_conn, "SELECT 1", ())
            assert row is None

    def test_scalar_pg(self):
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = (42,)
        mock_conn.cursor.return_value.__enter__ = MagicMock(return_value=mock_cursor)
        mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)

        with patch("services.db_compat.is_postgres", return_value=True):
            val = scalar_compat(mock_conn, "SELECT COUNT(*)", ())
            assert val == 42

    def test_scalar_pg_none(self):
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = None
        mock_conn.cursor.return_value.__enter__ = MagicMock(return_value=mock_cursor)
        mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)

        with patch("services.db_compat.is_postgres", return_value=True):
            val = scalar_compat(mock_conn, "SELECT 1 WHERE FALSE", ())
            assert val is None


# ---------------------------------------------------------------------------
# table_exists()
# ---------------------------------------------------------------------------


class TestTableExists:
    """Test table_exists for both backends."""

    def test_sqlite_table_exists(self):
        conn = sqlite3.connect(":memory:")
        conn.execute("CREATE TABLE my_table (id INTEGER)")
        with patch("services.db_compat.is_postgres", return_value=False):
            assert table_exists(conn, "my_table") is True
        conn.close()

    def test_sqlite_table_not_exists(self):
        conn = sqlite3.connect(":memory:")
        with patch("services.db_compat.is_postgres", return_value=False):
            assert table_exists(conn, "nonexistent") is False
        conn.close()

    def test_pg_table_exists(self):
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = (1,)
        mock_conn.cursor.return_value.__enter__ = MagicMock(return_value=mock_cursor)
        mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)

        with patch("services.db_compat.is_postgres", return_value=True):
            assert table_exists(mock_conn, "companies") is True

    def test_pg_table_not_exists(self):
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = None
        mock_conn.cursor.return_value.__enter__ = MagicMock(return_value=mock_cursor)
        mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)

        with patch("services.db_compat.is_postgres", return_value=True):
            assert table_exists(mock_conn, "nonexistent") is False
