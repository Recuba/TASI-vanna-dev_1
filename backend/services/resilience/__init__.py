"""
Resilience services for Ra'd AI TASI platform.

Provides circuit breaking, retry logic, timeout management,
and graceful degradation for external service calls.
"""

from backend.services.resilience.circuit_breaker import (
    CircuitBreaker,
    CircuitBreakerOpen,
    CircuitState,
    CircuitStats,
    get_all_stats,
    get_or_create,
    get_registry,
)
from backend.services.resilience.config import ResilienceConfig, get_resilience_config
from backend.services.resilience.degradation import (
    DegradationManager,
    create_default_manager,
)
from backend.services.resilience.retry import with_retry, with_timeout
from backend.services.resilience.timeout_manager import (
    QueryTimeoutConfig,
    QueryTimeoutManager,
)

__all__ = [
    "CircuitBreaker",
    "CircuitBreakerOpen",
    "CircuitState",
    "CircuitStats",
    "DegradationManager",
    "QueryTimeoutConfig",
    "QueryTimeoutManager",
    "ResilienceConfig",
    "create_default_manager",
    "get_all_stats",
    "get_or_create",
    "get_registry",
    "get_resilience_config",
    "with_retry",
    "with_timeout",
]
