"""Audit subsystem configuration.

Pydantic Settings model for the audit module. All environment variables use
the ``AUDIT_`` prefix.

Usage::

    from backend.services.audit.config import AuditConfig

    cfg = AuditConfig()          # reads from env / .env
    if cfg.enable_query_audit:
        ...
"""

from __future__ import annotations

from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class AuditConfig(BaseSettings):
    """Configuration for the audit and logging subsystem.

    Environment variables are prefixed with ``AUDIT_``.
    """

    model_config = SettingsConfigDict(env_prefix="AUDIT_")

    enable_query_audit: bool = Field(
        default=True,
        description="Record NL-to-SQL query lifecycle events",
    )
    enable_security_events: bool = Field(
        default=True,
        description="Record security-relevant events (injection attempts, etc.)",
    )
    enable_request_logging: bool = Field(
        default=True,
        description="Emit structured log lines for each HTTP request",
    )
    log_level: str = Field(
        default="INFO",
        description="Minimum log level for audit loggers (DEBUG, INFO, WARNING, ERROR)",
    )
    log_format: Literal["json", "text"] = Field(
        default="json",
        description="Output format: 'json' for production, 'text' for development",
    )
    retention_days: int = Field(
        default=90,
        ge=1,
        description="Number of days to retain audit records in the database",
    )
