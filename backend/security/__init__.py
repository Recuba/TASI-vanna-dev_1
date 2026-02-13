"""SQL security module for Ra'd AI TASI Platform.

Provides SQL injection prevention, query validation, input sanitization,
and Vanna integration hooks for AI-generated SQL queries.
"""

from backend.security.allowlist import QueryAllowlist
from backend.security.config import SecurityConfig
from backend.security.models import ValidationResult, ValidatedQuery
from backend.security.sanitizer import sanitize_nl_query, sanitize_identifiers
from backend.security.sql_validator import SqlQueryValidator
from backend.security.vanna_hook import validate_vanna_output

__all__ = [
    "QueryAllowlist",
    "SecurityConfig",
    "SqlQueryValidator",
    "ValidatedQuery",
    "ValidationResult",
    "sanitize_identifiers",
    "sanitize_nl_query",
    "validate_vanna_output",
]
