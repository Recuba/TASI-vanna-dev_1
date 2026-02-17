"""
Tests for backend/services/audit/ module.
Covers: models, config, query_audit, security_events, structured_logger, correlation.
"""

import json
import logging
import sys
import uuid
from pathlib import Path
from unittest.mock import MagicMock

import pytest

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from backend.services.audit.config import AuditConfig  # noqa: E402
from backend.services.audit.correlation import (  # noqa: E402
    CorrelationMiddleware,
    _request_id_ctx,
    get_current_request_id,
)
from backend.services.audit.models import (  # noqa: E402
    QueryAuditEvent,
    SecurityEvent,
    SecurityEventType,
    SecuritySeverity,
)
from backend.services.audit.query_audit import QueryAuditLogger  # noqa: E402
from backend.services.audit.security_events import SecurityEventLogger  # noqa: E402
from backend.services.audit.structured_logger import (  # noqa: E402
    JSONFormatter,
    configure_logging,
    get_logger,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def _reset_correlation_ctx():
    """Ensure the correlation contextvar is None before and after each test."""
    token = _request_id_ctx.set(None)
    yield
    _request_id_ctx.reset(token)


@pytest.fixture()
def mock_db_factory():
    """Return a factory that produces a mock DB-API 2.0 connection."""
    conn = MagicMock()
    cursor = MagicMock()
    conn.cursor.return_value.__enter__ = MagicMock(return_value=cursor)
    conn.cursor.return_value.__exit__ = MagicMock(return_value=False)
    factory = MagicMock(return_value=conn)
    return factory, conn, cursor


@pytest.fixture()
def sample_query_event():
    return QueryAuditEvent(
        nl_query="Show me top 10 stocks",
        generated_sql="SELECT * FROM companies LIMIT 10",
        validation_result="pass",
        execution_time_ms=42,
        row_count=10,
    )


@pytest.fixture()
def sample_security_event():
    return SecurityEvent(
        event_type=SecurityEventType.SQL_INJECTION_ATTEMPT,
        severity=SecuritySeverity.HIGH,
        details="DROP TABLE detected in user input",
        ip_address="192.168.1.1",
    )


# ---------------------------------------------------------------------------
# Models tests
# ---------------------------------------------------------------------------


class TestQueryAuditEvent:
    def test_defaults(self):
        event = QueryAuditEvent(nl_query="test query")
        assert event.nl_query == "test query"
        assert event.id  # auto-generated UUID hex
        assert len(event.id) == 32
        assert event.timestamp.tzinfo is not None
        assert event.generated_sql is None
        assert event.error is None
        assert event.risk_score is None

    def test_full_fields(self, sample_query_event):
        assert sample_query_event.execution_time_ms == 42
        assert sample_query_event.row_count == 10
        assert sample_query_event.validation_result == "pass"

    def test_risk_score_bounds(self):
        event = QueryAuditEvent(nl_query="q", risk_score=0.5)
        assert event.risk_score == 0.5

        with pytest.raises(Exception):
            QueryAuditEvent(nl_query="q", risk_score=1.5)

        with pytest.raises(Exception):
            QueryAuditEvent(nl_query="q", risk_score=-0.1)

    def test_extra_fields_ignored(self):
        event = QueryAuditEvent(nl_query="q", unknown_field="xyz")
        assert not hasattr(event, "unknown_field")

    def test_execution_time_non_negative(self):
        with pytest.raises(Exception):
            QueryAuditEvent(nl_query="q", execution_time_ms=-1)


class TestSecurityEvent:
    def test_defaults(self, sample_security_event):
        assert (
            sample_security_event.event_type == SecurityEventType.SQL_INJECTION_ATTEMPT
        )
        assert sample_security_event.severity == SecuritySeverity.HIGH
        assert sample_security_event.id
        assert sample_security_event.timestamp.tzinfo is not None

    def test_all_event_types(self):
        for et in SecurityEventType:
            event = SecurityEvent(
                event_type=et,
                severity=SecuritySeverity.LOW,
            )
            assert event.event_type == et

    def test_all_severity_levels(self):
        for sev in SecuritySeverity:
            event = SecurityEvent(
                event_type=SecurityEventType.INVALID_INPUT,
                severity=sev,
            )
            assert event.severity == sev


class TestSecurityEnums:
    def test_severity_values(self):
        assert SecuritySeverity.LOW.value == "low"
        assert SecuritySeverity.CRITICAL.value == "critical"

    def test_event_type_values(self):
        assert SecurityEventType.SQL_INJECTION_ATTEMPT.value == "sql_injection_attempt"
        assert SecurityEventType.RATE_LIMIT_EXCEEDED.value == "rate_limit_exceeded"
        assert SecurityEventType.UNAUTHORIZED_ACCESS.value == "unauthorized_access"


# ---------------------------------------------------------------------------
# Config tests
# ---------------------------------------------------------------------------


class TestAuditConfig:
    def test_defaults(self):
        cfg = AuditConfig()
        assert cfg.enable_query_audit is True
        assert cfg.enable_security_events is True
        assert cfg.enable_request_logging is True
        assert cfg.log_level == "INFO"
        assert cfg.log_format == "json"
        assert cfg.retention_days == 90

    def test_env_override(self, monkeypatch):
        monkeypatch.setenv("AUDIT_ENABLE_QUERY_AUDIT", "false")
        monkeypatch.setenv("AUDIT_LOG_LEVEL", "DEBUG")
        monkeypatch.setenv("AUDIT_RETENTION_DAYS", "30")
        cfg = AuditConfig()
        assert cfg.enable_query_audit is False
        assert cfg.log_level == "DEBUG"
        assert cfg.retention_days == 30

    def test_retention_minimum(self):
        with pytest.raises(Exception):
            AuditConfig(retention_days=0)

    def test_log_format_literal(self):
        cfg = AuditConfig(log_format="text")
        assert cfg.log_format == "text"

        with pytest.raises(Exception):
            AuditConfig(log_format="yaml")


# ---------------------------------------------------------------------------
# Query audit logger tests
# ---------------------------------------------------------------------------


class TestQueryAuditLogger:
    def test_log_without_db(self, sample_query_event, caplog):
        logger = QueryAuditLogger()
        with caplog.at_level(logging.INFO, logger="tasi.audit.query"):
            logger.log(sample_query_event)
        assert any("query_audit" in r.message for r in caplog.records)

    def test_log_with_error_warns(self, caplog):
        event = QueryAuditEvent(nl_query="bad query", error="syntax error")
        logger = QueryAuditLogger()
        with caplog.at_level(logging.WARNING, logger="tasi.audit.query"):
            logger.log(event)
        warn_records = [r for r in caplog.records if r.levelno == logging.WARNING]
        assert len(warn_records) >= 1

    def test_log_persists_to_db(self, sample_query_event, mock_db_factory):
        factory, conn, cursor = mock_db_factory
        logger = QueryAuditLogger(db_connection_factory=factory)
        logger.log(sample_query_event)
        factory.assert_called_once()
        conn.commit.assert_called_once()
        conn.close.assert_called_once()

    def test_db_failure_does_not_raise(self, sample_query_event):
        factory = MagicMock(side_effect=RuntimeError("connection refused"))
        logger = QueryAuditLogger(db_connection_factory=factory)
        # Should not raise
        logger.log(sample_query_event)

    def test_auto_fills_request_id(self, sample_query_event):
        rid = uuid.uuid4().hex
        _request_id_ctx.set(rid)
        logger = QueryAuditLogger()
        assert sample_query_event.request_id is None
        logger.log(sample_query_event)
        assert sample_query_event.request_id == rid

    def test_preserves_explicit_request_id(self):
        event = QueryAuditEvent(nl_query="q", request_id="explicit-id")
        logger = QueryAuditLogger()
        logger.log(event)
        assert event.request_id == "explicit-id"


# ---------------------------------------------------------------------------
# Security event logger tests
# ---------------------------------------------------------------------------


class TestSecurityEventLogger:
    def test_log_without_db(self, sample_security_event, caplog):
        logger = SecurityEventLogger()
        with caplog.at_level(logging.ERROR, logger="tasi.audit.security"):
            logger.log(sample_security_event)
        assert any("security_event" in r.message for r in caplog.records)

    def test_severity_maps_to_log_level(self, caplog):
        logger = SecurityEventLogger()
        for sev, expected_level in [
            (SecuritySeverity.LOW, logging.INFO),
            (SecuritySeverity.MEDIUM, logging.WARNING),
            (SecuritySeverity.HIGH, logging.ERROR),
            (SecuritySeverity.CRITICAL, logging.CRITICAL),
        ]:
            caplog.clear()
            event = SecurityEvent(
                event_type=SecurityEventType.INVALID_INPUT,
                severity=sev,
            )
            with caplog.at_level(logging.DEBUG, logger="tasi.audit.security"):
                logger.log(event)
            sec_records = [r for r in caplog.records if r.name == "tasi.audit.security"]
            assert any(r.levelno == expected_level for r in sec_records), (
                f"Expected level {expected_level} for severity {sev}"
            )

    def test_log_persists_to_db(self, sample_security_event, mock_db_factory):
        factory, conn, cursor = mock_db_factory
        logger = SecurityEventLogger(db_connection_factory=factory)
        logger.log(sample_security_event)
        factory.assert_called_once()
        conn.commit.assert_called_once()
        conn.close.assert_called_once()

    def test_db_failure_does_not_raise(self, sample_security_event):
        factory = MagicMock(side_effect=ConnectionError("db down"))
        logger = SecurityEventLogger(db_connection_factory=factory)
        # Should not raise
        logger.log(sample_security_event)

    def test_auto_fills_request_id(self, sample_security_event):
        rid = uuid.uuid4().hex
        _request_id_ctx.set(rid)
        logger = SecurityEventLogger()
        assert sample_security_event.request_id is None
        logger.log(sample_security_event)
        assert sample_security_event.request_id == rid


# ---------------------------------------------------------------------------
# Structured logger tests
# ---------------------------------------------------------------------------


class TestJSONFormatter:
    def test_produces_valid_json(self):
        formatter = JSONFormatter()
        record = logging.LogRecord(
            name="test",
            level=logging.INFO,
            pathname="",
            lineno=0,
            msg="hello",
            args=(),
            exc_info=None,
        )
        output = formatter.format(record)
        parsed = json.loads(output)
        assert parsed["level"] == "INFO"
        assert parsed["message"] == "hello"
        assert parsed["logger"] == "test"
        assert "timestamp" in parsed

    def test_includes_request_id(self):
        rid = "test-request-123"
        _request_id_ctx.set(rid)
        formatter = JSONFormatter()
        record = logging.LogRecord(
            name="test",
            level=logging.INFO,
            pathname="",
            lineno=0,
            msg="hi",
            args=(),
            exc_info=None,
        )
        parsed = json.loads(formatter.format(record))
        assert parsed["request_id"] == rid

    def test_no_request_id_when_none(self):
        formatter = JSONFormatter()
        record = logging.LogRecord(
            name="test",
            level=logging.INFO,
            pathname="",
            lineno=0,
            msg="hi",
            args=(),
            exc_info=None,
        )
        parsed = json.loads(formatter.format(record))
        assert "request_id" not in parsed

    def test_includes_extra_fields(self):
        formatter = JSONFormatter()
        record = logging.LogRecord(
            name="test",
            level=logging.INFO,
            pathname="",
            lineno=0,
            msg="msg",
            args=(),
            exc_info=None,
        )
        record.rows = 42
        record.query_time = 100
        parsed = json.loads(formatter.format(record))
        assert parsed["rows"] == 42
        assert parsed["query_time"] == 100

    def test_includes_exception(self):
        formatter = JSONFormatter()
        try:
            raise ValueError("test error")
        except ValueError:
            import sys as _sys

            exc_info = _sys.exc_info()
        record = logging.LogRecord(
            name="test",
            level=logging.ERROR,
            pathname="",
            lineno=0,
            msg="boom",
            args=(),
            exc_info=exc_info,
        )
        parsed = json.loads(formatter.format(record))
        assert "exception" in parsed
        assert "ValueError" in parsed["exception"]


class TestConfigureLogging:
    def test_json_format(self):
        configure_logging(log_level="DEBUG", json_format=True)
        root = logging.getLogger()
        assert root.level == logging.DEBUG
        assert len(root.handlers) == 1
        assert isinstance(root.handlers[0].formatter, JSONFormatter)

    def test_text_format(self):
        configure_logging(log_level="WARNING", json_format=False)
        root = logging.getLogger()
        assert root.level == logging.WARNING
        assert len(root.handlers) == 1
        assert not isinstance(root.handlers[0].formatter, JSONFormatter)

    def test_env_fallback(self, monkeypatch):
        monkeypatch.setenv("LOG_LEVEL", "ERROR")
        monkeypatch.setenv("LOG_FORMAT", "text")
        configure_logging()
        root = logging.getLogger()
        assert root.level == logging.ERROR
        assert not isinstance(root.handlers[0].formatter, JSONFormatter)

    def test_suppresses_noisy_loggers(self):
        configure_logging()
        assert logging.getLogger("uvicorn.access").level == logging.WARNING
        assert logging.getLogger("httpx").level == logging.WARNING
        assert logging.getLogger("yfinance").level == logging.WARNING

    def test_idempotent(self):
        configure_logging()
        configure_logging()
        root = logging.getLogger()
        assert len(root.handlers) == 1  # Handlers cleared on re-init


class TestGetLogger:
    def test_returns_named_logger(self):
        logger = get_logger("my.module")
        assert logger.name == "my.module"
        assert isinstance(logger, logging.Logger)


# ---------------------------------------------------------------------------
# Correlation middleware tests
# ---------------------------------------------------------------------------


class TestGetCurrentRequestId:
    def test_returns_none_by_default(self):
        assert get_current_request_id() is None

    def test_returns_set_value(self):
        _request_id_ctx.set("abc-123")
        assert get_current_request_id() == "abc-123"


class TestCorrelationMiddleware:
    @pytest.mark.asyncio
    async def test_generates_request_id(self):
        middleware = CorrelationMiddleware(app=MagicMock())

        captured_id = None

        async def fake_call_next(request):
            nonlocal captured_id
            captured_id = get_current_request_id()
            response = MagicMock(spec=["headers"])
            response.headers = {}
            return response

        request = MagicMock()
        request.headers = {}
        request.state = MagicMock()

        response = await middleware.dispatch(request, fake_call_next)
        assert captured_id is not None
        assert len(captured_id) == 32  # UUID4 hex
        assert response.headers["X-Request-ID"] == captured_id

    @pytest.mark.asyncio
    async def test_reuses_client_request_id(self):
        middleware = CorrelationMiddleware(app=MagicMock())
        client_id = "client-trace-xyz"

        captured_id = None

        async def fake_call_next(request):
            nonlocal captured_id
            captured_id = get_current_request_id()
            response = MagicMock(spec=["headers"])
            response.headers = {}
            return response

        request = MagicMock()
        request.headers = {"X-Request-ID": client_id}
        request.state = MagicMock()

        response = await middleware.dispatch(request, fake_call_next)
        assert captured_id == client_id
        assert response.headers["X-Request-ID"] == client_id

    @pytest.mark.asyncio
    async def test_resets_context_after_request(self):
        middleware = CorrelationMiddleware(app=MagicMock())

        async def fake_call_next(request):
            response = MagicMock(spec=["headers"])
            response.headers = {}
            return response

        request = MagicMock()
        request.headers = {}
        request.state = MagicMock()

        await middleware.dispatch(request, fake_call_next)
        assert get_current_request_id() is None

    @pytest.mark.asyncio
    async def test_resets_context_on_exception(self):
        middleware = CorrelationMiddleware(app=MagicMock())

        async def failing_call_next(request):
            raise RuntimeError("handler crashed")

        request = MagicMock()
        request.headers = {}
        request.state = MagicMock()

        with pytest.raises(RuntimeError, match="handler crashed"):
            await middleware.dispatch(request, failing_call_next)
        # Context should still be reset despite the exception
        assert get_current_request_id() is None

    @pytest.mark.asyncio
    async def test_sets_request_state(self):
        middleware = CorrelationMiddleware(app=MagicMock())

        async def fake_call_next(request):
            response = MagicMock(spec=["headers"])
            response.headers = {}
            return response

        request = MagicMock()
        request.headers = {}
        request.state = MagicMock()

        await middleware.dispatch(request, fake_call_next)
        # request.state.request_id should have been set
        assert request.state.request_id is not None


# ---------------------------------------------------------------------------
# Package __init__ re-exports test
# ---------------------------------------------------------------------------


class TestPackageExports:
    def test_all_exports_importable(self):
        import backend.services.audit as audit_pkg

        for name in audit_pkg.__all__:
            assert hasattr(audit_pkg, name), f"Missing export: {name}"
