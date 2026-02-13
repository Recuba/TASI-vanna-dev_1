"""
Circuit breaker implementation for external service calls.

Prevents cascading failures by short-circuiting calls to services that are
experiencing repeated failures. Transitions through three states:

    CLOSED   -> calls pass through; failures are counted
    OPEN     -> calls are rejected immediately (raises CircuitBreakerOpen)
    HALF_OPEN -> a limited number of probe calls are allowed to test recovery

State transitions are logged for observability.
"""

import asyncio
import logging
import time
from enum import Enum
from typing import Any, Callable, Optional, TypeVar

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

T = TypeVar("T")


class CircuitState(str, Enum):
    """Possible states of a circuit breaker."""

    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


class CircuitStats(BaseModel):
    """Observable statistics for a circuit breaker instance."""

    name: str = Field(description="Identifier of the protected service")
    state: CircuitState = Field(description="Current circuit state")
    failure_count: int = Field(default=0, description="Consecutive failure count")
    success_count: int = Field(default=0, description="Consecutive success count in half-open")
    total_failures: int = Field(default=0, description="Lifetime failure count")
    total_successes: int = Field(default=0, description="Lifetime success count")
    total_rejected: int = Field(default=0, description="Calls rejected while open")
    last_failure_time: Optional[float] = Field(
        default=None, description="Epoch time of last failure"
    )
    last_success_time: Optional[float] = Field(
        default=None, description="Epoch time of last success"
    )
    opened_at: Optional[float] = Field(
        default=None, description="Epoch time when circuit opened"
    )


class CircuitBreakerOpen(Exception):
    """Raised when a call is attempted on an open circuit breaker."""

    def __init__(self, name: str, retry_after: float) -> None:
        self.name = name
        self.retry_after = retry_after
        super().__init__(
            f"Circuit breaker '{name}' is OPEN. Retry after {retry_after:.1f}s."
        )


class CircuitBreaker:
    """Thread-safe circuit breaker for protecting external service calls.

    Args:
        name: Identifier for the protected service (used in logs and stats).
        failure_threshold: Number of consecutive failures before opening.
        recovery_timeout: Seconds to wait in OPEN state before transitioning
            to HALF_OPEN.
        half_open_max_calls: Number of probe calls allowed in HALF_OPEN state
            before deciding to close or re-open.
        success_threshold: Number of consecutive successes in HALF_OPEN state
            needed to transition back to CLOSED.
    """

    def __init__(
        self,
        name: str,
        failure_threshold: int = 5,
        recovery_timeout: float = 30.0,
        half_open_max_calls: int = 3,
        success_threshold: int = 2,
    ) -> None:
        self.name = name
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.half_open_max_calls = half_open_max_calls
        self.success_threshold = success_threshold

        self._state = CircuitState.CLOSED
        self._failure_count = 0
        self._success_count = 0
        self._half_open_calls = 0
        self._total_failures = 0
        self._total_successes = 0
        self._total_rejected = 0
        self._last_failure_time: Optional[float] = None
        self._last_success_time: Optional[float] = None
        self._opened_at: Optional[float] = None
        self._lock = asyncio.Lock()

        logger.info(
            "Circuit breaker '%s' initialized: failure_threshold=%d, "
            "recovery_timeout=%.1fs, success_threshold=%d",
            name,
            failure_threshold,
            recovery_timeout,
            success_threshold,
        )

    @property
    def state(self) -> CircuitState:
        """Return the current circuit state, considering timeout-based transitions."""
        if (
            self._state == CircuitState.OPEN
            and self._opened_at is not None
            and (time.monotonic() - self._opened_at) >= self.recovery_timeout
        ):
            return CircuitState.HALF_OPEN
        return self._state

    def get_stats(self) -> CircuitStats:
        """Return a snapshot of current circuit breaker statistics."""
        return CircuitStats(
            name=self.name,
            state=self.state,
            failure_count=self._failure_count,
            success_count=self._success_count,
            total_failures=self._total_failures,
            total_successes=self._total_successes,
            total_rejected=self._total_rejected,
            last_failure_time=self._last_failure_time,
            last_success_time=self._last_success_time,
            opened_at=self._opened_at,
        )

    async def call(self, func: Callable[..., Any], *args: Any, **kwargs: Any) -> Any:
        """Execute *func* through the circuit breaker.

        If the circuit is OPEN and the recovery timeout has not elapsed, raises
        ``CircuitBreakerOpen``.  In HALF_OPEN state, a limited number of probe
        calls are allowed through.

        Args:
            func: The async or sync callable to protect.
            *args: Positional arguments forwarded to *func*.
            **kwargs: Keyword arguments forwarded to *func*.

        Returns:
            The return value of *func*.

        Raises:
            CircuitBreakerOpen: If the circuit is open.
            Exception: Any exception raised by *func* (after recording the failure).
        """
        async with self._lock:
            current_state = self.state

            if current_state == CircuitState.OPEN:
                self._total_rejected += 1
                retry_after = self.recovery_timeout - (
                    time.monotonic() - (self._opened_at or time.monotonic())
                )
                raise CircuitBreakerOpen(self.name, max(retry_after, 0.0))

            if current_state == CircuitState.HALF_OPEN:
                if self._half_open_calls >= self.half_open_max_calls:
                    self._total_rejected += 1
                    raise CircuitBreakerOpen(self.name, retry_after=1.0)
                self._half_open_calls += 1

            # Transition from OPEN to HALF_OPEN if we got here
            if self._state == CircuitState.OPEN:
                self._transition(CircuitState.HALF_OPEN)

        # Execute outside the lock so we don't hold it during I/O
        try:
            if asyncio.iscoroutinefunction(func):
                result = await func(*args, **kwargs)
            else:
                result = func(*args, **kwargs)
        except Exception as exc:
            await self._record_failure(exc)
            raise
        else:
            await self._record_success()
            return result

    async def _record_success(self) -> None:
        """Record a successful call and potentially close the circuit."""
        async with self._lock:
            now = time.monotonic()
            self._last_success_time = now
            self._total_successes += 1

            if self._state == CircuitState.HALF_OPEN:
                self._success_count += 1
                if self._success_count >= self.success_threshold:
                    self._transition(CircuitState.CLOSED)
            elif self._state == CircuitState.CLOSED:
                # Reset consecutive failure counter on success
                self._failure_count = 0

    async def _record_failure(self, exc: Exception) -> None:
        """Record a failed call and potentially open the circuit."""
        async with self._lock:
            now = time.monotonic()
            self._last_failure_time = now
            self._total_failures += 1

            if self._state == CircuitState.HALF_OPEN:
                # Any failure in half-open immediately re-opens
                self._transition(CircuitState.OPEN)
            elif self._state == CircuitState.CLOSED:
                self._failure_count += 1
                if self._failure_count >= self.failure_threshold:
                    self._transition(CircuitState.OPEN)

            logger.warning(
                "Circuit breaker '%s' recorded failure (%s): %s",
                self.name,
                self._state.value,
                str(exc)[:200],
            )

    def _transition(self, new_state: CircuitState) -> None:
        """Transition to a new state, logging the change."""
        old_state = self._state
        self._state = new_state

        if new_state == CircuitState.OPEN:
            self._opened_at = time.monotonic()
            self._success_count = 0
            self._half_open_calls = 0
        elif new_state == CircuitState.HALF_OPEN:
            self._success_count = 0
            self._half_open_calls = 0
        elif new_state == CircuitState.CLOSED:
            self._failure_count = 0
            self._success_count = 0
            self._half_open_calls = 0
            self._opened_at = None

        logger.info(
            "Circuit breaker '%s' state transition: %s -> %s",
            self.name,
            old_state.value,
            new_state.value,
        )

    async def reset(self) -> None:
        """Manually reset the circuit breaker to CLOSED state."""
        async with self._lock:
            logger.info("Circuit breaker '%s' manually reset to CLOSED", self.name)
            self._transition(CircuitState.CLOSED)


# ---------------------------------------------------------------------------
# Global registry of circuit breakers for health reporting
# ---------------------------------------------------------------------------
_registry: dict[str, CircuitBreaker] = {}


def get_or_create(
    name: str,
    failure_threshold: int = 5,
    recovery_timeout: float = 30.0,
    half_open_max_calls: int = 3,
    success_threshold: int = 2,
) -> CircuitBreaker:
    """Return an existing circuit breaker or create a new one.

    This ensures a single ``CircuitBreaker`` instance per *name* across the
    application.
    """
    if name not in _registry:
        _registry[name] = CircuitBreaker(
            name=name,
            failure_threshold=failure_threshold,
            recovery_timeout=recovery_timeout,
            half_open_max_calls=half_open_max_calls,
            success_threshold=success_threshold,
        )
    return _registry[name]


def get_all_stats() -> list[CircuitStats]:
    """Return stats for every registered circuit breaker."""
    return [cb.get_stats() for cb in _registry.values()]


def get_registry() -> dict[str, CircuitBreaker]:
    """Return the global circuit breaker registry (read-only access)."""
    return dict(_registry)
