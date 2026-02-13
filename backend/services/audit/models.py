"""Pydantic v2 models for audit events.

Defines the data shapes for query audit trails and security events that are
persisted to the database and emitted as structured log entries.

All timestamps default to UTC.  IDs default to UUID4 hex strings so they can
be generated in application code without relying on the database.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Security event enumerations
# ---------------------------------------------------------------------------

class SecuritySeverity(str, Enum):
    """Severity level for security events."""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class SecurityEventType(str, Enum):
    """Categorical type of a security event."""

    SQL_INJECTION_ATTEMPT = "sql_injection_attempt"
    FORBIDDEN_KEYWORD = "forbidden_keyword"
    RATE_LIMIT_EXCEEDED = "rate_limit_exceeded"
    AUTH_FAILURE = "auth_failure"
    INVALID_INPUT = "invalid_input"
    SUSPICIOUS_PATTERN = "suspicious_pattern"
    UNAUTHORIZED_ACCESS = "unauthorized_access"


# ---------------------------------------------------------------------------
# Query audit event
# ---------------------------------------------------------------------------

class QueryAuditEvent(BaseModel):
    """Structured record of a single NL-to-SQL query lifecycle.

    Compatible with the ``query_audit_log`` PostgreSQL table defined in
    ``database/schema.sql`` and the migration in
    ``migrations/001_audit_table.sql``.
    """

    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    request_id: Optional[str] = Field(
        default=None,
        description="Correlation ID from CorrelationMiddleware",
    )
    user_id: Optional[str] = None
    timestamp: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
    )
    nl_query: str = Field(..., description="User's natural-language question")
    generated_sql: Optional[str] = Field(
        default=None, description="SQL produced by the LLM"
    )
    validation_result: Optional[str] = Field(
        default=None,
        description="'pass', 'fail', or a short reason string from SqlQueryValidator",
    )
    execution_time_ms: Optional[int] = Field(
        default=None, ge=0, description="Wall-clock query execution time"
    )
    row_count: Optional[int] = Field(
        default=None, ge=0, description="Number of result rows"
    )
    error: Optional[str] = Field(
        default=None, description="Error message if execution failed"
    )
    ip_address: Optional[str] = None
    risk_score: Optional[float] = Field(
        default=None,
        ge=0.0,
        le=1.0,
        description="0.0 (safe) to 1.0 (dangerous) risk estimate",
    )

    model_config = {"frozen": False, "extra": "ignore"}


# ---------------------------------------------------------------------------
# Security event
# ---------------------------------------------------------------------------

class SecurityEvent(BaseModel):
    """Structured record of a security-relevant occurrence.

    Stored in the ``security_events`` table (see
    ``migrations/002_security_events_table.sql``).
    """

    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    timestamp: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
    )
    event_type: SecurityEventType
    severity: SecuritySeverity
    user_id: Optional[str] = None
    ip_address: Optional[str] = None
    details: Optional[str] = Field(
        default=None,
        description="Free-text description or JSON blob with event specifics",
    )
    request_id: Optional[str] = Field(
        default=None,
        description="Correlation ID from CorrelationMiddleware",
    )

    model_config = {"frozen": False, "extra": "ignore"}
