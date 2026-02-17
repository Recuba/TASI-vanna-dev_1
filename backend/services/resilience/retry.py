"""
Retry and timeout decorators for resilient external service calls.

Provides two decorators:

    @with_retry   - Exponential backoff with jitter for transient failures
    @with_timeout - asyncio.wait_for wrapper with configurable deadline

Both decorators work with async functions and can be stacked.
"""

import asyncio
import functools
import logging
import random
from typing import Any, Callable, Optional, Sequence, Type, TypeVar

logger = logging.getLogger(__name__)

F = TypeVar("F", bound=Callable[..., Any])


def with_retry(
    max_attempts: int = 3,
    base_delay: float = 1.0,
    max_delay: float = 30.0,
    exponential_base: float = 2.0,
    jitter: bool = True,
    retryable_exceptions: Sequence[Type[BaseException]] = (Exception,),
    on_retry: Optional[Callable[[int, BaseException, float], None]] = None,
) -> Callable[[F], F]:
    """Decorator that retries an async function with exponential backoff + jitter.

    Args:
        max_attempts: Maximum number of attempts (including the first call).
        base_delay: Initial delay in seconds before the first retry.
        max_delay: Maximum delay in seconds between retries.
        exponential_base: Base for exponential backoff calculation.
        jitter: If True, adds random jitter to avoid thundering herd.
        retryable_exceptions: Tuple of exception types that trigger a retry.
            Non-matching exceptions propagate immediately.
        on_retry: Optional callback ``(attempt, exception, delay)`` called
            before each retry sleep.

    Returns:
        A decorated async function that transparently retries on failure.

    Example::

        @with_retry(max_attempts=3, retryable_exceptions=(ConnectionError, TimeoutError))
        async def fetch_data(url: str) -> dict:
            ...
    """

    def decorator(func: F) -> F:
        @functools.wraps(func)
        async def wrapper(*args: Any, **kwargs: Any) -> Any:
            last_exception: Optional[BaseException] = None

            for attempt in range(1, max_attempts + 1):
                try:
                    return await func(*args, **kwargs)
                except tuple(retryable_exceptions) as exc:
                    last_exception = exc

                    if attempt == max_attempts:
                        logger.error(
                            "Retry exhausted for %s after %d attempts: %s",
                            func.__qualname__,
                            max_attempts,
                            str(exc)[:200],
                        )
                        raise

                    # Calculate delay with exponential backoff
                    delay = min(
                        base_delay * (exponential_base ** (attempt - 1)),
                        max_delay,
                    )

                    # Add jitter: random value between 0 and delay
                    if jitter:
                        delay = delay * random.uniform(0.5, 1.0)

                    if on_retry is not None:
                        on_retry(attempt, exc, delay)

                    logger.warning(
                        "Retry %d/%d for %s after %.2fs (error: %s)",
                        attempt,
                        max_attempts,
                        func.__qualname__,
                        delay,
                        str(exc)[:200],
                    )

                    await asyncio.sleep(delay)

            # Should not reach here, but just in case
            if last_exception is not None:
                raise last_exception

        return wrapper  # type: ignore[return-value]

    return decorator


def with_timeout(
    timeout_seconds: float,
    timeout_message: Optional[str] = None,
) -> Callable[[F], F]:
    """Decorator that enforces a timeout on an async function.

    Uses ``asyncio.wait_for`` to cancel the coroutine if it exceeds the
    deadline.

    Args:
        timeout_seconds: Maximum execution time in seconds.
        timeout_message: Custom message for the ``asyncio.TimeoutError``.
            If not provided, a default message with the function name is used.

    Returns:
        A decorated async function that raises ``asyncio.TimeoutError``
        if the deadline is exceeded.

    Example::

        @with_timeout(5.0)
        async def query_database(sql: str) -> list:
            ...
    """

    def decorator(func: F) -> F:
        @functools.wraps(func)
        async def wrapper(*args: Any, **kwargs: Any) -> Any:
            try:
                return await asyncio.wait_for(
                    func(*args, **kwargs),
                    timeout=timeout_seconds,
                )
            except asyncio.TimeoutError:
                msg = timeout_message or (
                    f"{func.__qualname__} timed out after {timeout_seconds}s"
                )
                logger.error(msg)
                raise asyncio.TimeoutError(msg)

        return wrapper  # type: ignore[return-value]

    return decorator
