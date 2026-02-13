"""
Integration Tests: Query Lifecycle Flow
========================================
Tests the full NL -> validation -> SQL -> execution pipeline.

Covers:
  - Valid SELECT queries pass validation and execute
  - SQL injection attempts are blocked pre-execution
  - Read-only enforcement (no mutations allowed)
  - Table extraction from complex queries
  - Risk score calculation for borderline queries
  - Sanitized SQL output for valid queries
  - Multi-table join query flow
  - Parameterized-style queries

Uses SqlQueryValidator and test SQLite database from conftest.
"""

import sys
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from backend.security.sql_validator import SqlQueryValidator


@pytest.fixture
def validator():
    return SqlQueryValidator()


# ===========================================================================
# Valid query lifecycle (NL -> validation -> execution)
# ===========================================================================


class TestValidQueryFlow:
    """Test that valid queries pass validation and can be executed."""

    def test_simple_select_validates_and_executes(self, validator, test_db):
        sql = "SELECT ticker, short_name FROM companies"
        result = validator.validate(sql)
        assert result.is_valid is True
        assert result.sanitized_sql != ""

        # Execute against test DB
        rows = test_db["cursor"].execute(result.sanitized_sql).fetchall()
        assert len(rows) == 2
        tickers = [r[0] for r in rows]
        assert "2222.SR" in tickers
        assert "1010.SR" in tickers

    def test_where_clause_validates_and_executes(self, validator, test_db):
        sql = "SELECT ticker, current_price FROM market_data WHERE current_price > 50"
        result = validator.validate(sql)
        assert result.is_valid is True

        rows = test_db["cursor"].execute(result.sanitized_sql).fetchall()
        assert len(rows) == 1
        assert rows[0][0] == "1010.SR"
        assert rows[0][1] == 80.0

    def test_join_validates_and_executes(self, validator, test_db):
        sql = (
            "SELECT c.ticker, c.short_name, m.current_price "
            "FROM companies c JOIN market_data m ON c.ticker = m.ticker "
            "ORDER BY m.current_price DESC"
        )
        result = validator.validate(sql)
        assert result.is_valid is True

        rows = test_db["cursor"].execute(result.sanitized_sql).fetchall()
        assert len(rows) == 2
        # Ordered by price DESC: RIBL (80) first
        assert rows[0][0] == "1010.SR"

    def test_aggregation_validates_and_executes(self, validator, test_db):
        sql = (
            "SELECT sector, COUNT(*) as cnt FROM companies GROUP BY sector"
        )
        result = validator.validate(sql)
        assert result.is_valid is True

        rows = test_db["cursor"].execute(result.sanitized_sql).fetchall()
        assert len(rows) == 2
        sectors = {r[0] for r in rows}
        assert "Energy" in sectors
        assert "Financial Services" in sectors

    def test_subquery_validates_and_executes(self, validator, test_db):
        sql = (
            "SELECT ticker, current_price FROM market_data "
            "WHERE current_price > (SELECT AVG(current_price) FROM market_data)"
        )
        result = validator.validate(sql)
        assert result.is_valid is True

        rows = test_db["cursor"].execute(result.sanitized_sql).fetchall()
        assert len(rows) == 1
        assert rows[0][0] == "1010.SR"

    def test_limit_validates_and_executes(self, validator, test_db):
        sql = "SELECT ticker FROM companies LIMIT 1"
        result = validator.validate(sql)
        assert result.is_valid is True

        rows = test_db["cursor"].execute(result.sanitized_sql).fetchall()
        assert len(rows) == 1

    def test_financial_statement_query(self, validator, test_db):
        sql = (
            "SELECT ticker, period_date, total_revenue, net_income "
            "FROM income_statement "
            "WHERE period_type = 'annual' AND period_index = 0 "
            "ORDER BY net_income DESC"
        )
        result = validator.validate(sql)
        assert result.is_valid is True

        rows = test_db["cursor"].execute(result.sanitized_sql).fetchall()
        assert len(rows) == 2
        # Aramco has higher net_income
        assert rows[0][0] == "2222.SR"

    def test_multi_join_validates_and_executes(self, validator, test_db):
        sql = (
            "SELECT c.ticker, m.current_price, v.trailing_pe, p.profit_margin "
            "FROM companies c "
            "JOIN market_data m ON c.ticker = m.ticker "
            "JOIN valuation_metrics v ON c.ticker = v.ticker "
            "JOIN profitability_metrics p ON c.ticker = p.ticker"
        )
        result = validator.validate(sql)
        assert result.is_valid is True
        assert len(result.tables_accessed) == 4

        rows = test_db["cursor"].execute(result.sanitized_sql).fetchall()
        assert len(rows) == 2


# ===========================================================================
# Injection blocked pre-execution
# ===========================================================================


class TestInjectionBlockedPreExecution:
    """Test that SQL injection is blocked before reaching the database."""

    def test_drop_blocked_before_execution(self, validator, test_db):
        sql = "DROP TABLE companies"
        result = validator.validate(sql)
        assert result.is_valid is False
        assert result.sanitized_sql == ""

        # Verify table still exists
        count = test_db["cursor"].execute("SELECT COUNT(*) FROM companies").fetchone()[0]
        assert count == 2

    def test_stacked_delete_blocked(self, validator, test_db):
        sql = "SELECT * FROM companies; DELETE FROM companies"
        result = validator.validate(sql)
        assert result.is_valid is False

        # Verify no rows were deleted
        count = test_db["cursor"].execute("SELECT COUNT(*) FROM companies").fetchone()[0]
        assert count == 2

    def test_union_schema_probe_blocked(self, validator):
        sql = "SELECT ticker FROM companies UNION ALL SELECT name FROM sqlite_master"
        result = validator.validate(sql)
        assert result.is_valid is False
        assert result.sanitized_sql == ""

    def test_insert_blocked(self, validator, test_db):
        sql = "INSERT INTO companies (ticker, short_name) VALUES ('EVIL', 'Evil Corp')"
        result = validator.validate(sql)
        assert result.is_valid is False

        # Verify no new row
        count = test_db["cursor"].execute("SELECT COUNT(*) FROM companies").fetchone()[0]
        assert count == 2


# ===========================================================================
# Read-only enforcement
# ===========================================================================


class TestReadOnlyEnforcement:
    """Test that only read operations are allowed."""

    @pytest.mark.parametrize("operation", [
        "INSERT INTO companies VALUES ('X', 'Y', 'Z', 'W', 'V', 'U')",
        "UPDATE companies SET short_name = 'hacked'",
        "DELETE FROM companies",
        "DROP TABLE companies",
        "ALTER TABLE companies ADD COLUMN evil TEXT",
        "CREATE TABLE evil (id INTEGER)",
        "TRUNCATE TABLE companies",
    ])
    def test_mutation_blocked(self, validator, operation):
        assert validator.is_read_only(operation) is False

    @pytest.mark.parametrize("operation", [
        "SELECT * FROM companies",
        "SELECT COUNT(*) FROM market_data",
        "SELECT c.ticker FROM companies c JOIN market_data m ON c.ticker = m.ticker",
    ])
    def test_select_allowed(self, validator, operation):
        assert validator.is_read_only(operation) is True


# ===========================================================================
# Table extraction
# ===========================================================================


class TestTableExtraction:
    """Test table name extraction from various query patterns."""

    def test_single_table(self, validator):
        tables = validator.extract_tables("SELECT * FROM companies")
        assert tables == ["companies"]

    def test_aliased_table(self, validator):
        tables = validator.extract_tables("SELECT * FROM companies c")
        assert "companies" in tables

    def test_multiple_joins(self, validator):
        tables = validator.extract_tables(
            "SELECT * FROM companies c "
            "JOIN market_data m ON c.ticker = m.ticker "
            "LEFT JOIN valuation_metrics v ON c.ticker = v.ticker"
        )
        assert len(tables) >= 3

    def test_subquery_table(self, validator):
        tables = validator.extract_tables(
            "SELECT * FROM companies WHERE ticker IN "
            "(SELECT ticker FROM market_data WHERE current_price > 50)"
        )
        assert "companies" in tables
        assert "market_data" in tables


# ===========================================================================
# Risk score calculation
# ===========================================================================


class TestRiskScoreCalculation:
    """Test risk score assignment for different query types."""

    def test_safe_query_zero_risk(self, validator):
        result = validator.validate("SELECT * FROM companies")
        assert result.risk_score == 0.0

    def test_forbidden_op_high_risk(self, validator):
        result = validator.validate("DROP TABLE companies")
        assert result.risk_score >= 0.8

    def test_stacked_query_high_risk(self, validator):
        result = validator.validate("SELECT 1; DROP TABLE companies")
        assert result.risk_score >= 0.9

    def test_injection_pattern_medium_risk(self, validator):
        result = validator.validate(
            "SELECT * FROM companies WHERE ticker = '' OR SLEEP(5)"
        )
        assert result.risk_score >= 0.5
