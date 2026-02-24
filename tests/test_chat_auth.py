"""
Chat Authentication Middleware Tests
======================================
Tests for middleware/chat_auth.py (ChatAuthMiddleware).

The middleware behaviour is:
  - Protected paths: /api/vanna/v2/chat_sse  and  /api/vanna/v2/chat_poll
  - A request with NO Authorization header passes through (anonymous is OK)
  - A request with a valid Bearer token passes through
  - A request with an invalid/malformed token returns 401
  - A request with an expired token returns 401
  - Non-protected paths are never affected

Note: ChatAuthMiddleware imports decode_token via a lazy local import inside
dispatch().  Patching must therefore target 'auth.jwt_handler.decode_token'
(the actual function location), not a module-level attribute.
"""

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

import pytest

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import jwt  # noqa: E402
from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from middleware.chat_auth import ChatAuthMiddleware, _PROTECTED_PATHS  # noqa: E402

# ---------------------------------------------------------------------------
# Patch target: decode_token lives in auth.jwt_handler
# The middleware imports it lazily inside dispatch(), so patching
# auth.jwt_handler.decode_token is the correct approach.
# ---------------------------------------------------------------------------
_DECODE_PATCH = "auth.jwt_handler.decode_token"

_SECRET = "test-chat-auth-secret"
_ALGO = "HS256"


def _make_token(
    token_type: str = "access",
    exp_delta: timedelta = timedelta(minutes=30),
    secret: str = _SECRET,
    algorithm: str = _ALGO,
) -> str:
    payload = {
        "sub": "user-001",
        "type": token_type,
        "exp": datetime.now(timezone.utc) + exp_delta,
    }
    return jwt.encode(payload, secret, algorithm=algorithm)


def _build_app() -> FastAPI:
    """Create a minimal FastAPI app that covers both protected and unprotected paths."""
    app = FastAPI()

    @app.get("/api/vanna/v2/chat_sse")
    async def chat_sse():
        return {"stream": "ok"}

    @app.get("/api/vanna/v2/chat_poll")
    async def chat_poll():
        return {"poll": "ok"}

    @app.get("/api/v1/news/feed")
    async def news_feed():
        return {"news": []}

    @app.get("/health")
    async def health():
        return {"status": "healthy"}

    app.add_middleware(ChatAuthMiddleware)
    return app


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def app():
    return _build_app()


@pytest.fixture(scope="module")
def client(app):
    return TestClient(app, raise_server_exceptions=True)


# ---------------------------------------------------------------------------
# Protected path constants
# ---------------------------------------------------------------------------


class TestProtectedPaths:
    """Verify the set of protected paths is as expected."""

    def test_chat_sse_is_protected(self):
        assert "/api/vanna/v2/chat_sse" in _PROTECTED_PATHS

    def test_chat_poll_is_protected(self):
        assert "/api/vanna/v2/chat_poll" in _PROTECTED_PATHS

    def test_protected_paths_count(self):
        assert len(_PROTECTED_PATHS) == 2


# ---------------------------------------------------------------------------
# Anonymous access (no Authorization header)
# ---------------------------------------------------------------------------


class TestAnonymousAccess:
    """Requests without any Authorization header pass through on ALL paths."""

    def test_anonymous_on_chat_sse_passes(self, client):
        """Missing token on protected path => anonymous allowed (passes through)."""
        resp = client.get("/api/vanna/v2/chat_sse")
        assert resp.status_code == 200

    def test_anonymous_on_chat_poll_passes(self, client):
        resp = client.get("/api/vanna/v2/chat_poll")
        assert resp.status_code == 200

    def test_anonymous_on_unprotected_path_passes(self, client):
        resp = client.get("/api/v1/news/feed")
        assert resp.status_code == 200

    def test_anonymous_on_health_passes(self, client):
        resp = client.get("/health")
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# Valid token access
# ---------------------------------------------------------------------------


class TestValidTokenAccess:
    """Requests with a valid Bearer token pass through on protected paths."""

    def test_valid_token_on_chat_sse_passes(self, client):
        token = _make_token()
        with patch(_DECODE_PATCH, return_value={"sub": "user-001", "type": "access"}):
            resp = client.get(
                "/api/vanna/v2/chat_sse",
                headers={"Authorization": f"Bearer {token}"},
            )
        assert resp.status_code == 200

    def test_valid_token_on_chat_poll_passes(self, client):
        token = _make_token()
        with patch(_DECODE_PATCH, return_value={"sub": "user-001", "type": "access"}):
            resp = client.get(
                "/api/vanna/v2/chat_poll",
                headers={"Authorization": f"Bearer {token}"},
            )
        assert resp.status_code == 200

    def test_valid_token_decode_called_with_expected_type(self, client):
        """Middleware calls decode_token with expected_type='access'."""
        token = _make_token()
        with patch(
            _DECODE_PATCH, return_value={"sub": "u", "type": "access"}
        ) as mock_decode:
            client.get(
                "/api/vanna/v2/chat_sse",
                headers={"Authorization": f"Bearer {token}"},
            )
        mock_decode.assert_called_once_with(token, expected_type="access")


# ---------------------------------------------------------------------------
# Invalid token access — should return 401
# ---------------------------------------------------------------------------


class TestInvalidTokenAccess:
    """Requests with invalid, expired, or malformed tokens return 401."""

    def test_invalid_signature_returns_401(self, client):
        """A token signed with the wrong secret raises and returns 401."""
        bad_token = _make_token(secret="wrong-secret")
        with patch(_DECODE_PATCH, side_effect=jwt.InvalidSignatureError("bad sig")):
            resp = client.get(
                "/api/vanna/v2/chat_sse",
                headers={"Authorization": f"Bearer {bad_token}"},
            )
        assert resp.status_code == 401

    def test_expired_token_returns_401(self, client):
        """An expired token returns 401."""
        with patch(_DECODE_PATCH, side_effect=jwt.ExpiredSignatureError("expired")):
            resp = client.get(
                "/api/vanna/v2/chat_poll",
                headers={"Authorization": "Bearer expired.token.value"},
            )
        assert resp.status_code == 401

    def test_malformed_token_returns_401(self, client):
        """A completely malformed token string returns 401."""
        with patch(_DECODE_PATCH, side_effect=jwt.DecodeError("malformed")):
            resp = client.get(
                "/api/vanna/v2/chat_sse",
                headers={"Authorization": "Bearer not.a.valid.token"},
            )
        assert resp.status_code == 401

    def test_wrong_token_type_returns_401(self, client):
        """A refresh token where an access token is expected returns 401."""
        with patch(_DECODE_PATCH, side_effect=ValueError("type mismatch")):
            resp = client.get(
                "/api/vanna/v2/chat_sse",
                headers={"Authorization": "Bearer refresh.token.here"},
            )
        assert resp.status_code == 401

    def test_401_response_body_has_detail(self, client):
        """The 401 response body should include a 'detail' key."""
        with patch(_DECODE_PATCH, side_effect=Exception("any error")):
            resp = client.get(
                "/api/vanna/v2/chat_sse",
                headers={"Authorization": "Bearer invalid"},
            )
        assert resp.status_code == 401
        data = resp.json()
        assert "detail" in data


# ---------------------------------------------------------------------------
# Non-protected paths are never affected by middleware
# ---------------------------------------------------------------------------


class TestNonProtectedPaths:
    """Middleware must not affect paths outside _PROTECTED_PATHS."""

    def test_bad_token_on_news_feed_is_ignored(self, client):
        """Invalid token on a non-protected path does NOT trigger 401.

        The middleware only validates tokens on _PROTECTED_PATHS.
        A bad token on /api/v1/news/feed must not cause a 401.
        """
        resp = client.get(
            "/api/v1/news/feed",
            headers={"Authorization": "Bearer totally.invalid.token"},
        )
        # Middleware should not touch this path — endpoint returns 200
        assert resp.status_code == 200

    def test_bad_token_on_health_is_ignored(self, client):
        resp = client.get(
            "/health",
            headers={"Authorization": "Bearer bad.token"},
        )
        assert resp.status_code == 200

    def test_non_bearer_scheme_on_protected_path_passes(self, client):
        """A non-Bearer Authorization value is ignored (anonymous fallback).

        The middleware only processes 'Bearer ' tokens. Other auth schemes
        (Basic, Digest) are passed through as if no token was provided.
        """
        resp = client.get(
            "/api/vanna/v2/chat_sse",
            headers={"Authorization": "Basic dXNlcjpwYXNz"},
        )
        # Non-bearer auth on protected path: no token validation, pass through
        assert resp.status_code == 200
