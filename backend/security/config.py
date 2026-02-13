"""Security configuration for Ra'd AI SQL validation.

Pydantic Settings model with SECURITY_ prefix for environment variables.
Controls SQL validation behavior, query limits, and security strictness.
"""

from __future__ import annotations

from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class SecurityConfig(BaseSettings):
    """SQL security settings loaded from environment variables.

    All env vars use the SECURITY_ prefix.

    Attributes:
        max_query_length: Maximum allowed SQL query length in characters.
        max_result_rows: Maximum rows returned from a single query.
        enable_query_logging: Whether to log all validated queries.
        blocked_sql_patterns: Comma-separated additional regex patterns to block.
        allowed_tables_path: Path to the allowed_tables.json config file.
        enable_strict_mode: When True, rejects queries with any risk score > 0.
    """

    model_config = SettingsConfigDict(env_prefix="SECURITY_")

    max_query_length: int = Field(
        default=5000,
        ge=100,
        le=50000,
        description="Maximum allowed SQL query length in characters",
    )
    max_result_rows: int = Field(
        default=1000,
        ge=1,
        le=100000,
        description="Maximum rows returned from a single query",
    )
    enable_query_logging: bool = Field(
        default=True,
        description="Log all validated queries for audit purposes",
    )
    blocked_sql_patterns: str = Field(
        default="",
        description="Comma-separated additional regex patterns to block",
    )
    allowed_tables_path: str = Field(
        default="config/allowed_tables.json",
        description="Path to the allowed tables JSON config file",
    )
    enable_strict_mode: bool = Field(
        default=False,
        description="Reject queries with any risk score > 0",
    )

    @property
    def blocked_patterns_list(self) -> list[str]:
        """Parse comma-separated blocked patterns into a list."""
        if not self.blocked_sql_patterns:
            return []
        return [p.strip() for p in self.blocked_sql_patterns.split(",") if p.strip()]

    @property
    def resolved_allowed_tables_path(self) -> Path:
        """Return absolute path to allowed_tables.json, resolved relative to project root."""
        p = Path(self.allowed_tables_path)
        if p.is_absolute():
            return p
        return Path(__file__).resolve().parent.parent.parent / p
