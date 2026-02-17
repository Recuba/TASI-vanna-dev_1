"""
Tests for backend/security/ module.
Covers: sanitizer, allowlist, vanna_hook, config, models.

Note: sql_validator.py is tested separately in tests/security/test_sql_injection.py.
"""

import json
import os
import sys
import time
from pathlib import Path
from unittest.mock import patch

import pytest

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from backend.security.sanitizer import (  # noqa: E402
    MAX_IDENTIFIER_LENGTH,
    MAX_NL_QUERY_LENGTH,
    sanitize_identifiers,
    sanitize_nl_query,
)
from backend.security.allowlist import QueryAllowlist  # noqa: E402
from backend.security.config import SecurityConfig  # noqa: E402
from backend.security.models import ValidationResult, ValidatedQuery  # noqa: E402
from backend.security.vanna_hook import (  # noqa: E402
    reset_singletons,
    validate_vanna_output,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def allowlist_file(tmp_path):
    """Create a temporary allowlist JSON config file."""
    config = {
        "allowed_tables": ["companies", "market_data", "valuation_metrics"],
        "allowed_operations": ["SELECT"],
        "blocked_tables": ["users", "secrets"],
    }
    path = tmp_path / "allowed_tables.json"
    path.write_text(json.dumps(config), encoding="utf-8")
    return path


@pytest.fixture()
def allowlist(allowlist_file):
    """Return a QueryAllowlist loaded from a temp config."""
    return QueryAllowlist(config_path=allowlist_file, cache_ttl=0.0)


@pytest.fixture(autouse=True)
def _reset_vanna_singletons():
    """Reset vanna_hook singletons before and after each test."""
    reset_singletons()
    yield
    reset_singletons()


# ===========================================================================
# sanitizer.py tests
# ===========================================================================


class TestSanitizeNlQuery:
    """Tests for sanitize_nl_query()."""

    def test_empty_input_returns_empty(self):
        assert sanitize_nl_query("") == ""

    def test_none_like_empty(self):
        # None is not str, but empty string should return empty
        assert sanitize_nl_query("") == ""

    def test_normal_query_passes_through(self):
        result = sanitize_nl_query("What is the market cap of Aramco?")
        assert "market cap" in result
        assert "Aramco" in result

    def test_strips_control_characters(self):
        # \x00 (null) and \x07 (bell) should be stripped
        result = sanitize_nl_query("Hello\x00World\x07!")
        assert "\x00" not in result
        assert "\x07" not in result
        assert "HelloWorld!" in result

    def test_preserves_newlines_and_tabs(self):
        result = sanitize_nl_query("Line1\nLine2\tTabbed")
        assert "\n" in result
        assert "\t" in result

    def test_unicode_normalization(self):
        # NFC normalization: decomposed e-acute should become composed
        decomposed = "e\u0301"  # e + combining acute accent
        result = sanitize_nl_query(decomposed)
        assert "\u00e9" in result  # NFC composed form

    def test_truncation_at_max_length(self):
        long_input = "a" * (MAX_NL_QUERY_LENGTH + 500)
        result = sanitize_nl_query(long_input)
        # After HTML escaping, 'a' stays 'a', so length should be MAX_NL_QUERY_LENGTH
        assert len(result) == MAX_NL_QUERY_LENGTH

    def test_html_escaping(self):
        result = sanitize_nl_query('<script>alert("xss")</script>')
        assert "<script>" not in result
        assert "&lt;script&gt;" in result

    def test_html_escaping_quotes(self):
        result = sanitize_nl_query('value="test"')
        assert "&quot;" in result

    def test_html_escaping_ampersand(self):
        result = sanitize_nl_query("A & B")
        assert "&amp;" in result

    def test_rejects_raw_select(self):
        with pytest.raises(ValueError, match="raw SQL"):
            sanitize_nl_query("SELECT * FROM companies")

    def test_rejects_raw_drop(self):
        with pytest.raises(ValueError, match="raw SQL"):
            sanitize_nl_query("DROP TABLE companies")

    def test_rejects_raw_insert(self):
        with pytest.raises(ValueError, match="raw SQL"):
            sanitize_nl_query("INSERT INTO companies VALUES (1, 'test')")

    def test_rejects_raw_delete(self):
        with pytest.raises(ValueError, match="raw SQL"):
            sanitize_nl_query("DELETE FROM companies WHERE id = 1")

    def test_rejects_raw_update(self):
        with pytest.raises(ValueError, match="raw SQL"):
            sanitize_nl_query("UPDATE companies SET name = 'test'")

    def test_rejects_raw_alter(self):
        with pytest.raises(ValueError, match="raw SQL"):
            sanitize_nl_query("ALTER TABLE companies ADD COLUMN x INT")

    def test_rejects_raw_create(self):
        with pytest.raises(ValueError, match="raw SQL"):
            sanitize_nl_query("CREATE TABLE evil (id INT)")

    def test_rejects_raw_truncate(self):
        with pytest.raises(ValueError, match="raw SQL"):
            sanitize_nl_query("TRUNCATE TABLE companies")

    def test_rejects_with_cte(self):
        with pytest.raises(ValueError, match="raw SQL"):
            sanitize_nl_query("WITH cte AS (SELECT 1) SELECT * FROM cte")

    def test_rejects_explain(self):
        with pytest.raises(ValueError, match="raw SQL"):
            sanitize_nl_query("EXPLAIN SELECT * FROM companies")

    def test_rejects_pragma(self):
        with pytest.raises(ValueError, match="raw SQL"):
            sanitize_nl_query("PRAGMA table_info(companies)")

    def test_rejects_case_insensitive(self):
        with pytest.raises(ValueError, match="raw SQL"):
            sanitize_nl_query("select * from companies")

    def test_allows_natural_language_with_sql_words(self):
        # "select" in natural language context should be allowed
        result = sanitize_nl_query(
            "Please help me select the best companies from the market"
        )
        assert "select" in result.lower()

    def test_strips_leading_trailing_whitespace(self):
        result = sanitize_nl_query("   Hello World   ")
        assert result == "Hello World"


class TestSanitizeIdentifiers:
    """Tests for sanitize_identifiers()."""

    def test_valid_identifier(self):
        assert sanitize_identifiers("companies") == "companies"

    def test_valid_with_underscores(self):
        assert sanitize_identifiers("market_data") == "market_data"

    def test_valid_with_digits(self):
        assert sanitize_identifiers("table1") == "table1"

    def test_valid_starting_underscore(self):
        assert sanitize_identifiers("_private") == "_private"

    def test_valid_mixed_case(self):
        assert sanitize_identifiers("MarketData") == "MarketData"

    def test_empty_raises(self):
        with pytest.raises(ValueError, match="cannot be empty"):
            sanitize_identifiers("")

    def test_starts_with_digit_raises(self):
        with pytest.raises(ValueError, match="Invalid SQL identifier"):
            sanitize_identifiers("1table")

    def test_special_chars_raises(self):
        with pytest.raises(ValueError, match="Invalid SQL identifier"):
            sanitize_identifiers("table-name")

    def test_spaces_raises(self):
        with pytest.raises(ValueError, match="Invalid SQL identifier"):
            sanitize_identifiers("table name")

    def test_sql_injection_attempt_raises(self):
        with pytest.raises(ValueError, match="Invalid SQL identifier"):
            sanitize_identifiers("companies; DROP TABLE users")

    def test_dot_notation_raises(self):
        with pytest.raises(ValueError, match="Invalid SQL identifier"):
            sanitize_identifiers("schema.table")

    def test_max_length_exactly(self):
        # Exactly at limit should pass
        ident = "a" * MAX_IDENTIFIER_LENGTH
        assert sanitize_identifiers(ident) == ident

    def test_exceeds_max_length(self):
        ident = "a" * (MAX_IDENTIFIER_LENGTH + 1)
        with pytest.raises(ValueError, match="exceeds maximum length"):
            sanitize_identifiers(ident)

    def test_strips_whitespace(self):
        assert sanitize_identifiers("  companies  ") == "companies"


# ===========================================================================
# models.py tests
# ===========================================================================


class TestModels:
    """Tests for ValidationResult and ValidatedQuery Pydantic models."""

    def test_validation_result_defaults(self):
        r = ValidationResult()
        assert r.is_valid is True
        assert r.violations == []
        assert r.sanitized_sql == ""
        assert r.risk_score == 0.0
        assert r.tables_accessed == []

    def test_validation_result_with_data(self):
        r = ValidationResult(
            is_valid=False,
            violations=["forbidden op"],
            sanitized_sql="SELECT 1",
            risk_score=0.8,
            tables_accessed=["companies"],
        )
        assert r.is_valid is False
        assert len(r.violations) == 1
        assert r.risk_score == 0.8
        assert r.tables_accessed == ["companies"]

    def test_validated_query_defaults(self):
        q = ValidatedQuery()
        assert q.is_safe is True
        assert q.sql == ""
        assert q.reason == ""
        assert q.risk_score == 0.0
        assert q.validation_time_ms == 0.0

    def test_validated_query_with_data(self):
        q = ValidatedQuery(
            is_safe=False,
            sql="DROP TABLE x",
            reason="Forbidden operation",
            risk_score=1.0,
            validation_time_ms=1.23,
        )
        assert q.is_safe is False
        assert q.sql == "DROP TABLE x"
        assert q.validation_time_ms == 1.23

    def test_models_are_serializable(self):
        r = ValidationResult(is_valid=True, violations=[], risk_score=0.0)
        d = r.model_dump()
        assert isinstance(d, dict)
        assert "is_valid" in d

        q = ValidatedQuery(is_safe=True, sql="SELECT 1", reason="ok")
        d2 = q.model_dump()
        assert isinstance(d2, dict)
        assert "is_safe" in d2


# ===========================================================================
# config.py tests
# ===========================================================================


class TestSecurityConfig:
    """Tests for SecurityConfig pydantic-settings model."""

    def test_defaults(self):
        config = SecurityConfig()
        assert config.max_query_length == 5000
        assert config.max_result_rows == 1000
        assert config.enable_query_logging is True
        assert config.blocked_sql_patterns == ""
        assert config.enable_strict_mode is False

    def test_blocked_patterns_list_empty(self):
        config = SecurityConfig()
        assert config.blocked_patterns_list == []

    def test_blocked_patterns_list_parsing(self):
        config = SecurityConfig(blocked_sql_patterns="DROP.*,EXEC.*,UNION.*")
        patterns = config.blocked_patterns_list
        assert len(patterns) == 3
        assert "DROP.*" in patterns
        assert "EXEC.*" in patterns

    def test_blocked_patterns_strips_whitespace(self):
        config = SecurityConfig(blocked_sql_patterns=" DROP.* , EXEC.* ")
        patterns = config.blocked_patterns_list
        assert patterns == ["DROP.*", "EXEC.*"]

    def test_blocked_patterns_ignores_empty_entries(self):
        config = SecurityConfig(blocked_sql_patterns="DROP.*,,EXEC.*,")
        patterns = config.blocked_patterns_list
        assert len(patterns) == 2

    def test_resolved_allowed_tables_path_relative(self):
        config = SecurityConfig(allowed_tables_path="config/allowed_tables.json")
        resolved = config.resolved_allowed_tables_path
        assert resolved.is_absolute()
        assert str(resolved).endswith("allowed_tables.json")

    def test_resolved_allowed_tables_path_absolute(self, tmp_path):
        abs_path = str(tmp_path / "my_config.json")
        config = SecurityConfig(allowed_tables_path=abs_path)
        resolved = config.resolved_allowed_tables_path
        assert str(resolved) == abs_path

    def test_env_prefix(self):
        with patch.dict(os.environ, {"SECURITY_MAX_QUERY_LENGTH": "9999"}):
            config = SecurityConfig()
            assert config.max_query_length == 9999

    def test_max_query_length_bounds(self):
        # ge=100
        with pytest.raises(Exception):
            SecurityConfig(max_query_length=50)

    def test_max_result_rows_bounds(self):
        # ge=1
        with pytest.raises(Exception):
            SecurityConfig(max_result_rows=0)


# ===========================================================================
# allowlist.py tests
# ===========================================================================


class TestQueryAllowlist:
    """Tests for QueryAllowlist."""

    def test_allowed_table(self, allowlist):
        assert allowlist.is_table_allowed("companies") is True
        assert allowlist.is_table_allowed("market_data") is True

    def test_case_insensitive_table(self, allowlist):
        assert allowlist.is_table_allowed("COMPANIES") is True
        assert allowlist.is_table_allowed("Market_Data") is True

    def test_disallowed_table(self, allowlist):
        assert allowlist.is_table_allowed("unknown_table") is False

    def test_blocked_table_overrides_allowed(self, allowlist):
        # "users" is in blocked_tables
        assert allowlist.is_table_allowed("users") is False
        assert allowlist.is_table_allowed("secrets") is False

    def test_allowed_operation(self, allowlist):
        assert allowlist.is_operation_allowed("SELECT") is True

    def test_operation_case_insensitive(self, allowlist):
        assert allowlist.is_operation_allowed("select") is True

    def test_disallowed_operation(self, allowlist):
        assert allowlist.is_operation_allowed("DROP") is False
        assert allowlist.is_operation_allowed("INSERT") is False

    def test_get_allowed_tables_sorted(self, allowlist):
        tables = allowlist.get_allowed_tables()
        assert tables == sorted(tables)
        assert "companies" in tables
        assert "market_data" in tables
        assert "valuation_metrics" in tables

    def test_get_blocked_tables_sorted(self, allowlist):
        blocked = allowlist.get_blocked_tables()
        assert blocked == sorted(blocked)
        assert "users" in blocked
        assert "secrets" in blocked

    def test_missing_config_file(self, tmp_path):
        """When config file doesn't exist, nothing is allowed (fail safe)."""
        al = QueryAllowlist(config_path=tmp_path / "nonexistent.json")
        assert al.is_table_allowed("companies") is False
        assert al.is_operation_allowed("SELECT") is False
        assert al.get_allowed_tables() == []

    def test_invalid_json_config(self, tmp_path):
        """Invalid JSON fails safe with empty allowlist."""
        bad_file = tmp_path / "bad.json"
        bad_file.write_text("not valid json {{{", encoding="utf-8")
        al = QueryAllowlist(config_path=bad_file)
        assert al.is_table_allowed("companies") is False
        assert al.get_allowed_tables() == []

    def test_hot_reload(self, tmp_path):
        """Config changes are picked up after TTL expires."""
        config = {
            "allowed_tables": ["companies"],
            "allowed_operations": ["SELECT"],
            "blocked_tables": [],
        }
        path = tmp_path / "hot_reload.json"
        path.write_text(json.dumps(config), encoding="utf-8")

        al = QueryAllowlist(config_path=path, cache_ttl=0.0)
        assert al.is_table_allowed("companies") is True
        assert al.is_table_allowed("new_table") is False

        # Update the config file
        config["allowed_tables"].append("new_table")
        # Need mtime to actually differ
        time.sleep(0.05)
        path.write_text(json.dumps(config), encoding="utf-8")

        # With cache_ttl=0.0, next access should reload
        assert al.is_table_allowed("new_table") is True

    def test_empty_config_keys(self, tmp_path):
        """Config with missing keys uses empty defaults."""
        path = tmp_path / "empty_keys.json"
        path.write_text("{}", encoding="utf-8")
        al = QueryAllowlist(config_path=path)
        assert al.get_allowed_tables() == []
        assert al.get_blocked_tables() == []


# ===========================================================================
# vanna_hook.py tests
# ===========================================================================


class TestVannaHook:
    """Tests for validate_vanna_output()."""

    def test_empty_sql_returns_unsafe(self):
        result = validate_vanna_output("")
        assert result.is_safe is False
        assert "Empty" in result.reason
        assert result.risk_score == 1.0

    def test_whitespace_only_returns_unsafe(self):
        result = validate_vanna_output("   ")
        assert result.is_safe is False
        assert "Empty" in result.reason

    def test_valid_select_with_allowlist(self, allowlist_file):
        result = validate_vanna_output(
            "SELECT * FROM companies",
            original_query="Show all companies",
            allowlist_config_path=allowlist_file,
        )
        assert result.is_safe is True
        assert result.validation_time_ms >= 0

    def test_forbidden_operation_rejected(self, allowlist_file):
        result = validate_vanna_output(
            "DROP TABLE companies",
            allowlist_config_path=allowlist_file,
        )
        assert result.is_safe is False
        assert result.risk_score >= 0.8

    def test_disallowed_table_rejected(self, allowlist_file):
        result = validate_vanna_output(
            "SELECT * FROM unknown_table_xyz",
            allowlist_config_path=allowlist_file,
        )
        assert result.is_safe is False
        assert "not allowed" in result.reason

    def test_blocked_table_rejected(self, allowlist_file):
        result = validate_vanna_output(
            "SELECT * FROM users",
            allowlist_config_path=allowlist_file,
        )
        assert result.is_safe is False
        assert "not allowed" in result.reason

    def test_stacked_queries_rejected(self, allowlist_file):
        result = validate_vanna_output(
            "SELECT * FROM companies; DROP TABLE companies",
            allowlist_config_path=allowlist_file,
        )
        assert result.is_safe is False

    def test_injection_pattern_rejected(self, allowlist_file):
        result = validate_vanna_output(
            "SELECT * FROM companies WHERE 1=1 UNION ALL SELECT * FROM sqlite_master",
            allowlist_config_path=allowlist_file,
        )
        assert result.is_safe is False

    def test_validation_time_recorded(self, allowlist_file):
        result = validate_vanna_output(
            "SELECT * FROM companies",
            allowlist_config_path=allowlist_file,
        )
        assert result.validation_time_ms > 0

    def test_reset_singletons_clears_state(self):
        from backend.security import vanna_hook

        # Force singletons to be created
        validate_vanna_output("SELECT 1")
        assert vanna_hook._validator is not None

        reset_singletons()
        assert vanna_hook._validator is None
        assert vanna_hook._allowlist is None

    def test_operation_not_in_allowlist(self, tmp_path):
        """A query that passes sql_validator but whose primary op isn't allowed."""
        config = {
            "allowed_tables": ["companies"],
            "allowed_operations": [],  # No operations allowed
            "blocked_tables": [],
        }
        path = tmp_path / "no_ops.json"
        path.write_text(json.dumps(config), encoding="utf-8")

        result = validate_vanna_output(
            "SELECT * FROM companies",
            allowlist_config_path=path,
        )
        assert result.is_safe is False
        assert "not in the allowlist" in result.reason


# ===========================================================================
# __init__.py tests (public API re-exports)
# ===========================================================================


class TestModuleExports:
    """Verify the public API from backend.security.__init__."""

    def test_all_exports_importable(self):
        import backend.security as sec

        assert hasattr(sec, "QueryAllowlist")
        assert hasattr(sec, "SecurityConfig")
        assert hasattr(sec, "SqlQueryValidator")
        assert hasattr(sec, "ValidatedQuery")
        assert hasattr(sec, "ValidationResult")
        assert hasattr(sec, "sanitize_identifiers")
        assert hasattr(sec, "sanitize_nl_query")
        assert hasattr(sec, "validate_vanna_output")

    def test_all_matches_actual_exports(self):
        import backend.security as sec

        for name in sec.__all__:
            assert hasattr(sec, name), f"{name} listed in __all__ but not importable"
