"""
Configuration module for TASI AI Platform.
Uses pydantic-settings for typed, validated configuration loaded from environment variables and .env files.
"""

import logging
import secrets
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import AliasChoices, Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_log = logging.getLogger(__name__)


class DatabaseSettings(BaseSettings):
    """
    Database connection settings.

    Env vars use the DB_ prefix for app-level settings.
    PostgreSQL connection vars also accept POSTGRES_* names for Docker compatibility.
    """

    model_config = SettingsConfigDict(env_prefix="DB_")

    backend: Literal["sqlite", "postgres"] = "sqlite"
    # SQLite settings
    sqlite_path: str = "saudi_stocks.db"
    # PostgreSQL settings — accept both DB_PG_* and POSTGRES_* env vars
    pg_host: str = Field(
        default="localhost",
        validation_alias=AliasChoices("DB_PG_HOST", "POSTGRES_HOST"),
    )
    pg_port: int = Field(
        default=5432,
        validation_alias=AliasChoices("DB_PG_PORT", "POSTGRES_PORT"),
    )
    pg_database: str = Field(
        default="tasi_platform",
        validation_alias=AliasChoices("DB_PG_DATABASE", "POSTGRES_DB"),
    )
    pg_user: str = Field(
        default="tasi_user",
        validation_alias=AliasChoices("DB_PG_USER", "POSTGRES_USER"),
    )
    pg_password: str = Field(
        default="",
        validation_alias=AliasChoices("DB_PG_PASSWORD", "POSTGRES_PASSWORD"),
    )

    @property
    def pg_connection_string(self) -> str:
        return (
            f"postgresql://{self.pg_user}:{self.pg_password}"
            f"@{self.pg_host}:{self.pg_port}/{self.pg_database}"
        )

    @property
    def resolved_sqlite_path(self) -> Path:
        """Return absolute path to SQLite DB, resolved relative to project root."""
        p = Path(self.sqlite_path)
        if p.is_absolute():
            return p
        return Path(__file__).resolve().parent.parent / p


class LLMSettings(BaseSettings):
    """LLM provider settings. Supports Gemini (active) and Anthropic (legacy)."""

    model_config = SettingsConfigDict(env_prefix="LLM_")

    model: str = "gemini-2.5-flash"
    api_key: str = ""
    max_tool_iterations: int = 10
    # Gemini-specific settings (read via GEMINI_* env vars in app.py)
    # These are here for documentation; app.py reads GEMINI_API_KEY directly.


class PoolSettings(BaseSettings):
    """PostgreSQL connection pool settings. All env vars prefixed with PG_POOL_."""

    model_config = SettingsConfigDict(env_prefix="PG_POOL_")

    min: int = 2
    max: int = 10


class CacheSettings(BaseSettings):
    """Redis cache settings. All env vars use explicit field names."""

    model_config = SettingsConfigDict(env_prefix="CACHE_")

    redis_url: str = Field(
        default="redis://localhost:6379/0",
        validation_alias="REDIS_URL",
    )
    enabled: bool = False
    default_ttl: int = 300


class AuthSettings(BaseSettings):
    """JWT authentication settings. All env vars prefixed with AUTH_."""

    model_config = SettingsConfigDict(env_prefix="AUTH_")

    # In production, set AUTH_JWT_SECRET to a stable value.
    # The default generates a random secret on each startup (fine for dev).
    jwt_secret: str = Field(default_factory=lambda: secrets.token_urlsafe(32))
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7
    _is_auto_generated: bool = True

    @model_validator(mode="after")
    def _validate_jwt_secret(self) -> "AuthSettings":
        """Warn if JWT secret is auto-generated; fail in production."""
        import os

        # If the secret was explicitly provided via env var, it won't match
        # the auto-generated default (the default_factory runs only when
        # no value is supplied).  We detect this by checking whether
        # AUTH_JWT_SECRET is actually set in the environment.
        explicitly_set = bool(os.environ.get("AUTH_JWT_SECRET"))
        if explicitly_set:
            object.__setattr__(self, "_is_auto_generated", False)
            return self

        # Auto-generated secret -- fine for dev, dangerous in production.
        environment = os.environ.get("ENVIRONMENT", "development").lower()
        is_production = environment == "production" or os.environ.get("SERVER_DEBUG", "true").lower() in ("false", "0", "no")

        if is_production:
            raise ValueError(
                "AUTH_JWT_SECRET must be explicitly set in production. "
                "Generate one with: python -c \"import secrets; print(secrets.token_urlsafe(32))\""
            )
        _log.warning(
            "AUTH_JWT_SECRET not set -- using auto-generated secret. "
            "Sessions will be invalidated on restart. "
            "Set AUTH_JWT_SECRET for stable sessions."
        )
        return self


class MiddlewareSettings(BaseSettings):
    """Middleware settings. All env vars prefixed with MW_."""

    model_config = SettingsConfigDict(env_prefix="MW_")

    cors_origins: str = "http://localhost:3000,http://localhost:8084"
    rate_limit_per_minute: int = 60
    log_skip_paths: str = "/health,/favicon.ico"

    @property
    def cors_origins_list(self) -> list[str]:
        """Parse comma-separated CORS origins into a list."""
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def log_skip_paths_list(self) -> list[str]:
        """Parse comma-separated skip paths into a list."""
        return [p.strip() for p in self.log_skip_paths.split(",") if p.strip()]


class ServerSettings(BaseSettings):
    """FastAPI server settings. All env vars prefixed with SERVER_."""

    model_config = SettingsConfigDict(env_prefix="SERVER_")

    host: str = "0.0.0.0"
    port: int = 8084
    debug: bool = False
    environment: str = Field(
        default="development",
        validation_alias=AliasChoices("SERVER_ENVIRONMENT", "ENVIRONMENT"),
        description="Deployment environment: development, staging, production",
    )


class Settings(BaseSettings):
    """
    Top-level application settings.
    Loads from .env file and environment variables.
    Nested settings use their own env prefixes (DB_, LLM_, SERVER_).
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Backward compatibility: existing .env uses ANTHROPIC_API_KEY
    anthropic_api_key: str = ""
    # Gemini API key (active LLM provider)
    gemini_api_key: str = Field(
        default="",
        validation_alias=AliasChoices("GEMINI_API_KEY"),
    )

    # Nested settings
    db: DatabaseSettings = DatabaseSettings()
    llm: LLMSettings = LLMSettings()
    server: ServerSettings = ServerSettings()
    pool: PoolSettings = PoolSettings()
    cache: CacheSettings = CacheSettings()
    auth: AuthSettings = AuthSettings()
    middleware: MiddlewareSettings = MiddlewareSettings()

    def get_llm_api_key(self) -> str:
        """Return the effective LLM API key (Gemini > LLM_API_KEY > ANTHROPIC_API_KEY)."""
        return self.gemini_api_key or self.llm.api_key or self.anthropic_api_key


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return a cached singleton Settings instance."""
    return Settings()
