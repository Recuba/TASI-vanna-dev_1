"""
Tests for api/db_helper.py

Covers:
- _convert_sql() placeholder conversion (pure function)
- is_postgres() backend detection
- get_conn() for SQLite path (happy + missing DB)
- fetchall() / fetchone() with in-memory SQLite
- _sync_fetchall() / _sync_fetchone() with mock sqlite pool
- afetchall() / afetchone() async wrappers
"""

from __future__ import annotations

import sqlite3
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest


# ---------------------------------------------------------------------------
# Helpers to reload module state with different env vars
# ---------------------------------------------------------------------------


def _import_fresh(monkeypatch, backend="sqlite", sqlite_path=None):
    """Force-reimport api.db_helper with custom env vars.

    The module reads DB_BACKEND and DB_SQLITE_PATH at import-time, so we
    must reload it to test different configurations.
    """
    import importlib

    monkeypatch.setenv("DB_BACKEND", backend)
    if sqlite_path is not None:
        monkeypatch.setenv("DB_SQLITE_PATH", str(sqlite_path))
    else:
        monkeypatch.delenv("DB_SQLITE_PATH", raising=False)

    import api.db_helper as mod

    importlib.reload(mod)
    return mod


# =========================================================================
# _convert_sql
# =========================================================================


class TestConvertSql:
    """Test the SQL placeholder conversion helper."""

    def test_no_conversion_in_sqlite_mode(self, monkeypatch):
        mod = _import_fresh(monkeypatch, backend="sqlite")
        sql = "SELECT * FROM t WHERE id = ? AND name = ?"
        assert mod._convert_sql(sql) == sql

    def test_converts_placeholders_for_postgres(self, monkeypatch):
        mod = _import_fresh(monkeypatch, backend="postgres")
        sql = "SELECT * FROM t WHERE id = ? AND name = ?"
        assert mod._convert_sql(sql) == "SELECT * FROM t WHERE id = %s AND name = %s"

    def test_skips_question_marks_in_single_quotes(self, monkeypatch):
        mod = _import_fresh(monkeypatch, backend="postgres")
        sql = "SELECT * FROM t WHERE name LIKE '%?%' AND id = ?"
        result = mod._convert_sql(sql)
        assert result == "SELECT * FROM t WHERE name LIKE '%?%' AND id = %s"

    def test_skips_question_marks_in_double_quotes(self, monkeypatch):
        mod = _import_fresh(monkeypatch, backend="postgres")
        sql = 'SELECT * FROM t WHERE "col?" = ?'
        result = mod._convert_sql(sql)
        assert result == 'SELECT * FROM t WHERE "col?" = %s'

    def test_no_placeholders(self, monkeypatch):
        mod = _import_fresh(monkeypatch, backend="postgres")
        sql = "SELECT 1"
        assert mod._convert_sql(sql) == "SELECT 1"

    def test_empty_string(self, monkeypatch):
        mod = _import_fresh(monkeypatch, backend="postgres")
        assert mod._convert_sql("") == ""

    def test_multiple_quoted_and_bare(self, monkeypatch):
        mod = _import_fresh(monkeypatch, backend="postgres")
        sql = "INSERT INTO t (a, b, c) VALUES (?, '?literal', ?)"
        result = mod._convert_sql(sql)
        assert result == "INSERT INTO t (a, b, c) VALUES (%s, '?literal', %s)"


# =========================================================================
# is_postgres
# =========================================================================


class TestIsPostgres:
    """Test backend detection function."""

    def test_returns_false_for_sqlite(self, monkeypatch):
        mod = _import_fresh(monkeypatch, backend="sqlite")
        assert mod.is_postgres() is False

    def test_returns_true_for_postgres(self, monkeypatch):
        mod = _import_fresh(monkeypatch, backend="postgres")
        assert mod.is_postgres() is True


# =========================================================================
# get_conn - SQLite mode
# =========================================================================


class TestGetConnSqlite:
    """Test get_conn() in SQLite mode."""

    def test_returns_sqlite_connection(self, monkeypatch, test_db):
        mod = _import_fresh(monkeypatch, backend="sqlite", sqlite_path=test_db["path"])
        conn = mod.get_conn()
        try:
            assert conn is not None
            # Verify row_factory is set
            assert conn.row_factory is sqlite3.Row
            # Verify we can query
            row = conn.execute("SELECT 1 AS val").fetchone()
            assert row["val"] == 1
        finally:
            conn.close()

    def test_raises_503_when_db_missing(self, monkeypatch, tmp_path):
        missing_path = tmp_path / "nonexistent.db"
        mod = _import_fresh(monkeypatch, backend="sqlite", sqlite_path=missing_path)
        from fastapi import HTTPException

        with pytest.raises(HTTPException) as exc_info:
            mod.get_conn()
        assert exc_info.value.status_code == 503
        assert "not found" in exc_info.value.detail.lower()

    def test_delegates_to_pg_in_postgres_mode(self, monkeypatch):
        mod = _import_fresh(monkeypatch, backend="postgres")
        mock_conn = MagicMock()
        with patch("api.dependencies.get_db_connection", return_value=mock_conn):
            result = mod.get_conn()
        assert result is mock_conn


# =========================================================================
# fetchall / fetchone - SQLite mode
# =========================================================================


class TestFetchallSqlite:
    """Test fetchall with in-memory SQLite."""

    @pytest.fixture
    def mem_conn(self):
        conn = sqlite3.connect(":memory:")
        conn.row_factory = sqlite3.Row
        conn.execute("CREATE TABLE items (id INTEGER, name TEXT)")
        conn.execute("INSERT INTO items VALUES (1, 'alpha')")
        conn.execute("INSERT INTO items VALUES (2, 'beta')")
        conn.commit()
        yield conn
        conn.close()

    def test_fetchall_returns_list_of_dicts(self, monkeypatch, mem_conn):
        mod = _import_fresh(monkeypatch, backend="sqlite")
        rows = mod.fetchall(mem_conn, "SELECT * FROM items ORDER BY id")
        assert len(rows) == 2
        assert rows[0] == {"id": 1, "name": "alpha"}
        assert rows[1] == {"id": 2, "name": "beta"}

    def test_fetchall_with_params(self, monkeypatch, mem_conn):
        mod = _import_fresh(monkeypatch, backend="sqlite")
        rows = mod.fetchall(mem_conn, "SELECT * FROM items WHERE id = ?", (1,))
        assert len(rows) == 1
        assert rows[0]["name"] == "alpha"

    def test_fetchall_empty_result(self, monkeypatch, mem_conn):
        mod = _import_fresh(monkeypatch, backend="sqlite")
        rows = mod.fetchall(mem_conn, "SELECT * FROM items WHERE id = ?", (999,))
        assert rows == []

    def test_fetchall_none_params_treated_as_empty(self, monkeypatch, mem_conn):
        mod = _import_fresh(monkeypatch, backend="sqlite")
        rows = mod.fetchall(mem_conn, "SELECT * FROM items ORDER BY id", None)
        assert len(rows) == 2


class TestFetchoneSqlite:
    """Test fetchone with in-memory SQLite."""

    @pytest.fixture
    def mem_conn(self):
        conn = sqlite3.connect(":memory:")
        conn.row_factory = sqlite3.Row
        conn.execute("CREATE TABLE items (id INTEGER, name TEXT)")
        conn.execute("INSERT INTO items VALUES (1, 'alpha')")
        conn.commit()
        yield conn
        conn.close()

    def test_fetchone_returns_dict(self, monkeypatch, mem_conn):
        mod = _import_fresh(monkeypatch, backend="sqlite")
        row = mod.fetchone(mem_conn, "SELECT * FROM items WHERE id = ?", (1,))
        assert row == {"id": 1, "name": "alpha"}

    def test_fetchone_returns_none_when_empty(self, monkeypatch, mem_conn):
        mod = _import_fresh(monkeypatch, backend="sqlite")
        row = mod.fetchone(mem_conn, "SELECT * FROM items WHERE id = ?", (999,))
        assert row is None


# =========================================================================
# _sync_fetchall / _sync_fetchone - SQLite path via mocked pool
# =========================================================================


class TestSyncFetchSqlite:
    """Test _sync_fetchall and _sync_fetchone in SQLite mode."""

    def test_sync_fetchall_uses_sqlite_pool(self, monkeypatch, tmp_path):
        # Create a real SQLite database
        db_path = tmp_path / "test.db"
        conn = sqlite3.connect(str(db_path))
        conn.row_factory = sqlite3.Row
        conn.execute("CREATE TABLE t (id INTEGER, val TEXT)")
        conn.execute("INSERT INTO t VALUES (1, 'x')")
        conn.commit()
        conn.close()

        mod = _import_fresh(monkeypatch, backend="sqlite", sqlite_path=db_path)

        # Mock the sqlite_pool to return a real connection
        pool_conn = sqlite3.connect(str(db_path))
        pool_conn.row_factory = sqlite3.Row

        class FakeCtx:
            def __enter__(self):
                return pool_conn

            def __exit__(self, *_):
                pass

        mock_pool = MagicMock()
        mock_pool.connection.return_value = FakeCtx()

        with patch("services.sqlite_pool.get_pool", return_value=mock_pool):
            result = mod._sync_fetchall("SELECT * FROM t")

        assert len(result) == 1
        assert result[0]["val"] == "x"
        pool_conn.close()

    def test_sync_fetchone_uses_sqlite_pool(self, monkeypatch, tmp_path):
        db_path = tmp_path / "test.db"
        conn = sqlite3.connect(str(db_path))
        conn.row_factory = sqlite3.Row
        conn.execute("CREATE TABLE t (id INTEGER, val TEXT)")
        conn.execute("INSERT INTO t VALUES (1, 'hello')")
        conn.commit()
        conn.close()

        mod = _import_fresh(monkeypatch, backend="sqlite", sqlite_path=db_path)

        pool_conn = sqlite3.connect(str(db_path))
        pool_conn.row_factory = sqlite3.Row

        class FakeCtx:
            def __enter__(self):
                return pool_conn

            def __exit__(self, *_):
                pass

        mock_pool = MagicMock()
        mock_pool.connection.return_value = FakeCtx()

        with patch("services.sqlite_pool.get_pool", return_value=mock_pool):
            result = mod._sync_fetchone("SELECT * FROM t WHERE id = ?", (1,))

        assert result == {"id": 1, "val": "hello"}
        pool_conn.close()


# =========================================================================
# afetchall / afetchone - async wrappers
# =========================================================================


class TestAsyncFetch:
    """Test async wrappers that delegate to _sync_* via asyncio.to_thread.

    We mock _sync_fetchall/_sync_fetchone directly because the real
    implementations use SQLite connections that cannot cross threads
    (check_same_thread=True by default).
    """

    @pytest.mark.asyncio
    async def test_afetchall_delegates_to_sync(self, monkeypatch):
        mod = _import_fresh(monkeypatch, backend="sqlite")
        expected = [{"id": 42}]
        with patch.object(mod, "_sync_fetchall", return_value=expected) as mock_sync:
            result = await mod.afetchall("SELECT * FROM t", (1,))
        assert result == expected
        mock_sync.assert_called_once_with("SELECT * FROM t", (1,))

    @pytest.mark.asyncio
    async def test_afetchone_delegates_to_sync(self, monkeypatch):
        mod = _import_fresh(monkeypatch, backend="sqlite")
        expected = {"id": 7}
        with patch.object(mod, "_sync_fetchone", return_value=expected) as mock_sync:
            result = await mod.afetchone("SELECT * FROM t WHERE id = ?", (7,))
        assert result == expected
        mock_sync.assert_called_once_with("SELECT * FROM t WHERE id = ?", (7,))

    @pytest.mark.asyncio
    async def test_afetchone_returns_none(self, monkeypatch):
        mod = _import_fresh(monkeypatch, backend="sqlite")
        with patch.object(mod, "_sync_fetchone", return_value=None) as mock_sync:
            result = await mod.afetchone("SELECT * FROM t WHERE id = ?", (999,))
        assert result is None
        mock_sync.assert_called_once()

    @pytest.mark.asyncio
    async def test_afetchall_no_params(self, monkeypatch):
        mod = _import_fresh(monkeypatch, backend="sqlite")
        expected = [{"id": 1}, {"id": 2}]
        with patch.object(mod, "_sync_fetchall", return_value=expected):
            result = await mod.afetchall("SELECT * FROM t")
        assert result == expected


# =========================================================================
# Placeholder regex edge cases
# =========================================================================


class TestPlaceholderRegex:
    """Test the _PLACEHOLDER_RE regex used by _convert_sql."""

    def test_adjacent_quoted_and_bare(self, monkeypatch):
        mod = _import_fresh(monkeypatch, backend="postgres")
        sql = "WHERE a = '?' AND b = ?"
        assert mod._convert_sql(sql) == "WHERE a = '?' AND b = %s"

    def test_only_quoted_no_bare(self, monkeypatch):
        mod = _import_fresh(monkeypatch, backend="postgres")
        sql = "WHERE a LIKE '%?%'"
        assert mod._convert_sql(sql) == "WHERE a LIKE '%?%'"

    def test_mixed_quotes(self, monkeypatch):
        mod = _import_fresh(monkeypatch, backend="postgres")
        sql = """WHERE a = '?' AND b = "?" AND c = ?"""
        result = mod._convert_sql(sql)
        assert result == """WHERE a = '?' AND b = "?" AND c = %s"""
