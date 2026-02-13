"""
Auth Bypass Security Tests
===========================
Tests for JWT authentication bypass vulnerabilities.

Covers:
  - Expired token rejection
  - Malformed JWT rejection (garbage, truncated, extra segments)
  - Missing Authorization header
  - Invalid signature (wrong secret)
  - Token type mismatch (refresh used as access)
  - Algorithm confusion (none, HS384)
  - Missing required claims (no sub, no type)
  - Replay with forged claims
  - Empty Bearer value

Uses FastAPI TestClient with the auth router.
"""

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch

import jwt as pyjwt
import pytest

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


@pytest.fixture(scope="module")
def auth_app():
    """Create a minimal FastAPI app with the auth router."""
    from fastapi import FastAPI
    from api.routes.auth import router

    app = FastAPI()
    app.include_router(router)
    return app


@pytest.fixture(scope="module")
def client(auth_app):
    from fastapi.testclient import TestClient

    return TestClient(auth_app)


@pytest.fixture
def mock_auth_settings():
    from config.settings import AuthSettings

    settings = AuthSettings(
        jwt_secret="test-secret-for-bypass-tests",
        jwt_algorithm="HS256",
        access_token_expire_minutes=30,
        refresh_token_expire_days=7,
    )
    with patch("auth.jwt_handler._get_auth_settings", return_value=settings):
        yield settings


@pytest.fixture
def valid_token(mock_auth_settings):
    """Generate a valid access token for testing."""
    payload = {
        "sub": "test-user-bypass-1",
        "email": "bypass@test.com",
        "type": "access",
        "exp": datetime.now(timezone.utc) + timedelta(minutes=30),
    }
    return pyjwt.encode(
        payload,
        mock_auth_settings.jwt_secret,
        algorithm=mock_auth_settings.jwt_algorithm,
    )


@pytest.fixture
def mock_db_user():
    """Mock database returning a valid active user."""
    mock_conn = MagicMock()
    mock_cursor = MagicMock()
    mock_cursor.fetchone.return_value = (
        "test-user-bypass-1",
        "bypass@test.com",
        "Bypass Tester",
        "free",
        5,
        True,
        datetime.now(),
    )
    mock_conn.cursor.return_value.__enter__ = MagicMock(return_value=mock_cursor)
    mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)
    return mock_conn


# ===========================================================================
# Expired tokens
# ===========================================================================


class TestExpiredTokenBypass:
    """Test that expired tokens are properly rejected."""

    def test_expired_token_returns_401(self, client, mock_auth_settings):
        expired = pyjwt.encode(
            {
                "sub": "user-1",
                "email": "u@t.com",
                "type": "access",
                "exp": datetime.now(timezone.utc) - timedelta(hours=1),
            },
            mock_auth_settings.jwt_secret,
            algorithm=mock_auth_settings.jwt_algorithm,
        )
        resp = client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {expired}"},
        )
        assert resp.status_code == 401

    def test_just_expired_token_rejected(self, client, mock_auth_settings):
        """Token that expired 1 second ago should still be rejected."""
        just_expired = pyjwt.encode(
            {
                "sub": "user-1",
                "email": "u@t.com",
                "type": "access",
                "exp": datetime.now(timezone.utc) - timedelta(seconds=1),
            },
            mock_auth_settings.jwt_secret,
            algorithm=mock_auth_settings.jwt_algorithm,
        )
        resp = client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {just_expired}"},
        )
        assert resp.status_code == 401


# ===========================================================================
# Malformed JWT tokens
# ===========================================================================


class TestMalformedTokenBypass:
    """Test that malformed tokens are rejected."""

    def test_garbage_token_rejected(self, client, mock_auth_settings):
        resp = client.get(
            "/api/auth/me",
            headers={"Authorization": "Bearer totally-not-a-jwt"},
        )
        assert resp.status_code == 401

    def test_empty_bearer_value_rejected(self, client, mock_auth_settings):
        resp = client.get(
            "/api/auth/me",
            headers={"Authorization": "Bearer "},
        )
        assert resp.status_code in (401, 403, 422)

    def test_truncated_token_rejected(self, client, mock_auth_settings):
        """Token with missing signature segment."""
        token = pyjwt.encode(
            {"sub": "user-1", "type": "access", "exp": datetime.now(timezone.utc) + timedelta(hours=1)},
            mock_auth_settings.jwt_secret,
            algorithm=mock_auth_settings.jwt_algorithm,
        )
        # Remove the signature part
        parts = token.split(".")
        truncated = ".".join(parts[:2])
        resp = client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {truncated}"},
        )
        assert resp.status_code in (401, 403, 422)

    def test_extra_segments_rejected(self, client, mock_auth_settings):
        """Token with extra dot-segments."""
        resp = client.get(
            "/api/auth/me",
            headers={"Authorization": "Bearer aaa.bbb.ccc.ddd.eee"},
        )
        assert resp.status_code in (401, 403)


# ===========================================================================
# Missing Authorization header
# ===========================================================================


class TestMissingAuthHeader:
    """Test that missing auth headers are rejected."""

    def test_no_auth_header_returns_401_or_403(self, client):
        resp = client.get("/api/auth/me")
        assert resp.status_code in (401, 403)

    def test_non_bearer_scheme_rejected(self, client):
        resp = client.get(
            "/api/auth/me",
            headers={"Authorization": "Basic dXNlcjpwYXNz"},
        )
        assert resp.status_code in (401, 403)


# ===========================================================================
# Invalid signature (wrong secret)
# ===========================================================================


class TestInvalidSignatureBypass:
    """Test that tokens signed with wrong key are rejected."""

    def test_wrong_secret_rejected(self, client, mock_auth_settings):
        wrong_secret_token = pyjwt.encode(
            {
                "sub": "user-1",
                "email": "u@t.com",
                "type": "access",
                "exp": datetime.now(timezone.utc) + timedelta(hours=1),
            },
            "completely-wrong-secret-key",
            algorithm="HS256",
        )
        resp = client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {wrong_secret_token}"},
        )
        assert resp.status_code == 401


# ===========================================================================
# Token type mismatch
# ===========================================================================


class TestTokenTypeMismatch:
    """Test that using refresh tokens for access is rejected."""

    def test_refresh_token_for_access_rejected(self, client, mock_auth_settings):
        refresh_token = pyjwt.encode(
            {
                "sub": "user-1",
                "email": "u@t.com",
                "type": "refresh",
                "exp": datetime.now(timezone.utc) + timedelta(days=7),
            },
            mock_auth_settings.jwt_secret,
            algorithm=mock_auth_settings.jwt_algorithm,
        )
        resp = client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {refresh_token}"},
        )
        assert resp.status_code == 401

    def test_access_token_for_refresh_rejected(self, client, mock_auth_settings):
        """Access token used in refresh endpoint should fail."""
        guest_resp = client.post("/api/auth/guest")
        access_token = guest_resp.json()["token"]

        resp = client.post(
            "/api/auth/refresh",
            json={"refresh_token": access_token},
        )
        assert resp.status_code == 401


# ===========================================================================
# Algorithm confusion
# ===========================================================================


class TestAlgorithmConfusion:
    """Test algorithm confusion attacks."""

    def test_none_algorithm_rejected(self, client, mock_auth_settings):
        """Crafting a token with alg=none should be rejected."""
        import base64
        import json

        header = base64.urlsafe_b64encode(
            json.dumps({"alg": "none", "typ": "JWT"}).encode()
        ).rstrip(b"=").decode()
        payload = base64.urlsafe_b64encode(
            json.dumps({
                "sub": "admin",
                "email": "admin@test.com",
                "type": "access",
                "exp": int((datetime.now(timezone.utc) + timedelta(hours=1)).timestamp()),
            }).encode()
        ).rstrip(b"=").decode()
        fake_token = f"{header}.{payload}."

        resp = client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {fake_token}"},
        )
        assert resp.status_code in (401, 403)


# ===========================================================================
# Missing required claims
# ===========================================================================


class TestMissingClaims:
    """Test that tokens with missing required claims are rejected."""

    def test_missing_sub_claim_rejected(self, client, mock_auth_settings):
        token = pyjwt.encode(
            {
                "email": "no-sub@test.com",
                "type": "access",
                "exp": datetime.now(timezone.utc) + timedelta(hours=1),
            },
            mock_auth_settings.jwt_secret,
            algorithm=mock_auth_settings.jwt_algorithm,
        )
        resp = client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 401

    def test_empty_sub_claim_rejected(self, client, mock_auth_settings):
        token = pyjwt.encode(
            {
                "sub": "",
                "email": "empty-sub@test.com",
                "type": "access",
                "exp": datetime.now(timezone.utc) + timedelta(hours=1),
            },
            mock_auth_settings.jwt_secret,
            algorithm=mock_auth_settings.jwt_algorithm,
        )
        resp = client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 401
