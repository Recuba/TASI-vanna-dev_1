"""
API Routes Tests
================
Tests for all FastAPI API route modules.

Unit tests (always run):
  - Pydantic response model construction and validation
  - Route module imports and router configuration
  - Endpoint registration (path, methods, response_model)

Integration tests (require PostgreSQL):
  - Skipped when POSTGRES_HOST is not set or PG is unreachable
  - Full HTTP request/response cycle via FastAPI TestClient
"""

import os
import unittest


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
# Pydantic response model tests (always run, no DB required)
# ===========================================================================
class TestNewsPydanticModels(unittest.TestCase):
    """Test news route Pydantic response models."""

    def test_news_article_response(self):
        from api.routes.news import NewsArticleResponse

        resp = NewsArticleResponse(
            id="test-id",
            title="Test Article",
            language="en",
        )
        self.assertEqual(resp.id, "test-id")
        self.assertEqual(resp.title, "Test Article")
        self.assertIsNone(resp.ticker)

    def test_news_list_response(self):
        from api.routes.news import NewsListResponse, NewsArticleResponse

        resp = NewsListResponse(
            items=[
                NewsArticleResponse(id="1", title="A"),
                NewsArticleResponse(id="2", title="B"),
            ],
            count=2,
        )
        self.assertEqual(resp.count, 2)
        self.assertEqual(len(resp.items), 2)


class TestReportsPydanticModels(unittest.TestCase):
    """Test reports route Pydantic response models."""

    def test_report_response(self):
        from api.routes.reports import ReportResponse

        resp = ReportResponse(
            id="test-id",
            title="Aramco Analysis",
            recommendation="buy",
            target_price=35.50,
        )
        self.assertEqual(resp.recommendation, "buy")
        self.assertEqual(resp.target_price, 35.50)

    def test_report_list_response(self):
        from api.routes.reports import ReportListResponse

        resp = ReportListResponse(items=[], count=0)
        self.assertEqual(resp.count, 0)
        self.assertEqual(len(resp.items), 0)


class TestAnnouncementsPydanticModels(unittest.TestCase):
    """Test announcements route Pydantic response models."""

    def test_announcement_response(self):
        from api.routes.announcements import AnnouncementResponse

        resp = AnnouncementResponse(
            id="test-id",
            title_en="Test Announcement",
            source="CMA",
            is_material=True,
        )
        self.assertEqual(resp.source, "CMA")
        self.assertTrue(resp.is_material)

    def test_announcement_list_response(self):
        from api.routes.announcements import AnnouncementListResponse

        resp = AnnouncementListResponse(items=[], count=0)
        self.assertEqual(resp.count, 0)


class TestEntitiesPydanticModels(unittest.TestCase):
    """Test entities route Pydantic response models."""

    def test_company_summary(self):
        from api.routes.entities import CompanySummary

        resp = CompanySummary(
            ticker="2222.SR",
            short_name="Saudi Aramco",
            sector="Energy",
            market_cap=7000000000000.0,
        )
        self.assertEqual(resp.ticker, "2222.SR")
        self.assertEqual(resp.sector, "Energy")

    def test_company_detail(self):
        from api.routes.entities import CompanyDetail

        resp = CompanyDetail(
            ticker="2222.SR",
            short_name="Saudi Aramco",
            trailing_pe=15.5,
            roe=0.25,
        )
        self.assertEqual(resp.trailing_pe, 15.5)

    def test_entity_list_response(self):
        from api.routes.entities import EntityListResponse, CompanySummary

        resp = EntityListResponse(
            items=[CompanySummary(ticker="2222.SR")],
            count=1,
        )
        self.assertEqual(resp.count, 1)

    def test_sector_info(self):
        from api.routes.entities import SectorInfo

        resp = SectorInfo(sector="Energy", company_count=15)
        self.assertEqual(resp.sector, "Energy")
        self.assertEqual(resp.company_count, 15)


class TestWatchlistPydanticModels(unittest.TestCase):
    """Test watchlist route Pydantic models."""

    def test_watchlist_response(self):
        from api.routes.watchlists import WatchlistResponse

        resp = WatchlistResponse(
            id="test-id",
            user_id="user-1",
            name="My Portfolio",
            tickers=["2222.SR", "1010.SR"],
        )
        self.assertEqual(resp.name, "My Portfolio")
        self.assertEqual(len(resp.tickers), 2)

    def test_watchlist_create_request(self):
        from api.routes.watchlists import WatchlistCreateRequest

        req = WatchlistCreateRequest()
        self.assertEqual(req.name, "Default")
        self.assertEqual(req.tickers, [])

    def test_alert_response(self):
        from api.routes.watchlists import AlertResponse

        resp = AlertResponse(
            id="alert-1",
            user_id="user-1",
            ticker="2222.SR",
            alert_type="price_above",
            threshold_value=35.0,
        )
        self.assertEqual(resp.alert_type, "price_above")
        self.assertTrue(resp.is_active)


class TestChartsPydanticModels(unittest.TestCase):
    """Test charts route Pydantic models."""

    def test_chart_data_point(self):
        from api.routes.charts import ChartDataPoint

        dp = ChartDataPoint(label="Energy", value=5000000.0)
        self.assertEqual(dp.label, "Energy")
        self.assertEqual(dp.value, 5000000.0)

    def test_chart_response(self):
        from api.routes.charts import ChartResponse, ChartDataPoint

        resp = ChartResponse(
            chart_type="bar",
            title="Test Chart",
            data=[ChartDataPoint(label="A", value=1.0)],
        )
        self.assertEqual(resp.chart_type, "bar")
        self.assertEqual(len(resp.data), 1)


# ===========================================================================
# Router configuration tests (always run)
# ===========================================================================
class TestRouterConfiguration(unittest.TestCase):
    """Verify each route module exports a properly configured router."""

    def test_news_router(self):
        from api.routes.news import router

        self.assertEqual(router.prefix, "/api/news")
        self.assertIn("news", router.tags)

    def test_reports_router(self):
        from api.routes.reports import router

        self.assertEqual(router.prefix, "/api/reports")
        self.assertIn("reports", router.tags)

    def test_announcements_router(self):
        from api.routes.announcements import router

        self.assertEqual(router.prefix, "/api/announcements")
        self.assertIn("announcements", router.tags)

    def test_entities_router(self):
        from api.routes.entities import router

        self.assertEqual(router.prefix, "/api/entities")
        self.assertIn("entities", router.tags)

    def test_watchlists_router(self):
        from api.routes.watchlists import router

        self.assertEqual(router.prefix, "/api/watchlists")
        self.assertIn("watchlists", router.tags)

    def test_charts_router(self):
        from api.routes.charts import router

        self.assertEqual(router.prefix, "/api/charts")
        self.assertIn("charts", router.tags)

    def test_health_router(self):
        from api.routes.health import router

        self.assertIn("health", router.tags)


class TestRouteEndpoints(unittest.TestCase):
    """Verify expected endpoints are registered on each router."""

    def _route_paths(self, router):
        """Extract route paths from a router."""
        return [r.path for r in router.routes if hasattr(r, "path")]

    def test_news_routes(self):
        from api.routes.news import router

        paths = self._route_paths(router)
        self.assertIn("/api/news", paths)
        self.assertIn("/api/news/ticker/{ticker}", paths)
        self.assertIn("/api/news/sector/{sector}", paths)
        self.assertIn("/api/news/{article_id}", paths)

    def test_reports_routes(self):
        from api.routes.reports import router

        paths = self._route_paths(router)
        self.assertIn("/api/reports", paths)
        self.assertIn("/api/reports/ticker/{ticker}", paths)
        self.assertIn("/api/reports/{report_id}", paths)

    def test_announcements_routes(self):
        from api.routes.announcements import router

        paths = self._route_paths(router)
        self.assertIn("/api/announcements", paths)
        self.assertIn("/api/announcements/material", paths)
        self.assertIn("/api/announcements/sector/{sector}", paths)
        self.assertIn("/api/announcements/{announcement_id}", paths)

    def test_entities_routes(self):
        from api.routes.entities import router

        paths = self._route_paths(router)
        self.assertIn("/api/entities", paths)
        self.assertIn("/api/entities/sectors", paths)
        self.assertIn("/api/entities/{ticker}", paths)

    def test_watchlists_routes(self):
        from api.routes.watchlists import router

        paths = self._route_paths(router)
        self.assertIn("/api/watchlists", paths)
        self.assertIn("/api/watchlists/{watchlist_id}", paths)
        self.assertIn("/api/watchlists/alerts", paths)
        self.assertIn("/api/watchlists/alerts/{alert_id}", paths)

    def test_charts_routes(self):
        from api.routes.charts import router

        paths = self._route_paths(router)
        self.assertIn("/api/charts/sector-market-cap", paths)
        self.assertIn("/api/charts/top-companies", paths)
        self.assertIn("/api/charts/sector-pe", paths)
        self.assertIn("/api/charts/dividend-yield-top", paths)

    def test_health_route(self):
        from api.routes.health import router

        paths = self._route_paths(router)
        self.assertIn("/health", paths)


# ===========================================================================
# Integration tests with TestClient (require PostgreSQL)
# ===========================================================================
@unittest.skipUnless(PG_AVAILABLE, "PostgreSQL not available (set POSTGRES_HOST)")
class TestAPIRoutesWithTestClient(unittest.TestCase):
    """Integration tests using FastAPI TestClient against live PostgreSQL.

    These test the full request/response cycle including dependency injection,
    database queries, and response serialization.
    """

    @classmethod
    def setUpClass(cls):
        # Set DB_BACKEND to postgres before importing app
        os.environ["DB_BACKEND"] = "postgres"

        from fastapi.testclient import TestClient
        from app import app

        # Use context manager to trigger FastAPI lifespan (init_pg_pool, etc.)
        client = TestClient(app)
        client.__enter__()
        cls.client = client

    @classmethod
    def tearDownClass(cls):
        cls.client.__exit__(None, None, None)

    def test_health_endpoint(self):
        resp = self.client.get("/health")
        self.assertIn(resp.status_code, [200, 503])
        data = resp.json()
        self.assertIn("status", data)

    def test_entities_list(self):
        resp = self.client.get("/api/entities?limit=5")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("items", data)
        self.assertIn("count", data)

    def test_entities_sectors(self):
        resp = self.client.get("/api/entities/sectors")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIsInstance(data, list)

    def test_entities_detail(self):
        resp = self.client.get("/api/entities/2222.SR")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["ticker"], "2222.SR")

    def test_entities_detail_not_found(self):
        # Use a valid ticker format (4-digit) that doesn't exist in DB
        resp = self.client.get("/api/entities/9999.SR")
        self.assertIn(resp.status_code, [404, 400])

    def test_news_list(self):
        resp = self.client.get("/api/news?limit=5")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("items", data)

    def test_reports_list(self):
        resp = self.client.get("/api/reports?limit=5")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("items", data)

    def test_announcements_list(self):
        resp = self.client.get("/api/announcements?limit=5")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("items", data)

    def test_charts_sector_market_cap(self):
        resp = self.client.get("/api/charts/sector-market-cap")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["chart_type"], "bar")

    def test_charts_top_companies(self):
        resp = self.client.get("/api/charts/top-companies?limit=5")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("data", data)


if __name__ == "__main__":
    unittest.main(verbosity=2)
