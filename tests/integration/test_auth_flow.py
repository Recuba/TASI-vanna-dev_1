"""
Integration Tests: Authentication Flow
========================================
Tests the full JWT auth lifecycle using FastAPI TestClient.

Covers:
  - Guest login -> JWT token
  - Protected endpoint with valid token -> 200
  - Protected endpoint without token -> 401
  - Protected endpoint with invalid token -> 401/403
  - Token refresh flow

Markers:
  - integration: requires full app assembly (no external DB)
"""

from __future__ import annotations

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch

import jwt as pyjwt
import pytest

# Ensure project root on sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def auth_app():
    """Create a minimal FastAPI app with the auth router."""
    from fastapi import FastAPI
    from api.routes.auth import router

    app = FastAPI()
    app.include_router(router)
    return app


@pytest.fixture(scope="module")
def auth_client(auth_app):
    """TestClient for auth endpoints."""
    from fastapi.testclient import TestClient

    return TestClient(auth_app)


@pytest.fixture
def mock_auth_settings():
    """Provide deterministic auth settings for JWT operations."""
    from config.settings import AuthSettings

    settings = AuthSettings(
        jwt_secret="test-secret-key-for-integration-testing",
        jwt_algorithm="HS256",
        access_token_expire_minutes=30,
        refresh_token_expire_days=7,
    )
    with patch("auth.jwt_handler._get_auth_settings", return_value=settings):
        yield settings


@pytest.fixture
def mock_db_user():
    """Mock database to return a valid user for token verification."""
    mock_conn = MagicMock()
    mock_cursor = MagicMock()
    mock_cursor.fetchone.return_value = (
        "test-user-id-123",
        "testuser@example.com",
        "Test User",
        "free",
        5,
        True,
        datetime.now(),
    )
    mock_conn.cursor.return_value.__enter__ = MagicMock(return_value=mock_cursor)
    mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)
    return mock_conn


# ---------------------------------------------------------------------------
# Guest login -> JWT
# ---------------------------------------------------------------------------

class TestGuestLogin:
    """Test POST /api/auth/guest returns a valid JWT."""

    @pytest.mark.integration
    def test_guest_login_returns_200(self, auth_client, mock_auth_settings):
        resp = auth_client.post("/api/auth/guest")
        assert resp.status_code == 200

    @pytest.mark.integration
    def test_guest_login_returns_token(self, auth_client, mock_auth_settings):
        resp = auth_client.post("/api/auth/guest")
        body = resp.json()
        assert "token" in body
        assert len(body["token"]) > 0

    @pytest.mark.integration
    def test_guest_login_returns_refresh_token(self, auth_client, mock_auth_settings):
        resp = auth_client.post("/api/auth/guest")
        body = resp.json()
        assert "refresh_token" in body
        assert len(body["refresh_token"]) > 0

    @pytest.mark.integration
    def test_guest_login_returns_user_id(self, auth_client, mock_auth_settings):
        resp = auth_client.post("/api/auth/guest")
        body = resp.json()
        assert "user_id" in body
        assert body["user_id"].startswith("guest-")

    @pytest.mark.integration
    def test_guest_login_returns_name(self, auth_client, mock_auth_settings):
        resp = auth_client.post("/api/auth/guest")
        body = resp.json()
        assert body.get("name") == "Guest"

    @pytest.mark.integration
    def test_guest_token_is_decodable(self, auth_client, mock_auth_settings):
        resp = auth_client.post("/api/auth/guest")
        token = resp.json()["token"]
        payload = pyjwt.decode(
            token,
            mock_auth_settings.jwt_secret,
            algorithms=[mock_auth_settings.jwt_algorithm],
        )
        assert payload["type"] == "access"
        assert "sub" in payload
        assert "exp" in payload

    @pytest.mark.integration
    def test_each_guest_gets_unique_id(self, auth_client, mock_auth_settings):
        resp1 = auth_client.post("/api/auth/guest")
        resp2 = auth_client.post("/api/auth/guest")
        id1 = resp1.json()["user_id"]
        id2 = resp2.json()["user_id"]
        assert id1 != id2


# ---------------------------------------------------------------------------
# Protected endpoint with valid token -> 200
# ---------------------------------------------------------------------------

class TestProtectedWithValidToken:
    """Test GET /api/auth/me with a valid token returns user profile."""

    @pytest.mark.integration
    def test_me_with_valid_token_returns_200(
        self, auth_client, mock_auth_settings, mock_db_user
    ):
        # Get a guest token
        resp = auth_client.post("/api/auth/guest")
        token = resp.json()["token"]

        # Mock the DB lookup for /me
        with patch("auth.dependencies.get_db_connection", return_value=mock_db_user):
            resp = auth_client.get(
                "/api/auth/me",
                headers={"Authorization": f"Bearer {token}"},
            )
        assert resp.status_code == 200

    @pytest.mark.integration
    def test_me_returns_user_profile_fields(
        self, auth_client, mock_auth_settings, mock_db_user
    ):
        resp = auth_client.post("/api/auth/guest")
        token = resp.json()["token"]

        with patch("auth.dependencies.get_db_connection", return_value=mock_db_user):
            resp = auth_client.get(
                "/api/auth/me",
                headers={"Authorization": f"Bearer {token}"},
            )
        body = resp.json()
        assert "id" in body
        assert "email" in body
        assert "subscription_tier" in body
        assert "is_active" in body


# ---------------------------------------------------------------------------
# Protected endpoint without token -> 401/403
# ---------------------------------------------------------------------------

class TestProtectedWithoutToken:
    """Test GET /api/auth/me without a token returns 401/403."""

    @pytest.mark.integration
    def test_me_without_token_returns_401_or_403(self, auth_client):
        resp = auth_client.get("/api/auth/me")
        assert resp.status_code in (401, 403)

    @pytest.mark.integration
    def test_me_without_token_has_detail(self, auth_client):
        resp = auth_client.get("/api/auth/me")
        body = resp.json()
        assert "detail" in body


# ---------------------------------------------------------------------------
# Protected endpoint with invalid token -> 401/403
# ---------------------------------------------------------------------------

class TestProtectedWithInvalidToken:
    """Test GET /api/auth/me with invalid tokens."""

    @pytest.mark.integration
    def test_me_with_garbage_token(self, auth_client, mock_auth_settings):
        resp = auth_client.get(
            "/api/auth/me",
            headers={"Authorization": "Bearer totally-not-a-real-jwt-token"},
        )
        assert resp.status_code in (401, 403)

    @pytest.mark.integration
    def test_me_with_expired_token(self, auth_client, mock_auth_settings):
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
        resp = auth_client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {expired}"},
        )
        assert resp.status_code == 401

    @pytest.mark.integration
    def test_me_with_wrong_secret_token(self, auth_client, mock_auth_settings):
        wrong_secret_token = pyjwt.encode(
            {
                "sub": "user-1",
                "email": "u@t.com",
                "type": "access",
                "exp": datetime.now(timezone.utc) + timedelta(hours=1),
            },
            "completely-wrong-secret",
            algorithm="HS256",
        )
        resp = auth_client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {wrong_secret_token}"},
        )
        assert resp.status_code == 401

    @pytest.mark.integration
    def test_me_with_malformed_auth_header(self, auth_client):
        resp = auth_client.get(
            "/api/auth/me",
            headers={"Authorization": "NotBearer some-token"},
        )
        assert resp.status_code in (401, 403)


# ---------------------------------------------------------------------------
# Token refresh
# ---------------------------------------------------------------------------

class TestTokenRefresh:
    """Test POST /api/auth/refresh with guest tokens."""

    @pytest.mark.integration
    def test_refresh_guest_token(self, auth_client, mock_auth_settings):
        # Get guest tokens
        guest_resp = auth_client.post("/api/auth/guest")
        refresh_tok = guest_resp.json()["refresh_token"]

        # Refresh
        resp = auth_client.post(
            "/api/auth/refresh",
            json={"refresh_token": refresh_tok},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "access_token" in body
        assert "refresh_token" in body

    @pytest.mark.integration
    def test_refresh_with_invalid_token(self, auth_client, mock_auth_settings):
        resp = auth_client.post(
            "/api/auth/refresh",
            json={"refresh_token": "invalid-refresh-token"},
        )
        assert resp.status_code == 401

    @pytest.mark.integration
    def test_refresh_with_expired_token(self, auth_client, mock_auth_settings):
        expired_refresh = pyjwt.encode(
            {
                "sub": "guest-test",
                "email": "guest@local",
                "type": "refresh",
                "exp": datetime.now(timezone.utc) - timedelta(days=1),
            },
            mock_auth_settings.jwt_secret,
            algorithm=mock_auth_settings.jwt_algorithm,
        )
        resp = auth_client.post(
            "/api/auth/refresh",
            json={"refresh_token": expired_refresh},
        )
        assert resp.status_code == 401
