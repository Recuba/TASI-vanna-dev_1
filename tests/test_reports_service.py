"""
Tests for services.reports_service and database.manager
========================================================
Covers TechnicalReport dataclass, TechnicalReportsService CRUD (SQLite path),
and DatabaseManager context managers.
"""

from __future__ import annotations

import asyncio
import sqlite3
from datetime import datetime
from unittest.mock import MagicMock, patch

import pytest

from services.reports_service import TechnicalReport, TechnicalReportsService
from database.manager import DatabaseManager


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def memory_conn():
    """Return a fresh in-memory SQLite connection with Row factory."""
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    return conn


@pytest.fixture
def svc(memory_conn):
    """TechnicalReportsService backed by an in-memory SQLite DB."""
    # The service calls conn.close() after each operation, so we give it a
    # factory that always returns a *new* connection to the same in-memory DB.
    # We use a shared cache URI so all connections see the same data.
    uri = "file:test_reports?mode=memory&cache=shared"

    def _get_conn():
        c = sqlite3.connect(uri, uri=True)
        c.row_factory = sqlite3.Row
        return c

    service = TechnicalReportsService(_get_conn)
    # Pre-create the table on the shared URI
    init_conn = sqlite3.connect(uri, uri=True)
    init_conn.row_factory = sqlite3.Row
    init_conn.execute(TechnicalReportsService._SQLITE_CREATE_TABLE)
    init_conn.commit()
    yield service
    init_conn.close()


def _make_report(**overrides) -> TechnicalReport:
    """Create a TechnicalReport with sensible defaults."""
    defaults = dict(
        ticker="2222.SR",
        title="Test Report",
        summary="Summary text",
        author="Analyst",
        source_name="TestSource",
        source_url="https://example.com/report",
        published_at=datetime(2025, 6, 15, 10, 0, 0),
        recommendation="buy",
        target_price=36.0,
        current_price_at_report=32.5,
        report_type="initiation",
    )
    defaults.update(overrides)
    return TechnicalReport(**defaults)


# ---------------------------------------------------------------------------
# TechnicalReport dataclass
# ---------------------------------------------------------------------------


class TestTechnicalReport:
    """Tests for the TechnicalReport dataclass."""

    def test_default_id_is_uuid(self):
        r = TechnicalReport(title="X")
        assert len(r.id) == 36  # UUID4 format: 8-4-4-4-12
        assert r.id.count("-") == 4

    def test_to_dict_removes_none_created_at(self):
        r = TechnicalReport(title="X")
        d = r.to_dict()
        assert "created_at" not in d

    def test_to_dict_keeps_created_at_if_set(self):
        ts = datetime(2025, 1, 1)
        r = TechnicalReport(title="X", created_at=ts)
        d = r.to_dict()
        assert d["created_at"] == ts

    def test_to_dict_includes_all_fields(self):
        r = _make_report()
        d = r.to_dict()
        for key in ("ticker", "title", "summary", "author", "recommendation"):
            assert key in d

    def test_default_values(self):
        r = TechnicalReport()
        assert r.title == ""
        assert r.ticker is None
        assert r.target_price is None


# ---------------------------------------------------------------------------
# TechnicalReportsService – SQLite CRUD
# ---------------------------------------------------------------------------


class TestStoreReport:
    """Test store_report (single insert)."""

    def test_store_and_retrieve(self, svc):
        r = _make_report()
        returned_id = svc.store_report(r)
        assert returned_id == r.id

        fetched = svc.get_report_by_id(r.id)
        assert fetched is not None
        assert fetched.ticker == "2222.SR"
        assert fetched.title == "Test Report"

    def test_store_duplicate_id_is_ignored(self, svc):
        r = _make_report()
        svc.store_report(r)
        # Insert again with same id -- should not raise
        svc.store_report(r)
        count = svc.count_reports()
        assert count == 1

    def test_store_minimal_report(self, svc):
        r = TechnicalReport(title="Minimal")
        svc.store_report(r)
        fetched = svc.get_report_by_id(r.id)
        assert fetched is not None
        assert fetched.title == "Minimal"
        assert fetched.ticker is None
        assert fetched.target_price is None

    def test_store_report_error_triggers_rollback(self):
        """If execute raises, the service should rollback and re-raise."""
        mock_conn = MagicMock(spec=sqlite3.Connection)
        mock_conn.execute.side_effect = sqlite3.OperationalError("disk full")
        # Make _is_sqlite return True
        with patch.object(
            TechnicalReportsService, "_is_sqlite", return_value=True
        ), patch.object(
            TechnicalReportsService, "_ensure_table"
        ):
            svc = TechnicalReportsService(lambda: mock_conn)
            with pytest.raises(sqlite3.OperationalError, match="disk full"):
                svc.store_report(_make_report())
            mock_conn.rollback.assert_called_once()
            mock_conn.close.assert_called_once()


class TestStoreReports:
    """Test store_reports (bulk insert)."""

    def test_bulk_store(self, svc):
        reports = [_make_report(title=f"R{i}") for i in range(5)]
        count = svc.store_reports(reports)
        assert count == 5
        assert svc.count_reports() == 5

    def test_bulk_store_empty_list(self, svc):
        count = svc.store_reports([])
        assert count == 0

    def test_bulk_store_error_triggers_rollback(self):
        mock_conn = MagicMock(spec=sqlite3.Connection)
        mock_conn.executemany.side_effect = sqlite3.OperationalError("fail")
        with patch.object(
            TechnicalReportsService, "_is_sqlite", return_value=True
        ), patch.object(
            TechnicalReportsService, "_ensure_table"
        ):
            svc = TechnicalReportsService(lambda: mock_conn)
            with pytest.raises(sqlite3.OperationalError):
                svc.store_reports([_make_report()])
            mock_conn.rollback.assert_called_once()


class TestGetReports:
    """Test get_reports (list with filters)."""

    def test_get_all_reports(self, svc):
        for i in range(3):
            svc.store_report(_make_report(title=f"Report {i}"))
        results = svc.get_reports(limit=10)
        assert len(results) == 3

    def test_get_reports_limit(self, svc):
        for i in range(5):
            svc.store_report(_make_report(title=f"Report {i}"))
        results = svc.get_reports(limit=2)
        assert len(results) == 2

    def test_get_reports_offset(self, svc):
        for i in range(5):
            svc.store_report(_make_report(title=f"Report {i}"))
        all_reports = svc.get_reports(limit=10)
        offset_reports = svc.get_reports(limit=10, offset=2)
        assert len(offset_reports) == 3
        assert offset_reports[0].id == all_reports[2].id

    def test_filter_by_recommendation(self, svc):
        svc.store_report(_make_report(title="Buy R", recommendation="buy"))
        svc.store_report(_make_report(title="Sell R", recommendation="sell"))
        results = svc.get_reports(recommendation="buy")
        assert len(results) == 1
        assert results[0].recommendation == "buy"

    def test_filter_by_report_type(self, svc):
        svc.store_report(_make_report(title="Init", report_type="initiation"))
        svc.store_report(_make_report(title="Upd", report_type="update"))
        results = svc.get_reports(report_type="initiation")
        assert len(results) == 1
        assert results[0].report_type == "initiation"

    def test_filter_by_since(self, svc):
        svc.store_report(
            _make_report(
                title="Old",
                published_at=datetime(2024, 1, 1),
            )
        )
        svc.store_report(
            _make_report(
                title="New",
                published_at=datetime(2025, 6, 1),
            )
        )
        results = svc.get_reports(since=datetime(2025, 1, 1))
        assert len(results) == 1
        assert results[0].title == "New"


class TestGetReportsByTicker:
    """Test get_reports_by_ticker."""

    def test_filter_by_ticker(self, svc):
        svc.store_report(_make_report(title="Aramco", ticker="2222.SR"))
        svc.store_report(_make_report(title="RIBL", ticker="1010.SR"))
        results = svc.get_reports_by_ticker("2222.SR")
        assert len(results) == 1
        assert results[0].ticker == "2222.SR"

    def test_ticker_with_recommendation_filter(self, svc):
        svc.store_report(
            _make_report(title="Buy", ticker="2222.SR", recommendation="buy")
        )
        svc.store_report(
            _make_report(title="Sell", ticker="2222.SR", recommendation="sell")
        )
        results = svc.get_reports_by_ticker("2222.SR", recommendation="buy")
        assert len(results) == 1

    def test_ticker_with_since_filter(self, svc):
        svc.store_report(
            _make_report(
                title="Old", ticker="2222.SR", published_at=datetime(2024, 1, 1)
            )
        )
        svc.store_report(
            _make_report(
                title="New", ticker="2222.SR", published_at=datetime(2025, 6, 1)
            )
        )
        results = svc.get_reports_by_ticker(
            "2222.SR", since=datetime(2025, 1, 1)
        )
        assert len(results) == 1
        assert results[0].title == "New"

    def test_nonexistent_ticker(self, svc):
        svc.store_report(_make_report(ticker="2222.SR"))
        results = svc.get_reports_by_ticker("9999.SR")
        assert results == []


class TestGetReportById:
    """Test get_report_by_id."""

    def test_existing_report(self, svc):
        r = _make_report()
        svc.store_report(r)
        fetched = svc.get_report_by_id(r.id)
        assert fetched is not None
        assert fetched.id == r.id

    def test_nonexistent_report(self, svc):
        result = svc.get_report_by_id("nonexistent-uuid")
        assert result is None


class TestCountReports:
    """Test count_reports."""

    def test_count_all(self, svc):
        assert svc.count_reports() == 0
        svc.store_report(_make_report(title="A"))
        svc.store_report(_make_report(title="B"))
        assert svc.count_reports() == 2

    def test_count_by_ticker(self, svc):
        svc.store_report(_make_report(title="A", ticker="2222.SR"))
        svc.store_report(_make_report(title="B", ticker="1010.SR"))
        assert svc.count_reports(ticker="2222.SR") == 1

    def test_count_by_recommendation(self, svc):
        svc.store_report(_make_report(title="A", recommendation="buy"))
        svc.store_report(_make_report(title="B", recommendation="sell"))
        assert svc.count_reports(recommendation="buy") == 1

    def test_count_by_ticker_and_recommendation(self, svc):
        svc.store_report(
            _make_report(title="A", ticker="2222.SR", recommendation="buy")
        )
        svc.store_report(
            _make_report(title="B", ticker="2222.SR", recommendation="sell")
        )
        svc.store_report(
            _make_report(title="C", ticker="1010.SR", recommendation="buy")
        )
        assert svc.count_reports(ticker="2222.SR", recommendation="buy") == 1


# ---------------------------------------------------------------------------
# TechnicalReportsService – helpers
# ---------------------------------------------------------------------------


class TestServiceHelpers:
    """Test static/class helper methods."""

    def test_is_sqlite_true(self, memory_conn):
        assert TechnicalReportsService._is_sqlite(memory_conn) is True

    def test_is_sqlite_false_for_mock(self):
        mock = MagicMock()
        assert TechnicalReportsService._is_sqlite(mock) is False

    def test_ensure_table_creates_table(self, memory_conn):
        TechnicalReportsService._ensure_table(memory_conn)
        row = memory_conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='technical_reports'"
        ).fetchone()
        assert row is not None

    def test_like_op(self):
        assert TechnicalReportsService._like_op(True) == "LIKE"
        assert TechnicalReportsService._like_op(False) == "ILIKE"

    def test_nulls_last(self):
        assert TechnicalReportsService._nulls_last(True) == ""
        assert TechnicalReportsService._nulls_last(False) == "NULLS LAST"

    def test_conflict_ignore(self):
        assert TechnicalReportsService._conflict_ignore(True) == "OR IGNORE"
        assert TechnicalReportsService._conflict_ignore(False) == ""

    def test_on_conflict(self):
        assert TechnicalReportsService._on_conflict(True) == ""
        assert "ON CONFLICT" in TechnicalReportsService._on_conflict(False)

    def test_row_to_report(self):
        row = {
            "id": "abc-123",
            "ticker": "2222.SR",
            "title": "T",
            "summary": "S",
            "author": "A",
            "source_name": "SN",
            "source_url": "http://x",
            "published_at": "2025-01-01",
            "recommendation": "buy",
            "target_price": 36.0,
            "current_price_at_report": 32.5,
            "report_type": "initiation",
            "created_at": "2025-01-01",
        }
        report = TechnicalReportsService._row_to_report(row)
        assert report.id == "abc-123"
        assert report.target_price == 36.0

    def test_row_to_report_null_prices(self):
        row = {
            "id": "abc-123",
            "ticker": None,
            "title": "T",
            "summary": None,
            "author": None,
            "source_name": None,
            "source_url": None,
            "published_at": None,
            "recommendation": None,
            "target_price": None,
            "current_price_at_report": None,
            "report_type": None,
            "created_at": None,
        }
        report = TechnicalReportsService._row_to_report(row)
        assert report.target_price is None
        assert report.current_price_at_report is None

    def test_build_insert_sql_sqlite(self, svc):
        sql = svc._build_insert_sql(is_sqlite=True)
        assert "INSERT OR IGNORE" in sql
        assert "?" in sql

    def test_build_insert_sql_postgres(self, svc):
        sql = svc._build_insert_sql(is_sqlite=False)
        assert "ON CONFLICT" in sql
        assert "%(id)s" in sql

    def test_to_insert_params_sqlite(self):
        r = _make_report()
        params = TechnicalReportsService._to_insert_params(r, is_sqlite=True)
        assert isinstance(params, tuple)
        assert len(params) == 12

    def test_to_insert_params_postgres(self):
        r = _make_report()
        params = TechnicalReportsService._to_insert_params(r, is_sqlite=False)
        assert isinstance(params, dict)
        assert "id" in params


# ---------------------------------------------------------------------------
# TechnicalReportsService – PostgreSQL path (mocked)
# ---------------------------------------------------------------------------


class TestReportsServicePostgres:
    """Test PG code paths with a mocked psycopg2 connection."""

    def _make_pg_svc(self, mock_conn):
        """Create a service backed by a mocked PG connection."""
        svc = TechnicalReportsService(lambda: mock_conn)
        return svc

    def test_store_report_pg(self):
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_conn.cursor.return_value.__enter__ = MagicMock(return_value=mock_cursor)
        mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)

        svc = self._make_pg_svc(mock_conn)
        r = _make_report()
        result_id = svc.store_report(r)

        assert result_id == r.id
        mock_conn.commit.assert_called_once()
        mock_conn.close.assert_called_once()

    def test_fetchall_pg(self):
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.fetchall.return_value = [{"id": 1, "name": "test"}]
        mock_conn.cursor.return_value.__enter__ = MagicMock(return_value=mock_cursor)
        mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)

        result = TechnicalReportsService._fetchall(mock_conn, "SELECT 1", {})
        assert len(result) == 1

    def test_fetchone_pg_returns_none(self):
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = None
        mock_conn.cursor.return_value.__enter__ = MagicMock(return_value=mock_cursor)
        mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)

        result = TechnicalReportsService._fetchone(mock_conn, "SELECT 1", {})
        assert result is None

    def test_scalar_pg(self):
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = (42,)
        mock_conn.cursor.return_value.__enter__ = MagicMock(return_value=mock_cursor)
        mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)

        result = TechnicalReportsService._scalar(mock_conn, "SELECT COUNT(*)", {})
        assert result == 42

    def test_scalar_pg_none(self):
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = None
        mock_conn.cursor.return_value.__enter__ = MagicMock(return_value=mock_cursor)
        mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)

        result = TechnicalReportsService._scalar(mock_conn, "SELECT COUNT(*)", {})
        assert result is None

    def test_executemany_pg(self):
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_conn.cursor.return_value.__enter__ = MagicMock(return_value=mock_cursor)
        mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)

        TechnicalReportsService._executemany(mock_conn, "INSERT INTO t VALUES (%s)", [("a",), ("b",)])
        mock_cursor.executemany.assert_called_once()


# ---------------------------------------------------------------------------
# DatabaseManager – SQLite path
# ---------------------------------------------------------------------------


class TestDatabaseManagerSQLite:
    """Test DatabaseManager with SQLite backend."""

    def test_backend_property(self):
        db = DatabaseManager(backend="sqlite", sqlite_path=":memory:")
        assert db.backend == "sqlite"

    def test_connection_context_commits(self, tmp_path):
        db_path = str(tmp_path / "test.db")
        db = DatabaseManager(backend="sqlite", sqlite_path=db_path)
        with db.connection() as conn:
            conn.execute("CREATE TABLE t (id INTEGER)")
            conn.execute("INSERT INTO t VALUES (1)")
        # Verify data persisted (committed)
        with db.connection() as conn:
            row = conn.execute("SELECT id FROM t").fetchone()
            assert row[0] == 1

    def test_connection_context_rollback_on_error(self, tmp_path):
        db_path = str(tmp_path / "test.db")
        db = DatabaseManager(backend="sqlite", sqlite_path=db_path)
        # Create the table first
        with db.connection() as conn:
            conn.execute("CREATE TABLE t (id INTEGER)")
        # Now try an operation that raises
        with pytest.raises(ValueError):
            with db.connection() as conn:
                conn.execute("INSERT INTO t VALUES (99)")
                raise ValueError("oops")
        # Data should be rolled back
        with db.connection() as conn:
            row = conn.execute("SELECT COUNT(*) FROM t").fetchone()
            assert row[0] == 0

    def test_connection_uses_row_factory(self, tmp_path):
        db_path = str(tmp_path / "test.db")
        db = DatabaseManager(backend="sqlite", sqlite_path=db_path)
        with db.connection() as conn:
            conn.execute("CREATE TABLE t (id INTEGER, name TEXT)")
            conn.execute("INSERT INTO t VALUES (1, 'hello')")
            conn.commit()
            row = conn.execute("SELECT * FROM t").fetchone()
            assert row["id"] == 1
            assert row["name"] == "hello"

    def test_raises_without_sqlite_path(self):
        db = DatabaseManager(backend="sqlite", sqlite_path=None)
        with pytest.raises(RuntimeError, match="SQLite path not configured"):
            with db.connection():
                pass

    def test_get_connection_dependency(self, tmp_path):
        db_path = str(tmp_path / "test.db")
        db = DatabaseManager(backend="sqlite", sqlite_path=db_path)
        gen = db.get_connection_dependency()
        conn = next(gen)
        assert isinstance(conn, sqlite3.Connection)
        # Exhaust the generator
        try:
            next(gen)
        except StopIteration:
            pass


class TestDatabaseManagerAsync:
    """Test DatabaseManager async context manager.

    Note: aconnection() creates the connection in a thread via asyncio.to_thread,
    then yields it back to the caller's async context. With SQLite's
    check_same_thread=True (the default in DatabaseManager), we can't use the
    connection across threads. So we test the async path using mocks to verify
    the commit/rollback logic without hitting SQLite thread restrictions.
    """

    def test_aconnection_commits(self):
        mock_conn = MagicMock()
        db = DatabaseManager(backend="sqlite", sqlite_path=":memory:")

        async def _run():
            with patch.object(db, "_get_raw_connection", return_value=mock_conn):
                async with db.aconnection() as conn:
                    assert conn is mock_conn

        asyncio.run(_run())
        mock_conn.commit.assert_called_once()
        mock_conn.close.assert_called_once()

    def test_aconnection_rollback_on_error(self):
        mock_conn = MagicMock()
        db = DatabaseManager(backend="sqlite", sqlite_path=":memory:")

        async def _run():
            with patch.object(db, "_get_raw_connection", return_value=mock_conn):
                async with db.aconnection() as _:
                    raise ValueError("async oops")

        with pytest.raises(ValueError):
            asyncio.run(_run())

        mock_conn.rollback.assert_called_once()
        mock_conn.commit.assert_not_called()
        mock_conn.close.assert_called_once()


class TestDatabaseManagerPostgres:
    """Test DatabaseManager PostgreSQL path with mocked psycopg2."""

    def test_raises_without_pg_settings(self):
        db = DatabaseManager(backend="postgres", pg_settings=None)
        # Make pool import raise ImportError so it falls through to direct connect
        with patch.dict("sys.modules", {"database.pool": None}):
            with pytest.raises(RuntimeError, match="PostgreSQL settings not configured"):
                db._get_raw_connection()

    def test_uses_pool_when_available(self):
        mock_pool_conn = MagicMock()
        mock_pool_module = MagicMock()
        mock_pool_module.is_pool_initialized.return_value = True
        mock_pool_module.get_pool_connection.return_value = mock_pool_conn

        db = DatabaseManager(backend="postgres", pg_settings=MagicMock())
        with patch.dict("sys.modules", {"database.pool": mock_pool_module}):
            conn = db._get_raw_connection()
            assert conn is mock_pool_conn


class TestGetDatabaseManager:
    """Test the get_database_manager singleton factory."""

    def test_returns_manager(self):
        from database.manager import get_database_manager

        # Clear the lru_cache
        get_database_manager.cache_clear()
        mgr = get_database_manager()
        assert isinstance(mgr, DatabaseManager)

    def test_fallback_on_config_error(self):
        from database.manager import get_database_manager

        get_database_manager.cache_clear()
        # get_settings is imported inside get_database_manager via
        # "from config import get_settings", so we patch it at the config module level
        with patch("config.get_settings", side_effect=RuntimeError("no config")):
            mgr = get_database_manager()
            assert isinstance(mgr, DatabaseManager)
            assert mgr.backend == "sqlite"
        get_database_manager.cache_clear()
