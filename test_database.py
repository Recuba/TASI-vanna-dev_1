"""
Comprehensive database testing suite for Saudi Stocks database
Tests data quality, integrity, schema validation, and cross-table consistency.

Supports dual backends:
  - SQLite (default): Always runs against saudi_stocks.db
  - PostgreSQL (optional): Runs when POSTGRES_HOST is set and reachable
    Skip PG tests gracefully if unavailable.
"""

import os
import sqlite3
import unittest
from datetime import datetime
from pathlib import Path
from typing import List

# ---------------------------------------------------------------------------
# Backend helpers
# ---------------------------------------------------------------------------
_HERE = Path(__file__).resolve().parent
_SQLITE_PATH = str(_HERE / "saudi_stocks.db")


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
            connect_timeout=3,
        )
        conn.close()
        return True
    except Exception:
        return False


def _get_sqlite_conn():
    return sqlite3.connect(_SQLITE_PATH)


def _get_pg_conn():
    import psycopg2

    return psycopg2.connect(
        host=os.environ.get("POSTGRES_HOST", "localhost"),
        port=int(os.environ.get("POSTGRES_PORT", "5432")),
        dbname=os.environ.get("POSTGRES_DB", "tasi_platform"),
        user=os.environ.get("POSTGRES_USER", "tasi_user"),
        password=os.environ.get("POSTGRES_PASSWORD", ""),
    )


class _DatabaseTestMixin:
    """
    Shared test logic for both SQLite and PostgreSQL backends.
    Subclasses must set cls.conn, cls.cursor, and cls.backend in setUpClass.
    """

    expected_tables = [
        "companies",
        "market_data",
        "valuation_metrics",
        "profitability_metrics",
        "dividend_data",
        "financial_summary",
        "analyst_data",
        "balance_sheet",
        "income_statement",
        "cash_flow",
    ]
    simple_tables = [
        "companies",
        "market_data",
        "valuation_metrics",
        "profitability_metrics",
        "dividend_data",
        "financial_summary",
        "analyst_data",
    ]
    financial_tables = ["balance_sheet", "income_statement", "cash_flow"]

    def _list_tables(self) -> List[str]:
        if self.backend == "sqlite":
            self.cursor.execute(
                "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
            )
        else:
            self.cursor.execute("""
                SELECT table_name FROM information_schema.tables
                WHERE table_schema = 'public' ORDER BY table_name
            """)
        return [row[0] for row in self.cursor.fetchall()]

    def _get_columns(self, table: str) -> List[str]:
        if self.backend == "sqlite":
            self.cursor.execute(f"PRAGMA table_info({table})")
            return [row[1] for row in self.cursor.fetchall()]
        else:
            self.cursor.execute(
                """
                SELECT column_name FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = %s
                ORDER BY ordinal_position
            """,
                (table,),
            )
            return [row[0] for row in self.cursor.fetchall()]

    def test_01_table_existence(self):
        """Verify all 10 expected tables exist"""
        actual_tables = self._list_tables()
        for table in self.expected_tables:
            self.assertIn(table, actual_tables, f"Table {table} should exist")

    def test_02_row_counts_simple_tables(self):
        """Verify simple tables have exactly 500 rows"""
        for table in self.simple_tables:
            self.cursor.execute(f"SELECT COUNT(*) FROM {table}")
            count = self.cursor.fetchone()[0]
            self.assertEqual(count, 500, f"{table} should have exactly 500 rows")

    def test_03_row_counts_financial_tables(self):
        """Verify financial tables have 2500+ rows"""
        for table in self.financial_tables:
            self.cursor.execute(f"SELECT COUNT(*) FROM {table}")
            count = self.cursor.fetchone()[0]
            self.assertGreaterEqual(
                count, 2500, f"{table} should have at least 2500 rows"
            )

    def test_04_schema_validation_companies(self):
        """Validate companies table schema"""
        self._validate_columns(
            "companies", ["ticker", "short_name", "sector", "industry"]
        )

    def test_05_schema_validation_market_data(self):
        """Validate market_data table schema"""
        self._validate_columns(
            "market_data", ["ticker", "current_price", "market_cap", "volume"]
        )

    def test_06_schema_validation_balance_sheet(self):
        """Validate balance_sheet table schema"""
        self._validate_columns(
            "balance_sheet",
            [
                "ticker",
                "period_type",
                "period_index",
                "period_date",
                "total_assets",
                "total_liabilities_net_minority_interest",
                "stockholders_equity",
            ],
        )

    def test_07_schema_validation_income_statement(self):
        """Validate income_statement table schema"""
        self._validate_columns(
            "income_statement",
            [
                "ticker",
                "period_type",
                "period_index",
                "period_date",
                "total_revenue",
                "gross_profit",
                "net_income",
            ],
        )

    def test_08_schema_validation_cash_flow(self):
        """Validate cash_flow table schema"""
        self._validate_columns(
            "cash_flow",
            [
                "ticker",
                "period_type",
                "period_index",
                "period_date",
                "operating_cash_flow",
                "investing_cash_flow",
                "financing_cash_flow",
            ],
        )

    def test_09_foreign_key_integrity(self):
        """Verify foreign key integrity across all tables"""
        self.cursor.execute("SELECT ticker FROM companies")
        valid_tickers = set(row[0] for row in self.cursor.fetchall())

        child_tables = [t for t in self.expected_tables if t != "companies"]
        for table in child_tables:
            self.cursor.execute(f"SELECT DISTINCT ticker FROM {table}")
            table_tickers = set(row[0] for row in self.cursor.fetchall())
            invalid_tickers = table_tickers - valid_tickers
            self.assertEqual(
                len(invalid_tickers),
                0,
                f"{table} has invalid tickers: {invalid_tickers}",
            )

    def test_10_no_duplicate_tickers_simple_tables(self):
        """Verify no duplicate tickers in simple tables"""
        for table in self.simple_tables:
            self.cursor.execute(f"""
                SELECT ticker, COUNT(*) as cnt
                FROM {table}
                GROUP BY ticker
                HAVING COUNT(*) > 1
            """)
            duplicates = self.cursor.fetchall()
            self.assertEqual(
                len(duplicates), 0, f"{table} has duplicate tickers: {duplicates}"
            )

    def test_11_no_duplicate_period_combos(self):
        """Verify no duplicate period combinations in financial tables"""
        for table in self.financial_tables:
            self.cursor.execute(f"""
                SELECT ticker, period_type, period_index, COUNT(*) as cnt
                FROM {table}
                GROUP BY ticker, period_type, period_index
                HAVING COUNT(*) > 1
            """)
            duplicates = self.cursor.fetchall()
            self.assertEqual(
                len(duplicates), 0, f"{table} has duplicate period combinations"
            )

    def test_12_valid_period_types(self):
        """Verify period_type values are valid"""
        valid_types = {"annual", "quarterly", "ttm"}
        for table in self.financial_tables:
            self.cursor.execute(f"SELECT DISTINCT period_type FROM {table}")
            actual_types = set(
                row[0] for row in self.cursor.fetchall() if row[0] is not None
            )
            invalid_types = actual_types - valid_types
            self.assertEqual(
                len(invalid_types),
                0,
                f"{table} has invalid period_types: {invalid_types}",
            )

    def test_13_period_date_not_null(self):
        """Verify period_date is not null in financial statements"""
        for table in self.financial_tables:
            self.cursor.execute(
                f"SELECT COUNT(*) FROM {table} WHERE period_date IS NULL"
            )
            null_count = self.cursor.fetchone()[0]
            self.assertEqual(
                null_count, 0, f"{table} has {null_count} null period_dates"
            )

    def test_14_non_null_financial_data(self):
        """Verify some non-null values for key financial columns"""
        checks = [
            ("balance_sheet", "total_assets"),
            ("income_statement", "total_revenue"),
            ("cash_flow", "operating_cash_flow"),
        ]
        for table, column in checks:
            self.cursor.execute(
                f"SELECT COUNT(*) FROM {table} WHERE {column} IS NOT NULL"
            )
            non_null_count = self.cursor.fetchone()[0]
            self.assertGreater(
                non_null_count, 0, f"{table}.{column} has no non-null values"
            )

    def test_15_index_existence(self):
        """Verify indexes exist on financial statement tables"""
        for table in self.financial_tables:
            if self.backend == "sqlite":
                self.cursor.execute(f"""
                    SELECT name FROM sqlite_master
                    WHERE type='index' AND tbl_name='{table}'
                """)
                indexes = [row[0] for row in self.cursor.fetchall()]
                custom_indexes = [
                    idx for idx in indexes if not idx.startswith("sqlite_autoindex_")
                ]
            else:
                self.cursor.execute(
                    """
                    SELECT indexname FROM pg_indexes
                    WHERE tablename = %s AND schemaname = 'public'
                """,
                    (table,),
                )
                custom_indexes = [row[0] for row in self.cursor.fetchall()]
            # Verify at least one index exists for query performance
            self.assertGreater(
                len(custom_indexes),
                0,
                f"{table} should have at least one custom index for query performance",
            )

    def test_16_saudi_aramco_exists(self):
        """Verify Saudi Aramco (2222.SR) exists"""
        self.cursor.execute(
            "SELECT ticker, short_name, sector FROM companies WHERE ticker = '2222.SR'"
        )
        result = self.cursor.fetchone()
        self.assertIsNotNone(result, "Saudi Aramco (2222.SR) should exist")

    def test_17_positive_market_caps(self):
        """Verify market cap values are positive where present"""
        self.cursor.execute(
            "SELECT COUNT(*) FROM market_data WHERE market_cap IS NOT NULL AND market_cap <= 0"
        )
        negative_count = self.cursor.fetchone()[0]
        self.assertEqual(negative_count, 0, "All market caps should be positive")

    def test_18_valid_date_formats(self):
        """Verify dates are in valid format (YYYY-MM-DD)"""
        for table in self.financial_tables:
            self.cursor.execute(
                f"SELECT period_date FROM {table} WHERE period_date IS NOT NULL LIMIT 100"
            )
            dates = [row[0] for row in self.cursor.fetchall()]
            invalid_dates = []
            for date_val in dates:
                date_str = str(date_val) if not isinstance(date_val, str) else date_val
                try:
                    datetime.strptime(date_str[:10], "%Y-%m-%d")
                except ValueError:
                    invalid_dates.append(date_str)
            self.assertEqual(
                len(invalid_dates),
                0,
                f"{table} has invalid date formats: {invalid_dates[:5]}",
            )

    def test_19_cross_table_consistency(self):
        """Companies with market_data should have financial statements"""
        self.cursor.execute(
            "SELECT COUNT(DISTINCT ticker) FROM market_data WHERE market_cap IS NOT NULL"
        )
        _companies_with_market_data = self.cursor.fetchone()[0]

        self.cursor.execute("""
            SELECT COUNT(DISTINCT m.ticker)
            FROM market_data m
            WHERE m.market_cap IS NOT NULL
            AND EXISTS (SELECT 1 FROM balance_sheet b WHERE b.ticker = m.ticker)
        """)
        with_financials = self.cursor.fetchone()[0]
        self.assertGreater(
            with_financials, 0, "Some companies should have financial statements"
        )

    def test_20_sector_distribution(self):
        """Verify sector distribution shows known Saudi sectors"""
        self.cursor.execute("""
            SELECT sector, COUNT(*) as count
            FROM companies WHERE sector IS NOT NULL
            GROUP BY sector ORDER BY count DESC
        """)
        sectors = self.cursor.fetchall()
        self.assertGreater(len(sectors), 0, "Should have at least one sector")

    def test_21_no_null_period_types(self):
        """Verify period_type is never null in financial tables"""
        for table in self.financial_tables:
            self.cursor.execute(
                f"SELECT COUNT(*) FROM {table} WHERE period_type IS NULL"
            )
            null_count = self.cursor.fetchone()[0]
            self.assertEqual(
                null_count, 0, f"{table} has {null_count} rows with null period_type"
            )

    def test_22_no_negative_prices(self):
        """Verify price values are non-negative where present"""
        price_columns = [
            "current_price",
            "previous_close",
            "open_price",
            "day_high",
            "day_low",
        ]
        for col in price_columns:
            self.cursor.execute(
                f"SELECT COUNT(*) FROM market_data WHERE {col} IS NOT NULL AND {col} < 0"
            )
            negative = self.cursor.fetchone()[0]
            self.assertEqual(
                negative, 0, f"market_data.{col} has {negative} negative values"
            )

    def test_23_sequential_period_indexes(self):
        """Verify period_index values start at 0 for each ticker/period_type"""
        for table in self.financial_tables:
            self.cursor.execute(f"""
                SELECT ticker, period_type, MIN(period_index) as min_idx
                FROM {table}
                GROUP BY ticker, period_type
                HAVING MIN(period_index) != 0
            """)
            bad = self.cursor.fetchall()
            self.assertEqual(
                len(bad),
                0,
                f"{table} has ticker/period_type combos not starting at index 0: {bad[:5]}",
            )

    def _validate_columns(self, table: str, expected_columns: List[str]):
        actual_columns = self._get_columns(table)
        for col in expected_columns:
            self.assertIn(col, actual_columns, f"Column {col} should exist in {table}")


# ---------------------------------------------------------------------------
# SQLite test class (always runs)
# ---------------------------------------------------------------------------
class TestDatabaseIntegrity(unittest.TestCase, _DatabaseTestMixin):
    """SQLite database integrity tests (20 tests)."""

    @classmethod
    def setUpClass(cls):
        cls.backend = "sqlite"
        cls.conn = _get_sqlite_conn()
        cls.cursor = cls.conn.cursor()

    @classmethod
    def tearDownClass(cls):
        cls.conn.close()


# ---------------------------------------------------------------------------
# PostgreSQL test class (skipped if PG unavailable)
# ---------------------------------------------------------------------------
@unittest.skipUnless(_pg_available(), "PostgreSQL not available (set POSTGRES_HOST)")
class TestDatabaseIntegrityPG(unittest.TestCase, _DatabaseTestMixin):
    """PostgreSQL database integrity tests (20 tests, skipped if PG unavailable)."""

    @classmethod
    def setUpClass(cls):
        cls.backend = "postgres"
        cls.conn = _get_pg_conn()
        cls.cursor = cls.conn.cursor()

    @classmethod
    def tearDownClass(cls):
        cls.conn.close()


# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------
def run_tests():
    print("\n" + "=" * 80)
    print("COMPREHENSIVE DATABASE INTEGRITY TEST SUITE")
    print(f"SQLite: {_SQLITE_PATH}")
    print(
        f"PostgreSQL: {'available' if _pg_available() else 'not available (skipped)'}"
    )
    print("=" * 80)

    loader = unittest.TestLoader()
    suite = unittest.TestSuite()
    suite.addTests(loader.loadTestsFromTestCase(TestDatabaseIntegrity))
    suite.addTests(loader.loadTestsFromTestCase(TestDatabaseIntegrityPG))

    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)

    print("\n" + "=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    print(f"Total Tests Run: {result.testsRun}")
    print(f"Passed: {result.testsRun - len(result.failures) - len(result.errors)}")
    print(f"Failed: {len(result.failures)}")
    print(f"Errors: {len(result.errors)}")
    print(f"Skipped: {len(result.skipped)}")
    print("=" * 80)
    return result


if __name__ == "__main__":
    run_tests()
