"""
Authentication Module Tests
============================
Tests for JWT handling, password hashing, auth models, and auth dependencies.

All tests run without a database or external services.
"""

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch

import jwt
import pytest

# Ensure project root is on sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


# ===========================================================================
# Password hashing tests
# ===========================================================================


class TestPasswordHashing:
    """Tests for auth.password module."""

    def test_hash_password_returns_string(self):
        from auth.password import hash_password

        result = hash_password("mysecretpassword")
        assert isinstance(result, str)

    def test_hash_password_not_plaintext(self):
        from auth.password import hash_password

        password = "mysecretpassword"
        hashed = hash_password(password)
        assert hashed != password

    def test_hash_password_unique_salts(self):
        from auth.password import hash_password

        h1 = hash_password("samepassword")
        h2 = hash_password("samepassword")
        assert h1 != h2, "Each hash should have a unique salt"

    def test_verify_password_correct(self):
        from auth.password import hash_password, verify_password

        password = "correcthorsebatterystaple"
        hashed = hash_password(password)
        assert verify_password(password, hashed) is True

    def test_verify_password_wrong(self):
        from auth.password import hash_password, verify_password

        hashed = hash_password("realpassword")
        assert verify_password("wrongpassword", hashed) is False

    def test_verify_password_empty_string(self):
        from auth.password import hash_password, verify_password

        hashed = hash_password("")
        assert verify_password("", hashed) is True
        assert verify_password("notempty", hashed) is False

    def test_hash_password_unicode(self):
        from auth.password import hash_password, verify_password

        password = "كلمة_سر_عربية"
        hashed = hash_password(password)
        assert verify_password(password, hashed) is True


# ===========================================================================
# JWT token tests
# ===========================================================================


class TestJWTTokenCreation:
    """Tests for auth.jwt_handler token creation and verification."""

    @pytest.fixture(autouse=True)
    def _mock_auth_settings(self, auth_settings):
        """Patch _get_auth_settings in jwt_handler for all tests in this class."""
        with patch("auth.jwt_handler._get_auth_settings", return_value=auth_settings):
            self.auth_settings = auth_settings
            yield

    def test_create_access_token_returns_string(self):
        from auth.jwt_handler import create_access_token

        token = create_access_token({"sub": "user-1", "email": "user@test.com"})
        assert isinstance(token, str)
        assert len(token) > 0

    def test_create_access_token_contains_claims(self):
        from auth.jwt_handler import create_access_token

        token = create_access_token({"sub": "user-1", "email": "user@test.com"})
        payload = jwt.decode(
            token,
            self.auth_settings.jwt_secret,
            algorithms=[self.auth_settings.jwt_algorithm],
        )
        assert payload["sub"] == "user-1"
        assert payload["email"] == "user@test.com"
        assert payload["type"] == "access"

    def test_create_access_token_has_expiration(self):
        from auth.jwt_handler import create_access_token

        token = create_access_token({"sub": "user-1"})
        payload = jwt.decode(
            token,
            self.auth_settings.jwt_secret,
            algorithms=[self.auth_settings.jwt_algorithm],
        )
        assert "exp" in payload

    def test_create_refresh_token_returns_string(self):
        from auth.jwt_handler import create_refresh_token

        token = create_refresh_token({"sub": "user-1"})
        assert isinstance(token, str)

    def test_create_refresh_token_type_is_refresh(self):
        from auth.jwt_handler import create_refresh_token

        token = create_refresh_token({"sub": "user-1"})
        payload = jwt.decode(
            token,
            self.auth_settings.jwt_secret,
            algorithms=[self.auth_settings.jwt_algorithm],
        )
        assert payload["type"] == "refresh"

    def test_access_and_refresh_tokens_differ(self):
        from auth.jwt_handler import create_access_token, create_refresh_token

        data = {"sub": "user-1"}
        access = create_access_token(data)
        refresh = create_refresh_token(data)
        assert access != refresh

    def test_decode_valid_access_token(self):
        from auth.jwt_handler import create_access_token, decode_token

        token = create_access_token({"sub": "user-1", "email": "a@b.com"})
        payload = decode_token(token, expected_type="access")
        assert payload["sub"] == "user-1"
        assert payload["type"] == "access"

    def test_decode_valid_refresh_token(self):
        from auth.jwt_handler import create_refresh_token, decode_token

        token = create_refresh_token({"sub": "user-1"})
        payload = decode_token(token, expected_type="refresh")
        assert payload["sub"] == "user-1"
        assert payload["type"] == "refresh"

    def test_decode_token_wrong_type_raises_value_error(self):
        from auth.jwt_handler import create_access_token, decode_token

        token = create_access_token({"sub": "user-1"})
        with pytest.raises(ValueError, match="Expected token type 'refresh'"):
            decode_token(token, expected_type="refresh")

    def test_decode_token_no_type_check(self):
        from auth.jwt_handler import create_access_token, decode_token

        token = create_access_token({"sub": "user-1"})
        payload = decode_token(token)  # no expected_type
        assert payload["sub"] == "user-1"

    def test_decode_expired_token_raises(self):
        from auth.jwt_handler import decode_token

        expired_payload = {
            "sub": "user-1",
            "type": "access",
            "exp": datetime.now(timezone.utc) - timedelta(hours=1),
        }
        expired_token = jwt.encode(
            expired_payload,
            self.auth_settings.jwt_secret,
            algorithm=self.auth_settings.jwt_algorithm,
        )
        with pytest.raises(jwt.ExpiredSignatureError):
            decode_token(expired_token)

    def test_decode_token_with_invalid_secret_raises(self):
        from auth.jwt_handler import decode_token

        payload = {
            "sub": "user-1",
            "type": "access",
            "exp": datetime.now(timezone.utc) + timedelta(hours=1),
        }
        token = jwt.encode(payload, "wrong-secret", algorithm="HS256")
        with pytest.raises(jwt.InvalidSignatureError):
            decode_token(token)

    def test_decode_malformed_token_raises(self):
        from auth.jwt_handler import decode_token

        with pytest.raises(jwt.DecodeError):
            decode_token("not.a.valid.token.at.all")

    def test_token_preserves_custom_claims(self):
        from auth.jwt_handler import create_access_token, decode_token

        token = create_access_token(
            {"sub": "user-1", "role": "admin", "tier": "enterprise"}
        )
        payload = decode_token(token)
        assert payload["role"] == "admin"
        assert payload["tier"] == "enterprise"


# ===========================================================================
# Auth models tests
# ===========================================================================


class TestAuthModels:
    """Tests for auth.models Pydantic models."""

    def test_user_create_valid(self):
        from auth.models import UserCreate

        user = UserCreate(email="test@example.com", password="securepass123")
        assert user.email == "test@example.com"
        assert user.password == "securepass123"
        assert user.display_name is None

    def test_user_create_with_display_name(self):
        from auth.models import UserCreate

        user = UserCreate(
            email="test@example.com",
            password="securepass123",
            display_name="Test User",
        )
        assert user.display_name == "Test User"

    def test_user_create_invalid_email(self):
        from auth.models import UserCreate

        with pytest.raises(Exception):  # ValidationError
            UserCreate(email="not-an-email", password="securepass123")

    def test_user_create_password_too_short(self):
        from auth.models import UserCreate

        with pytest.raises(Exception):  # ValidationError
            UserCreate(email="test@example.com", password="short")

    def test_user_create_password_too_long(self):
        from auth.models import UserCreate

        with pytest.raises(Exception):  # ValidationError
            UserCreate(email="test@example.com", password="x" * 129)

    def test_user_create_password_max_length(self):
        from auth.models import UserCreate

        user = UserCreate(email="test@example.com", password="x" * 128)
        assert len(user.password) == 128

    def test_user_login_valid(self):
        from auth.models import UserLogin

        login = UserLogin(email="test@example.com", password="anypass")
        assert login.email == "test@example.com"

    def test_token_response_default_type(self):
        from auth.models import TokenResponse

        resp = TokenResponse(access_token="abc", refresh_token="def")
        assert resp.token_type == "bearer"

    def test_token_refresh_request(self):
        from auth.models import TokenRefreshRequest

        req = TokenRefreshRequest(refresh_token="some-refresh-token")
        assert req.refresh_token == "some-refresh-token"

    def test_user_profile(self):
        from auth.models import UserProfile

        profile = UserProfile(
            id="user-1",
            email="test@example.com",
            subscription_tier="free",
            usage_count=42,
            is_active=True,
        )
        assert profile.id == "user-1"
        assert profile.usage_count == 42
        assert profile.display_name is None

    def test_user_profile_with_all_fields(self):
        from auth.models import UserProfile

        profile = UserProfile(
            id="user-1",
            email="test@example.com",
            display_name="Test User",
            subscription_tier="enterprise",
            usage_count=100,
            is_active=True,
            created_at=datetime(2024, 1, 1),
        )
        assert profile.display_name == "Test User"
        assert profile.created_at == datetime(2024, 1, 1)


# ===========================================================================
# Auth dependencies tests
# ===========================================================================


class TestAuthDependencies:
    """Tests for auth.dependencies (get_current_user, require_admin)."""

    @pytest.fixture(autouse=True)
    def _mock_auth_settings(self, auth_settings):
        with patch("auth.jwt_handler._get_auth_settings", return_value=auth_settings):
            self.auth_settings = auth_settings
            yield

    def _make_credentials(self, token):
        creds = MagicMock()
        creds.credentials = token
        return creds

    @pytest.mark.asyncio
    async def test_get_current_user_with_valid_token(self):
        from auth.jwt_handler import create_access_token
        from auth.dependencies import get_current_user

        token = create_access_token({"sub": "user-42", "email": "u@t.com"})
        creds = self._make_credentials(token)

        fake_row = (
            "user-42",
            "u@t.com",
            "Test User",
            "free",
            5,
            True,
            datetime.now(),
        )

        with patch("auth.dependencies._fetch_user_row", return_value=fake_row):
            user = await get_current_user(creds)

        assert user["id"] == "user-42"
        assert user["email"] == "u@t.com"
        assert user["is_active"] is True

    @pytest.mark.asyncio
    async def test_get_current_user_expired_token_raises_401(self):
        from auth.dependencies import get_current_user
        from fastapi import HTTPException

        expired_payload = {
            "sub": "user-1",
            "type": "access",
            "exp": datetime.now(timezone.utc) - timedelta(hours=1),
        }
        expired_token = jwt.encode(
            expired_payload,
            self.auth_settings.jwt_secret,
            algorithm=self.auth_settings.jwt_algorithm,
        )
        creds = self._make_credentials(expired_token)

        with pytest.raises(HTTPException) as exc_info:
            await get_current_user(creds)
        assert exc_info.value.status_code == 401
        assert "expired" in exc_info.value.detail.lower()

    @pytest.mark.asyncio
    async def test_get_current_user_invalid_token_raises_401(self):
        from auth.dependencies import get_current_user
        from fastapi import HTTPException

        creds = self._make_credentials("totally-invalid-token")
        with pytest.raises(HTTPException) as exc_info:
            await get_current_user(creds)
        assert exc_info.value.status_code == 401

    @pytest.mark.asyncio
    async def test_get_current_user_missing_sub_raises_401(self):
        from auth.dependencies import get_current_user
        from fastapi import HTTPException

        # Token without "sub" claim
        payload = {
            "type": "access",
            "exp": datetime.now(timezone.utc) + timedelta(hours=1),
        }
        token = jwt.encode(
            payload,
            self.auth_settings.jwt_secret,
            algorithm=self.auth_settings.jwt_algorithm,
        )
        creds = self._make_credentials(token)
        with pytest.raises(HTTPException) as exc_info:
            await get_current_user(creds)
        assert exc_info.value.status_code == 401
        assert "claims" in exc_info.value.detail.lower()

    @pytest.mark.asyncio
    async def test_get_current_user_deactivated_account_raises_401(self):
        from auth.jwt_handler import create_access_token
        from auth.dependencies import get_current_user
        from fastapi import HTTPException

        token = create_access_token({"sub": "user-99"})
        creds = self._make_credentials(token)

        fake_row = (
            "user-99",
            "user@t.com",
            None,
            "free",
            0,
            False,
            None,
        )

        with patch("auth.dependencies._fetch_user_row", return_value=fake_row):
            with pytest.raises(HTTPException) as exc_info:
                await get_current_user(creds)
        assert exc_info.value.status_code == 401
        assert "deactivated" in exc_info.value.detail.lower()

    @pytest.mark.asyncio
    async def test_get_current_user_not_found_raises_401(self):
        from auth.jwt_handler import create_access_token
        from auth.dependencies import get_current_user
        from fastapi import HTTPException

        token = create_access_token({"sub": "nonexistent"})
        creds = self._make_credentials(token)

        with patch("auth.dependencies._fetch_user_row", return_value=None):
            with pytest.raises(HTTPException) as exc_info:
                await get_current_user(creds)
        assert exc_info.value.status_code == 401

    def test_require_admin_with_enterprise_user(self):
        from auth.dependencies import require_admin

        user = {"subscription_tier": "enterprise", "id": "admin-1"}
        result = require_admin(user)
        assert result == user

    def test_require_admin_with_free_user_raises_403(self):
        from auth.dependencies import require_admin
        from fastapi import HTTPException

        user = {"subscription_tier": "free", "id": "user-1"}
        with pytest.raises(HTTPException) as exc_info:
            require_admin(user)
        assert exc_info.value.status_code == 403
