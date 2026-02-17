"""
Integration Tests: PostgreSQL Path
====================================
Tests the PostgreSQL database path end-to-end.

Skips automatically if PostgreSQL is not available (no POSTGRES_HOST or
unable to connect). When PG is available, tests:
  - Connection and table creation
  - Data insertion and retrieval
  - Query via TASI-style endpoints
  - Cleanup

Markers:
  - integration
  - pg_required: requires a running PostgreSQL instance
"""

from __future__ import annotations

import os
import sys
import uuid
from pathlib import Path

import pytest

# Ensure project root on sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


# ---------------------------------------------------------------------------
# Skip if PostgreSQL is not available
# ---------------------------------------------------------------------------


def _pg_available() -> bool:
    """Check if PostgreSQL is reachable."""
    if not os.environ.get("POSTGRES_HOST"):
        return False
    try:
        import psycopg2

        conn = psycopg2.connect(
            host=os.environ.get("POSTGRES_HOST", "localhost"),
            port=int(os.environ.get("POSTGRES_PORT", "5432")),
            dbname=os.environ.get("POSTGRES_DB", "tasi_platform"),
            user=os.environ.get("POSTGRES_USER", "tasi_user"),
            password=os.environ.get("POSTGRES_PASSWORD", ""),
            connect_timeout=5,
        )
        conn.close()
        return True
    except Exception:
        return False


PG_AVAILABLE = _pg_available()
pytestmark = [
    pytest.mark.integration,
    pytest.mark.pg_required,
    pytest.mark.skipif(
        not PG_AVAILABLE,
        reason="PostgreSQL not available (set POSTGRES_HOST and ensure PG is running)",
    ),
]


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def pg_conn():
    """Provide a PostgreSQL connection for the test module."""
    import psycopg2

    conn = psycopg2.connect(
        host=os.environ.get("POSTGRES_HOST", "localhost"),
        port=int(os.environ.get("POSTGRES_PORT", "5432")),
        dbname=os.environ.get("POSTGRES_DB", "tasi_platform"),
        user=os.environ.get("POSTGRES_USER", "tasi_user"),
        password=os.environ.get("POSTGRES_PASSWORD", ""),
    )
    conn.autocommit = True
    yield conn
    conn.close()


@pytest.fixture
def test_table_name():
    """Generate a unique temp table name for isolation."""
    suffix = uuid.uuid4().hex[:8]
    return f"_test_integration_{suffix}"


@pytest.fixture
def temp_table(pg_conn, test_table_name):
    """Create a temporary test table and drop it after the test."""
    cur = pg_conn.cursor()
    cur.execute(
        f"""
        CREATE TABLE IF NOT EXISTS {test_table_name} (
            ticker TEXT PRIMARY KEY,
            short_name TEXT,
            sector TEXT,
            current_price NUMERIC
        )
        """
    )
    cur.close()
    yield test_table_name
    # Cleanup
    cur = pg_conn.cursor()
    cur.execute(f"DROP TABLE IF EXISTS {test_table_name}")
    cur.close()


# ---------------------------------------------------------------------------
# Connection tests
# ---------------------------------------------------------------------------


class TestPGConnection:
    """Test basic PostgreSQL connectivity."""

    def test_connection_alive(self, pg_conn):
        cur = pg_conn.cursor()
        cur.execute("SELECT 1")
        result = cur.fetchone()
        cur.close()
        assert result == (1,)

    def test_pg_version(self, pg_conn):
        cur = pg_conn.cursor()
        cur.execute("SELECT version()")
        version = cur.fetchone()[0]
        cur.close()
        assert "PostgreSQL" in version


# ---------------------------------------------------------------------------
# Table creation tests
# ---------------------------------------------------------------------------


class TestPGTableCreation:
    """Test table creation and schema verification."""

    def test_create_table(self, pg_conn, temp_table):
        cur = pg_conn.cursor()
        cur.execute(
            f"SELECT column_name, data_type FROM information_schema.columns "
            f"WHERE table_name = '{temp_table}' ORDER BY ordinal_position"
        )
        columns = cur.fetchall()
        cur.close()

        col_names = [c[0] for c in columns]
        assert "ticker" in col_names
        assert "short_name" in col_names
        assert "sector" in col_names
        assert "current_price" in col_names


# ---------------------------------------------------------------------------
# Data insertion and retrieval
# ---------------------------------------------------------------------------


class TestPGDataOperations:
    """Test data insertion, retrieval, and query patterns."""

    def test_insert_and_query(self, pg_conn, temp_table):
        cur = pg_conn.cursor()
        cur.execute(
            f"INSERT INTO {temp_table} (ticker, short_name, sector, current_price) "
            f"VALUES (%s, %s, %s, %s)",
            ("2222.SR", "Saudi Aramco", "Energy", 32.50),
        )
        cur.execute(
            f"INSERT INTO {temp_table} (ticker, short_name, sector, current_price) "
            f"VALUES (%s, %s, %s, %s)",
            ("1010.SR", "RIBL", "Financial Services", 80.00),
        )
        cur.execute(f"SELECT COUNT(*) FROM {temp_table}")
        count = cur.fetchone()[0]
        cur.close()
        assert count == 2

    def test_query_by_sector(self, pg_conn, temp_table):
        cur = pg_conn.cursor()
        # Insert test data
        cur.execute(
            f"INSERT INTO {temp_table} (ticker, short_name, sector, current_price) "
            f"VALUES (%s, %s, %s, %s) ON CONFLICT (ticker) DO NOTHING",
            ("2222.SR", "Saudi Aramco", "Energy", 32.50),
        )
        cur.execute(
            f"INSERT INTO {temp_table} (ticker, short_name, sector, current_price) "
            f"VALUES (%s, %s, %s, %s) ON CONFLICT (ticker) DO NOTHING",
            ("1010.SR", "RIBL", "Financial Services", 80.00),
        )
        # Query by sector
        cur.execute(
            f"SELECT ticker, short_name FROM {temp_table} WHERE sector = %s",
            ("Energy",),
        )
        rows = cur.fetchall()
        cur.close()
        assert len(rows) == 1
        assert rows[0][0] == "2222.SR"

    def test_query_price_range(self, pg_conn, temp_table):
        cur = pg_conn.cursor()
        cur.execute(
            f"INSERT INTO {temp_table} (ticker, short_name, sector, current_price) "
            f"VALUES (%s, %s, %s, %s) ON CONFLICT (ticker) DO NOTHING",
            ("2222.SR", "Saudi Aramco", "Energy", 32.50),
        )
        cur.execute(
            f"INSERT INTO {temp_table} (ticker, short_name, sector, current_price) "
            f"VALUES (%s, %s, %s, %s) ON CONFLICT (ticker) DO NOTHING",
            ("1010.SR", "RIBL", "Financial Services", 80.00),
        )
        cur.execute(
            f"SELECT ticker FROM {temp_table} WHERE current_price > %s ORDER BY current_price DESC",
            (50.0,),
        )
        rows = cur.fetchall()
        cur.close()
        assert len(rows) == 1
        assert rows[0][0] == "1010.SR"


# ---------------------------------------------------------------------------
# Schema verification (if main schema tables exist)
# ---------------------------------------------------------------------------


class TestPGSchemaVerification:
    """Verify that the main application tables exist (if schema has been applied)."""

    def test_companies_table_exists(self, pg_conn):
        cur = pg_conn.cursor()
        cur.execute(
            "SELECT EXISTS ("
            "  SELECT 1 FROM information_schema.tables "
            "  WHERE table_name = 'companies'"
            ")"
        )
        exists = cur.fetchone()[0]
        cur.close()
        if not exists:
            pytest.skip("companies table not found (schema not applied)")
        assert exists

    def test_companies_has_data(self, pg_conn):
        cur = pg_conn.cursor()
        try:
            cur.execute("SELECT COUNT(*) FROM companies")
            count = cur.fetchone()[0]
        except Exception:
            pytest.skip("companies table not accessible")
            return
        finally:
            cur.close()
        assert count > 0, "companies table is empty"
