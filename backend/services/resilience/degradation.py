"""
Graceful degradation handler for external service failures.

Manages fallback behaviors when external services (Anthropic/Gemini LLM,
yfinance, Redis) are unavailable. Instead of returning 500 errors, the
system provides reduced-functionality responses.

Usage::

    manager = DegradationManager()

    manager.register_fallback(
        service="anthropic_llm",
        fallback=lambda *a, **kw: {"error": "LLM unavailable", "cached": True},
        description="Return cached/static response when LLM is down",
    )

    result = await manager.execute_with_fallback(
        service="anthropic_llm",
        func=call_anthropic_api,
        query="What is ARAMCO's P/E ratio?",
    )
"""

import logging
import time
from dataclasses import dataclass
from typing import Any, Callable, Dict, List

logger = logging.getLogger(__name__)


@dataclass
class FallbackEntry:
    """A registered fallback for a service."""

    service: str
    fallback: Callable[..., Any]
    description: str = ""


@dataclass
class DegradedServiceInfo:
    """Status information for a service currently in degraded mode."""

    service: str
    degraded_since: float
    last_error: str
    fallback_invocations: int = 0
    description: str = ""


class DegradationManager:
    """Manages fallback execution when external services are unavailable.

    Thread-safe for read operations; fallback registration should happen
    at startup before concurrent access.
    """

    def __init__(self) -> None:
        self._fallbacks: Dict[str, FallbackEntry] = {}
        self._degraded: Dict[str, DegradedServiceInfo] = {}
        self._total_fallback_calls = 0

        logger.info("DegradationManager initialized")

    def register_fallback(
        self,
        service: str,
        fallback: Callable[..., Any],
        description: str = "",
    ) -> None:
        """Register a fallback function for a named service.

        Args:
            service: Unique service identifier (e.g., ``"anthropic_llm"``).
            fallback: Callable that returns a degraded response. May be sync
                or async. Receives the same ``*args, **kwargs`` as the primary
                function.
            description: Human-readable description of the fallback behavior.
        """
        self._fallbacks[service] = FallbackEntry(
            service=service,
            fallback=fallback,
            description=description,
        )
        logger.info(
            "Registered fallback for '%s': %s",
            service,
            description or "(no description)",
        )

    async def execute_with_fallback(
        self,
        service: str,
        func: Callable[..., Any],
        *args: Any,
        **kwargs: Any,
    ) -> Any:
        """Execute *func* with automatic fallback on failure.

        If *func* raises an exception and a fallback is registered for
        *service*, the fallback is invoked instead. The service is marked
        as degraded until a successful primary call clears the state.

        Args:
            service: Service identifier matching a registered fallback.
            func: The primary async or sync callable.
            *args: Positional arguments forwarded to both *func* and fallback.
            **kwargs: Keyword arguments forwarded to both *func* and fallback.

        Returns:
            The result of *func* on success, or the fallback result on failure.

        Raises:
            Exception: If *func* fails and no fallback is registered.
        """
        import asyncio

        try:
            if asyncio.iscoroutinefunction(func):
                result = await func(*args, **kwargs)
            else:
                result = func(*args, **kwargs)

            # Success -- clear degraded state if previously degraded
            if service in self._degraded:
                logger.info(
                    "Service '%s' recovered from degraded state",
                    service,
                )
                del self._degraded[service]

            return result

        except Exception as exc:
            entry = self._fallbacks.get(service)
            if entry is None:
                logger.error(
                    "Service '%s' failed with no fallback registered: %s",
                    service,
                    str(exc)[:200],
                )
                raise

            # Mark as degraded
            if service not in self._degraded:
                self._degraded[service] = DegradedServiceInfo(
                    service=service,
                    degraded_since=time.monotonic(),
                    last_error=str(exc)[:500],
                    description=entry.description,
                )
            else:
                self._degraded[service].last_error = str(exc)[:500]

            self._degraded[service].fallback_invocations += 1
            self._total_fallback_calls += 1

            logger.warning(
                "Service '%s' degraded, using fallback (%s): %s",
                service,
                entry.description,
                str(exc)[:200],
            )

            # Execute the fallback
            try:
                if asyncio.iscoroutinefunction(entry.fallback):
                    return await entry.fallback(*args, **kwargs)
                return entry.fallback(*args, **kwargs)
            except Exception as fallback_exc:
                logger.error(
                    "Fallback for '%s' also failed: %s",
                    service,
                    str(fallback_exc)[:200],
                )
                raise exc from fallback_exc

    def get_degraded_services(self) -> List[Dict[str, Any]]:
        """Return a list of currently degraded services with details."""
        now = time.monotonic()
        return [
            {
                "service": info.service,
                "degraded_for_seconds": round(now - info.degraded_since, 1),
                "last_error": info.last_error,
                "fallback_invocations": info.fallback_invocations,
                "description": info.description,
            }
            for info in self._degraded.values()
        ]

    def is_degraded(self, service: str) -> bool:
        """Check if a specific service is currently in degraded mode."""
        return service in self._degraded

    @property
    def total_fallback_calls(self) -> int:
        """Total number of times any fallback has been invoked."""
        return self._total_fallback_calls

    def get_stats(self) -> Dict[str, Any]:
        """Return summary statistics for the degradation manager."""
        return {
            "registered_fallbacks": list(self._fallbacks.keys()),
            "degraded_services": self.get_degraded_services(),
            "total_fallback_calls": self._total_fallback_calls,
        }


# ---------------------------------------------------------------------------
# Pre-configured fallbacks for known external services
# ---------------------------------------------------------------------------


def _anthropic_fallback(*args: Any, **kwargs: Any) -> Dict[str, Any]:
    """Fallback when Anthropic/Gemini LLM is unavailable."""
    return {
        "type": "error",
        "error": "LLM service temporarily unavailable",
        "message": "The AI assistant is temporarily unavailable. "
        "Please try again in a few minutes.",
        "degraded": True,
    }


def _yfinance_fallback(*args: Any, **kwargs: Any) -> Dict[str, Any]:
    """Fallback when yfinance market data is unavailable."""
    return {
        "type": "error",
        "error": "Market data service temporarily unavailable",
        "message": "Live market data is temporarily unavailable. "
        "Cached data may be shown instead.",
        "degraded": True,
    }


def _redis_fallback(*args: Any, **kwargs: Any) -> None:
    """Fallback when Redis cache is unavailable -- operations become no-ops."""
    return None


def create_default_manager() -> DegradationManager:
    """Create a ``DegradationManager`` pre-loaded with standard fallbacks.

    Registered services:
        - ``anthropic_llm``: Returns a user-friendly "unavailable" message.
        - ``yfinance``: Returns a "cached data" message.
        - ``redis``: Returns ``None`` (cache miss / no-op).
    """
    manager = DegradationManager()

    manager.register_fallback(
        service="anthropic_llm",
        fallback=_anthropic_fallback,
        description="Static error response when LLM is down",
    )
    manager.register_fallback(
        service="yfinance",
        fallback=_yfinance_fallback,
        description="Cached/static response when yfinance is unreachable",
    )
    manager.register_fallback(
        service="redis",
        fallback=_redis_fallback,
        description="No-op fallback when Redis cache is unavailable",
    )

    return manager
