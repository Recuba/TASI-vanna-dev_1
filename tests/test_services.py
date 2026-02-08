"""
Service Layer Tests
===================
Tests for all service modules: health, news, reports, announcements, user, audit.

Unit tests (always run):
  - Data class construction and serialization
  - Service instantiation with mock connection factories
  - Method existence and signatures

Integration tests (require PostgreSQL):
  - Skipped when POSTGRES_HOST is not set or PG is unreachable
  - Full CRUD operations against a live database
"""

import os
import unittest
import uuid
from datetime import datetime
from unittest.mock import MagicMock, patch


# ---------------------------------------------------------------------------
# PostgreSQL availability check
# ---------------------------------------------------------------------------
def _pg_available() -> bool:
    if not os.environ.get("POSTGRES_HOST"):
        return False
    try:
        import psycopg2
        conn = psycopg2.connect(
            host=os.environ.get("POSTGRES_HOST", "localhost"),
            port=int(os.environ.get("POSTGRES_PORT", "5432")),
            dbname=os.environ.get("POSTGRES_DB", "tasi_platform"),
            user=os.environ.get("POSTGRES_USER", "tasi_user"),
            password=os.environ.get("POSTGRES_PASSWORD", ""),
            connect_timeout=3,
        )
        conn.close()
        return True
    except Exception:
        return False


PG_AVAILABLE = _pg_available()


# ===========================================================================
# Data class unit tests (always run, no DB required)
# ===========================================================================
class TestNewsDataClass(unittest.TestCase):
    """Test NewsArticle data class."""

    def test_default_construction(self):
        from services.news_service import NewsArticle
        article = NewsArticle()
        self.assertIsNotNone(article.id)
        self.assertEqual(article.title, "")
        self.assertEqual(article.language, "ar")
        self.assertIsNone(article.ticker)

    def test_construction_with_values(self):
        from services.news_service import NewsArticle
        article = NewsArticle(
            ticker="2222.SR",
            title="Test Article",
            source_name="Reuters",
            sentiment_score=0.85,
            sentiment_label="positive",
        )
        self.assertEqual(article.ticker, "2222.SR")
        self.assertEqual(article.title, "Test Article")
        self.assertEqual(article.sentiment_score, 0.85)

    def test_to_dict(self):
        from services.news_service import NewsArticle
        article = NewsArticle(ticker="1010.SR", title="Test")
        d = article.to_dict()
        self.assertIn("ticker", d)
        self.assertIn("title", d)
        # created_at should be removed when None (let DB default apply)
        self.assertNotIn("created_at", d)

    def test_unique_ids(self):
        from services.news_service import NewsArticle
        a1 = NewsArticle()
        a2 = NewsArticle()
        self.assertNotEqual(a1.id, a2.id)


class TestTechnicalReportDataClass(unittest.TestCase):
    """Test TechnicalReport data class."""

    def test_default_construction(self):
        from services.reports_service import TechnicalReport
        report = TechnicalReport()
        self.assertIsNotNone(report.id)
        self.assertEqual(report.title, "")
        self.assertIsNone(report.recommendation)

    def test_construction_with_values(self):
        from services.reports_service import TechnicalReport
        report = TechnicalReport(
            ticker="2222.SR",
            title="Aramco Analysis",
            recommendation="buy",
            target_price=35.50,
        )
        self.assertEqual(report.recommendation, "buy")
        self.assertEqual(report.target_price, 35.50)

    def test_to_dict(self):
        from services.reports_service import TechnicalReport
        report = TechnicalReport(title="Test Report")
        d = report.to_dict()
        self.assertIn("title", d)
        self.assertNotIn("created_at", d)


class TestAnnouncementDataClass(unittest.TestCase):
    """Test Announcement data class."""

    def test_default_construction(self):
        from services.announcement_service import Announcement
        ann = Announcement()
        self.assertIsNotNone(ann.id)
        self.assertFalse(ann.is_material)
        self.assertFalse(ann.embedding_flag)

    def test_construction_with_values(self):
        from services.announcement_service import Announcement
        ann = Announcement(
            ticker="1010.SR",
            title_ar="اعلان اختبار",
            title_en="Test Announcement",
            source="CMA",
            is_material=True,
        )
        self.assertEqual(ann.source, "CMA")
        self.assertTrue(ann.is_material)

    def test_to_dict(self):
        from services.announcement_service import Announcement
        ann = Announcement(title_en="Test")
        d = ann.to_dict()
        self.assertIn("title_en", d)
        self.assertNotIn("created_at", d)


class TestUserDataClasses(unittest.TestCase):
    """Test UserProfile, Watchlist, and UserAlert data classes."""

    def test_user_profile_defaults(self):
        from services.user_service import UserProfile
        user = UserProfile()
        self.assertIsNotNone(user.id)
        self.assertEqual(user.auth_provider, "local")
        self.assertEqual(user.subscription_tier, "free")
        self.assertEqual(user.usage_count, 0)
        self.assertTrue(user.is_active)

    def test_watchlist_defaults(self):
        from services.user_service import Watchlist
        wl = Watchlist()
        self.assertIsNotNone(wl.id)
        self.assertEqual(wl.name, "Default")
        self.assertEqual(wl.tickers, [])

    def test_watchlist_with_tickers(self):
        from services.user_service import Watchlist
        wl = Watchlist(tickers=["2222.SR", "1010.SR"])
        self.assertEqual(len(wl.tickers), 2)

    def test_user_alert_defaults(self):
        from services.user_service import UserAlert
        alert = UserAlert()
        self.assertIsNotNone(alert.id)
        self.assertTrue(alert.is_active)
        self.assertIsNone(alert.threshold_value)


class TestAuditDataClasses(unittest.TestCase):
    """Test AuditEntry and UsageStats data classes."""

    def test_audit_entry_defaults(self):
        from services.audit_service import AuditEntry
        entry = AuditEntry()
        self.assertIsNotNone(entry.id)
        self.assertEqual(entry.natural_language_query, "")
        self.assertIsNone(entry.was_successful)

    def test_usage_stats_defaults(self):
        from services.audit_service import UsageStats
        stats = UsageStats()
        self.assertEqual(stats.period, "")
        self.assertEqual(stats.query_count, 0)
        self.assertEqual(stats.unique_users, 0)


# ===========================================================================
# Service construction tests (always run, mock connection factory)
# ===========================================================================
class TestServiceConstruction(unittest.TestCase):
    """Verify all services can be instantiated with a mock connection factory."""

    def _mock_conn_factory(self):
        return MagicMock()

    def test_news_service_construction(self):
        from services.news_service import NewsAggregationService
        svc = NewsAggregationService(get_conn=self._mock_conn_factory)
        self.assertIsNotNone(svc)
        self.assertTrue(callable(svc._get_conn))

    def test_reports_service_construction(self):
        from services.reports_service import TechnicalReportsService
        svc = TechnicalReportsService(get_conn=self._mock_conn_factory)
        self.assertIsNotNone(svc)

    def test_announcement_service_construction(self):
        from services.announcement_service import AnnouncementService
        svc = AnnouncementService(get_conn=self._mock_conn_factory)
        self.assertIsNotNone(svc)

    def test_user_service_construction(self):
        from services.user_service import UserService
        svc = UserService(get_conn=self._mock_conn_factory)
        self.assertIsNotNone(svc)

    def test_audit_service_construction(self):
        from services.audit_service import AuditService
        svc = AuditService(get_conn=self._mock_conn_factory)
        self.assertIsNotNone(svc)


# ===========================================================================
# Service method signature tests (always run)
# ===========================================================================
class TestServiceMethodSignatures(unittest.TestCase):
    """Verify all expected public methods exist on each service."""

    def test_news_service_methods(self):
        from services.news_service import NewsAggregationService
        methods = [
            "store_articles", "get_latest_news", "get_news_by_ticker",
            "get_news_by_sector", "get_article_by_id", "count_articles",
        ]
        for m in methods:
            self.assertTrue(
                hasattr(NewsAggregationService, m),
                f"NewsAggregationService missing method: {m}"
            )

    def test_reports_service_methods(self):
        from services.reports_service import TechnicalReportsService
        methods = [
            "store_report", "store_reports", "get_reports",
            "get_reports_by_ticker", "get_report_by_id", "count_reports",
        ]
        for m in methods:
            self.assertTrue(
                hasattr(TechnicalReportsService, m),
                f"TechnicalReportsService missing method: {m}"
            )

    def test_announcement_service_methods(self):
        from services.announcement_service import AnnouncementService
        methods = [
            "store_announcements", "get_announcements", "get_material_events",
            "get_announcements_by_sector", "get_announcement_by_id",
            "count_announcements",
        ]
        for m in methods:
            self.assertTrue(
                hasattr(AnnouncementService, m),
                f"AnnouncementService missing method: {m}"
            )

    def test_user_service_methods(self):
        from services.user_service import UserService
        methods = [
            "get_or_create_user", "get_user_by_id", "get_user_by_email",
            "increment_usage", "get_watchlists", "create_watchlist",
            "update_watchlist", "delete_watchlist", "create_alert",
            "get_active_alerts", "deactivate_alert",
        ]
        for m in methods:
            self.assertTrue(
                hasattr(UserService, m),
                f"UserService missing method: {m}"
            )

    def test_audit_service_methods(self):
        from services.audit_service import AuditService
        methods = [
            "log_query", "get_user_query_history", "get_usage_stats_daily",
            "get_usage_stats_monthly", "count_queries",
        ]
        for m in methods:
            self.assertTrue(
                hasattr(AuditService, m),
                f"AuditService missing method: {m}"
            )


# ===========================================================================
# Health service tests (always run against SQLite)
# ===========================================================================
class TestHealthService(unittest.TestCase):
    """Test health service functions (works with SQLite backend)."""

    def test_health_status_enum(self):
        from services.health_service import HealthStatus
        self.assertEqual(HealthStatus.HEALTHY.value, "healthy")
        self.assertEqual(HealthStatus.DEGRADED.value, "degraded")
        self.assertEqual(HealthStatus.UNHEALTHY.value, "unhealthy")

    def test_component_health_construction(self):
        from services.health_service import ComponentHealth, HealthStatus
        ch = ComponentHealth(name="test", status=HealthStatus.HEALTHY, message="ok")
        self.assertEqual(ch.name, "test")
        self.assertEqual(ch.status, HealthStatus.HEALTHY)

    def test_health_report_to_dict(self):
        from services.health_service import HealthReport, ComponentHealth, HealthStatus
        report = HealthReport(
            status=HealthStatus.HEALTHY,
            components=[
                ComponentHealth(name="db", status=HealthStatus.HEALTHY, latency_ms=1.5, message="ok"),
            ],
        )
        d = report.to_dict()
        self.assertEqual(d["status"], "healthy")
        self.assertEqual(len(d["components"]), 1)
        self.assertEqual(d["components"][0]["latency_ms"], 1.5)

    def test_check_database_sqlite(self):
        """Verify SQLite health check works (DB_BACKEND defaults to sqlite)."""
        from services.health_service import check_database, HealthStatus
        result = check_database()
        self.assertEqual(result.name, "database")
        # Should be HEALTHY if saudi_stocks.db exists, UNHEALTHY otherwise
        self.assertIn(result.status, [HealthStatus.HEALTHY, HealthStatus.UNHEALTHY])

    def test_get_health(self):
        from services.health_service import get_health
        report = get_health()
        self.assertIsNotNone(report.status)
        self.assertGreaterEqual(len(report.components), 2)


# ===========================================================================
# PostgreSQL integration tests (skipped if PG unavailable)
# ===========================================================================
@unittest.skipUnless(PG_AVAILABLE, "PostgreSQL not available (set POSTGRES_HOST)")
class TestNewsServicePG(unittest.TestCase):
    """Integration tests for NewsAggregationService against PostgreSQL."""

    @classmethod
    def setUpClass(cls):
        import psycopg2
        cls._get_conn = lambda: psycopg2.connect(
            host=os.environ.get("POSTGRES_HOST", "localhost"),
            port=int(os.environ.get("POSTGRES_PORT", "5432")),
            dbname=os.environ.get("POSTGRES_DB", "tasi_platform"),
            user=os.environ.get("POSTGRES_USER", "tasi_user"),
            password=os.environ.get("POSTGRES_PASSWORD", ""),
        )
        from services.news_service import NewsAggregationService
        cls.svc = NewsAggregationService(get_conn=cls._get_conn)

    def test_store_and_retrieve_article(self):
        from services.news_service import NewsArticle
        article = NewsArticle(
            ticker="2222.SR",
            title=f"Test Article {uuid.uuid4().hex[:8]}",
            source_name="Test",
            language="en",
        )
        count = self.svc.store_articles([article])
        self.assertEqual(count, 1)

        retrieved = self.svc.get_article_by_id(article.id)
        self.assertIsNotNone(retrieved)
        self.assertEqual(retrieved.title, article.title)

    def test_get_latest_news(self):
        articles = self.svc.get_latest_news(limit=5)
        self.assertIsInstance(articles, list)

    def test_count_articles(self):
        count = self.svc.count_articles()
        self.assertIsInstance(count, int)
        self.assertGreaterEqual(count, 0)


@unittest.skipUnless(PG_AVAILABLE, "PostgreSQL not available (set POSTGRES_HOST)")
class TestUserServicePG(unittest.TestCase):
    """Integration tests for UserService against PostgreSQL."""

    @classmethod
    def setUpClass(cls):
        import psycopg2
        cls._get_conn = lambda: psycopg2.connect(
            host=os.environ.get("POSTGRES_HOST", "localhost"),
            port=int(os.environ.get("POSTGRES_PORT", "5432")),
            dbname=os.environ.get("POSTGRES_DB", "tasi_platform"),
            user=os.environ.get("POSTGRES_USER", "tasi_user"),
            password=os.environ.get("POSTGRES_PASSWORD", ""),
        )
        from services.user_service import UserService
        cls.svc = UserService(get_conn=cls._get_conn)

    def test_get_or_create_user(self):
        email = f"test-{uuid.uuid4().hex[:8]}@test.com"
        user = self.svc.get_or_create_user(email=email, display_name="Test User")
        self.assertIsNotNone(user)
        self.assertEqual(user.email, email)

    def test_create_and_get_watchlist(self):
        email = f"wl-{uuid.uuid4().hex[:8]}@test.com"
        user = self.svc.get_or_create_user(email=email)
        wl = self.svc.create_watchlist(
            user_id=user.id, name="My Portfolio", tickers=["2222.SR", "1010.SR"]
        )
        self.assertIsNotNone(wl)
        self.assertEqual(wl.name, "My Portfolio")

        watchlists = self.svc.get_watchlists(user_id=user.id)
        self.assertGreaterEqual(len(watchlists), 1)

    def test_create_and_deactivate_alert(self):
        email = f"alert-{uuid.uuid4().hex[:8]}@test.com"
        user = self.svc.get_or_create_user(email=email)
        alert = self.svc.create_alert(
            user_id=user.id,
            ticker="2222.SR",
            alert_type="price_above",
            threshold_value=35.0,
        )
        self.assertIsNotNone(alert)
        self.assertTrue(alert.is_active)

        deactivated = self.svc.deactivate_alert(alert_id=alert.id, user_id=user.id)
        self.assertTrue(deactivated)


@unittest.skipUnless(PG_AVAILABLE, "PostgreSQL not available (set POSTGRES_HOST)")
class TestAuditServicePG(unittest.TestCase):
    """Integration tests for AuditService against PostgreSQL."""

    @classmethod
    def setUpClass(cls):
        import psycopg2
        cls._get_conn = lambda: psycopg2.connect(
            host=os.environ.get("POSTGRES_HOST", "localhost"),
            port=int(os.environ.get("POSTGRES_PORT", "5432")),
            dbname=os.environ.get("POSTGRES_DB", "tasi_platform"),
            user=os.environ.get("POSTGRES_USER", "tasi_user"),
            password=os.environ.get("POSTGRES_PASSWORD", ""),
        )
        from services.audit_service import AuditService
        cls.svc = AuditService(get_conn=cls._get_conn)

    def test_log_query(self):
        entry_id = self.svc.log_query(
            natural_language_query="What is the market cap of Aramco?",
            generated_sql="SELECT market_cap FROM market_data WHERE ticker = '2222.SR'",
            execution_time_ms=42,
            row_count=1,
            was_successful=True,
        )
        self.assertIsNotNone(entry_id)

    def test_count_queries(self):
        count = self.svc.count_queries()
        self.assertIsInstance(count, int)
        self.assertGreaterEqual(count, 0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
