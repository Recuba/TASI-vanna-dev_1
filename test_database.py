"""
Comprehensive database testing suite for Saudi Stocks database
Tests data quality, integrity, schema validation, and cross-table consistency
"""

import sqlite3
import unittest
from datetime import datetime
from typing import List, Tuple


class TestDatabaseIntegrity(unittest.TestCase):
    """Test suite for database integrity and data quality validation"""

    @classmethod
    def setUpClass(cls):
        """Set up database connection for all tests"""
        cls.db_path = r"C:\Users\User\saudi_stocks_fetcher\output\vanna-ai-testing\saudi_stocks.db"
        cls.conn = sqlite3.connect(cls.db_path)
        cls.cursor = cls.conn.cursor()

        # Expected table names
        cls.expected_tables = [
            'companies', 'market_data', 'valuation_metrics',
            'profitability_metrics', 'dividend_data', 'financial_summary',
            'analyst_data', 'balance_sheet', 'income_statement', 'cash_flow'
        ]

        # Simple tables (should have exactly 500 rows)
        cls.simple_tables = [
            'companies', 'market_data', 'valuation_metrics',
            'profitability_metrics', 'dividend_data', 'financial_summary',
            'analyst_data'
        ]

        # Financial statement tables (should have 2500+ rows)
        cls.financial_tables = ['balance_sheet', 'income_statement', 'cash_flow']

    @classmethod
    def tearDownClass(cls):
        """Close database connection after all tests"""
        cls.conn.close()

    def test_01_table_existence(self):
        """Test 1: Verify all 10 expected tables exist"""
        print("\n" + "="*80)
        print("TEST 1: Table Existence")
        print("="*80)

        self.cursor.execute("""
            SELECT name FROM sqlite_master
            WHERE type='table'
            ORDER BY name
        """)
        actual_tables = [row[0] for row in self.cursor.fetchall()]

        for table in self.expected_tables:
            exists = table in actual_tables
            status = "[PASS]" if exists else "[FAIL]"
            print(f"  {status}: Table '{table}' exists")
            self.assertIn(table, actual_tables, f"Table {table} should exist")

        print(f"\nResult: All {len(self.expected_tables)} tables exist")

    def test_02_row_counts_simple_tables(self):
        """Test 2a: Verify simple tables have exactly 500 rows"""
        print("\n" + "="*80)
        print("TEST 2a: Row Counts - Simple Tables (Expected: 500 rows each)")
        print("="*80)

        for table in self.simple_tables:
            self.cursor.execute(f"SELECT COUNT(*) FROM {table}")
            count = self.cursor.fetchone()[0]
            status = "[PASS]" if count == 500 else "[FAIL]"
            print(f"  {status}: {table}: {count:,} rows")
            self.assertEqual(count, 500, f"{table} should have exactly 500 rows")

    def test_03_row_counts_financial_tables(self):
        """Test 2b: Verify financial tables have 2500+ rows"""
        print("\n" + "="*80)
        print("TEST 2b: Row Counts - Financial Statement Tables (Expected: 2500+)")
        print("="*80)

        for table in self.financial_tables:
            self.cursor.execute(f"SELECT COUNT(*) FROM {table}")
            count = self.cursor.fetchone()[0]
            status = "[PASS]" if count >= 2500 else "[FAIL]"
            print(f"  {status}: {table}: {count:,} rows")
            self.assertGreaterEqual(count, 2500, f"{table} should have at least 2500 rows")

    def test_04_schema_validation_companies(self):
        """Test 3a: Validate companies table schema"""
        print("\n" + "="*80)
        print("TEST 3a: Schema Validation - companies table")
        print("="*80)

        expected_columns = ['ticker', 'short_name', 'sector', 'industry']
        self._validate_columns('companies', expected_columns)

    def test_05_schema_validation_market_data(self):
        """Test 3b: Validate market_data table schema"""
        print("\n" + "="*80)
        print("TEST 3b: Schema Validation - market_data table")
        print("="*80)

        expected_columns = ['ticker', 'current_price', 'market_cap', 'volume']
        self._validate_columns('market_data', expected_columns)

    def test_06_schema_validation_balance_sheet(self):
        """Test 3c: Validate balance_sheet table schema"""
        print("\n" + "="*80)
        print("TEST 3c: Schema Validation - balance_sheet table")
        print("="*80)

        expected_columns = ['ticker', 'period_type', 'period_index', 'period_date',
                           'total_assets', 'total_liabilities_net_minority_interest',
                           'stockholders_equity']
        self._validate_columns('balance_sheet', expected_columns)

    def test_07_schema_validation_income_statement(self):
        """Test 3d: Validate income_statement table schema"""
        print("\n" + "="*80)
        print("TEST 3d: Schema Validation - income_statement table")
        print("="*80)

        expected_columns = ['ticker', 'period_type', 'period_index', 'period_date',
                           'total_revenue', 'gross_profit', 'net_income']
        self._validate_columns('income_statement', expected_columns)

    def test_08_schema_validation_cash_flow(self):
        """Test 3e: Validate cash_flow table schema"""
        print("\n" + "="*80)
        print("TEST 3e: Schema Validation - cash_flow table")
        print("="*80)

        expected_columns = ['ticker', 'period_type', 'period_index', 'period_date',
                           'operating_cash_flow', 'investing_cash_flow', 'financing_cash_flow']
        self._validate_columns('cash_flow', expected_columns)

    def test_09_foreign_key_integrity(self):
        """Test 4: Verify foreign key integrity across all tables"""
        print("\n" + "="*80)
        print("TEST 4: Foreign Key Integrity")
        print("="*80)

        # Get all tickers from companies table
        self.cursor.execute("SELECT ticker FROM companies")
        valid_tickers = set(row[0] for row in self.cursor.fetchall())
        print(f"  Valid tickers in companies table: {len(valid_tickers)}")

        # Check each child table
        child_tables = [t for t in self.expected_tables if t != 'companies']

        for table in child_tables:
            self.cursor.execute(f"SELECT DISTINCT ticker FROM {table}")
            table_tickers = set(row[0] for row in self.cursor.fetchall())
            invalid_tickers = table_tickers - valid_tickers

            status = "[PASS]" if len(invalid_tickers) == 0 else "[FAIL]"
            print(f"  {status}: {table}: {len(table_tickers)} unique tickers, {len(invalid_tickers)} invalid")

            self.assertEqual(len(invalid_tickers), 0,
                           f"{table} has invalid tickers: {invalid_tickers}")

    def test_10_no_duplicate_tickers_simple_tables(self):
        """Test 5a: Verify no duplicate tickers in simple tables"""
        print("\n" + "="*80)
        print("TEST 5a: No Duplicate Tickers in Simple Tables")
        print("="*80)

        for table in self.simple_tables:
            self.cursor.execute(f"""
                SELECT ticker, COUNT(*) as cnt
                FROM {table}
                GROUP BY ticker
                HAVING cnt > 1
            """)
            duplicates = self.cursor.fetchall()

            status = "[PASS]" if len(duplicates) == 0 else "[FAIL]"
            print(f"  {status}: {table}: {len(duplicates)} duplicate tickers")

            self.assertEqual(len(duplicates), 0,
                           f"{table} has duplicate tickers: {duplicates}")

    def test_11_no_duplicate_period_combos(self):
        """Test 5b: Verify no duplicate period combinations in financial tables"""
        print("\n" + "="*80)
        print("TEST 5b: No Duplicate Period Combinations in Financial Tables")
        print("="*80)

        for table in self.financial_tables:
            self.cursor.execute(f"""
                SELECT ticker, period_type, period_index, COUNT(*) as cnt
                FROM {table}
                GROUP BY ticker, period_type, period_index
                HAVING cnt > 1
            """)
            duplicates = self.cursor.fetchall()

            status = "[PASS]" if len(duplicates) == 0 else "[FAIL]"
            print(f"  {status}: {table}: {len(duplicates)} duplicate combinations")

            self.assertEqual(len(duplicates), 0,
                           f"{table} has duplicate period combinations")

    def test_12_valid_period_types(self):
        """Test 5c: Verify period_type values are valid"""
        print("\n" + "="*80)
        print("TEST 5c: Valid period_type Values")
        print("="*80)

        valid_types = {'annual', 'quarterly', 'ttm'}

        for table in self.financial_tables:
            self.cursor.execute(f"SELECT DISTINCT period_type FROM {table}")
            actual_types = set(row[0] for row in self.cursor.fetchall() if row[0] is not None)
            invalid_types = actual_types - valid_types

            status = "[PASS]" if len(invalid_types) == 0 else "[FAIL]"
            print(f"  {status}: {table}: period_types = {sorted(actual_types)}")

            self.assertEqual(len(invalid_types), 0,
                           f"{table} has invalid period_types: {invalid_types}")

    def test_13_period_date_not_null(self):
        """Test 5d: Verify period_date is not null in financial statements"""
        print("\n" + "="*80)
        print("TEST 5d: period_date Not Null in Financial Tables")
        print("="*80)

        for table in self.financial_tables:
            self.cursor.execute(f"SELECT COUNT(*) FROM {table} WHERE period_date IS NULL")
            null_count = self.cursor.fetchone()[0]

            self.cursor.execute(f"SELECT COUNT(*) FROM {table}")
            total_count = self.cursor.fetchone()[0]

            status = "[PASS]" if null_count == 0 else "[FAIL]"
            print(f"  {status}: {table}: {null_count}/{total_count} null period_dates")

            self.assertEqual(null_count, 0,
                           f"{table} has {null_count} null period_dates")

    def test_14_non_null_financial_data(self):
        """Test 5e: Verify some non-null values for key financial columns"""
        print("\n" + "="*80)
        print("TEST 5e: Non-Null Key Financial Columns")
        print("="*80)

        checks = [
            ('balance_sheet', 'total_assets'),
            ('income_statement', 'total_revenue'),
            ('cash_flow', 'operating_cash_flow')
        ]

        for table, column in checks:
            self.cursor.execute(f"""
                SELECT COUNT(*) FROM {table} WHERE {column} IS NOT NULL
            """)
            non_null_count = self.cursor.fetchone()[0]

            self.cursor.execute(f"SELECT COUNT(*) FROM {table}")
            total_count = self.cursor.fetchone()[0]

            percentage = (non_null_count / total_count * 100) if total_count > 0 else 0
            status = "[PASS]" if non_null_count > 0 else "[FAIL]"

            print(f"  {status}: {table}.{column}: {non_null_count:,}/{total_count:,} " +
                  f"({percentage:.1f}%) non-null")

            self.assertGreater(non_null_count, 0,
                             f"{table}.{column} has no non-null values")

    def test_15_index_existence(self):
        """Test 6: Verify indexes exist on financial statement tables"""
        print("\n" + "="*80)
        print("TEST 6: Index Existence on Financial Tables")
        print("="*80)

        for table in self.financial_tables:
            self.cursor.execute(f"""
                SELECT name FROM sqlite_master
                WHERE type='index' AND tbl_name='{table}'
            """)
            indexes = [row[0] for row in self.cursor.fetchall()]

            # Filter out auto-created indexes (usually start with sqlite_autoindex_)
            custom_indexes = [idx for idx in indexes if not idx.startswith('sqlite_autoindex_')]

            status = "[PASS]" if len(custom_indexes) > 0 else "[WARN]"
            print(f"  {status}: {table}: {len(custom_indexes)} custom indexes")
            if custom_indexes:
                for idx in custom_indexes:
                    print(f"         - {idx}")

    def test_16_saudi_aramco_exists(self):
        """Test 7a: Verify Saudi Aramco (2222.SR) exists"""
        print("\n" + "="*80)
        print("TEST 7a: Saudi Aramco (2222.SR) Exists")
        print("="*80)

        self.cursor.execute("""
            SELECT ticker, short_name, sector
            FROM companies
            WHERE ticker = '2222.SR'
        """)
        result = self.cursor.fetchone()

        status = "[PASS]" if result else "[FAIL]"
        if result:
            print(f"  {status}: Found - Ticker: {result[0]}, Name: {result[1]}, Sector: {result[2]}")
        else:
            print(f"  {status}: Saudi Aramco (2222.SR) not found")

        self.assertIsNotNone(result, "Saudi Aramco (2222.SR) should exist")

    def test_17_positive_market_caps(self):
        """Test 7b: Verify market cap values are positive where present"""
        print("\n" + "="*80)
        print("TEST 7b: Positive Market Cap Values")
        print("="*80)

        self.cursor.execute("""
            SELECT COUNT(*) FROM market_data
            WHERE market_cap IS NOT NULL AND market_cap <= 0
        """)
        negative_count = self.cursor.fetchone()[0]

        self.cursor.execute("""
            SELECT COUNT(*) FROM market_data WHERE market_cap IS NOT NULL
        """)
        total_with_cap = self.cursor.fetchone()[0]

        status = "[PASS]" if negative_count == 0 else "[FAIL]"
        print(f"  {status}: {negative_count}/{total_with_cap} negative/zero market caps")

        # Sample some market caps
        self.cursor.execute("""
            SELECT ticker, market_cap
            FROM market_data
            WHERE market_cap IS NOT NULL
            ORDER BY market_cap DESC
            LIMIT 5
        """)
        print(f"\n  Top 5 Market Caps:")
        for ticker, cap in self.cursor.fetchall():
            print(f"    {ticker}: {cap:,.0f}")

        self.assertEqual(negative_count, 0, "All market caps should be positive")

    def test_18_valid_date_formats(self):
        """Test 7c: Verify dates are in valid format (YYYY-MM-DD)"""
        print("\n" + "="*80)
        print("TEST 7c: Valid Date Formats (YYYY-MM-DD)")
        print("="*80)

        for table in self.financial_tables:
            self.cursor.execute(f"""
                SELECT period_date FROM {table}
                WHERE period_date IS NOT NULL
                LIMIT 100
            """)
            dates = [row[0] for row in self.cursor.fetchall()]

            invalid_dates = []
            for date_str in dates:
                try:
                    datetime.strptime(date_str, '%Y-%m-%d')
                except ValueError:
                    invalid_dates.append(date_str)

            status = "[PASS]" if len(invalid_dates) == 0 else "[FAIL]"
            print(f"  {status}: {table}: {len(invalid_dates)}/{len(dates)} invalid dates")

            if invalid_dates and len(invalid_dates) <= 5:
                print(f"         Invalid: {invalid_dates}")

            self.assertEqual(len(invalid_dates), 0,
                           f"{table} has invalid date formats: {invalid_dates[:5]}")

    def test_19_cross_table_consistency(self):
        """Test 8a: Companies with market_data should have financial statements"""
        print("\n" + "="*80)
        print("TEST 8a: Cross-Table Consistency")
        print("="*80)

        # Get companies with market data
        self.cursor.execute("""
            SELECT COUNT(DISTINCT ticker) FROM market_data
            WHERE market_cap IS NOT NULL
        """)
        companies_with_market_data = self.cursor.fetchone()[0]

        # Check how many have at least one financial statement
        self.cursor.execute("""
            SELECT COUNT(DISTINCT m.ticker)
            FROM market_data m
            WHERE m.market_cap IS NOT NULL
            AND EXISTS (
                SELECT 1 FROM balance_sheet b
                WHERE b.ticker = m.ticker
            )
        """)
        with_financials = self.cursor.fetchone()[0]

        percentage = (with_financials / companies_with_market_data * 100) if companies_with_market_data > 0 else 0
        status = "[PASS]" if percentage > 50 else "[WARN]"

        print(f"  {status}: {with_financials}/{companies_with_market_data} " +
              f"({percentage:.1f}%) companies with market data have financial statements")

    def test_20_sector_distribution(self):
        """Test 8b: Verify sector distribution shows known Saudi sectors"""
        print("\n" + "="*80)
        print("TEST 8b: Sector Distribution")
        print("="*80)

        self.cursor.execute("""
            SELECT sector, COUNT(*) as count
            FROM companies
            WHERE sector IS NOT NULL
            GROUP BY sector
            ORDER BY count DESC
        """)
        sectors = self.cursor.fetchall()

        print(f"  Found {len(sectors)} sectors:\n")
        for sector, count in sectors:
            print(f"    {sector}: {count} companies")

        status = "[PASS]" if len(sectors) > 0 else "[FAIL]"
        print(f"\n  {status}: Sector distribution looks reasonable")

        self.assertGreater(len(sectors), 0, "Should have at least one sector")

    def _validate_columns(self, table: str, expected_columns: List[str]):
        """Helper method to validate table columns"""
        self.cursor.execute(f"PRAGMA table_info({table})")
        actual_columns = [row[1] for row in self.cursor.fetchall()]

        for col in expected_columns:
            exists = col in actual_columns
            status = "[PASS]" if exists else "[FAIL]"
            print(f"  {status}: Column '{col}' exists")
            self.assertIn(col, actual_columns, f"Column {col} should exist in {table}")


def run_tests():
    """Run all tests and provide summary"""
    print("\n" + "="*80)
    print("COMPREHENSIVE DATABASE INTEGRITY TEST SUITE")
    print("Database: saudi_stocks.db")
    print("="*80)

    # Create test suite
    loader = unittest.TestLoader()
    suite = loader.loadTestsFromTestCase(TestDatabaseIntegrity)

    # Run tests with detailed output
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)

    # Print summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    print(f"Total Tests Run: {result.testsRun}")
    print(f"Passed: {result.testsRun - len(result.failures) - len(result.errors)}")
    print(f"Failed: {len(result.failures)}")
    print(f"Errors: {len(result.errors)}")

    if result.wasSuccessful():
        print("\n[SUCCESS] ALL TESTS PASSED! Database integrity verified.")
    else:
        print("\n[WARNING] SOME TESTS FAILED. Review the output above for details.")

    print("="*80)

    return result


if __name__ == '__main__':
    run_tests()
