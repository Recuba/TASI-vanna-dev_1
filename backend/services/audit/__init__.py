"""Audit and structured logging subsystem for Ra'd AI TASI Platform.

Provides:
- Structured JSON logging with automatic request-ID injection
- Correlation ID middleware for end-to-end request tracing
- Query audit logging for NL-to-SQL lifecycle tracking
- Security event logging for threat detection and compliance

Quick start::

    from backend.services.audit import (
        configure_logging,
        get_logger,
        CorrelationMiddleware,
        get_current_request_id,
        QueryAuditLogger,
        SecurityEventLogger,
        QueryAuditEvent,
        SecurityEvent,
        AuditConfig,
    )
"""

from backend.services.audit.config import AuditConfig
from backend.services.audit.correlation import (
    CorrelationMiddleware,
    get_current_request_id,
)
from backend.services.audit.models import (
    QueryAuditEvent,
    SecurityEvent,
    SecurityEventType,
    SecuritySeverity,
)
from backend.services.audit.query_audit import QueryAuditLogger
from backend.services.audit.security_events import SecurityEventLogger
from backend.services.audit.structured_logger import (
    JSONFormatter,
    configure_logging,
    get_logger,
)

__all__ = [
    "AuditConfig",
    "CorrelationMiddleware",
    "JSONFormatter",
    "QueryAuditEvent",
    "QueryAuditLogger",
    "SecurityEvent",
    "SecurityEventLogger",
    "SecurityEventType",
    "SecuritySeverity",
    "configure_logging",
    "get_current_request_id",
    "get_logger",
]
