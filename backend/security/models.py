"""Pydantic models for SQL security validation results."""

from __future__ import annotations

from pydantic import BaseModel, Field


class ValidationResult(BaseModel):
    """Result of SQL query validation.

    Attributes:
        is_valid: Whether the query passed all validation checks.
        violations: List of specific violation descriptions found.
        sanitized_sql: The query after whitespace normalization (or empty if invalid).
        risk_score: Numeric risk score from 0.0 (safe) to 1.0 (dangerous).
        tables_accessed: List of table names referenced in the query.
    """

    is_valid: bool = True
    violations: list[str] = Field(default_factory=list)
    sanitized_sql: str = ""
    risk_score: float = 0.0
    tables_accessed: list[str] = Field(default_factory=list)


class ValidatedQuery(BaseModel):
    """Result of the Vanna output validation pipeline.

    This is the output of the single entry point for validating
    AI-generated SQL before execution.

    Attributes:
        is_safe: Whether the query is safe to execute.
        sql: The validated (possibly sanitized) SQL string.
        reason: Human-readable explanation of the validation outcome.
        risk_score: Numeric risk score from 0.0 (safe) to 1.0 (dangerous).
        validation_time_ms: Time taken for validation in milliseconds.
    """

    is_safe: bool = True
    sql: str = ""
    reason: str = ""
    risk_score: float = 0.0
    validation_time_ms: float = 0.0
