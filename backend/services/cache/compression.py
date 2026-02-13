"""Response compression utilities for the cache layer.

Provides gzip helpers that can be used both as a FastAPI middleware and as
standalone functions for compressing large payloads before Redis storage.
"""

from __future__ import annotations

import gzip
import logging
from typing import Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

logger = logging.getLogger(__name__)

_DEFAULT_THRESHOLD = 1024  # bytes
_DEFAULT_LEVEL = 6


def compress_bytes(
    data: bytes,
    *,
    level: int = _DEFAULT_LEVEL,
) -> bytes:
    """Gzip-compress raw bytes.

    Args:
        data: The input bytes.
        level: Compression level (1=fastest, 9=smallest).

    Returns:
        The gzip-compressed bytes.
    """
    return gzip.compress(data, compresslevel=level)


def decompress_bytes(data: bytes) -> bytes:
    """Decompress gzip bytes.

    Args:
        data: Gzip-compressed bytes.

    Returns:
        The decompressed bytes.
    """
    return gzip.decompress(data)


def compress_large_response(
    body: bytes,
    *,
    threshold: int = _DEFAULT_THRESHOLD,
    level: int = _DEFAULT_LEVEL,
) -> tuple[bytes, bool]:
    """Conditionally compress a response body.

    Args:
        body: The raw response body.
        threshold: Minimum size in bytes to trigger compression.
        level: gzip compression level.

    Returns:
        A tuple of ``(payload, was_compressed)``.
    """
    if len(body) < threshold:
        return body, False
    compressed = compress_bytes(body, level=level)
    # Only use compressed version if it is actually smaller
    if len(compressed) >= len(body):
        return body, False
    return compressed, True


class GZipCacheMiddleware(BaseHTTPMiddleware):
    """FastAPI middleware that gzip-compresses responses above a size threshold.

    This is complementary to (not a replacement for) standard GZip middleware
    shipped with Starlette. It adds ``X-Compressed: true`` and
    ``Content-Encoding: gzip`` headers when compression is applied.

    Args:
        app: The ASGI application.
        threshold: Minimum response body size to trigger compression.
        level: gzip compression level.
    """

    def __init__(
        self,
        app: Callable,
        threshold: int = _DEFAULT_THRESHOLD,
        level: int = _DEFAULT_LEVEL,
    ) -> None:
        super().__init__(app)
        self._threshold = threshold
        self._level = level

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        # Skip if client doesn't accept gzip
        accept_encoding = request.headers.get("accept-encoding", "")
        if "gzip" not in accept_encoding:
            return await call_next(request)

        response = await call_next(request)

        # Only compress JSON / text responses
        content_type = response.headers.get("content-type", "")
        if not any(ct in content_type for ct in ("application/json", "text/")):
            return response

        # Read the body from the streaming response
        body_parts: list[bytes] = []
        async for chunk in response.body_iterator:  # type: ignore[union-attr]
            if isinstance(chunk, str):
                chunk = chunk.encode("utf-8")
            body_parts.append(chunk)
        body = b"".join(body_parts)

        compressed, was_compressed = compress_large_response(
            body, threshold=self._threshold, level=self._level
        )

        headers = dict(response.headers)
        if was_compressed:
            headers["content-encoding"] = "gzip"
            headers["x-compressed"] = "true"
            headers["content-length"] = str(len(compressed))

        return Response(
            content=compressed,
            status_code=response.status_code,
            headers=headers,
            media_type=response.media_type,
        )
