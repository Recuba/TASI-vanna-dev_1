"""
Tests for database/postgres_utils.py
======================================
Covers pg_available() and pg_connection_params() with mocked env vars
and mocked psycopg2 connections. No real PostgreSQL required.
"""

import sys
from pathlib import Path
from unittest.mock import MagicMock, patch


PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from database.postgres_utils import pg_available, pg_connection_params  # noqa: E402


# ===========================================================================
# pg_available tests
# ===========================================================================


class TestPgAvailable:
    """Tests for pg_available().

    psycopg2 is imported locally inside pg_available(), so we patch it
    via sys.modules to intercept the local import.
    """

    def test_returns_false_when_no_postgres_host(self, monkeypatch):
        """Without POSTGRES_HOST, pg_available returns False immediately."""
        monkeypatch.delenv("POSTGRES_HOST", raising=False)
        assert pg_available() is False

    def test_returns_true_when_connection_succeeds(self, monkeypatch):
        """When psycopg2.connect succeeds, pg_available returns True."""
        monkeypatch.setenv("POSTGRES_HOST", "testhost")
        monkeypatch.setenv("POSTGRES_PORT", "5432")
        monkeypatch.setenv("POSTGRES_DB", "testdb")
        monkeypatch.setenv("POSTGRES_USER", "testuser")
        monkeypatch.setenv("POSTGRES_PASSWORD", "testpass")

        mock_conn = MagicMock()
        mock_psycopg2 = MagicMock()
        mock_psycopg2.connect.return_value = mock_conn

        with patch.dict("sys.modules", {"psycopg2": mock_psycopg2}):
            result = pg_available(timeout=1)

        assert result is True
        mock_conn.close.assert_called_once()

    def test_returns_false_when_connection_fails(self, monkeypatch):
        """When psycopg2.connect raises, pg_available returns False."""
        monkeypatch.setenv("POSTGRES_HOST", "badhost")

        mock_psycopg2 = MagicMock()
        mock_psycopg2.connect.side_effect = Exception("Connection refused")

        with patch.dict("sys.modules", {"psycopg2": mock_psycopg2}):
            result = pg_available(timeout=1)

        assert result is False

    def test_passes_timeout_to_connect(self, monkeypatch):
        """Verify connect_timeout is forwarded to psycopg2.connect."""
        monkeypatch.setenv("POSTGRES_HOST", "testhost")

        mock_conn = MagicMock()
        mock_psycopg2 = MagicMock()
        mock_psycopg2.connect.return_value = mock_conn

        with patch.dict("sys.modules", {"psycopg2": mock_psycopg2}):
            pg_available(timeout=7)

        call_kwargs = mock_psycopg2.connect.call_args[1]
        assert call_kwargs["connect_timeout"] == 7

    def test_uses_env_var_values(self, monkeypatch):
        """Verify all env vars are passed to psycopg2.connect."""
        monkeypatch.setenv("POSTGRES_HOST", "myhost")
        monkeypatch.setenv("POSTGRES_PORT", "5433")
        monkeypatch.setenv("POSTGRES_DB", "mydb")
        monkeypatch.setenv("POSTGRES_USER", "myuser")
        monkeypatch.setenv("POSTGRES_PASSWORD", "mypass")

        mock_conn = MagicMock()
        mock_psycopg2 = MagicMock()
        mock_psycopg2.connect.return_value = mock_conn

        with patch.dict("sys.modules", {"psycopg2": mock_psycopg2}):
            pg_available()

        call_kwargs = mock_psycopg2.connect.call_args[1]
        assert call_kwargs["host"] == "myhost"
        assert call_kwargs["port"] == 5433
        assert call_kwargs["dbname"] == "mydb"
        assert call_kwargs["user"] == "myuser"
        assert call_kwargs["password"] == "mypass"

    def test_default_values_when_env_vars_missing(self, monkeypatch):
        """Defaults are used for optional env vars."""
        monkeypatch.setenv("POSTGRES_HOST", "somehost")
        monkeypatch.delenv("POSTGRES_PORT", raising=False)
        monkeypatch.delenv("POSTGRES_DB", raising=False)
        monkeypatch.delenv("POSTGRES_USER", raising=False)
        monkeypatch.delenv("POSTGRES_PASSWORD", raising=False)

        mock_conn = MagicMock()
        mock_psycopg2 = MagicMock()
        mock_psycopg2.connect.return_value = mock_conn

        with patch.dict("sys.modules", {"psycopg2": mock_psycopg2}):
            pg_available()

        call_kwargs = mock_psycopg2.connect.call_args[1]
        assert call_kwargs["port"] == 5432
        assert call_kwargs["dbname"] == "tasi_platform"
        assert call_kwargs["user"] == "tasi_user"
        assert call_kwargs["password"] == ""


# ===========================================================================
# pg_connection_params tests
# ===========================================================================


class TestPgConnectionParams:
    """Tests for pg_connection_params()."""

    def test_returns_dict_with_correct_keys(self, monkeypatch):
        monkeypatch.setenv("POSTGRES_HOST", "h")
        monkeypatch.setenv("POSTGRES_PORT", "5432")
        monkeypatch.setenv("POSTGRES_DB", "d")
        monkeypatch.setenv("POSTGRES_USER", "u")
        monkeypatch.setenv("POSTGRES_PASSWORD", "p")

        params = pg_connection_params()
        assert set(params.keys()) == {"host", "port", "dbname", "user", "password"}

    def test_reads_env_vars(self, monkeypatch):
        monkeypatch.setenv("POSTGRES_HOST", "prodhost")
        monkeypatch.setenv("POSTGRES_PORT", "5433")
        monkeypatch.setenv("POSTGRES_DB", "proddb")
        monkeypatch.setenv("POSTGRES_USER", "produser")
        monkeypatch.setenv("POSTGRES_PASSWORD", "prodpass")

        params = pg_connection_params()
        assert params["host"] == "prodhost"
        assert params["port"] == 5433
        assert params["dbname"] == "proddb"
        assert params["user"] == "produser"
        assert params["password"] == "prodpass"

    def test_defaults_when_env_vars_unset(self, monkeypatch):
        monkeypatch.delenv("POSTGRES_HOST", raising=False)
        monkeypatch.delenv("POSTGRES_PORT", raising=False)
        monkeypatch.delenv("POSTGRES_DB", raising=False)
        monkeypatch.delenv("POSTGRES_USER", raising=False)
        monkeypatch.delenv("POSTGRES_PASSWORD", raising=False)

        params = pg_connection_params()
        assert params["host"] == "localhost"
        assert params["port"] == 5432
        assert params["dbname"] == "tasi_platform"
        assert params["user"] == "tasi_user"
        assert params["password"] == ""

    def test_invalid_port_defaults_to_5432(self, monkeypatch):
        """Non-numeric POSTGRES_PORT falls back to 5432."""
        monkeypatch.setenv("POSTGRES_PORT", "not_a_number")

        params = pg_connection_params()
        assert params["port"] == 5432

    def test_empty_port_defaults_to_5432(self, monkeypatch):
        """Empty POSTGRES_PORT string falls back to 5432."""
        monkeypatch.setenv("POSTGRES_PORT", "")

        params = pg_connection_params()
        assert params["port"] == 5432

    def test_does_not_include_connect_timeout(self, monkeypatch):
        """The returned dict should NOT include connect_timeout."""
        monkeypatch.setenv("POSTGRES_HOST", "h")
        params = pg_connection_params()
        assert "connect_timeout" not in params

    def test_port_as_int(self, monkeypatch):
        """Port is always an integer, even when env var is a string."""
        monkeypatch.setenv("POSTGRES_PORT", "9999")
        params = pg_connection_params()
        assert isinstance(params["port"], int)
        assert params["port"] == 9999
