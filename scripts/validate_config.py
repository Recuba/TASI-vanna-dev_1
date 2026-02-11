"""
Configuration validation script for TASI AI Platform.

Validates that all required environment variables are set and consistent.
Can be run standalone or imported and called from app.py lifespan.

Usage:
    python scripts/validate_config.py          # standalone
    python -m scripts.validate_config          # as module

From app.py:
    from scripts.validate_config import validate_config
    issues = validate_config()
"""

import logging
import os
import sys

_log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Validation checks
# ---------------------------------------------------------------------------


def _check_llm_provider() -> list[str]:
    """Validate exactly one LLM provider is configured."""
    issues: list[str] = []
    gemini_key = os.environ.get("GEMINI_API_KEY", "").strip()
    anthropic_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    llm_key = os.environ.get("LLM_API_KEY", "").strip()

    has_gemini = bool(gemini_key)
    has_anthropic = bool(anthropic_key or llm_key)

    if not has_gemini and not has_anthropic:
        issues.append(
            "FAIL: No LLM API key configured. "
            "Set GEMINI_API_KEY (recommended) or ANTHROPIC_API_KEY."
        )
    elif has_gemini and has_anthropic:
        issues.append(
            "WARN: Both GEMINI_API_KEY and ANTHROPIC_API_KEY are set. "
            "Gemini will be used as the active provider. "
            "Remove the unused key to avoid confusion."
        )
    return issues


def _check_database_config() -> list[str]:
    """Validate database settings match the chosen backend."""
    issues: list[str] = []
    backend = os.environ.get("DB_BACKEND", "sqlite").lower()

    if backend == "postgres":
        required_pg_vars = {
            "host": ("DB_PG_HOST", "POSTGRES_HOST"),
            "port": ("DB_PG_PORT", "POSTGRES_PORT"),
            "database": ("DB_PG_DATABASE", "POSTGRES_DB"),
            "user": ("DB_PG_USER", "POSTGRES_USER"),
            "password": ("DB_PG_PASSWORD", "POSTGRES_PASSWORD"),
        }
        for field, (db_name, pg_name) in required_pg_vars.items():
            db_val = os.environ.get(db_name, "").strip()
            pg_val = os.environ.get(pg_name, "").strip()
            if not db_val and not pg_val:
                issues.append(
                    f"FAIL: DB_BACKEND=postgres but {field} is not set. "
                    f"Set {pg_name} or {db_name}."
                )
            if field == "password" and (db_val or pg_val):
                pw = db_val or pg_val
                if pw in ("changeme", "password", ""):
                    issues.append(
                        f"WARN: PostgreSQL password is weak or empty ({pg_name}). "
                        "Use a strong password in production."
                    )
    return issues


def _check_jwt_secret() -> list[str]:
    """Validate JWT secret is set in production."""
    issues: list[str] = []
    jwt_secret = os.environ.get("AUTH_JWT_SECRET", "").strip()
    environment = os.environ.get("ENVIRONMENT", "development").lower()
    debug = os.environ.get("SERVER_DEBUG", "true").lower()
    is_production = environment == "production" or debug in ("false", "0", "no")

    if not jwt_secret:
        if is_production:
            issues.append(
                "FAIL: AUTH_JWT_SECRET is not set in production. "
                "All sessions will be lost on restart. "
                'Generate with: python -c "import secrets; print(secrets.token_urlsafe(32))"'
            )
        else:
            issues.append(
                "WARN: AUTH_JWT_SECRET not set. Using auto-generated secret "
                "(sessions invalidated on restart). Fine for development."
            )
    elif jwt_secret in ("change-me-to-a-stable-secret", "changeme", "secret"):
        issues.append(
            "WARN: AUTH_JWT_SECRET is set to a placeholder value. "
            "Use a cryptographically random secret in production."
        )
    return issues


def _check_env_naming_consistency() -> list[str]:
    """Warn if both DB_PG_* and POSTGRES_* are set with conflicting values."""
    issues: list[str] = []
    pairs = [
        ("DB_PG_HOST", "POSTGRES_HOST"),
        ("DB_PG_PORT", "POSTGRES_PORT"),
        ("DB_PG_DATABASE", "POSTGRES_DB"),
        ("DB_PG_USER", "POSTGRES_USER"),
        ("DB_PG_PASSWORD", "POSTGRES_PASSWORD"),
    ]
    for db_name, pg_name in pairs:
        db_val = os.environ.get(db_name, "").strip()
        pg_val = os.environ.get(pg_name, "").strip()
        if db_val and pg_val and db_val != pg_val:
            issues.append(
                f"WARN: Conflicting values for {db_name}={db_val!r} and "
                f"{pg_name}={pg_val!r}. {db_name} takes priority."
            )
    return issues


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def validate_config(*, fail_fast: bool = False) -> list[str]:
    """
    Run all configuration checks.

    Args:
        fail_fast: If True, raise ValueError on the first FAIL-level issue.

    Returns:
        List of issue strings (prefixed with FAIL: or WARN:).
    """
    all_issues: list[str] = []
    for check in (
        _check_llm_provider,
        _check_database_config,
        _check_jwt_secret,
        _check_env_naming_consistency,
    ):
        issues = check()
        all_issues.extend(issues)
        if fail_fast:
            for issue in issues:
                if issue.startswith("FAIL:"):
                    raise ValueError(issue)

    return all_issues


def print_validation_report(issues: list[str] | None = None) -> bool:
    """
    Print a human-readable validation report.

    Returns True if all checks pass (no FAIL-level issues).
    """
    if issues is None:
        issues = validate_config()

    fails = [i for i in issues if i.startswith("FAIL:")]
    warns = [i for i in issues if i.startswith("WARN:")]

    print("=" * 60)
    print("  TASI AI Platform - Configuration Validation")
    print("=" * 60)

    if not issues:
        print("\n  All checks PASSED.\n")
        return True

    for issue in issues:
        prefix = "  [X]" if issue.startswith("FAIL:") else "  [!]"
        # Strip the FAIL:/WARN: prefix for cleaner display
        msg = issue.split(":", 1)[1].strip() if ":" in issue else issue
        tag = "FAIL" if issue.startswith("FAIL:") else "WARN"
        print(f"\n{prefix} [{tag}] {msg}")

    print()
    print("-" * 60)
    print(f"  Result: {len(fails)} failure(s), {len(warns)} warning(s)")
    if fails:
        print("  Status: FAILED - fix the above issues before deploying.")
    else:
        print("  Status: PASSED with warnings.")
    print("=" * 60)

    return len(fails) == 0


# ---------------------------------------------------------------------------
# Standalone entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    from dotenv import load_dotenv

    load_dotenv()

    ok = print_validation_report()
    sys.exit(0 if ok else 1)
