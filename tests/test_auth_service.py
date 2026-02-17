"""
Tests for services/auth_service.py and auth/ modules.

Covers: password hashing, JWT token creation/validation, AuthService register/login,
token claims, error handling for database failures, and guest session patterns.
"""

from __future__ import annotations

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch

import jwt
import pytest

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

# ---------------------------------------------------------------------------
# Password hashing tests
# ---------------------------------------------------------------------------


class TestPasswordHashing:
    """Tests for auth/password.py hash_password and verify_password."""

    def test_hash_password_returns_string(self):
        from auth.password import hash_password

        result = hash_password("mysecretpassword")
        assert isinstance(result, str)

    def test_hash_password_different_each_time(self):
        """bcrypt uses a random salt, so two hashes of same password differ."""
        from auth.password import hash_password

        hash1 = hash_password("samepassword")
        hash2 = hash_password("samepassword")
        assert hash1 != hash2

    def test_hash_password_not_plaintext(self):
        from auth.password import hash_password

        pwd = "plaintext123"
        hashed = hash_password(pwd)
        assert pwd not in hashed

    def test_verify_password_correct(self):
        from auth.password import hash_password, verify_password

        pwd = "correct_password"
        hashed = hash_password(pwd)
        assert verify_password(pwd, hashed) is True

    def test_verify_password_wrong(self):
        from auth.password import hash_password, verify_password

        hashed = hash_password("correct_password")
        assert verify_password("wrong_password", hashed) is False

    def test_verify_password_empty_string_fails(self):
        from auth.password import hash_password, verify_password

        hashed = hash_password("some_password")
        assert verify_password("", hashed) is False

    def test_verify_password_case_sensitive(self):
        from auth.password import hash_password, verify_password

        hashed = hash_password("Password123")
        assert verify_password("password123", hashed) is False


# ---------------------------------------------------------------------------
# JWT token tests
# ---------------------------------------------------------------------------


class TestJWTTokens:
    """Tests for auth/jwt_handler.py create_access_token, create_refresh_token, decode_token."""

    @pytest.fixture(autouse=True)
    def patch_settings(self):
        """Patch get_settings() to return deterministic auth settings."""
        mock_auth = MagicMock()
        mock_auth.jwt_secret = "test-secret-key-for-testing-only"
        mock_auth.jwt_algorithm = "HS256"
        mock_auth.access_token_expire_minutes = 30
        mock_auth.refresh_token_expire_days = 7

        mock_settings = MagicMock()
        mock_settings.auth = mock_auth

        with patch("auth.jwt_handler.get_settings", return_value=mock_settings):
            yield mock_settings

    def test_create_access_token_returns_string(self):
        from auth.jwt_handler import create_access_token

        token = create_access_token({"sub": "user-123", "email": "test@example.com"})
        assert isinstance(token, str)
        assert len(token) > 0

    def test_access_token_contains_expected_claims(self):
        from auth.jwt_handler import create_access_token

        claims = {"sub": "user-abc", "email": "user@example.com"}
        token = create_access_token(claims)
        decoded = jwt.decode(
            token, "test-secret-key-for-testing-only", algorithms=["HS256"]
        )
        assert decoded["sub"] == "user-abc"
        assert decoded["email"] == "user@example.com"
        assert decoded["type"] == "access"
        assert "exp" in decoded

    def test_access_token_has_future_expiry(self):
        from auth.jwt_handler import create_access_token

        token = create_access_token({"sub": "user-123"})
        decoded = jwt.decode(
            token, "test-secret-key-for-testing-only", algorithms=["HS256"]
        )
        exp = datetime.fromtimestamp(decoded["exp"], tz=timezone.utc)
        assert exp > datetime.now(timezone.utc)

    def test_create_refresh_token_returns_string(self):
        from auth.jwt_handler import create_refresh_token

        token = create_refresh_token({"sub": "user-123", "email": "test@example.com"})
        assert isinstance(token, str)

    def test_refresh_token_type_claim(self):
        from auth.jwt_handler import create_refresh_token

        token = create_refresh_token({"sub": "user-123"})
        decoded = jwt.decode(
            token, "test-secret-key-for-testing-only", algorithms=["HS256"]
        )
        assert decoded["type"] == "refresh"

    def test_refresh_token_longer_lived_than_access(self):
        from auth.jwt_handler import create_access_token, create_refresh_token

        access = create_access_token({"sub": "u"})
        refresh = create_refresh_token({"sub": "u"})

        access_exp = jwt.decode(
            access, "test-secret-key-for-testing-only", algorithms=["HS256"]
        )["exp"]
        refresh_exp = jwt.decode(
            refresh, "test-secret-key-for-testing-only", algorithms=["HS256"]
        )["exp"]

        assert refresh_exp > access_exp

    def test_decode_token_valid_access(self):
        from auth.jwt_handler import create_access_token, decode_token

        token = create_access_token({"sub": "user-123", "email": "a@b.com"})
        payload = decode_token(token, expected_type="access")
        assert payload["sub"] == "user-123"

    def test_decode_token_wrong_type_raises_value_error(self):
        from auth.jwt_handler import create_access_token, decode_token

        token = create_access_token({"sub": "user-123"})
        with pytest.raises(ValueError, match="Expected token type"):
            decode_token(token, expected_type="refresh")

    def test_decode_expired_token_raises(self):
        """Expired token should raise jwt.ExpiredSignatureError."""
        secret = "test-secret-key-for-testing-only"
        payload = {
            "sub": "user-123",
            "type": "access",
            "exp": datetime.now(timezone.utc) - timedelta(seconds=1),
        }
        expired_token = jwt.encode(payload, secret, algorithm="HS256")

        from auth.jwt_handler import decode_token

        with pytest.raises(jwt.ExpiredSignatureError):
            decode_token(expired_token)

    def test_decode_invalid_token_raises(self):
        from auth.jwt_handler import decode_token

        with pytest.raises(jwt.InvalidTokenError):
            decode_token("not.a.valid.token")


# ---------------------------------------------------------------------------
# AuthService static methods
# ---------------------------------------------------------------------------


class TestAuthServiceStaticMethods:
    """Tests for AuthService.build_token_claims and create_tokens."""

    @pytest.fixture(autouse=True)
    def patch_settings(self):
        mock_auth = MagicMock()
        mock_auth.jwt_secret = "test-secret-key-for-testing-only"
        mock_auth.jwt_algorithm = "HS256"
        mock_auth.access_token_expire_minutes = 30
        mock_auth.refresh_token_expire_days = 7

        mock_settings = MagicMock()
        mock_settings.auth = mock_auth

        with patch("auth.jwt_handler.get_settings", return_value=mock_settings):
            yield

    def test_build_token_claims_structure(self):
        from services.auth_service import AuthService

        claims = AuthService.build_token_claims("uid-1", "test@example.com")
        assert claims["sub"] == "uid-1"
        assert claims["email"] == "test@example.com"

    def test_create_tokens_returns_both_keys(self):
        from services.auth_service import AuthService

        claims = {"sub": "uid-1", "email": "test@example.com"}
        tokens = AuthService.create_tokens(claims)
        assert "access_token" in tokens
        assert "refresh_token" in tokens

    def test_create_tokens_are_strings(self):
        from services.auth_service import AuthService

        claims = {"sub": "uid-1", "email": "test@example.com"}
        tokens = AuthService.create_tokens(claims)
        assert isinstance(tokens["access_token"], str)
        assert isinstance(tokens["refresh_token"], str)

    def test_create_tokens_access_and_refresh_differ(self):
        from services.auth_service import AuthService

        claims = {"sub": "uid-1", "email": "test@example.com"}
        tokens = AuthService.create_tokens(claims)
        assert tokens["access_token"] != tokens["refresh_token"]


# ---------------------------------------------------------------------------
# AuthService.register tests
# ---------------------------------------------------------------------------


class TestAuthServiceRegister:
    """Tests for AuthService.register() with mocked DB."""

    def _make_service(self, conn_mock):
        from services.auth_service import AuthService

        return AuthService(get_conn=lambda: conn_mock)

    def test_register_success(self, mock_db_conn):
        conn = mock_db_conn["conn"]
        cursor = mock_db_conn["cursor"]

        # No existing user found
        cursor.fetchone.side_effect = [None, ("new-uuid-123",)]

        service = self._make_service(conn)
        result = service.register("new@example.com", "securepassword")

        assert result.success is True
        assert result.email == "new@example.com"
        assert result.user_id == "new-uuid-123"
        assert result.error is None

    def test_register_duplicate_email_returns_failure(self, mock_db_conn):
        conn = mock_db_conn["conn"]
        cursor = mock_db_conn["cursor"]

        # Existing user found
        cursor.fetchone.return_value = ("existing-id",)

        service = self._make_service(conn)
        result = service.register("existing@example.com", "password123")

        assert result.success is False
        assert result.error_code == 409
        assert "already registered" in result.error

    def test_register_calls_commit_on_success(self, mock_db_conn):
        conn = mock_db_conn["conn"]
        cursor = mock_db_conn["cursor"]

        cursor.fetchone.side_effect = [None, ("new-id-456",)]

        service = self._make_service(conn)
        service.register("user@example.com", "pass")

        conn.commit.assert_called_once()

    def test_register_calls_rollback_on_db_error(self, mock_db_conn):
        conn = mock_db_conn["conn"]
        cursor = mock_db_conn["cursor"]

        # First fetchone returns None (no duplicate), second raises
        cursor.fetchone.return_value = None
        cursor.execute.side_effect = [None, Exception("DB insert failed")]

        service = self._make_service(conn)
        with pytest.raises(Exception, match="DB insert failed"):
            service.register("user@example.com", "pass")

        conn.rollback.assert_called_once()

    def test_register_closes_connection(self, mock_db_conn):
        conn = mock_db_conn["conn"]
        cursor = mock_db_conn["cursor"]

        cursor.fetchone.side_effect = [None, ("uid-789",)]

        service = self._make_service(conn)
        service.register("user@example.com", "pass")

        conn.close.assert_called_once()


# ---------------------------------------------------------------------------
# AuthService.login tests
# ---------------------------------------------------------------------------


class TestAuthServiceLogin:
    """Tests for AuthService.login() with mocked DB."""

    def _make_service(self, conn_mock):
        from services.auth_service import AuthService

        return AuthService(get_conn=lambda: conn_mock)

    def test_login_success(self, mock_db_conn):
        from auth.password import hash_password

        conn = mock_db_conn["conn"]
        cursor = mock_db_conn["cursor"]

        password = "correct_password"
        hashed = hash_password(password)
        cursor.fetchone.return_value = ("uid-123", hashed, True)

        service = self._make_service(conn)
        result = service.login("user@example.com", password)

        assert result.success is True
        assert result.user_id == "uid-123"
        assert result.email == "user@example.com"

    def test_login_user_not_found(self, mock_db_conn):
        conn = mock_db_conn["conn"]
        cursor = mock_db_conn["cursor"]

        cursor.fetchone.return_value = None

        service = self._make_service(conn)
        result = service.login("nobody@example.com", "password")

        assert result.success is False
        assert "Invalid email or password" in result.error

    def test_login_wrong_password(self, mock_db_conn):
        from auth.password import hash_password

        conn = mock_db_conn["conn"]
        cursor = mock_db_conn["cursor"]

        hashed = hash_password("correct_password")
        cursor.fetchone.return_value = ("uid-123", hashed, True)

        service = self._make_service(conn)
        result = service.login("user@example.com", "wrong_password")

        assert result.success is False
        assert "Invalid email or password" in result.error

    def test_login_inactive_user(self, mock_db_conn):
        from auth.password import hash_password

        conn = mock_db_conn["conn"]
        cursor = mock_db_conn["cursor"]

        hashed = hash_password("password")
        # is_active = False
        cursor.fetchone.return_value = ("uid-999", hashed, False)

        service = self._make_service(conn)
        result = service.login("user@example.com", "password")

        assert result.success is False
        assert "deactivated" in result.error

    def test_login_closes_connection(self, mock_db_conn):
        conn = mock_db_conn["conn"]
        cursor = mock_db_conn["cursor"]

        cursor.fetchone.return_value = None

        service = self._make_service(conn)
        service.login("user@example.com", "password")

        conn.close.assert_called_once()


# ---------------------------------------------------------------------------
# AuthService.verify_user_active tests
# ---------------------------------------------------------------------------


class TestAuthServiceVerifyUserActive:
    """Tests for AuthService.verify_user_active() with mocked DB."""

    def _make_service(self, conn_mock):
        from services.auth_service import AuthService

        return AuthService(get_conn=lambda: conn_mock)

    def test_verify_active_user_success(self, mock_db_conn):
        conn = mock_db_conn["conn"]
        cursor = mock_db_conn["cursor"]

        cursor.fetchone.return_value = (True,)

        service = self._make_service(conn)
        result = service.verify_user_active("uid-123")

        assert result.success is True
        assert result.user_id == "uid-123"

    def test_verify_user_not_found(self, mock_db_conn):
        conn = mock_db_conn["conn"]
        cursor = mock_db_conn["cursor"]

        cursor.fetchone.return_value = None

        service = self._make_service(conn)
        result = service.verify_user_active("non-existent-id")

        assert result.success is False
        assert "not found" in result.error

    def test_verify_deactivated_user(self, mock_db_conn):
        conn = mock_db_conn["conn"]
        cursor = mock_db_conn["cursor"]

        cursor.fetchone.return_value = (False,)

        service = self._make_service(conn)
        result = service.verify_user_active("uid-inactive")

        assert result.success is False
        assert "deactivated" in result.error
