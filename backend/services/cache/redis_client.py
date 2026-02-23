"""Async Redis client manager with connection pooling and auto-reconnection.

Provides a singleton-style RedisManager for the Ra'd AI platform that wraps
redis.asyncio with connection pooling, health checks, and graceful reconnection.
"""

from __future__ import annotations

import logging
import time
from typing import Any

from redis.asyncio import ConnectionPool, Redis
from redis.exceptions import ConnectionError as RedisConnectionError, RedisError

logger = logging.getLogger(__name__)

# Default configuration
_DEFAULT_URL = "redis://localhost:6379/0"
_DEFAULT_MAX_CONNECTIONS = 20
_DEFAULT_SOCKET_TIMEOUT = 5.0
_DEFAULT_SOCKET_CONNECT_TIMEOUT = 5.0
_DEFAULT_RETRY_ON_TIMEOUT = True
_DEFAULT_DECODE_RESPONSES = False  # Keep bytes for msgpack serialization


class RedisManager:
    """Async Redis client manager with connection pooling and auto-reconnect.

    Attributes:
        url: Redis connection URL.
        max_connections: Maximum pool size.
        password: Optional Redis password (overrides URL auth).
    """

    def __init__(
        self,
        url: str = _DEFAULT_URL,
        password: str | None = None,
        max_connections: int = _DEFAULT_MAX_CONNECTIONS,
        socket_timeout: float = _DEFAULT_SOCKET_TIMEOUT,
        socket_connect_timeout: float = _DEFAULT_SOCKET_CONNECT_TIMEOUT,
        retry_on_timeout: bool = _DEFAULT_RETRY_ON_TIMEOUT,
        decode_responses: bool = _DEFAULT_DECODE_RESPONSES,
    ) -> None:
        self._url = url
        self._password = password
        self._max_connections = max_connections
        self._socket_timeout = socket_timeout
        self._socket_connect_timeout = socket_connect_timeout
        self._retry_on_timeout = retry_on_timeout
        self._decode_responses = decode_responses
        self._pool: ConnectionPool | None = None
        self._client: Redis | None = None
        self._connected = False

    @property
    def is_connected(self) -> bool:
        """Whether the manager currently holds a live connection."""
        return self._connected

    async def connect(self) -> None:
        """Initialize the connection pool and Redis client.

        Safe to call multiple times; subsequent calls are no-ops if already
        connected.
        """
        if self._connected and self._client is not None:
            return

        try:
            self._pool = ConnectionPool.from_url(
                self._url,
                password=self._password,
                max_connections=self._max_connections,
                socket_timeout=self._socket_timeout,
                socket_connect_timeout=self._socket_connect_timeout,
                retry_on_timeout=self._retry_on_timeout,
                decode_responses=self._decode_responses,
            )
            self._client = Redis(connection_pool=self._pool)
            # Verify connectivity
            await self._client.ping()  # type: ignore[misc]
            self._connected = True
            logger.info(
                "Redis connected: url=%s pool_max=%d",
                self._url,
                self._max_connections,
            )
        except RedisError as exc:
            self._connected = False
            logger.error("Redis connection failed: %s", exc)
            raise

    async def disconnect(self) -> None:
        """Close the Redis client and drain the connection pool."""
        if self._client is not None:
            try:
                await self._client.aclose()  # type: ignore[attr-defined]
            except RedisError as exc:
                logger.warning("Error closing Redis client: %s", exc)
            finally:
                self._client = None

        if self._pool is not None:
            try:
                await self._pool.aclose()  # type: ignore[attr-defined]
            except RedisError as exc:
                logger.warning("Error closing Redis pool: %s", exc)
            finally:
                self._pool = None

        self._connected = False
        logger.info("Redis disconnected")

    async def _ensure_connection(self) -> Redis:
        """Return the Redis client, reconnecting if necessary.

        Raises:
            RuntimeError: If connect() was never called.
            RedisError: If reconnection fails.
        """
        if self._client is not None and self._connected:
            return self._client

        # Attempt automatic reconnection
        logger.warning("Redis connection lost, attempting reconnect")
        await self.disconnect()
        await self.connect()

        if self._client is None:
            raise RuntimeError("Redis client is not available after reconnect")
        return self._client

    # ------------------------------------------------------------------
    # Core operations
    # ------------------------------------------------------------------

    async def get(self, key: str) -> bytes | None:
        """Get a value by key.

        Args:
            key: The cache key.

        Returns:
            The raw bytes value, or None if the key does not exist.
        """
        client = await self._ensure_connection()
        try:
            return await client.get(key)
        except RedisConnectionError:
            self._connected = False
            client = await self._ensure_connection()
            return await client.get(key)

    async def set(
        self,
        key: str,
        value: bytes | str,
        ttl: int | None = None,
    ) -> bool:
        """Set a key-value pair with an optional TTL.

        Args:
            key: The cache key.
            value: The value to store (bytes or str).
            ttl: Time-to-live in seconds. None means no expiry.

        Returns:
            True if the key was set successfully.
        """
        client = await self._ensure_connection()
        try:
            if ttl is not None:
                result = await client.setex(key, ttl, value)
            else:
                result = await client.set(key, value)
            return bool(result)
        except RedisConnectionError:
            self._connected = False
            client = await self._ensure_connection()
            if ttl is not None:
                result = await client.setex(key, ttl, value)
            else:
                result = await client.set(key, value)
            return bool(result)

    async def delete(self, *keys: str) -> int:
        """Delete one or more keys.

        Args:
            keys: One or more cache keys to delete.

        Returns:
            Number of keys that were deleted.
        """
        if not keys:
            return 0
        client = await self._ensure_connection()
        try:
            return await client.delete(*keys)
        except RedisConnectionError:
            self._connected = False
            client = await self._ensure_connection()
            return await client.delete(*keys)

    async def exists(self, *keys: str) -> int:
        """Check if one or more keys exist.

        Args:
            keys: One or more cache keys to check.

        Returns:
            Number of provided keys that exist.
        """
        if not keys:
            return 0
        client = await self._ensure_connection()
        try:
            return await client.exists(*keys)
        except RedisConnectionError:
            self._connected = False
            client = await self._ensure_connection()
            return await client.exists(*keys)

    # ------------------------------------------------------------------
    # Health
    # ------------------------------------------------------------------

    async def health_check(self) -> dict[str, Any]:
        """Run a health check against the Redis server.

        Returns:
            A dict with keys: ``status`` (``"healthy"`` or ``"unhealthy"``),
            ``latency_ms``, ``connected``, and optionally ``error``.
        """
        start = time.monotonic()
        try:
            client = await self._ensure_connection()
            await client.ping()  # type: ignore[misc]
            latency_ms = round((time.monotonic() - start) * 1000, 2)

            info = await client.info(section="memory")
            used_memory = info.get("used_memory_human", "unknown")

            return {
                "status": "healthy",
                "latency_ms": latency_ms,
                "connected": True,
                "used_memory": used_memory,
                "pool_max_connections": self._max_connections,
            }
        except (RedisError, RuntimeError) as exc:
            latency_ms = round((time.monotonic() - start) * 1000, 2)
            self._connected = False
            return {
                "status": "unhealthy",
                "latency_ms": latency_ms,
                "connected": False,
                "error": str(exc),
            }
