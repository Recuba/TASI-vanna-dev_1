"""
Chat authentication middleware.
Validates JWT bearer tokens for Vanna chat endpoints.
Anonymous access is allowed — a missing token passes through,
but a present-and-invalid token returns 401.
"""
import logging
from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger(__name__)

_PROTECTED_PATHS = {"/api/vanna/v2/chat_sse", "/api/vanna/v2/chat_poll"}


class ChatAuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.url.path in _PROTECTED_PATHS:
            auth_header = request.headers.get("authorization", "")
            if auth_header.lower().startswith("bearer "):
                token = auth_header[7:]
                logger.debug("ChatAuthMiddleware: validating bearer token for %s", request.url.path)
                try:
                    from auth.jwt_handler import decode_token
                    decode_token(token, expected_type="access")
                except Exception as exc:
                    logger.debug("ChatAuthMiddleware: token validation failed: %s", exc)
                    return JSONResponse(
                        status_code=401,
                        content={"detail": "Invalid or expired authentication token"},
                    )
        return await call_next(request)
