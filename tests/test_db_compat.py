"""Tests for services.db_compat – datetime_recent() validation."""

from __future__ import annotations

from unittest.mock import patch

import pytest

from services.db_compat import (
    _ALLOWED_DATETIME_COLUMNS,
    _INTERVAL_PATTERN,
    datetime_recent,
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
