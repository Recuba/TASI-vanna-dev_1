"""
Query Router Tests
===================
Tests for the hybrid query routing layer that directs natural language
queries to the appropriate handler (Vanna SQL generation, knowledge base,
or direct API lookup).

This module contains structural tests that validate the routing taxonomy
and edge-case behaviour expected from the router once implemented.

Currently the router is not yet implemented as a standalone module.
These tests exercise the classification logic that WILL be wired up
and verify that the routing taxonomy is well-defined and self-consistent.
"""

import re
import unittest


# ===========================================================================
# Intent taxonomy
# ===========================================================================

INTENT_TYPES = [
    "sql_query",  # "What is the market cap of Aramco?"
    "company_lookup",  # "Show me details for 2222.SR"
    "sector_analysis",  # "Compare energy sector companies"
    "news_search",  # "Latest news for Aramco"
    "report_search",  # "Analyst reports for banking sector"
    "chart_request",  # "Show me a chart of sector P/E ratios"
    "general_chat",  # "Hello", "What can you do?"
]

# SQL patterns by category (used by the future router)
SELECT_PATTERN = re.compile(r"^\s*SELECT\b", re.IGNORECASE)
AGGREGATE_PATTERN = re.compile(r"\b(COUNT|SUM|AVG|MIN|MAX)\s*\(", re.IGNORECASE)
MULTI_TABLE_PATTERN = re.compile(r"\bJOIN\b", re.IGNORECASE)
WRITE_PATTERN = re.compile(
    r"^\s*(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE)\b", re.IGNORECASE
)


def classify_sql(query: str) -> str:
    """Classify a SQL string into a routing category.

    Returns one of: 'select', 'aggregate', 'multi_table', 'write', 'non_sql'.
    Priority: write > multi_table > aggregate > select > non_sql.
    """
    if not query or not query.strip():
        return "non_sql"
    if WRITE_PATTERN.search(query):
        return "write"
    if not SELECT_PATTERN.search(query):
        return "non_sql"
    if MULTI_TABLE_PATTERN.search(query):
        return "multi_table"
    if AGGREGATE_PATTERN.search(query):
        return "aggregate"
    return "select"


class TestQueryRouterPlaceholder(unittest.TestCase):
    """Placeholder tests — kept for backward compatibility."""

    def test_placeholder_passes(self):
        """Verify test framework is operational for future query router tests."""
        self.assertTrue(True)

    def test_intent_classification_types(self):
        """Validate expected intent types are defined."""
        self.assertGreaterEqual(len(INTENT_TYPES), 5)
        self.assertIn("sql_query", INTENT_TYPES)
        self.assertIn("company_lookup", INTENT_TYPES)


# ===========================================================================
# SQL pattern classification
# ===========================================================================


class TestSqlPatternClassification(unittest.TestCase):
    """Tests for classify_sql() routing helper."""

    # --- SELECT queries ---

    def test_simple_select_classified_as_select(self):
        sql = "SELECT ticker, current_price FROM market_data"
        self.assertEqual(classify_sql(sql), "select")

    def test_select_with_where_classified_as_select(self):
        sql = "SELECT * FROM companies WHERE sector = 'Energy'"
        self.assertEqual(classify_sql(sql), "select")

    def test_select_case_insensitive(self):
        sql = "select ticker from companies"
        self.assertEqual(classify_sql(sql), "select")

    # --- Aggregate queries ---

    def test_count_aggregate_classified(self):
        sql = "SELECT COUNT(*) FROM companies"
        self.assertEqual(classify_sql(sql), "aggregate")

    def test_avg_aggregate_classified(self):
        sql = "SELECT AVG(current_price) FROM market_data"
        self.assertEqual(classify_sql(sql), "aggregate")

    def test_multi_aggregate_classified(self):
        sql = "SELECT sector, SUM(market_cap), AVG(trailing_pe) FROM companies JOIN market_data ON companies.ticker = market_data.ticker GROUP BY sector"
        # Has both JOIN and aggregate; JOIN takes priority
        self.assertEqual(classify_sql(sql), "multi_table")

    # --- Multi-table (JOIN) queries ---

    def test_inner_join_classified(self):
        sql = "SELECT c.ticker, m.current_price FROM companies c JOIN market_data m ON c.ticker = m.ticker"
        self.assertEqual(classify_sql(sql), "multi_table")

    def test_left_join_classified(self):
        sql = "SELECT c.ticker, d.dividend_yield FROM companies c LEFT JOIN dividend_data d ON c.ticker = d.ticker"
        self.assertEqual(classify_sql(sql), "multi_table")

    # --- Write queries (should be rejected/re-routed) ---

    def test_drop_table_classified_as_write(self):
        sql = "DROP TABLE companies"
        self.assertEqual(classify_sql(sql), "write")

    def test_delete_classified_as_write(self):
        sql = "DELETE FROM market_data WHERE ticker = '2222.SR'"
        self.assertEqual(classify_sql(sql), "write")

    def test_insert_classified_as_write(self):
        sql = "INSERT INTO companies (ticker) VALUES ('9999.SR')"
        self.assertEqual(classify_sql(sql), "write")

    def test_update_classified_as_write(self):
        sql = "UPDATE market_data SET current_price = 50 WHERE ticker = '2222.SR'"
        self.assertEqual(classify_sql(sql), "write")

    # --- Edge cases ---

    def test_empty_query_classified_as_non_sql(self):
        self.assertEqual(classify_sql(""), "non_sql")

    def test_whitespace_only_classified_as_non_sql(self):
        self.assertEqual(classify_sql("   "), "non_sql")

    def test_natural_language_classified_as_non_sql(self):
        self.assertEqual(classify_sql("What is the market cap of Aramco?"), "non_sql")

    def test_very_long_query_handled(self):
        """Very long SQL strings do not raise and are classified correctly."""
        long_sql = (
            "SELECT " + ", ".join([f"col_{i}" for i in range(200)]) + " FROM companies"
        )
        result = classify_sql(long_sql)
        self.assertEqual(result, "select")

    def test_non_sql_arabic_input(self):
        """Arabic natural language input should be classified as non_sql."""
        self.assertEqual(classify_sql("ما هو سعر سهم أرامكو؟"), "non_sql")


# ===========================================================================
# Read vs Write classification
# ===========================================================================


class TestReadWriteClassification(unittest.TestCase):
    """Tests distinguishing read-only vs write SQL queries."""

    def test_select_is_read(self):
        sql = "SELECT * FROM companies"
        self.assertNotEqual(classify_sql(sql), "write")

    def test_drop_is_write(self):
        sql = "DROP TABLE sensitive_data"
        self.assertEqual(classify_sql(sql), "write")

    def test_truncate_is_write(self):
        sql = "TRUNCATE TABLE companies"
        self.assertEqual(classify_sql(sql), "write")

    def test_create_is_write(self):
        sql = "CREATE TABLE temp_test (id INTEGER)"
        self.assertEqual(classify_sql(sql), "write")

    def test_alter_is_write(self):
        sql = "ALTER TABLE companies ADD COLUMN notes TEXT"
        self.assertEqual(classify_sql(sql), "write")


# ===========================================================================
# Intent taxonomy completeness
# ===========================================================================


class TestIntentTaxonomy(unittest.TestCase):
    """Validate the intent taxonomy is complete and consistent."""

    def test_all_intents_are_strings(self):
        for intent in INTENT_TYPES:
            self.assertIsInstance(intent, str)

    def test_no_duplicate_intents(self):
        self.assertEqual(len(INTENT_TYPES), len(set(INTENT_TYPES)))

    def test_required_intents_present(self):
        required = {"sql_query", "company_lookup", "news_search", "general_chat"}
        for intent in required:
            self.assertIn(intent, INTENT_TYPES, f"Missing required intent: {intent}")

    def test_minimum_intent_count(self):
        self.assertGreaterEqual(len(INTENT_TYPES), 5)


if __name__ == "__main__":
    unittest.main(verbosity=2)
