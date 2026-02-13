"""
Resilience configuration via environment variables.

All settings use the ``RESILIENCE_`` prefix. Example ``.env`` entries::

    RESILIENCE_CB_FAILURE_THRESHOLD=5
    RESILIENCE_CB_RECOVERY_TIMEOUT=30.0
    RESILIENCE_RETRY_MAX_ATTEMPTS=3
    RESILIENCE_QUERY_TIMEOUT=30.0
"""

from pydantic import Field
from pydantic_settings import BaseSettings


class ResilienceConfig(BaseSettings):
    """Resilience settings loaded from environment variables.

    Prefix: ``RESILIENCE_``
    """

    model_config = {"env_prefix": "RESILIENCE_"}

    # --- Circuit Breaker ---
    cb_failure_threshold: int = Field(
        default=5,
        description="Consecutive failures before opening the circuit",
    )
    cb_recovery_timeout: float = Field(
        default=30.0,
        description="Seconds to wait in OPEN state before probing (HALF_OPEN)",
    )
    cb_half_open_max_calls: int = Field(
        default=3,
        description="Max probe calls allowed in HALF_OPEN state",
    )
    cb_success_threshold: int = Field(
        default=2,
        description="Consecutive successes in HALF_OPEN to close the circuit",
    )

    # --- Retry ---
    retry_max_attempts: int = Field(
        default=3,
        description="Maximum retry attempts (including first call)",
    )
    retry_base_delay: float = Field(
        default=1.0,
        description="Initial retry delay in seconds",
    )
    retry_max_delay: float = Field(
        default=30.0,
        description="Maximum retry delay cap in seconds",
    )
    retry_jitter: bool = Field(
        default=True,
        description="Add random jitter to retry delays",
    )

    # --- Query Timeout ---
    query_timeout: float = Field(
        default=30.0,
        description="Default query timeout in seconds",
    )
    query_slow_threshold: float = Field(
        default=5.0,
        description="Log queries slower than this (seconds)",
    )
    query_max_timeout: float = Field(
        default=120.0,
        description="Absolute maximum query timeout",
    )
    query_cancel_on_timeout: bool = Field(
        default=True,
        description="Cancel PG backend on timeout",
    )

    # --- Degradation ---
    degradation_enabled: bool = Field(
        default=True,
        description="Enable graceful degradation with fallbacks",
    )


_config: ResilienceConfig | None = None


def get_resilience_config() -> ResilienceConfig:
    """Return the cached resilience configuration singleton."""
    global _config
    if _config is None:
        _config = ResilienceConfig()
    return _config
