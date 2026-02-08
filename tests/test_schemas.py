"""
Pydantic Schema Validation Tests
=================================
Tests for all API request/response schemas in api/schemas/.

All tests run without a database or external services.
"""

import math
import sys
from datetime import datetime
from pathlib import Path

import pytest
from pydantic import ValidationError

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


# ===========================================================================
# PaginationParams tests
# ===========================================================================

class TestPaginationParams:
    """Tests for api.schemas.common.PaginationParams."""

    def test_defaults(self):
        from api.schemas.common import PaginationParams
        # PaginationParams uses FastAPI Query() defaults; calling with explicit
        # values is the intended usage pattern.
        p = PaginationParams(page=1, page_size=20)
        assert p.page == 1
        assert p.page_size == 20

    def test_offset_page_1(self):
        from api.schemas.common import PaginationParams
        p = PaginationParams(page=1, page_size=20)
        assert p.offset == 0
        assert p.limit == 20

    def test_offset_page_3(self):
        from api.schemas.common import PaginationParams
        p = PaginationParams(page=3, page_size=10)
        assert p.offset == 20
        assert p.limit == 10

    def test_custom_page_size(self):
        from api.schemas.common import PaginationParams
        p = PaginationParams(page=1, page_size=50)
        assert p.limit == 50


class TestPaginatedResponse:
    """Tests for api.schemas.common.PaginatedResponse."""

    def test_build_basic(self):
        from api.schemas.common import PaginatedResponse
        resp = PaginatedResponse.build(
            items=["a", "b", "c"],
            total=10,
            page=1,
            page_size=3,
        )
        assert resp.total == 10
        assert resp.page == 1
        assert resp.page_size == 3
        assert resp.total_pages == 4  # ceil(10/3) = 4
        assert len(resp.items) == 3

    def test_build_single_page(self):
        from api.schemas.common import PaginatedResponse
        resp = PaginatedResponse.build(items=["a"], total=1, page=1, page_size=20)
        assert resp.total_pages == 1

    def test_build_empty(self):
        from api.schemas.common import PaginatedResponse
        resp = PaginatedResponse.build(items=[], total=0, page=1, page_size=20)
        assert resp.total_pages == 1  # max(1, ...) ensures at least 1


class TestErrorResponse:
    """Tests for api.schemas.common.ErrorResponse."""

    def test_basic(self):
        from api.schemas.common import ErrorResponse
        err = ErrorResponse(detail="Not found")
        assert err.detail == "Not found"
        assert err.code is None

    def test_with_code(self):
        from api.schemas.common import ErrorResponse
        err = ErrorResponse(detail="Rate limited", code="RATE_LIMIT")
        assert err.code == "RATE_LIMIT"


# ===========================================================================
# NewsCreate / NewsUpdate / NewsResponse
# ===========================================================================

class TestNewsSchemas:
    """Tests for api.schemas.news."""

    def test_news_create_valid_minimal(self):
        from api.schemas.news import NewsCreate
        n = NewsCreate(title="Breaking News", content="Details here")
        assert n.title == "Breaking News"
        assert n.language == "ar"
        assert n.ticker is None

    def test_news_create_valid_full(self):
        from api.schemas.news import NewsCreate
        n = NewsCreate(
            title="Aramco Earnings",
            content="Quarterly earnings reported",
            ticker="2222.SR",
            source="Reuters",
            source_url="https://example.com/article",
            language="en",
            sentiment_score=0.85,
            sentiment_label="positive",
        )
        assert n.sentiment_score == 0.85
        assert n.source == "Reuters"

    def test_news_create_missing_title(self):
        from api.schemas.news import NewsCreate
        with pytest.raises(ValidationError):
            NewsCreate(content="no title")

    def test_news_create_missing_content(self):
        from api.schemas.news import NewsCreate
        with pytest.raises(ValidationError):
            NewsCreate(title="no content")

    def test_news_create_empty_title(self):
        from api.schemas.news import NewsCreate
        with pytest.raises(ValidationError):
            NewsCreate(title="", content="something")

    def test_news_create_title_too_long(self):
        from api.schemas.news import NewsCreate
        with pytest.raises(ValidationError):
            NewsCreate(title="x" * 501, content="body")

    def test_news_create_sentiment_score_out_of_range_high(self):
        from api.schemas.news import NewsCreate
        with pytest.raises(ValidationError):
            NewsCreate(title="Test", content="body", sentiment_score=1.5)

    def test_news_create_sentiment_score_out_of_range_low(self):
        from api.schemas.news import NewsCreate
        with pytest.raises(ValidationError):
            NewsCreate(title="Test", content="body", sentiment_score=-1.5)

    def test_news_create_sentiment_score_boundary_values(self):
        from api.schemas.news import NewsCreate
        n_pos = NewsCreate(title="Test", content="body", sentiment_score=1.0)
        n_neg = NewsCreate(title="Test", content="body", sentiment_score=-1.0)
        assert n_pos.sentiment_score == 1.0
        assert n_neg.sentiment_score == -1.0

    def test_news_update_all_optional(self):
        from api.schemas.news import NewsUpdate
        u = NewsUpdate()
        assert u.title is None
        assert u.content is None

    def test_news_response_construction(self):
        from api.schemas.news import NewsResponse
        resp = NewsResponse(id="news-1", title="Test", language="en")
        assert resp.id == "news-1"
        assert resp.ticker is None


# ===========================================================================
# ReportCreate / ReportUpdate / ReportResponse
# ===========================================================================

class TestReportSchemas:
    """Tests for api.schemas.reports."""

    def test_report_create_valid(self):
        from api.schemas.reports import ReportCreate
        r = ReportCreate(title="Aramco Analysis")
        assert r.title == "Aramco Analysis"
        assert r.target_price is None

    def test_report_create_with_prices(self):
        from api.schemas.reports import ReportCreate
        r = ReportCreate(
            title="Buy Recommendation",
            ticker="2222.SR",
            recommendation="buy",
            target_price=35.5,
            current_price_at_report=32.0,
        )
        assert r.target_price == 35.5
        assert r.current_price_at_report == 32.0

    def test_report_create_missing_title(self):
        from api.schemas.reports import ReportCreate
        with pytest.raises(ValidationError):
            ReportCreate()

    def test_report_create_negative_target_price(self):
        from api.schemas.reports import ReportCreate
        with pytest.raises(ValidationError):
            ReportCreate(title="Test", target_price=-10.0)

    def test_report_create_zero_target_price(self):
        from api.schemas.reports import ReportCreate
        r = ReportCreate(title="Test", target_price=0)
        assert r.target_price == 0

    def test_report_update_all_optional(self):
        from api.schemas.reports import ReportUpdate
        u = ReportUpdate()
        assert u.title is None

    def test_report_response(self):
        from api.schemas.reports import ReportResponse
        resp = ReportResponse(id="r-1", title="Analysis")
        assert resp.id == "r-1"


# ===========================================================================
# AnnouncementCreate / AnnouncementResponse
# ===========================================================================

class TestAnnouncementSchemas:
    """Tests for api.schemas.announcements."""

    def test_announcement_create_minimal(self):
        from api.schemas.announcements import AnnouncementCreate
        a = AnnouncementCreate()
        assert a.is_material is False
        assert a.ticker is None

    def test_announcement_create_full(self):
        from api.schemas.announcements import AnnouncementCreate
        a = AnnouncementCreate(
            ticker="2222.SR",
            title_ar="اعلان",
            title_en="Announcement",
            source="CMA",
            is_material=True,
            category="Earnings",
        )
        assert a.is_material is True
        assert a.source == "CMA"

    def test_announcement_response(self):
        from api.schemas.announcements import AnnouncementResponse
        resp = AnnouncementResponse(id="ann-1")
        assert resp.id == "ann-1"
        assert resp.is_material is False


# ===========================================================================
# Entity schemas
# ===========================================================================

class TestEntitySchemas:
    """Tests for api.schemas.entities."""

    def test_company_summary(self):
        from api.schemas.entities import CompanySummary
        cs = CompanySummary(ticker="2222.SR", short_name="Aramco", sector="Energy")
        assert cs.ticker == "2222.SR"
        assert cs.current_price is None

    def test_company_detail(self):
        from api.schemas.entities import CompanyDetail
        cd = CompanyDetail(
            ticker="2222.SR",
            short_name="Saudi Aramco",
            current_price=32.5,
            trailing_pe=15.5,
            roe=0.25,
        )
        assert cd.trailing_pe == 15.5

    def test_entity_list_response(self):
        from api.schemas.entities import EntityListResponse, CompanySummary
        resp = EntityListResponse(
            items=[CompanySummary(ticker="2222.SR")],
            count=1,
        )
        assert resp.count == 1

    def test_sector_info(self):
        from api.schemas.entities import SectorInfo
        si = SectorInfo(sector="Energy", company_count=15)
        assert si.company_count == 15


# ===========================================================================
# Watchlist schemas
# ===========================================================================

class TestWatchlistSchemas:
    """Tests for api.schemas.watchlists."""

    def test_watchlist_create_defaults(self):
        from api.schemas.watchlists import WatchlistCreateRequest
        req = WatchlistCreateRequest()
        assert req.name == "Default"
        assert req.tickers == []

    def test_watchlist_create_with_tickers(self):
        from api.schemas.watchlists import WatchlistCreateRequest
        req = WatchlistCreateRequest(
            name="My Portfolio",
            tickers=["2222.SR", "1010.SR"],
        )
        assert len(req.tickers) == 2

    def test_watchlist_add_request_valid(self):
        from api.schemas.watchlists import WatchlistAddRequest
        req = WatchlistAddRequest(ticker="2222.SR")
        assert req.ticker == "2222.SR"

    def test_watchlist_add_request_empty_ticker(self):
        from api.schemas.watchlists import WatchlistAddRequest
        with pytest.raises(ValidationError):
            WatchlistAddRequest(ticker="")

    def test_watchlist_update_request(self):
        from api.schemas.watchlists import WatchlistUpdateRequest
        req = WatchlistUpdateRequest(name="Renamed")
        assert req.name == "Renamed"
        assert req.tickers is None

    def test_watchlist_response(self):
        from api.schemas.watchlists import WatchlistResponse
        resp = WatchlistResponse(
            id="wl-1", user_id="u-1", name="My List", tickers=["2222.SR"]
        )
        assert resp.id == "wl-1"

    def test_alert_create_request(self):
        from api.schemas.watchlists import AlertCreateRequest
        req = AlertCreateRequest(
            ticker="2222.SR", alert_type="price_above", threshold_value=35.0
        )
        assert req.threshold_value == 35.0

    def test_alert_response_default_active(self):
        from api.schemas.watchlists import AlertResponse
        resp = AlertResponse(
            id="a-1", user_id="u-1", ticker="2222.SR", alert_type="price_above"
        )
        assert resp.is_active is True


# ===========================================================================
# Chart schemas
# ===========================================================================

class TestChartSchemas:
    """Tests for api.schemas.charts."""

    def test_chart_request_defaults(self):
        from api.schemas.charts import ChartRequest
        req = ChartRequest(ticker="2222.SR")
        assert req.chart_type == "bar"
        assert req.period == "1y"

    def test_chart_request_empty_ticker(self):
        from api.schemas.charts import ChartRequest
        with pytest.raises(ValidationError):
            ChartRequest(ticker="")

    def test_chart_data_point(self):
        from api.schemas.charts import ChartDataPoint
        dp = ChartDataPoint(label="Energy", value=5000000.0)
        assert dp.value == 5000000.0

    def test_chart_response(self):
        from api.schemas.charts import ChartResponse, ChartDataPoint
        resp = ChartResponse(
            chart_type="bar",
            title="Market Cap by Sector",
            data=[ChartDataPoint(label="Energy", value=7e12)],
        )
        assert len(resp.data) == 1


# ===========================================================================
# Health schemas
# ===========================================================================

class TestHealthSchemas:
    """Tests for api.schemas.health."""

    def test_component_health_response(self):
        from api.schemas.health import ComponentHealthResponse
        ch = ComponentHealthResponse(name="database", status="healthy", latency_ms=1.5)
        assert ch.name == "database"
        assert ch.latency_ms == 1.5

    def test_component_health_response_defaults(self):
        from api.schemas.health import ComponentHealthResponse
        ch = ComponentHealthResponse(name="redis", status="degraded")
        assert ch.latency_ms is None
        assert ch.message == ""

    def test_health_response(self):
        from api.schemas.health import HealthResponse, ComponentHealthResponse
        resp = HealthResponse(
            status="healthy",
            components=[
                ComponentHealthResponse(name="db", status="healthy"),
                ComponentHealthResponse(name="llm", status="healthy"),
            ],
        )
        assert len(resp.components) == 2
