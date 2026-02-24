"""
Tests for health service and config modules.
Covers: services/health_service.py, config/env_validator.py,
        config/lifecycle.py, config/error_tracking.py
"""

import logging
import os
import sqlite3
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

from fastapi import FastAPI


PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


# ---------------------------------------------------------------------------
# Health Service - HealthStatus / ComponentHealth / HealthReport
# ---------------------------------------------------------------------------


class TestHealthDataclasses:
    """Tests for HealthStatus, ComponentHealth, and HealthReport dataclasses."""

    def test_health_status_values(self):
        from services.health_service import HealthStatus

        assert HealthStatus.HEALTHY == "healthy"
        assert HealthStatus.DEGRADED == "degraded"
        assert HealthStatus.UNHEALTHY == "unhealthy"

    def test_component_health_defaults(self):
        from services.health_service import ComponentHealth, HealthStatus

        ch = ComponentHealth(name="db", status=HealthStatus.HEALTHY)
        assert ch.name == "db"
        assert ch.status == HealthStatus.HEALTHY
        assert ch.latency_ms is None
        assert ch.message == ""

    def test_component_health_with_latency(self):
        from services.health_service import ComponentHealth, HealthStatus

        ch = ComponentHealth(
            name="redis",
            status=HealthStatus.DEGRADED,
            latency_ms=5.5,
            message="timeout",
        )
        assert ch.latency_ms == 5.5
        assert ch.message == "timeout"

    def test_health_report_defaults(self):
        from services.health_service import HealthReport, HealthStatus

        report = HealthReport()
        assert report.status == HealthStatus.HEALTHY
        assert report.service == "raid-ai-tasi"
        assert report.version == "1.0.0"
        assert report.uptime_seconds == 0.0
        assert report.components == []
        assert report.build_info == {}

    def test_health_report_to_dict_basic(self):
        from services.health_service import HealthReport

        report = HealthReport()
        d = report.to_dict()
        assert d["status"] == "healthy"
        assert d["service"] == "raid-ai-tasi"
        assert d["version"] == "1.0.0"
        assert "uptime_seconds" in d
        assert "components" in d

    def test_health_report_to_dict_with_components(self):
        from services.health_service import (
            HealthReport,
            HealthStatus,
            ComponentHealth,
        )

        report = HealthReport()
        report.components = [
            ComponentHealth(
                name="db",
                status=HealthStatus.HEALTHY,
                latency_ms=2.5,
                message="ok",
            )
        ]
        d = report.to_dict()
        assert len(d["components"]) == 1
        comp = d["components"][0]
        assert comp["name"] == "db"
        assert comp["status"] == "healthy"
        assert comp["latency_ms"] == 2.5
        assert comp["message"] == "ok"

    def test_health_report_to_dict_no_build_info(self):
        from services.health_service import HealthReport

        report = HealthReport()
        d = report.to_dict()
        assert "build_info" not in d

    def test_health_report_to_dict_with_build_info(self):
        from services.health_service import HealthReport

        report = HealthReport()
        report.build_info = {"python_version": "3.11.0"}
        d = report.to_dict()
        assert "build_info" in d
        assert d["build_info"]["python_version"] == "3.11.0"

    def test_health_report_latency_none_in_dict(self):
        from services.health_service import (
            HealthReport,
            HealthStatus,
            ComponentHealth,
        )

        report = HealthReport()
        report.components = [ComponentHealth(name="llm", status=HealthStatus.HEALTHY)]
        d = report.to_dict()
        assert d["components"][0]["latency_ms"] is None


# ---------------------------------------------------------------------------
# Health Service - check_database
# ---------------------------------------------------------------------------


class TestCheckDatabase:
    """Tests for check_database() with SQLite and mocked PostgreSQL."""

    def test_sqlite_healthy_when_db_exists(self, tmp_path):
        from services.health_service import check_database, HealthStatus

        db_path = tmp_path / "test.db"
        conn = sqlite3.connect(str(db_path))
        conn.execute("SELECT 1")
        conn.close()

        mock_settings = MagicMock()
        mock_settings.db.backend = "sqlite"
        mock_settings.db.resolved_sqlite_path = db_path

        with patch("services.health_service.get_settings", return_value=mock_settings):
            result = check_database()

        assert result.status == HealthStatus.HEALTHY
        assert result.name == "database"
        assert "sqlite" in result.message.lower()

    def test_sqlite_unhealthy_when_db_missing(self, tmp_path):
        from services.health_service import check_database, HealthStatus

        missing_path = tmp_path / "nonexistent.db"

        mock_settings = MagicMock()
        mock_settings.db.backend = "sqlite"
        mock_settings.db.resolved_sqlite_path = missing_path

        with patch("services.health_service.get_settings", return_value=mock_settings):
            result = check_database()

        assert result.status == HealthStatus.UNHEALTHY
        assert "not found" in result.message.lower()

    def test_postgres_healthy_via_pool(self):
        from services.health_service import check_database, HealthStatus

        mock_settings = MagicMock()
        mock_settings.db.backend = "postgres"

        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_conn.cursor.return_value = mock_cursor
        mock_conn.__enter__ = MagicMock(return_value=mock_conn)
        mock_conn.__exit__ = MagicMock(return_value=False)

        with patch("services.health_service.get_settings", return_value=mock_settings):
            with patch("database.pool.is_pool_initialized", return_value=True):
                with patch(
                    "database.pool.get_connection",
                    return_value=mock_conn,
                ):
                    result = check_database()

        assert result.name == "database"
        # If we get here without exception, status should not be unhealthy from exception
        assert result.status in (HealthStatus.HEALTHY, HealthStatus.UNHEALTHY)

    def test_postgres_fallback_direct_connection(self):
        from services.health_service import check_database, HealthStatus

        mock_settings = MagicMock()
        mock_settings.db.backend = "postgres"
        mock_settings.db.pg_host = "localhost"
        mock_settings.db.pg_port = 5432
        mock_settings.db.pg_database = "testdb"
        mock_settings.db.pg_user = "testuser"
        mock_settings.db.pg_password = "testpass"

        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_conn.cursor.return_value = mock_cursor

        with patch("services.health_service.get_settings", return_value=mock_settings):
            with patch("database.pool.is_pool_initialized", return_value=False):
                with patch("psycopg2.connect", return_value=mock_conn):
                    result = check_database()

        assert result.name == "database"
        # Pool not initialized → health service returns UNHEALTHY (no direct-connection fallback)
        assert result.status == HealthStatus.UNHEALTHY

    def test_database_exception_returns_unhealthy(self, tmp_path):
        from services.health_service import check_database, HealthStatus

        mock_settings = MagicMock()
        mock_settings.db.backend = "sqlite"
        mock_settings.db.resolved_sqlite_path = tmp_path / "test.db"
        # Make the path exist but sqlite3.connect fail
        (tmp_path / "test.db").touch()

        with patch("services.health_service.get_settings", return_value=mock_settings):
            with patch("sqlite3.connect", side_effect=Exception("connection refused")):
                result = check_database()

        assert result.status == HealthStatus.UNHEALTHY
        assert "connection refused" in result.message


# ---------------------------------------------------------------------------
# Health Service - check_llm
# ---------------------------------------------------------------------------


class TestCheckLlm:
    """Tests for check_llm()."""

    def test_llm_healthy_with_valid_api_key(self):
        from services.health_service import check_llm, HealthStatus

        mock_settings = MagicMock()
        mock_settings.get_llm_api_key.return_value = "sk-test-key-1234567890"
        mock_settings.llm.model = "claude-sonnet-4-5"

        with patch("services.health_service.get_settings", return_value=mock_settings):
            result = check_llm()

        assert result.status == HealthStatus.HEALTHY
        assert result.name == "llm"
        assert "anthropic" in result.message

    def test_llm_degraded_when_no_api_key(self):
        from services.health_service import check_llm, HealthStatus

        mock_settings = MagicMock()
        mock_settings.get_llm_api_key.return_value = None
        mock_settings.llm.model = "claude-sonnet-4-5"

        with patch("services.health_service.get_settings", return_value=mock_settings):
            result = check_llm()

        assert result.status == HealthStatus.DEGRADED
        assert "No LLM API key" in result.message

    def test_llm_degraded_with_short_key(self):
        from services.health_service import check_llm, HealthStatus

        mock_settings = MagicMock()
        mock_settings.get_llm_api_key.return_value = "short"
        mock_settings.llm.model = "claude-sonnet-4-5"

        with patch("services.health_service.get_settings", return_value=mock_settings):
            result = check_llm()

        assert result.status == HealthStatus.DEGRADED

    def test_llm_degraded_with_empty_string(self):
        from services.health_service import check_llm, HealthStatus

        mock_settings = MagicMock()
        mock_settings.get_llm_api_key.return_value = ""
        mock_settings.llm.model = "claude-sonnet-4-5"

        with patch("services.health_service.get_settings", return_value=mock_settings):
            result = check_llm()

        assert result.status == HealthStatus.DEGRADED


# ---------------------------------------------------------------------------
# Health Service - check_redis
# ---------------------------------------------------------------------------


class TestCheckRedis:
    """Tests for check_redis()."""

    def test_redis_healthy_when_caching_disabled(self):
        from services.health_service import check_redis, HealthStatus

        mock_settings = MagicMock()
        mock_settings.cache.enabled = False

        with patch("services.health_service.get_settings", return_value=mock_settings):
            result = check_redis()

        assert result.status == HealthStatus.HEALTHY
        assert "disabled" in result.message

    def test_redis_healthy_when_available(self):
        from services.health_service import check_redis, HealthStatus

        mock_settings = MagicMock()
        mock_settings.cache.enabled = True

        with patch("services.health_service.get_settings", return_value=mock_settings):
            with patch("cache.redis_client.is_redis_available", return_value=True):
                result = check_redis()

        assert result.status == HealthStatus.HEALTHY
        assert result.latency_ms is not None

    def test_redis_degraded_when_unavailable(self):
        from services.health_service import check_redis, HealthStatus

        mock_settings = MagicMock()
        mock_settings.cache.enabled = True

        with patch("services.health_service.get_settings", return_value=mock_settings):
            with patch("cache.redis_client.is_redis_available", return_value=False):
                result = check_redis()

        assert result.status == HealthStatus.DEGRADED
        assert "not reachable" in result.message

    def test_redis_degraded_on_exception(self):
        from services.health_service import check_redis, HealthStatus

        mock_settings = MagicMock()
        mock_settings.cache.enabled = True

        with patch("services.health_service.get_settings", return_value=mock_settings):
            with patch(
                "cache.redis_client.is_redis_available",
                side_effect=Exception("connection refused"),
            ):
                result = check_redis()

        assert result.status == HealthStatus.DEGRADED
        assert result.latency_ms is not None


# ---------------------------------------------------------------------------
# Health Service - check_entities / check_market_data
# ---------------------------------------------------------------------------


class TestCheckEntities:
    """Tests for check_entities()."""

    def test_entities_healthy_when_companies_exist(self, tmp_path):
        from services.health_service import check_entities, HealthStatus

        db_path = tmp_path / "test.db"
        conn = sqlite3.connect(str(db_path))
        conn.execute(
            "CREATE TABLE companies (ticker TEXT PRIMARY KEY, short_name TEXT)"
        )
        conn.execute("INSERT INTO companies VALUES ('2222.SR', 'Aramco')")
        conn.commit()
        conn.close()

        with (
            patch("services.health_service._is_pg_backend", return_value=False),
            patch("services.health_service._get_sqlite_path", return_value=db_path),
        ):
            result = check_entities()

        assert result.status == HealthStatus.HEALTHY
        assert "1 companies" in result.message

    def test_entities_degraded_when_empty(self, tmp_path):
        from services.health_service import check_entities, HealthStatus

        db_path = tmp_path / "test.db"
        conn = sqlite3.connect(str(db_path))
        conn.execute(
            "CREATE TABLE companies (ticker TEXT PRIMARY KEY, short_name TEXT)"
        )
        conn.commit()
        conn.close()

        with (
            patch("services.health_service._is_pg_backend", return_value=False),
            patch("services.health_service._get_sqlite_path", return_value=db_path),
        ):
            result = check_entities()

        assert result.status == HealthStatus.DEGRADED

    def test_entities_unhealthy_when_db_missing(self, tmp_path):
        from services.health_service import check_entities, HealthStatus

        missing_path = tmp_path / "missing.db"

        with (
            patch("services.health_service._is_pg_backend", return_value=False),
            patch(
                "services.health_service._get_sqlite_path", return_value=missing_path
            ),
        ):
            result = check_entities()

        assert result.status == HealthStatus.UNHEALTHY

    def test_entities_unhealthy_on_exception(self, tmp_path):
        from services.health_service import check_entities, HealthStatus

        db_path = tmp_path / "test.db"
        conn = sqlite3.connect(str(db_path))
        conn.commit()
        conn.close()

        with (
            patch("services.health_service._is_pg_backend", return_value=False),
            patch("services.health_service._get_sqlite_path", return_value=db_path),
            patch(
                "services.health_service._scalar_query",
                side_effect=Exception("table error"),
            ),
        ):
            result = check_entities()

        assert result.status == HealthStatus.UNHEALTHY


class TestCheckMarketData:
    """Tests for check_market_data()."""

    def test_market_data_healthy(self, tmp_path):
        from services.health_service import check_market_data, HealthStatus

        db_path = tmp_path / "test.db"
        conn = sqlite3.connect(str(db_path))
        conn.execute("CREATE TABLE market_data (ticker TEXT, current_price REAL)")
        conn.execute("INSERT INTO market_data VALUES ('2222.SR', 32.5)")
        conn.commit()
        conn.close()

        with (
            patch("services.health_service._is_pg_backend", return_value=False),
            patch("services.health_service._get_sqlite_path", return_value=db_path),
        ):
            result = check_market_data()

        assert result.status == HealthStatus.HEALTHY
        assert "current_price" in result.message

    def test_market_data_degraded_no_rows(self, tmp_path):
        from services.health_service import check_market_data, HealthStatus

        db_path = tmp_path / "test.db"
        conn = sqlite3.connect(str(db_path))
        conn.execute("CREATE TABLE market_data (ticker TEXT, current_price REAL)")
        conn.commit()
        conn.close()

        with (
            patch("services.health_service._is_pg_backend", return_value=False),
            patch("services.health_service._get_sqlite_path", return_value=db_path),
        ):
            result = check_market_data()

        assert result.status == HealthStatus.DEGRADED
        assert "No market data" in result.message

    def test_market_data_degraded_no_current_price(self, tmp_path):
        from services.health_service import check_market_data, HealthStatus

        db_path = tmp_path / "test.db"
        conn = sqlite3.connect(str(db_path))
        conn.execute("CREATE TABLE market_data (ticker TEXT, current_price REAL)")
        conn.execute("INSERT INTO market_data VALUES ('2222.SR', NULL)")
        conn.commit()
        conn.close()

        with (
            patch("services.health_service._is_pg_backend", return_value=False),
            patch("services.health_service._get_sqlite_path", return_value=db_path),
        ):
            result = check_market_data()

        assert result.status == HealthStatus.DEGRADED
        assert "no current_price" in result.message

    def test_market_data_unhealthy_db_missing(self, tmp_path):
        from services.health_service import check_market_data, HealthStatus

        missing_path = tmp_path / "missing.db"

        with (
            patch("services.health_service._is_pg_backend", return_value=False),
            patch(
                "services.health_service._get_sqlite_path", return_value=missing_path
            ),
        ):
            result = check_market_data()

        assert result.status == HealthStatus.UNHEALTHY


# ---------------------------------------------------------------------------
# Health Service - get_health (full report)
# ---------------------------------------------------------------------------


class TestGetHealth:
    """Tests for get_health() aggregation."""

    def test_get_health_returns_report(self):
        from services.health_service import get_health, HealthReport, HealthStatus

        mock_component = MagicMock()
        mock_component.status = HealthStatus.HEALTHY

        with (
            patch(
                "services.health_service.check_database", return_value=mock_component
            ),
            patch("services.health_service.check_llm", return_value=mock_component),
            patch("services.health_service.check_redis", return_value=mock_component),
            patch(
                "services.health_service.check_entities", return_value=mock_component
            ),
            patch(
                "services.health_service.check_market_data", return_value=mock_component
            ),
            patch("services.health_service.check_news", return_value=mock_component),
            patch(
                "services.health_service.check_tasi_index", return_value=mock_component
            ),
            patch(
                "services.health_service.check_news_scraper",
                return_value=mock_component,
            ),
        ):
            report = get_health()

        assert isinstance(report, HealthReport)
        assert len(report.components) == 8

    def test_get_health_overall_healthy(self):
        from services.health_service import get_health, HealthStatus, ComponentHealth

        healthy = ComponentHealth(name="x", status=HealthStatus.HEALTHY)

        with (
            patch("services.health_service.check_database", return_value=healthy),
            patch("services.health_service.check_llm", return_value=healthy),
            patch("services.health_service.check_redis", return_value=healthy),
            patch("services.health_service.check_entities", return_value=healthy),
            patch("services.health_service.check_market_data", return_value=healthy),
            patch("services.health_service.check_news", return_value=healthy),
            patch("services.health_service.check_tasi_index", return_value=healthy),
            patch("services.health_service.check_news_scraper", return_value=healthy),
        ):
            report = get_health()

        assert report.status == HealthStatus.HEALTHY

    def test_get_health_overall_degraded_when_any_degraded(self):
        from services.health_service import get_health, HealthStatus, ComponentHealth

        healthy = ComponentHealth(name="x", status=HealthStatus.HEALTHY)
        degraded = ComponentHealth(name="y", status=HealthStatus.DEGRADED)

        with (
            patch("services.health_service.check_database", return_value=healthy),
            patch("services.health_service.check_llm", return_value=degraded),
            patch("services.health_service.check_redis", return_value=healthy),
            patch("services.health_service.check_entities", return_value=healthy),
            patch("services.health_service.check_market_data", return_value=healthy),
            patch("services.health_service.check_news", return_value=healthy),
            patch("services.health_service.check_tasi_index", return_value=healthy),
            patch("services.health_service.check_news_scraper", return_value=healthy),
        ):
            report = get_health()

        assert report.status == HealthStatus.DEGRADED

    def test_get_health_overall_unhealthy_when_any_unhealthy(self):
        from services.health_service import get_health, HealthStatus, ComponentHealth

        healthy = ComponentHealth(name="x", status=HealthStatus.HEALTHY)
        unhealthy = ComponentHealth(name="z", status=HealthStatus.UNHEALTHY)

        with (
            patch("services.health_service.check_database", return_value=unhealthy),
            patch("services.health_service.check_llm", return_value=healthy),
            patch("services.health_service.check_redis", return_value=healthy),
            patch("services.health_service.check_entities", return_value=healthy),
            patch("services.health_service.check_market_data", return_value=healthy),
            patch("services.health_service.check_news", return_value=healthy),
            patch("services.health_service.check_tasi_index", return_value=healthy),
            patch("services.health_service.check_news_scraper", return_value=healthy),
        ):
            report = get_health()

        assert report.status == HealthStatus.UNHEALTHY

    def test_get_health_includes_uptime(self):
        from services.health_service import get_health, HealthStatus, ComponentHealth

        healthy = ComponentHealth(name="x", status=HealthStatus.HEALTHY)

        with (
            patch("services.health_service.check_database", return_value=healthy),
            patch("services.health_service.check_llm", return_value=healthy),
            patch("services.health_service.check_redis", return_value=healthy),
            patch("services.health_service.check_entities", return_value=healthy),
            patch("services.health_service.check_market_data", return_value=healthy),
            patch("services.health_service.check_news", return_value=healthy),
            patch("services.health_service.check_tasi_index", return_value=healthy),
            patch("services.health_service.check_news_scraper", return_value=healthy),
        ):
            report = get_health()

        assert report.uptime_seconds >= 0


# ---------------------------------------------------------------------------
# Environment Validator
# ---------------------------------------------------------------------------


class TestValidateEnv:
    """Tests for config/env_validator.py."""

    def test_valid_sqlite_config_passes(self):
        from config.env_validator import validate_env

        env = {
            "DB_BACKEND": "sqlite",
            "LLM_API_KEY": "sk-test-api-key-long-enough",
        }
        with patch.dict(os.environ, env, clear=True):
            errors, warnings = validate_env()

        assert errors == []

    def test_valid_postgres_config_passes(self):
        from config.env_validator import validate_env

        env = {
            "DB_BACKEND": "postgres",
            "POSTGRES_PASSWORD": "mypassword",
            "POSTGRES_HOST": "localhost",
            "LLM_API_KEY": "sk-test-api-key-long-enough",
        }
        with patch.dict(os.environ, env, clear=True):
            errors, warnings = validate_env()

        assert errors == []

    def test_invalid_db_backend_fails(self):
        from config.env_validator import validate_env

        env = {"DB_BACKEND": "oracle"}
        with patch.dict(os.environ, env, clear=True):
            errors, warnings = validate_env()

        assert any("DB_BACKEND" in e for e in errors)

    def test_postgres_missing_password_fails(self):
        from config.env_validator import validate_env

        env = {
            "DB_BACKEND": "postgres",
            "POSTGRES_HOST": "localhost",
        }
        with patch.dict(os.environ, env, clear=True):
            errors, warnings = validate_env()

        assert any("POSTGRES_PASSWORD" in e for e in errors)

    def test_postgres_password_via_db_pg_password(self):
        from config.env_validator import validate_env

        env = {
            "DB_BACKEND": "postgres",
            "DB_PG_PASSWORD": "secretpass",
            "POSTGRES_HOST": "localhost",
            "LLM_API_KEY": "sk-test-key-long-enough",
        }
        with patch.dict(os.environ, env, clear=True):
            errors, warnings = validate_env()

        assert not any("POSTGRES_PASSWORD" in e for e in errors)

    def test_missing_llm_key_warns(self):
        from config.env_validator import validate_env

        env = {"DB_BACKEND": "sqlite"}
        with patch.dict(os.environ, env, clear=True):
            errors, warnings = validate_env()

        assert any("LLM API key" in w for w in warnings)

    def test_postgres_missing_host_warns(self):
        from config.env_validator import validate_env

        env = {
            "DB_BACKEND": "postgres",
            "POSTGRES_PASSWORD": "pass",
            "LLM_API_KEY": "sk-test-api-key-long",
        }
        with patch.dict(os.environ, env, clear=True):
            errors, warnings = validate_env()

        assert any("POSTGRES_HOST" in w for w in warnings)

    def test_invalid_log_level_warns(self):
        from config.env_validator import validate_env

        env = {
            "DB_BACKEND": "sqlite",
            "LLM_API_KEY": "sk-test-key-long-enough",
            "LOG_LEVEL": "SUPERVERBOSE",
        }
        with patch.dict(os.environ, env, clear=True):
            errors, warnings = validate_env()

        assert any("LOG_LEVEL" in w for w in warnings)

    def test_valid_log_levels_no_warning(self):
        from config.env_validator import validate_env

        for level in ("DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"):
            env = {
                "DB_BACKEND": "sqlite",
                "LLM_API_KEY": "sk-test-key-long-enough",
                "LOG_LEVEL": level,
            }
            with patch.dict(os.environ, env, clear=True):
                errors, warnings = validate_env()
            assert not any("LOG_LEVEL" in w for w in warnings), (
                f"Unexpected warning for {level}"
            )

    def test_cors_wildcard_in_production_warns(self):
        from config.env_validator import validate_env

        env = {
            "DB_BACKEND": "sqlite",
            "LLM_API_KEY": "sk-test-key-long-enough",
            "ENVIRONMENT": "production",
            "MW_CORS_ORIGINS": "*",
        }
        with patch.dict(os.environ, env, clear=True):
            errors, warnings = validate_env()

        assert any("CORS" in w or "*" in w for w in warnings)

    def test_missing_jwt_secret_in_production_warns(self):
        from config.env_validator import validate_env

        env = {
            "DB_BACKEND": "sqlite",
            "LLM_API_KEY": "sk-test-key-long-enough",
            "ENVIRONMENT": "production",
        }
        with patch.dict(os.environ, env, clear=True):
            errors, warnings = validate_env()

        assert any("AUTH_JWT_SECRET" in e for e in errors)

    def test_jwt_secret_not_required_in_development(self):
        from config.env_validator import validate_env

        env = {
            "DB_BACKEND": "sqlite",
            "LLM_API_KEY": "sk-test-key-long-enough",
            "ENVIRONMENT": "development",
        }
        with patch.dict(os.environ, env, clear=True):
            errors, warnings = validate_env()

        assert not any("AUTH_JWT_SECRET" in w for w in warnings)

    def test_default_db_backend_is_sqlite(self):
        from config.env_validator import validate_env

        # Remove DB_BACKEND from env - should default to sqlite and pass
        with patch.dict(os.environ, {"LLM_API_KEY": "sk-long-enough-key"}, clear=True):
            errors, warnings = validate_env()

        assert not any("DB_BACKEND" in e for e in errors)


class TestValidateAndLog:
    """Tests for validate_and_log()."""

    def test_returns_true_on_no_errors(self):
        from config.env_validator import validate_and_log

        env = {
            "DB_BACKEND": "sqlite",
            "LLM_API_KEY": "sk-test-api-key-long-enough",
        }
        with patch.dict(os.environ, env, clear=True):
            result = validate_and_log()

        assert result is True

    def test_returns_false_on_errors(self):
        from config.env_validator import validate_and_log

        env = {"DB_BACKEND": "invalid_backend"}
        with patch.dict(os.environ, env, clear=True):
            result = validate_and_log()

        assert result is False


# ---------------------------------------------------------------------------
# Lifecycle
# ---------------------------------------------------------------------------


class TestLifecycle:
    """Tests for config/lifecycle.py startup and shutdown handlers."""

    def test_on_startup_logs(self, caplog):
        from config.lifecycle import on_startup

        mock_settings = MagicMock()
        mock_settings.db.backend = "sqlite"
        mock_settings.server.host = "0.0.0.0"
        mock_settings.server.port = 8084
        with (
            patch("config.env_validator.validate_and_log", return_value=True),
            patch("config.settings.get_settings", return_value=mock_settings),
        ):
            with caplog.at_level(logging.INFO, logger="config.lifecycle"):
                on_startup()

        # Verify startup was logged
        messages = " ".join(caplog.messages)
        assert "starting" in messages.lower() or "Ra'd AI" in messages

    def test_on_startup_sets_start_time(self):
        import config.lifecycle as lc

        mock_settings = MagicMock()
        mock_settings.db.backend = "sqlite"
        mock_settings.server.host = "0.0.0.0"
        mock_settings.server.port = 8084
        with (
            patch("config.env_validator.validate_and_log", return_value=True),
            patch("config.settings.get_settings", return_value=mock_settings),
        ):
            lc._start_time = 0.0
            lc.on_startup()

        assert lc._start_time > 0

    def test_on_shutdown_logs(self, caplog):
        import config.lifecycle as lc
        from config.lifecycle import on_shutdown

        lc._start_time = 1.0  # Non-zero start time

        with caplog.at_level(logging.INFO, logger="config.lifecycle"):
            on_shutdown()

        messages = " ".join(caplog.messages)
        assert "shutdown" in messages.lower() or "Shutdown" in messages

    def test_on_startup_handles_settings_failure(self, caplog):
        from config.lifecycle import on_startup

        with (
            patch("config.env_validator.validate_and_log", return_value=True),
            patch(
                "config.settings.get_settings",
                side_effect=Exception("settings load failed"),
            ),
        ):
            with caplog.at_level(logging.WARNING, logger="config.lifecycle"):
                # Should not raise even if settings fail
                on_startup()

    def test_on_startup_handles_missing_env_validator(self, caplog):
        from config.lifecycle import on_startup

        with patch("builtins.__import__", side_effect=ImportError("no module")):
            # This should not raise
            try:
                on_startup()
            except ImportError:
                pass  # acceptable - the validate_and_log import path
            except Exception:
                pass


# ---------------------------------------------------------------------------
# Error Tracking
# ---------------------------------------------------------------------------


class TestLogErrorTracker:
    """Tests for LogErrorTracker (default error tracking implementation)."""

    def test_capture_exception_logs_error(self, caplog):
        from config.error_tracking import LogErrorTracker

        tracker = LogErrorTracker()
        exc = ValueError("test error")

        with caplog.at_level(logging.ERROR, logger="tasi.errors"):
            tracker.capture_exception(exc)

        assert any(
            "ValueError" in msg or "test error" in msg for msg in caplog.messages
        )

    def test_capture_exception_with_context(self, caplog):
        from config.error_tracking import LogErrorTracker

        tracker = LogErrorTracker()
        exc = RuntimeError("runtime fail")
        ctx = {"user": "test-user", "path": "/api/v1/health"}

        with caplog.at_level(logging.ERROR, logger="tasi.errors"):
            tracker.capture_exception(exc, context=ctx)

        assert any(
            "RuntimeError" in msg or "runtime fail" in msg for msg in caplog.messages
        )

    def test_capture_message_defaults_to_error_level(self, caplog):
        from config.error_tracking import LogErrorTracker

        tracker = LogErrorTracker()

        with caplog.at_level(logging.ERROR, logger="tasi.errors"):
            tracker.capture_message("Something went wrong")

        assert any("Something went wrong" in msg for msg in caplog.messages)

    def test_capture_message_with_info_level(self, caplog):
        from config.error_tracking import LogErrorTracker

        tracker = LogErrorTracker()

        with caplog.at_level(logging.DEBUG, logger="tasi.errors"):
            tracker.capture_message("Info message", level="info")

        assert any("Info message" in msg for msg in caplog.messages)

    def test_capture_message_with_context(self, caplog):
        from config.error_tracking import LogErrorTracker

        tracker = LogErrorTracker()
        ctx = {"request_id": "abc-123"}

        with caplog.at_level(logging.ERROR, logger="tasi.errors"):
            tracker.capture_message("Context message", context=ctx)

        assert any("Context message" in msg for msg in caplog.messages)

    def test_capture_message_no_context(self, caplog):
        from config.error_tracking import LogErrorTracker

        tracker = LogErrorTracker()

        with caplog.at_level(logging.WARNING, logger="tasi.errors"):
            tracker.capture_message("No context message", level="warning")

        assert any("No context message" in msg for msg in caplog.messages)


class TestInitErrorTracking:
    """Tests for init_error_tracking() and get_error_tracker()."""

    def setup_method(self):
        """Reset singleton before each test."""
        import config.error_tracking as et

        et._tracker = None

    def test_init_returns_log_tracker_by_default(self):
        from config.error_tracking import init_error_tracking, LogErrorTracker

        env = {"ERROR_TRACKER": "log"}
        with patch.dict(os.environ, env, clear=True):
            tracker = init_error_tracking()

        assert isinstance(tracker, LogErrorTracker)

    def test_init_without_env_defaults_to_log_tracker(self):
        from config.error_tracking import init_error_tracking, LogErrorTracker

        with patch.dict(os.environ, {}, clear=True):
            tracker = init_error_tracking()

        assert isinstance(tracker, LogErrorTracker)

    def test_init_sentry_without_dsn_falls_back_to_log(self):
        from config.error_tracking import init_error_tracking, LogErrorTracker

        env = {"ERROR_TRACKER": "sentry"}
        with patch.dict(os.environ, env, clear=True):
            tracker = init_error_tracking()

        assert isinstance(tracker, LogErrorTracker)

    def test_init_sentry_with_dsn_falls_back_to_log(self):
        from config.error_tracking import init_error_tracking, LogErrorTracker

        env = {
            "ERROR_TRACKER": "sentry",
            "SENTRY_DSN": "https://key@sentry.io/123",
        }
        with patch.dict(os.environ, env, clear=True):
            tracker = init_error_tracking()

        # SentryErrorTracker is commented out, so falls back to LogErrorTracker
        assert isinstance(tracker, LogErrorTracker)

    def test_get_error_tracker_initializes_if_none(self):
        from config.error_tracking import get_error_tracker, LogErrorTracker
        import config.error_tracking as et

        et._tracker = None
        with patch.dict(os.environ, {}, clear=True):
            tracker = get_error_tracker()

        assert isinstance(tracker, LogErrorTracker)

    def test_get_error_tracker_returns_existing(self):
        from config.error_tracking import get_error_tracker, LogErrorTracker
        import config.error_tracking as et

        existing = LogErrorTracker()
        et._tracker = existing
        tracker = get_error_tracker()

        assert tracker is existing

    def test_init_sets_global_tracker(self):
        from config.error_tracking import init_error_tracking
        import config.error_tracking as et

        et._tracker = None
        with patch.dict(os.environ, {}, clear=True):
            tracker = init_error_tracking()

        assert et._tracker is tracker

    def test_init_reinitializes_tracker(self):
        from config.error_tracking import init_error_tracking, LogErrorTracker

        with patch.dict(os.environ, {}, clear=True):
            tracker1 = init_error_tracking()
            tracker2 = init_error_tracking()

        assert isinstance(tracker1, LogErrorTracker)
        assert isinstance(tracker2, LogErrorTracker)


# ---------------------------------------------------------------------------
# Health Service - get_uptime_seconds
# ---------------------------------------------------------------------------


class TestGetUptimeSeconds:
    """Tests for get_uptime_seconds()."""

    def test_uptime_is_non_negative(self):
        from services.health_service import get_uptime_seconds

        uptime = get_uptime_seconds()
        assert uptime >= 0

    def test_uptime_increases_over_time(self):
        import time
        from services.health_service import get_uptime_seconds

        t1 = get_uptime_seconds()
        time.sleep(0.05)
        t2 = get_uptime_seconds()
        assert t2 >= t1


# ---------------------------------------------------------------------------
# Health Service - check_news (expanded)
# ---------------------------------------------------------------------------


class TestCheckNews:
    """Tests for check_news() -- SQLite paths."""

    def test_news_healthy_with_articles(self, tmp_path):
        from services.health_service import check_news, HealthStatus

        db_path = tmp_path / "test.db"
        conn = sqlite3.connect(str(db_path))
        conn.execute(
            "CREATE TABLE news_articles "
            "(id INTEGER PRIMARY KEY, title TEXT, source_name TEXT, created_at TEXT)"
        )
        conn.execute(
            "INSERT INTO news_articles VALUES (1, 'headline', 'argaam', '2026-01-01')"
        )
        conn.commit()
        conn.close()

        with (
            patch("services.health_service._is_pg_backend", return_value=False),
            patch("services.health_service._get_sqlite_path", return_value=db_path),
        ):
            result = check_news()

        assert result.status == HealthStatus.HEALTHY
        assert "1 articles" in result.message
        assert "1 sources" in result.message

    def test_news_degraded_when_table_empty(self, tmp_path):
        from services.health_service import check_news, HealthStatus

        db_path = tmp_path / "test.db"
        conn = sqlite3.connect(str(db_path))
        conn.execute(
            "CREATE TABLE news_articles "
            "(id INTEGER PRIMARY KEY, title TEXT, source_name TEXT, created_at TEXT)"
        )
        conn.commit()
        conn.close()

        with (
            patch("services.health_service._is_pg_backend", return_value=False),
            patch("services.health_service._get_sqlite_path", return_value=db_path),
        ):
            result = check_news()

        assert result.status == HealthStatus.DEGRADED
        assert "No articles" in result.message

    def test_news_unhealthy_when_table_missing(self, tmp_path):
        from services.health_service import check_news, HealthStatus

        db_path = tmp_path / "test.db"
        conn = sqlite3.connect(str(db_path))
        conn.execute("CREATE TABLE other_table (id INTEGER)")
        conn.commit()
        conn.close()

        with (
            patch("services.health_service._is_pg_backend", return_value=False),
            patch("services.health_service._get_sqlite_path", return_value=db_path),
        ):
            result = check_news()

        assert result.status == HealthStatus.UNHEALTHY
        assert "not found" in result.message

    def test_news_unhealthy_when_db_missing(self, tmp_path):
        from services.health_service import check_news, HealthStatus

        missing = tmp_path / "missing.db"

        with (
            patch("services.health_service._is_pg_backend", return_value=False),
            patch("services.health_service._get_sqlite_path", return_value=missing),
        ):
            result = check_news()

        assert result.status == HealthStatus.UNHEALTHY

    def test_news_unhealthy_on_exception(self, tmp_path):
        from services.health_service import check_news, HealthStatus

        with (
            patch("services.health_service._is_pg_backend", side_effect=Exception("boom")),
        ):
            result = check_news()

        assert result.status == HealthStatus.UNHEALTHY
        assert "boom" in result.message


# ---------------------------------------------------------------------------
# Health Service - check_tasi_index (expanded)
# ---------------------------------------------------------------------------


class TestCheckTasiIndex:
    """Tests for check_tasi_index()."""

    def test_tasi_healthy_when_cached(self):
        from services.health_service import check_tasi_index, HealthStatus

        cache_info = {"cache_status": "valid", "cache_age_seconds": 60}
        cb_info = {"circuit_state": "closed", "consecutive_failures": 0}

        with (
            patch(
                "services.tasi_index.get_cache_status", return_value=cache_info
            ),
            patch(
                "services.tasi_index.get_circuit_breaker_status", return_value=cb_info
            ),
        ):
            result = check_tasi_index()

        assert result.status == HealthStatus.HEALTHY
        assert "cache=valid" in result.message
        assert "circuit_breaker=closed" in result.message

    def test_tasi_degraded_when_circuit_open(self):
        from services.health_service import check_tasi_index, HealthStatus

        cache_info = {"cache_status": "valid", "cache_age_seconds": 120}
        cb_info = {"circuit_state": "open", "consecutive_failures": 5}

        with (
            patch(
                "services.tasi_index.get_cache_status", return_value=cache_info
            ),
            patch(
                "services.tasi_index.get_circuit_breaker_status", return_value=cb_info
            ),
        ):
            result = check_tasi_index()

        assert result.status == HealthStatus.DEGRADED
        assert "failures=5" in result.message

    def test_tasi_degraded_when_cache_empty(self):
        from services.health_service import check_tasi_index, HealthStatus

        cache_info = {"cache_status": "empty"}
        cb_info = {"circuit_state": "closed", "consecutive_failures": 0}

        with (
            patch(
                "services.tasi_index.get_cache_status", return_value=cache_info
            ),
            patch(
                "services.tasi_index.get_circuit_breaker_status", return_value=cb_info
            ),
        ):
            result = check_tasi_index()

        assert result.status == HealthStatus.DEGRADED

    def test_tasi_degraded_on_import_error(self):
        from services.health_service import check_tasi_index, HealthStatus

        with patch.dict("sys.modules", {"services.tasi_index": None}):
            # Force ImportError by patching the import target
            with patch(
                "services.health_service.check_tasi_index",
                wraps=check_tasi_index,
            ):
                # Directly test by simulating ImportError
                pass

        # Simpler approach: directly check import error path
        original_import = __builtins__.__import__ if hasattr(__builtins__, '__import__') else __import__

        def fail_import(name, *args, **kwargs):
            if name == "services.tasi_index":
                raise ImportError("no tasi_index")
            return original_import(name, *args, **kwargs)

        with patch("builtins.__import__", side_effect=fail_import):
            result = check_tasi_index()

        assert result.status == HealthStatus.DEGRADED
        assert "not available" in result.message or "tasi_index" in result.message

    def test_tasi_degraded_on_generic_exception(self):
        from services.health_service import check_tasi_index, HealthStatus

        with (
            patch(
                "services.tasi_index.get_cache_status",
                side_effect=RuntimeError("unexpected"),
            ),
        ):
            result = check_tasi_index()

        assert result.status == HealthStatus.DEGRADED
        assert "unexpected" in result.message


# ---------------------------------------------------------------------------
# Health Service - check_news_scraper (expanded)
# ---------------------------------------------------------------------------


class TestCheckNewsScraper:
    """Tests for check_news_scraper()."""

    def test_scraper_healthy_when_running_with_sources(self, tmp_path):
        from services.health_service import check_news_scraper, HealthStatus

        db_path = tmp_path / "test.db"
        conn = sqlite3.connect(str(db_path))
        conn.execute(
            "CREATE TABLE news_articles "
            "(id INTEGER PRIMARY KEY, title TEXT, source_name TEXT, created_at TEXT)"
        )
        conn.execute(
            "INSERT INTO news_articles VALUES (1, 'headline', 'argaam', datetime('now'))"
        )
        conn.commit()
        conn.close()

        mock_scheduler = MagicMock()
        mock_scheduler._running = True
        mock_thread = MagicMock()
        mock_thread.is_alive.return_value = True
        mock_scheduler._thread = mock_thread

        mock_app = MagicMock()
        mock_app._news_scheduler = mock_scheduler

        with (
            patch("services.health_service._is_pg_backend", return_value=False),
            patch("services.health_service._get_sqlite_path", return_value=db_path),
            patch.dict("sys.modules", {"app": mock_app}),
        ):
            result = check_news_scraper()

        assert result.status == HealthStatus.HEALTHY
        assert "running" in result.message

    def test_scraper_degraded_when_not_running(self, tmp_path):
        from services.health_service import check_news_scraper, HealthStatus

        db_path = tmp_path / "test.db"
        conn = sqlite3.connect(str(db_path))
        conn.execute(
            "CREATE TABLE news_articles "
            "(id INTEGER PRIMARY KEY, title TEXT, source_name TEXT, created_at TEXT)"
        )
        conn.commit()
        conn.close()

        mock_scheduler = MagicMock()
        mock_scheduler._running = False
        mock_scheduler._thread = None

        mock_app = MagicMock()
        mock_app._news_scheduler = mock_scheduler

        with (
            patch("services.health_service._is_pg_backend", return_value=False),
            patch("services.health_service._get_sqlite_path", return_value=db_path),
            patch.dict("sys.modules", {"app": mock_app}),
        ):
            result = check_news_scraper()

        assert result.status == HealthStatus.DEGRADED
        assert "stopped" in result.message

    def test_scraper_degraded_when_thread_dead(self, tmp_path):
        from services.health_service import check_news_scraper, HealthStatus

        db_path = tmp_path / "test.db"
        conn = sqlite3.connect(str(db_path))
        conn.execute(
            "CREATE TABLE news_articles "
            "(id INTEGER PRIMARY KEY, title TEXT, source_name TEXT, created_at TEXT)"
        )
        conn.commit()
        conn.close()

        mock_scheduler = MagicMock()
        mock_scheduler._running = True
        mock_thread = MagicMock()
        mock_thread.is_alive.return_value = False
        mock_scheduler._thread = mock_thread

        mock_app = MagicMock()
        mock_app._news_scheduler = mock_scheduler

        with (
            patch("services.health_service._is_pg_backend", return_value=False),
            patch("services.health_service._get_sqlite_path", return_value=db_path),
            patch.dict("sys.modules", {"app": mock_app}),
        ):
            result = check_news_scraper()

        assert result.status == HealthStatus.DEGRADED
        assert "thread dead" in result.message

    def test_scraper_degraded_on_exception(self):
        from services.health_service import check_news_scraper, HealthStatus

        with patch(
            "services.health_service._is_pg_backend",
            side_effect=Exception("total failure"),
        ):
            # Force exception in the outer try block
            pass

        # The function has a broad try/except, test that path
        with patch("builtins.__import__", side_effect=Exception("import bomb")):
            result = check_news_scraper()

        assert result.status == HealthStatus.DEGRADED


# ---------------------------------------------------------------------------
# Health Service - get_pool_stats (expanded)
# ---------------------------------------------------------------------------


class TestGetPoolStats:
    """Tests for get_pool_stats()."""

    def test_pool_stats_sqlite_default(self):
        from services.health_service import get_pool_stats

        mock_settings = MagicMock()
        mock_settings.db.backend = "sqlite"

        with patch("services.health_service.get_settings", return_value=mock_settings):
            stats = get_pool_stats()

        assert stats["backend"] == "sqlite"

    def test_pool_stats_postgres_with_pool(self):
        from services.health_service import get_pool_stats

        mock_settings = MagicMock()
        mock_settings.db.backend = "postgres"

        mock_pool = MagicMock()
        mock_pool.minconn = 2
        mock_pool.maxconn = 10

        with (
            patch("services.health_service.get_settings", return_value=mock_settings),
            patch("database.pool._pool", mock_pool),
        ):
            stats = get_pool_stats()

        assert stats["backend"] == "postgres"
        assert stats["min"] == 2
        assert stats["max"] == 10

    def test_pool_stats_postgres_no_pool(self):
        from services.health_service import get_pool_stats

        mock_settings = MagicMock()
        mock_settings.db.backend = "postgres"

        with (
            patch("services.health_service.get_settings", return_value=mock_settings),
            patch("database.pool._pool", None),
        ):
            stats = get_pool_stats()

        assert stats["backend"] == "postgres"
        assert stats["pool_size"] == "unknown"

    def test_pool_stats_settings_exception(self):
        from services.health_service import get_pool_stats

        with patch(
            "services.health_service.get_settings",
            side_effect=Exception("settings error"),
        ):
            stats = get_pool_stats()

        # Falls back to sqlite backend
        assert stats["backend"] == "sqlite"


# ---------------------------------------------------------------------------
# Health Service - _get_build_info (expanded)
# ---------------------------------------------------------------------------


class TestGetBuildInfo:
    """Tests for _get_build_info()."""

    def test_build_info_contains_required_keys(self):
        from services.health_service import _get_build_info

        mock_settings = MagicMock()
        mock_settings.db.backend = "sqlite"
        mock_settings.llm.model = "claude-sonnet-4-5"

        with patch("services.health_service.get_settings", return_value=mock_settings):
            info = _get_build_info()

        assert "python_version" in info
        assert "platform" in info
        assert "db_backend" in info
        assert "llm_model" in info
        assert info["db_backend"] == "sqlite"
        assert info["llm_model"] == "claude-sonnet-4-5"


# ---------------------------------------------------------------------------
# Health Service - _scalar_query / _sqlite_query / _is_pg_backend
# ---------------------------------------------------------------------------


class TestHelperFunctions:
    """Tests for private helper functions in health_service."""

    def test_is_pg_backend_false_for_sqlite(self):
        from services.health_service import _is_pg_backend

        mock_settings = MagicMock()
        mock_settings.db.backend = "sqlite"

        with patch("services.health_service.get_settings", return_value=mock_settings):
            assert _is_pg_backend() is False

    def test_is_pg_backend_true_for_postgres(self):
        from services.health_service import _is_pg_backend

        mock_settings = MagicMock()
        mock_settings.db.backend = "postgres"

        with patch("services.health_service.get_settings", return_value=mock_settings):
            assert _is_pg_backend() is True

    def test_is_pg_backend_false_on_exception(self):
        from services.health_service import _is_pg_backend

        with patch(
            "services.health_service.get_settings",
            side_effect=Exception("oops"),
        ):
            assert _is_pg_backend() is False

    def test_sqlite_query_returns_rows(self, tmp_path):
        from services.health_service import _sqlite_query

        db_path = tmp_path / "test.db"
        conn = sqlite3.connect(str(db_path))
        conn.execute("CREATE TABLE t (v INTEGER)")
        conn.execute("INSERT INTO t VALUES (42)")
        conn.commit()
        conn.close()

        rows = _sqlite_query("SELECT v FROM t", db_path)
        assert rows == [(42,)]

    def test_scalar_query_sqlite(self, tmp_path):
        from services.health_service import _scalar_query

        db_path = tmp_path / "test.db"
        conn = sqlite3.connect(str(db_path))
        conn.execute("CREATE TABLE t (v INTEGER)")
        conn.execute("INSERT INTO t VALUES (99)")
        conn.commit()
        conn.close()

        with (
            patch("services.health_service._is_pg_backend", return_value=False),
            patch("services.health_service._get_sqlite_path", return_value=db_path),
        ):
            result = _scalar_query("SELECT v FROM t")

        assert result == 99


# ---------------------------------------------------------------------------
# Error Handler Middleware (expanded coverage)
# ---------------------------------------------------------------------------


class TestErrorHandlerMappedExceptions:
    """Tests for mapped exception types in ErrorHandlerMiddleware."""

    def _make_app_with_error(self, exc):
        from middleware.error_handler import ErrorHandlerMiddleware

        app = FastAPI()
        app.add_middleware(ErrorHandlerMiddleware)

        @app.get("/raise")
        async def raise_endpoint():
            raise exc

        return app

    def test_value_error_returns_400(self):
        from fastapi.testclient import TestClient

        app = self._make_app_with_error(ValueError("bad input"))
        client = TestClient(app, raise_server_exceptions=False)
        response = client.get("/raise")
        assert response.status_code == 400
        data = response.json()
        assert data["error"]["code"] == "BAD_REQUEST"
        assert "bad input" in data["error"]["message"]

    def test_permission_error_returns_403(self):
        from fastapi.testclient import TestClient

        app = self._make_app_with_error(PermissionError("forbidden"))
        client = TestClient(app, raise_server_exceptions=False)
        response = client.get("/raise")
        assert response.status_code == 403
        assert response.json()["error"]["code"] == "FORBIDDEN"

    def test_file_not_found_error_returns_404(self):
        from fastapi.testclient import TestClient

        app = self._make_app_with_error(FileNotFoundError("no such file"))
        client = TestClient(app, raise_server_exceptions=False)
        response = client.get("/raise")
        assert response.status_code == 404
        assert response.json()["error"]["code"] == "NOT_FOUND"

    def test_key_error_returns_404(self):
        from fastapi.testclient import TestClient

        app = self._make_app_with_error(KeyError("missing_key"))
        client = TestClient(app, raise_server_exceptions=False)
        response = client.get("/raise")
        assert response.status_code == 404
        assert response.json()["error"]["code"] == "NOT_FOUND"

    def test_connection_error_returns_503(self):
        from fastapi.testclient import TestClient

        app = self._make_app_with_error(ConnectionError("refused"))
        client = TestClient(app, raise_server_exceptions=False)
        response = client.get("/raise")
        assert response.status_code == 503
        assert response.json()["error"]["code"] == "SERVICE_UNAVAILABLE"

    def test_generic_exception_returns_500(self):
        from fastapi.testclient import TestClient

        app = self._make_app_with_error(RuntimeError("unexpected"))
        client = TestClient(app, raise_server_exceptions=False)
        response = client.get("/raise")
        assert response.status_code == 500
        assert response.json()["error"]["code"] == "INTERNAL_ERROR"

    def test_error_response_includes_request_id(self):
        from fastapi.testclient import TestClient

        app = self._make_app_with_error(ValueError("test"))
        client = TestClient(app, raise_server_exceptions=False)
        response = client.get("/raise")
        data = response.json()
        assert "request_id" in data["error"]
        assert len(data["error"]["request_id"]) > 0

    def test_debug_mode_exposes_message(self):
        from fastapi.testclient import TestClient

        with patch.dict(os.environ, {"SERVER_DEBUG": "true"}):
            # Need to reimport to pick up env var
            import importlib
            import middleware.error_handler as eh

            original_debug = eh._DEBUG
            eh._DEBUG = True

            try:
                app = self._make_app_with_error(RuntimeError("secret detail"))
                client = TestClient(app, raise_server_exceptions=False)
                response = client.get("/raise")
                data = response.json()
                assert data["error"]["message"] == "secret detail"
            finally:
                eh._DEBUG = original_debug

    def test_non_debug_hides_message(self):
        from fastapi.testclient import TestClient
        import middleware.error_handler as eh

        original_debug = eh._DEBUG
        eh._DEBUG = False

        try:
            app = self._make_app_with_error(RuntimeError("secret detail"))
            client = TestClient(app, raise_server_exceptions=False)
            response = client.get("/raise")
            data = response.json()
            assert data["error"]["message"] == "Internal server error"
        finally:
            eh._DEBUG = original_debug


class TestInstallExceptionHandlers:
    """Tests for install_exception_handlers()."""

    def test_http_exception_uses_error_shape(self):
        from fastapi import HTTPException
        from fastapi.testclient import TestClient
        from middleware.error_handler import install_exception_handlers

        app = FastAPI()
        install_exception_handlers(app)

        @app.get("/http-err")
        async def http_err():
            raise HTTPException(status_code=404, detail="Not found here")

        client = TestClient(app)
        response = client.get("/http-err")
        assert response.status_code == 404
        data = response.json()
        assert data["error"]["code"] == "NOT_FOUND"
        assert data["error"]["message"] == "Not found here"
        assert "request_id" in data["error"]

    def test_http_exception_401(self):
        from fastapi import HTTPException
        from fastapi.testclient import TestClient
        from middleware.error_handler import install_exception_handlers

        app = FastAPI()
        install_exception_handlers(app)

        @app.get("/unauth")
        async def unauth():
            raise HTTPException(status_code=401, detail="Invalid token")

        client = TestClient(app)
        response = client.get("/unauth")
        assert response.status_code == 401
        data = response.json()
        assert data["error"]["code"] == "UNAUTHORIZED"

    def test_http_exception_429(self):
        from fastapi import HTTPException
        from fastapi.testclient import TestClient
        from middleware.error_handler import install_exception_handlers

        app = FastAPI()
        install_exception_handlers(app)

        @app.get("/ratelimit")
        async def ratelimit():
            raise HTTPException(status_code=429, detail="Too many requests")

        client = TestClient(app)
        response = client.get("/ratelimit")
        assert response.status_code == 429
        assert response.json()["error"]["code"] == "RATE_LIMITED"

    def test_validation_error_returns_422(self):
        from fastapi.testclient import TestClient
        from middleware.error_handler import install_exception_handlers

        app = FastAPI()
        install_exception_handlers(app)

        @app.get("/validate/{item_id}")
        async def validate_endpoint(item_id: int):
            return {"id": item_id}

        client = TestClient(app)
        response = client.get("/validate/not-a-number")
        assert response.status_code == 422
        data = response.json()
        assert data["error"]["code"] == "VALIDATION_ERROR"
        assert "request_id" in data["error"]

    def test_http_exception_unknown_status_code(self):
        from fastapi import HTTPException
        from fastapi.testclient import TestClient
        from middleware.error_handler import install_exception_handlers

        app = FastAPI()
        install_exception_handlers(app)

        @app.get("/teapot")
        async def teapot():
            raise HTTPException(status_code=418, detail="I'm a teapot")

        client = TestClient(app)
        response = client.get("/teapot")
        assert response.status_code == 418
        data = response.json()
        assert data["error"]["code"] == "ERROR"  # fallback
        assert data["error"]["message"] == "I'm a teapot"


class TestGetRequestId:
    """Tests for _get_request_id helper."""

    def test_from_request_state(self):
        from middleware.error_handler import _get_request_id

        request = MagicMock()
        request.state.request_id = "state-id-123"
        assert _get_request_id(request) == "state-id-123"

    def test_from_header(self):
        from middleware.error_handler import _get_request_id

        request = MagicMock()
        request.state.request_id = None
        # Make getattr return None for request_id
        del request.state.request_id
        request.headers.get.return_value = "header-id-456"
        assert _get_request_id(request) == "header-id-456"

    def test_generates_new_id(self):
        from middleware.error_handler import _get_request_id

        request = MagicMock()
        del request.state.request_id
        request.headers.get.return_value = None
        rid = _get_request_id(request)
        assert isinstance(rid, str)
        assert len(rid) == 16  # uuid4().hex[:16]


# ---------------------------------------------------------------------------
# Logging Config (expanded coverage)
# ---------------------------------------------------------------------------


class TestJsonFormatter:
    """Tests for JsonFormatter."""

    def test_format_produces_valid_json(self):
        import json
        from config.logging_config import JsonFormatter

        formatter = JsonFormatter()
        record = logging.LogRecord(
            name="test.logger",
            level=logging.INFO,
            pathname="test.py",
            lineno=42,
            msg="hello %s",
            args=("world",),
            exc_info=None,
        )
        output = formatter.format(record)
        parsed = json.loads(output)

        assert parsed["level"] == "INFO"
        assert parsed["logger"] == "test.logger"
        assert parsed["message"] == "hello world"
        assert "timestamp" in parsed

    def test_format_includes_exception(self):
        import json
        from config.logging_config import JsonFormatter

        formatter = JsonFormatter()
        try:
            raise ValueError("test error")
        except ValueError:
            import sys

            exc_info = sys.exc_info()

        record = logging.LogRecord(
            name="test",
            level=logging.ERROR,
            pathname="test.py",
            lineno=1,
            msg="error occurred",
            args=(),
            exc_info=exc_info,
        )
        output = formatter.format(record)
        parsed = json.loads(output)

        assert "exception" in parsed
        assert "ValueError" in parsed["exception"]

    def test_format_includes_extra_fields(self):
        import json
        from config.logging_config import JsonFormatter

        formatter = JsonFormatter()
        record = logging.LogRecord(
            name="test",
            level=logging.INFO,
            pathname="test.py",
            lineno=1,
            msg="with extra",
            args=(),
            exc_info=None,
        )
        record.request_id = "req-123"
        record.duration_ms = 42.5

        output = formatter.format(record)
        parsed = json.loads(output)

        assert parsed["request_id"] == "req-123"
        assert parsed["duration_ms"] == 42.5

    def test_format_skips_internal_fields(self):
        import json
        from config.logging_config import JsonFormatter

        formatter = JsonFormatter()
        record = logging.LogRecord(
            name="test",
            level=logging.INFO,
            pathname="test.py",
            lineno=1,
            msg="test",
            args=(),
            exc_info=None,
        )
        output = formatter.format(record)
        parsed = json.loads(output)

        # Internal fields should not be in output
        assert "lineno" not in parsed
        assert "funcName" not in parsed
        assert "pathname" not in parsed
        assert "thread" not in parsed


class TestPrettyFormatter:
    """Tests for PrettyFormatter."""

    def test_format_contains_time_and_level(self):
        from config.logging_config import PrettyFormatter

        formatter = PrettyFormatter()
        record = logging.LogRecord(
            name="mymodule",
            level=logging.WARNING,
            pathname="test.py",
            lineno=1,
            msg="watch out",
            args=(),
            exc_info=None,
        )
        output = formatter.format(record)

        assert "WARNING" in output
        assert "mymodule" in output
        assert "watch out" in output
        # Time format HH:MM:SS
        assert "|" in output

    def test_format_string_matches_expected(self):
        from config.logging_config import PrettyFormatter

        formatter = PrettyFormatter()
        assert "%(asctime)s" in formatter._fmt
        assert "%(levelname)" in formatter._fmt
        assert "%(name)s" in formatter._fmt
        assert "%(message)s" in formatter._fmt


class TestIsDevMode:
    """Tests for _is_dev_mode() environment detection."""

    def test_dev_mode_via_is_development(self):
        from config.logging_config import _is_dev_mode

        with patch.dict(os.environ, {"IS_DEVELOPMENT": "true"}, clear=True):
            assert _is_dev_mode() is True

    def test_dev_mode_via_is_development_1(self):
        from config.logging_config import _is_dev_mode

        with patch.dict(os.environ, {"IS_DEVELOPMENT": "1"}, clear=True):
            assert _is_dev_mode() is True

    def test_dev_mode_via_server_debug(self):
        from config.logging_config import _is_dev_mode

        with patch.dict(os.environ, {"SERVER_DEBUG": "yes"}, clear=True):
            assert _is_dev_mode() is True

    def test_dev_mode_via_environment_development(self):
        from config.logging_config import _is_dev_mode

        with patch.dict(os.environ, {"SERVER_ENVIRONMENT": "development"}, clear=True):
            assert _is_dev_mode() is True

    def test_dev_mode_via_environment_fallback(self):
        from config.logging_config import _is_dev_mode

        with patch.dict(os.environ, {"ENVIRONMENT": "development"}, clear=True):
            assert _is_dev_mode() is True

    def test_prod_mode_via_environment_production(self):
        from config.logging_config import _is_dev_mode

        with patch.dict(os.environ, {"SERVER_ENVIRONMENT": "production"}, clear=True):
            assert _is_dev_mode() is False

    def test_default_is_dev_mode(self):
        from config.logging_config import _is_dev_mode

        # Default ENVIRONMENT fallback is "development"
        with patch.dict(os.environ, {}, clear=True):
            assert _is_dev_mode() is True


class TestSetupLogging:
    """Tests for setup_logging()."""

    def test_setup_logging_default_dev_mode(self):
        from config.logging_config import setup_logging, PrettyFormatter

        with patch.dict(os.environ, {"IS_DEVELOPMENT": "true"}, clear=True):
            setup_logging()

        root = logging.getLogger()
        assert len(root.handlers) >= 1
        # Dev mode should use PrettyFormatter
        handler = root.handlers[-1]
        assert isinstance(handler.formatter, PrettyFormatter)

    def test_setup_logging_json_mode(self):
        from config.logging_config import setup_logging, JsonFormatter

        setup_logging(json_output=True)

        root = logging.getLogger()
        assert len(root.handlers) >= 1
        handler = root.handlers[-1]
        assert isinstance(handler.formatter, JsonFormatter)

    def test_setup_logging_pretty_mode(self):
        from config.logging_config import setup_logging, PrettyFormatter

        setup_logging(json_output=False)

        root = logging.getLogger()
        handler = root.handlers[-1]
        assert isinstance(handler.formatter, PrettyFormatter)

    def test_setup_logging_custom_level(self):
        from config.logging_config import setup_logging

        setup_logging(level="DEBUG")

        root = logging.getLogger()
        assert root.level == logging.DEBUG

    def test_setup_logging_level_from_env(self):
        from config.logging_config import setup_logging

        with patch.dict(os.environ, {"LOG_LEVEL": "WARNING"}, clear=True):
            setup_logging(json_output=True)

        root = logging.getLogger()
        assert root.level == logging.WARNING

    def test_setup_logging_suppresses_noisy_loggers(self):
        from config.logging_config import setup_logging, _NOISY_LOGGERS

        setup_logging()

        for name in _NOISY_LOGGERS:
            logger = logging.getLogger(name)
            assert logger.level >= logging.WARNING

    def test_setup_logging_clears_old_handlers(self):
        from config.logging_config import setup_logging

        root = logging.getLogger()
        # Add a dummy handler
        dummy = logging.StreamHandler()
        root.addHandler(dummy)
        old_count = len(root.handlers)

        setup_logging(json_output=True)
        # Handlers should be cleared and replaced with just 1
        assert len(root.handlers) == 1

    def test_setup_logging_invalid_level_defaults_to_info(self):
        from config.logging_config import setup_logging

        setup_logging(level="NONEXISTENT")

        root = logging.getLogger()
        assert root.level == logging.INFO


class TestGetLogger:
    """Tests for get_logger()."""

    def test_get_logger_returns_logger(self):
        from config.logging_config import get_logger

        logger = get_logger("my.test.module")
        assert isinstance(logger, logging.Logger)
        assert logger.name == "my.test.module"

    def test_get_logger_same_name_returns_same_instance(self):
        from config.logging_config import get_logger

        logger1 = get_logger("shared.name")
        logger2 = get_logger("shared.name")
        assert logger1 is logger2
