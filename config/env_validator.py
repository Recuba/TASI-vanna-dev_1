"""
Startup environment variable validation.

Validates critical environment variables before the application loads
pydantic settings. Provides clear, actionable error messages for
missing or invalid configuration.

Usage:
    from config.env_validator import validate_env
    errors, warnings = validate_env()
    if errors:
        for e in errors:
            print(f"ERROR: {e}")
        sys.exit(1)
"""

import logging
import os
from typing import List, Tuple

logger = logging.getLogger(__name__)

_VALID_DB_BACKENDS = {"sqlite", "postgres"}
_VALID_LOG_LEVELS = {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}


def validate_env() -> Tuple[List[str], List[str]]:
    """Validate environment variables at startup.

    Returns:
        Tuple of (errors, warnings).
        errors: list of critical issues that should prevent startup.
        warnings: list of non-critical issues to log.
    """
    errors: List[str] = []
    warnings: List[str] = []

    # --- DB_BACKEND ---
    db_backend = os.environ.get("DB_BACKEND", "sqlite").lower()
    if db_backend not in _VALID_DB_BACKENDS:
        errors.append(
            f"DB_BACKEND='{db_backend}' is invalid. "
            f"Must be one of: {', '.join(sorted(_VALID_DB_BACKENDS))}"
        )

    # --- PostgreSQL vars (required when DB_BACKEND=postgres) ---
    if db_backend == "postgres":
        pg_password = os.environ.get("POSTGRES_PASSWORD") or os.environ.get(
            "DB_PG_PASSWORD"
        )
        if not pg_password:
            errors.append(
                "POSTGRES_PASSWORD (or DB_PG_PASSWORD) is required "
                "when DB_BACKEND=postgres"
            )

        pg_host = os.environ.get("POSTGRES_HOST") or os.environ.get("DB_PG_HOST")
        if not pg_host:
            warnings.append(
                "POSTGRES_HOST not set, defaulting to 'localhost'. "
                "Set POSTGRES_HOST for production."
            )

    # --- LLM API key ---
    llm_key = (
        os.environ.get("LLM_API_KEY")
        or os.environ.get("ANTHROPIC_API_KEY")
        or os.environ.get("GEMINI_API_KEY")
    )
    if not llm_key:
        warnings.append(
            "No LLM API key found (ANTHROPIC_API_KEY, LLM_API_KEY, or GEMINI_API_KEY). "
            "Chat functionality will not work."
        )

    # --- LOG_LEVEL ---
    log_level = os.environ.get("LOG_LEVEL", "").upper()
    if log_level and log_level not in _VALID_LOG_LEVELS:
        warnings.append(
            f"LOG_LEVEL='{log_level}' is not standard. "
            f"Expected one of: {', '.join(sorted(_VALID_LOG_LEVELS))}"
        )

    # --- AUTH_JWT_SECRET in production ---
    environment = os.environ.get("ENVIRONMENT", "development").lower()
    if environment == "production":
        jwt_secret = os.environ.get("AUTH_JWT_SECRET")
        if not jwt_secret:
            warnings.append(
                "AUTH_JWT_SECRET not set in production. "
                "JWT tokens will not persist across restarts."
            )

    # --- CORS origins ---
    cors = os.environ.get("MW_CORS_ORIGINS", "")
    if cors and environment == "production":
        if "*" in cors:
            warnings.append(
                "MW_CORS_ORIGINS contains '*' in production. "
                "Consider restricting to specific origins."
            )

    return errors, warnings


def validate_and_log() -> bool:
    """Run validation and log results.

    Returns:
        True if no critical errors, False otherwise.
    """
    errors, warnings = validate_env()

    for w in warnings:
        logger.warning("ENV: %s", w)

    for e in errors:
        logger.error("ENV: %s", e)

    if errors:
        logger.error(
            "Environment validation failed with %d error(s). "
            "Fix the issues above and restart.",
            len(errors),
        )
        return False

    logger.info("Environment validation passed")
    return True
