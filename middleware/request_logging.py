"""
Request logging middleware.

Logs method, path, status code, duration, client IP (anonymized), and
request_id for each request as structured JSON-compatible log records.
Uses Python logging with extra fields compatible with config/logging_config.py.
"""

from __future__ import annotations

import json
import logging
import time
from typing import List

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

logger = logging.getLogger("tasi.access")

# Default paths to skip (health, docs, static assets)
_DEFAULT_SKIP_PATHS = {"/health", "/favicon.ico", "/docs", "/redoc", "/openapi.json"}


def _anonymize_ip(ip: str) -> str:
    """Anonymize the last octet of an IPv4 address, or last segment of IPv6."""
    if not ip or ip == "unknown":
        return "unknown"
    if "." in ip:
        # IPv4: replace last octet
        parts = ip.rsplit(".", 1)
        return f"{parts[0]}.xxx"
    if ":" in ip:
        # IPv6: replace last segment
        parts = ip.rsplit(":", 1)
        return f"{parts[0]}:xxxx"
    return ip


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Logs HTTP requests with timing, request_id, and anonymized client IP.

    Parameters
    ----------
    app : ASGIApp
        The ASGI application.
    skip_paths : list[str]
        Paths to exclude from logging (e.g. ["/health", "/favicon.ico"]).
        Merged with a default set that includes /docs, /redoc, /openapi.json.
    """

    def __init__(self, app, skip_paths: List[str] | None = None) -> None:
        super().__init__(app)
        self.skip_paths: set[str] = _DEFAULT_SKIP_PATHS | set(skip_paths or [])

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if path in self.skip_paths:
            return await call_next(request)

        raw_ip = request.client.host if request.client else "unknown"
        client_ip = _anonymize_ip(raw_ip)
        request_id = getattr(request.state, "request_id", "unknown")
        start = time.perf_counter()

        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id

        duration_ms = (time.perf_counter() - start) * 1000
        status_code = response.status_code

        # Structured log data (JSON-compatible)
        log_data = {
            "method": request.method,
            "path": path,
            "status_code": status_code,
            "response_time_ms": round(duration_ms, 1),
            "client_ip": client_ip,
            "request_id": request_id,
        }

        msg = json.dumps(log_data, ensure_ascii=False)

        if status_code < 400:
            logger.info(msg)
        elif status_code < 500:
            logger.warning(msg)
        else:
            logger.error(msg)

        return response
