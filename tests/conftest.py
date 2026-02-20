"""
Shared pytest fixtures for TASI AI Platform tests.

Provides reusable fixtures for:
- SQLite test databases with sample data
- PostgreSQL live connections (when POSTGRES_HOST is set)
- Mock Redis clients
- JWT auth tokens
- FastAPI TestClient
- Mock PostgreSQL connection pools
"""

import os
import sqlite3
import sys
from pathlib import Path
from unittest.mock import MagicMock

import pytest

# Ensure project root is on sys.path for imports
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

# test_app_assembly_v2.py is a standalone script (not a pytest-compatible module).
# Its top-level `test_result()` function is mistakenly collected as a pytest fixture.
# Excluding it here prevents a confusing collection error; the CI runs it directly
# via `python tests/test_app_assembly_v2.py`.
collect_ignore = [str(Path(__file__).parent / "test_app_assembly_v2.py")]


# ---------------------------------------------------------------------------
# SQLite test database
# ---------------------------------------------------------------------------


@pytest.fixture
def test_db(tmp_path):
    """Create a temporary SQLite database with sample TASI data."""
    db_path = tmp_path / "test_saudi_stocks.db"
    conn = sqlite3.connect(str(db_path))
    cursor = conn.cursor()

    # Create core tables
    cursor.executescript("""
        CREATE TABLE companies (
            ticker TEXT PRIMARY KEY,
            short_name TEXT,
            sector TEXT,
            industry TEXT,
            exchange TEXT,
            currency TEXT
        );

        CREATE TABLE market_data (
            ticker TEXT PRIMARY KEY,
            current_price REAL,
            market_cap REAL,
            volume INTEGER,
            previous_close REAL,
            day_high REAL,
            day_low REAL,
            week_52_high REAL,
            week_52_low REAL,
            beta REAL
        );

        CREATE TABLE valuation_metrics (
            ticker TEXT PRIMARY KEY,
            trailing_pe REAL,
            forward_pe REAL,
            price_to_book REAL,
            trailing_eps REAL,
            peg_ratio REAL
        );

        CREATE TABLE profitability_metrics (
            ticker TEXT PRIMARY KEY,
            roe REAL,
            profit_margin REAL,
            revenue_growth REAL,
            operating_margin REAL
        );

        CREATE TABLE dividend_data (
            ticker TEXT PRIMARY KEY,
            dividend_yield REAL,
            dividend_rate REAL,
            payout_ratio REAL,
            ex_dividend_date TEXT
        );

        CREATE TABLE financial_summary (
            ticker TEXT PRIMARY KEY,
            total_revenue REAL,
            total_cash REAL,
            total_debt REAL,
            revenue_per_share REAL
        );

        CREATE TABLE analyst_data (
            ticker TEXT PRIMARY KEY,
            recommendation TEXT,
            target_mean_price REAL,
            analyst_count INTEGER
        );

        CREATE TABLE balance_sheet (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticker TEXT,
            period_type TEXT,
            period_index INTEGER,
            period_date TEXT,
            total_assets REAL,
            total_liabilities_net_minority_interest REAL,
            stockholders_equity REAL
        );

        CREATE TABLE income_statement (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticker TEXT,
            period_type TEXT,
            period_index INTEGER,
            period_date TEXT,
            total_revenue REAL,
            gross_profit REAL,
            net_income REAL
        );

        CREATE TABLE cash_flow (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticker TEXT,
            period_type TEXT,
            period_index INTEGER,
            period_date TEXT,
            operating_cash_flow REAL,
            investing_cash_flow REAL,
            financing_cash_flow REAL
        );

        -- Sample data: 2 companies
        INSERT INTO companies VALUES ('2222.SR', 'Saudi Aramco', 'Energy', 'Oil & Gas', 'SAU', 'SAR');
        INSERT INTO companies VALUES ('1010.SR', 'RIBL', 'Financial Services', 'Banks', 'SAU', 'SAR');

        INSERT INTO market_data VALUES ('2222.SR', 32.50, 7000000000000, 15000000, 32.40, 32.80, 32.10, 38.0, 28.0, 0.5);
        INSERT INTO market_data VALUES ('1010.SR', 80.0, 300000000000, 5000000, 79.50, 80.50, 79.0, 90.0, 70.0, 1.1);

        INSERT INTO valuation_metrics VALUES ('2222.SR', 15.5, 14.0, 3.2, 2.10, 1.5);
        INSERT INTO valuation_metrics VALUES ('1010.SR', 12.0, 11.0, 2.0, 6.67, 0.9);

        INSERT INTO profitability_metrics VALUES ('2222.SR', 0.25, 0.30, 0.05, 0.35);
        INSERT INTO profitability_metrics VALUES ('1010.SR', 0.15, 0.40, 0.08, 0.50);

        INSERT INTO dividend_data VALUES ('2222.SR', 0.06, 1.96, 0.93, '2024-03-10');
        INSERT INTO dividend_data VALUES ('1010.SR', 0.04, 3.20, 0.48, '2024-06-15');

        INSERT INTO financial_summary VALUES ('2222.SR', 1500000000000, 200000000000, 100000000000, 7.0);
        INSERT INTO financial_summary VALUES ('1010.SR', 50000000000, 30000000000, 20000000000, 13.3);

        INSERT INTO analyst_data VALUES ('2222.SR', 'buy', 36.0, 15);
        INSERT INTO analyst_data VALUES ('1010.SR', 'hold', 85.0, 10);

        INSERT INTO balance_sheet (ticker, period_type, period_index, period_date, total_assets, total_liabilities_net_minority_interest, stockholders_equity)
        VALUES ('2222.SR', 'annual', 0, '2024-12-31', 2000000000000, 800000000000, 1200000000000);
        INSERT INTO balance_sheet (ticker, period_type, period_index, period_date, total_assets, total_liabilities_net_minority_interest, stockholders_equity)
        VALUES ('2222.SR', 'annual', 1, '2023-12-31', 1900000000000, 750000000000, 1150000000000);

        INSERT INTO income_statement (ticker, period_type, period_index, period_date, total_revenue, gross_profit, net_income)
        VALUES ('2222.SR', 'annual', 0, '2024-12-31', 1500000000000, 900000000000, 450000000000);
        INSERT INTO income_statement (ticker, period_type, period_index, period_date, total_revenue, gross_profit, net_income)
        VALUES ('1010.SR', 'annual', 0, '2024-12-31', 50000000000, 30000000000, 15000000000);

        INSERT INTO cash_flow (ticker, period_type, period_index, period_date, operating_cash_flow, investing_cash_flow, financing_cash_flow)
        VALUES ('2222.SR', 'annual', 0, '2024-12-31', 500000000000, -200000000000, -150000000000);
    """)

    conn.commit()
    yield {"conn": conn, "cursor": cursor, "path": db_path}
    conn.close()


# ---------------------------------------------------------------------------
# PostgreSQL availability & fixtures
# ---------------------------------------------------------------------------


def _pg_available() -> bool:
    """Check if PostgreSQL is reachable via POSTGRES_HOST env var."""
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
            connect_timeout=3,
        )
        conn.close()
        return True
    except Exception:
        return False


PG_AVAILABLE = _pg_available()


@pytest.fixture(scope="session")
def pg_conn():
    """Provide a live PostgreSQL connection for integration tests.

    Skips the test automatically when PostgreSQL is not available.
    The connection is shared across all tests in the session and closed at the end.
    """
    if not PG_AVAILABLE:
        pytest.skip("PostgreSQL not available (set POSTGRES_HOST)")

    import psycopg2

    conn = psycopg2.connect(
        host=os.environ.get("POSTGRES_HOST", "localhost"),
        port=int(os.environ.get("POSTGRES_PORT", "5432")),
        dbname=os.environ.get("POSTGRES_DB", "tasi_platform"),
        user=os.environ.get("POSTGRES_USER", "tasi_user"),
        password=os.environ.get("POSTGRES_PASSWORD", ""),
    )
    yield conn
    conn.close()


@pytest.fixture
def pg_cursor(pg_conn):
    """Provide a PostgreSQL cursor that rolls back after each test.

    Uses SAVEPOINT/ROLLBACK TO isolate test side effects without
    committing data. Requires the ``pg_conn`` fixture.
    """
    pg_conn.autocommit = False
    cur = pg_conn.cursor()
    cur.execute("SAVEPOINT test_savepoint")
    yield cur
    pg_conn.rollback()
    cur.close()


@pytest.fixture
def pg_conn_factory():
    """Provide a factory callable that returns new PostgreSQL connections.

    Useful for services that accept a ``get_conn`` callable.
    Skips when PostgreSQL is not available.
    """
    if not PG_AVAILABLE:
        pytest.skip("PostgreSQL not available (set POSTGRES_HOST)")

    import psycopg2

    connections = []

    def _factory():
        conn = psycopg2.connect(
            host=os.environ.get("POSTGRES_HOST", "localhost"),
            port=int(os.environ.get("POSTGRES_PORT", "5432")),
            dbname=os.environ.get("POSTGRES_DB", "tasi_platform"),
            user=os.environ.get("POSTGRES_USER", "tasi_user"),
            password=os.environ.get("POSTGRES_PASSWORD", ""),
        )
        connections.append(conn)
        return conn

    yield _factory

    for conn in connections:
        try:
            conn.close()
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Mock Redis
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_redis():
    """Provide a mock Redis client with basic get/set/delete."""
    client = MagicMock()
    _store = {}

    def mock_get(key):
        return _store.get(key)

    def mock_setex(key, ttl, value):
        _store[key] = value

    def mock_delete(*keys):
        count = 0
        for key in keys:
            if key in _store:
                del _store[key]
                count += 1
        return count

    def mock_ping():
        return True

    def mock_scan(cursor=0, match=None, count=100):
        import fnmatch

        matching = [k for k in _store if fnmatch.fnmatch(k, match or "*")]
        return (0, matching)

    client.get = MagicMock(side_effect=mock_get)
    client.setex = MagicMock(side_effect=mock_setex)
    client.delete = MagicMock(side_effect=mock_delete)
    client.ping = MagicMock(side_effect=mock_ping)
    client.scan = MagicMock(side_effect=mock_scan)
    client._store = _store

    return client


# ---------------------------------------------------------------------------
# Auth token
# ---------------------------------------------------------------------------


@pytest.fixture
def auth_settings():
    """Return a fixed AuthSettings for deterministic JWT testing."""
    from config.settings import AuthSettings

    return AuthSettings(
        jwt_secret="test-secret-key-for-jwt-testing-only",
        jwt_algorithm="HS256",
        access_token_expire_minutes=30,
        refresh_token_expire_days=7,
    )


@pytest.fixture
def auth_token(auth_settings):
    """Generate a valid access token for testing."""
    import jwt
    from datetime import datetime, timedelta, timezone

    payload = {
        "sub": "test-user-id-123",
        "email": "testuser@example.com",
        "type": "access",
        "exp": datetime.now(timezone.utc) + timedelta(minutes=30),
    }
    token = jwt.encode(
        payload, auth_settings.jwt_secret, algorithm=auth_settings.jwt_algorithm
    )
    return token


@pytest.fixture
def refresh_token(auth_settings):
    """Generate a valid refresh token for testing."""
    import jwt
    from datetime import datetime, timedelta, timezone

    payload = {
        "sub": "test-user-id-123",
        "email": "testuser@example.com",
        "type": "refresh",
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
    }
    token = jwt.encode(
        payload, auth_settings.jwt_secret, algorithm=auth_settings.jwt_algorithm
    )
    return token


# ---------------------------------------------------------------------------
# Mock connection pool
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_pool():
    """Mock psycopg2 ThreadedConnectionPool."""
    pool = MagicMock()
    mock_conn = MagicMock()
    mock_cursor = MagicMock()
    mock_conn.cursor.return_value = mock_cursor

    pool.getconn.return_value = mock_conn
    pool.putconn = MagicMock()
    pool.closeall = MagicMock()

    return {"pool": pool, "conn": mock_conn, "cursor": mock_cursor}


# ---------------------------------------------------------------------------
# Mock DB connection (for services/routes that need psycopg2)
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_db_conn():
    """Mock psycopg2 connection with cursor context manager."""
    conn = MagicMock()
    cursor = MagicMock()

    # Support `with conn.cursor() as cur:` pattern
    conn.cursor.return_value.__enter__ = MagicMock(return_value=cursor)
    conn.cursor.return_value.__exit__ = MagicMock(return_value=False)

    return {"conn": conn, "cursor": cursor}


# ---------------------------------------------------------------------------
# PostgreSQL schema sanity check (S3-I7)
# ---------------------------------------------------------------------------
#
# Design note: the authoritative PostgreSQL schema lives in database/schema.sql.
# In CI the test-pg job initialises the database with:
#
#   psql -h localhost -U tasi_user -d tasi_platform -f database/schema.sql
#
# before pytest is invoked, so PG integration tests do NOT need to run CREATE
# TABLE statements themselves.  The fixture below acts as a fast sanity check
# that the schema was actually applied before any PG test touches the database.
# It is session-scoped, autouse=False, and silently skips when PostgreSQL is
# unavailable (i.e. in the standard SQLite CI job).
#


@pytest.fixture(scope="session", autouse=False)
def pg_schema_version(pg_conn):
    """Verify that database/schema.sql was applied before PG tests run.

    This fixture depends on ``pg_conn`` (which already skips when PostgreSQL is
    unreachable) and checks that the ``companies`` table exists as a proxy for
    a fully-initialised schema.  If the table is absent the test session is
    aborted with a clear message pointing at the correct initialisation step.

    Usage — request this fixture in any PG integration test class or module::

        @pytest.mark.usefixtures("pg_schema_version")
        class TestMyPGService:
            ...

    The CI test-pg job guarantees the schema is present by running::

        psql ... -f database/schema.sql

    before invoking pytest, so this fixture should always pass in CI.
    """
    cur = pg_conn.cursor()
    cur.execute(
        """
        SELECT EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name   = 'companies'
        )
        """
    )
    (table_exists,) = cur.fetchone()
    cur.close()

    if not table_exists:
        pytest.fail(
            "PostgreSQL schema has not been initialised.  "
            "Run 'psql ... -f database/schema.sql' before executing PG tests.  "
            "In CI this is handled by the 'Initialize PostgreSQL schema' step in "
            "the test-pg job."
        )

    return True
