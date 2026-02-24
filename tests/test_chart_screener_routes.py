"""
Chart Analytics, Screener, and SQLite Entities Route Tests
==========================================================
HTTP-level tests for:
  - api/routes/charts_analytics.py  (4 endpoints)
  - api/routes/screener.py          (POST /api/v1/screener/search)
  - api/routes/sqlite_entities.py   (3 endpoints)

All database calls are mocked via ``unittest.mock.patch`` at the route-module
import location so no real database connection is required.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

# ── helpers ──────────────────────────────────────────────────────────────────


def _charts_app() -> FastAPI:
    from api.routes.charts_analytics import router

    app = FastAPI()
    app.include_router(router)
    return app


def _screener_app() -> FastAPI:
    from api.routes.screener import router

    app = FastAPI()
    app.include_router(router)
    return app


def _entities_app() -> FastAPI:
    from api.routes.sqlite_entities import router

    app = FastAPI()
    app.include_router(router)
    return app


# ═══════════════════════════════════════════════════════════════════════════
# Charts Analytics  (api/routes/charts_analytics.py)
# ═══════════════════════════════════════════════════════════════════════════


class TestSectorMarketCap:
    """GET /api/charts/sector-market-cap"""

    @pytest.fixture(autouse=True)
    def _setup(self):
        self.app = _charts_app()
        self.client = TestClient(self.app)

    def test_returns_200_with_data(self):
        mock_rows = [
            {"label": "Energy", "value": 7000000000000},
            {"label": "Financial Services", "value": 3000000000000},
        ]
        with patch(
            "api.routes.charts_analytics.afetchall",
            new_callable=AsyncMock,
            return_value=mock_rows,
        ):
            resp = self.client.get("/api/charts/sector-market-cap")

        assert resp.status_code == 200
        body = resp.json()
        assert body["chart_type"] == "bar"
        assert body["title"] == "Market Cap by Sector (SAR)"
        assert len(body["data"]) == 2
        assert body["data"][0]["label"] == "Energy"
        assert body["data"][0]["value"] == 7000000000000

    def test_returns_200_empty_list(self):
        with patch(
            "api.routes.charts_analytics.afetchall",
            new_callable=AsyncMock,
            return_value=[],
        ):
            resp = self.client.get("/api/charts/sector-market-cap")

        assert resp.status_code == 200
        assert resp.json()["data"] == []

    def test_db_error_returns_503(self):
        with patch(
            "api.routes.charts_analytics.afetchall",
            new_callable=AsyncMock,
            side_effect=RuntimeError("connection lost"),
        ):
            resp = self.client.get("/api/charts/sector-market-cap")

        assert resp.status_code == 503
        assert "unavailable" in resp.json()["detail"].lower()


class TestTopCompanies:
    """GET /api/charts/top-companies"""

    @pytest.fixture(autouse=True)
    def _setup(self):
        self.app = _charts_app()
        self.client = TestClient(self.app)

    def test_default_limit(self):
        rows = [{"label": f"Co{i}", "value": float(1000 - i)} for i in range(10)]
        with patch(
            "api.routes.charts_analytics.afetchall",
            new_callable=AsyncMock,
            return_value=rows,
        ):
            resp = self.client.get("/api/charts/top-companies")

        assert resp.status_code == 200
        assert len(resp.json()["data"]) == 10

    def test_custom_limit(self):
        rows = [{"label": "Aramco", "value": 7e12}]
        with patch(
            "api.routes.charts_analytics.afetchall",
            new_callable=AsyncMock,
            return_value=rows,
        ) as mock_fetch:
            resp = self.client.get("/api/charts/top-companies?limit=1")

        assert resp.status_code == 200
        # The limit parameter should be passed through to the query
        call_args = mock_fetch.call_args
        # Last param in the list is the limit
        assert 1 in call_args[0][1]

    def test_sector_filter(self):
        rows = [{"label": "Aramco", "value": 7e12}]
        with patch(
            "api.routes.charts_analytics.afetchall",
            new_callable=AsyncMock,
            return_value=rows,
        ) as mock_fetch:
            resp = self.client.get("/api/charts/top-companies?sector=Energy")

        assert resp.status_code == 200
        sql_used = mock_fetch.call_args[0][0]
        assert "LIKE" in sql_used

    def test_limit_too_high_returns_422(self):
        resp = self.client.get("/api/charts/top-companies?limit=999")
        assert resp.status_code == 422

    def test_limit_below_one_returns_422(self):
        resp = self.client.get("/api/charts/top-companies?limit=0")
        assert resp.status_code == 422

    def test_null_label_becomes_unknown(self):
        rows = [{"label": None, "value": 100.0}]
        with patch(
            "api.routes.charts_analytics.afetchall",
            new_callable=AsyncMock,
            return_value=rows,
        ):
            resp = self.client.get("/api/charts/top-companies")

        assert resp.status_code == 200
        assert resp.json()["data"][0]["label"] == "Unknown"

    def test_db_error_returns_503(self):
        with patch(
            "api.routes.charts_analytics.afetchall",
            new_callable=AsyncMock,
            side_effect=RuntimeError("db down"),
        ):
            resp = self.client.get("/api/charts/top-companies")

        assert resp.status_code == 503


class TestSectorPE:
    """GET /api/charts/sector-pe"""

    @pytest.fixture(autouse=True)
    def _setup(self):
        self.app = _charts_app()
        self.client = TestClient(self.app)

    def test_returns_200_with_data(self):
        rows = [
            {"label": "Energy", "value": 15.5},
            {"label": "Banks", "value": 12.3},
        ]
        with patch(
            "api.routes.charts_analytics.afetchall",
            new_callable=AsyncMock,
            return_value=rows,
        ):
            resp = self.client.get("/api/charts/sector-pe")

        assert resp.status_code == 200
        body = resp.json()
        assert body["chart_type"] == "bar"
        assert body["title"] == "Average P/E Ratio by Sector"
        # Values should be rounded to 2 decimals
        assert body["data"][0]["value"] == 15.5
        assert body["data"][1]["value"] == 12.3

    def test_value_rounding(self):
        rows = [{"label": "Tech", "value": 22.456789}]
        with patch(
            "api.routes.charts_analytics.afetchall",
            new_callable=AsyncMock,
            return_value=rows,
        ):
            resp = self.client.get("/api/charts/sector-pe")

        assert resp.json()["data"][0]["value"] == 22.46

    def test_db_error_returns_503(self):
        with patch(
            "api.routes.charts_analytics.afetchall",
            new_callable=AsyncMock,
            side_effect=RuntimeError("timeout"),
        ):
            resp = self.client.get("/api/charts/sector-pe")

        assert resp.status_code == 503


class TestDividendYieldTop:
    """GET /api/charts/dividend-yield-top"""

    @pytest.fixture(autouse=True)
    def _setup(self):
        self.app = _charts_app()
        self.client = TestClient(self.app)

    def test_default_limit_15(self):
        rows = [{"label": f"Co{i}", "value": float(6 - i * 0.1)} for i in range(15)]
        with patch(
            "api.routes.charts_analytics.afetchall",
            new_callable=AsyncMock,
            return_value=rows,
        ) as mock_fetch:
            resp = self.client.get("/api/charts/dividend-yield-top")

        assert resp.status_code == 200
        # Default limit is 15
        call_args = mock_fetch.call_args[0][1]
        assert call_args == (15,)

    def test_custom_limit(self):
        rows = [{"label": "DivCo", "value": 5.5}]
        with patch(
            "api.routes.charts_analytics.afetchall",
            new_callable=AsyncMock,
            return_value=rows,
        ) as mock_fetch:
            resp = self.client.get("/api/charts/dividend-yield-top?limit=5")

        assert resp.status_code == 200
        call_args = mock_fetch.call_args[0][1]
        assert call_args == (5,)

    def test_value_rounding(self):
        rows = [{"label": "HighDiv", "value": 5.6789}]
        with patch(
            "api.routes.charts_analytics.afetchall",
            new_callable=AsyncMock,
            return_value=rows,
        ):
            resp = self.client.get("/api/charts/dividend-yield-top")

        assert resp.json()["data"][0]["value"] == 5.68

    def test_null_label_becomes_unknown(self):
        rows = [{"label": None, "value": 3.0}]
        with patch(
            "api.routes.charts_analytics.afetchall",
            new_callable=AsyncMock,
            return_value=rows,
        ):
            resp = self.client.get("/api/charts/dividend-yield-top")

        assert resp.json()["data"][0]["label"] == "Unknown"

    def test_limit_validation(self):
        resp = self.client.get("/api/charts/dividend-yield-top?limit=0")
        assert resp.status_code == 422

        resp = self.client.get("/api/charts/dividend-yield-top?limit=100")
        assert resp.status_code == 422

    def test_db_error_returns_503(self):
        with patch(
            "api.routes.charts_analytics.afetchall",
            new_callable=AsyncMock,
            side_effect=RuntimeError("db down"),
        ):
            resp = self.client.get("/api/charts/dividend-yield-top")

        assert resp.status_code == 503


# ═══════════════════════════════════════════════════════════════════════════
# Screener  (api/routes/screener.py)
# ═══════════════════════════════════════════════════════════════════════════


class TestBuildWhereClauses:
    """Unit tests for the pure _build_where_clauses function."""

    def _make_filters(self, **kwargs):
        from api.routes.screener import ScreenerFilters

        return ScreenerFilters(**kwargs)

    def test_no_filters_returns_empty(self):
        from api.routes.screener import _build_where_clauses

        sql, params = _build_where_clauses(self._make_filters())
        assert sql == ""
        assert params == []

    def test_sector_filter(self):
        from api.routes.screener import _build_where_clauses

        sql, params = _build_where_clauses(self._make_filters(sector="Energy"))
        assert "c.sector = ?" in sql
        assert "Energy" in params

    def test_pe_range(self):
        from api.routes.screener import _build_where_clauses

        sql, params = _build_where_clauses(self._make_filters(pe_min=5.0, pe_max=20.0))
        assert "v.trailing_pe >= ?" in sql
        assert "v.trailing_pe <= ?" in sql
        assert 5.0 in params
        assert 20.0 in params

    def test_pb_range(self):
        from api.routes.screener import _build_where_clauses

        sql, params = _build_where_clauses(self._make_filters(pb_min=1.0, pb_max=3.0))
        assert "v.price_to_book >= ?" in sql
        assert "v.price_to_book <= ?" in sql

    def test_roe_range(self):
        from api.routes.screener import _build_where_clauses

        sql, params = _build_where_clauses(
            self._make_filters(roe_min=0.1, roe_max=0.5)
        )
        assert "p.roe >= ?" in sql
        assert "p.roe <= ?" in sql

    def test_dividend_yield_range(self):
        from api.routes.screener import _build_where_clauses

        sql, params = _build_where_clauses(
            self._make_filters(dividend_yield_min=0.02, dividend_yield_max=0.08)
        )
        assert "d.dividend_yield >= ?" in sql
        assert "d.dividend_yield <= ?" in sql

    def test_market_cap_range(self):
        from api.routes.screener import _build_where_clauses

        sql, params = _build_where_clauses(
            self._make_filters(market_cap_min=1e9, market_cap_max=1e12)
        )
        assert "m.market_cap >= ?" in sql
        assert "m.market_cap <= ?" in sql

    def test_revenue_growth_range(self):
        from api.routes.screener import _build_where_clauses

        sql, params = _build_where_clauses(
            self._make_filters(revenue_growth_min=0.05, revenue_growth_max=0.3)
        )
        assert "p.revenue_growth >= ?" in sql
        assert "p.revenue_growth <= ?" in sql

    def test_debt_to_equity_max(self):
        from api.routes.screener import _build_where_clauses

        sql, params = _build_where_clauses(
            self._make_filters(debt_to_equity_max=1.5)
        )
        assert "f.debt_to_equity <= ?" in sql
        assert 1.5 in params

    def test_current_ratio_min(self):
        from api.routes.screener import _build_where_clauses

        sql, params = _build_where_clauses(
            self._make_filters(current_ratio_min=1.0)
        )
        assert "f.current_ratio >= ?" in sql
        assert 1.0 in params

    def test_recommendation_filter(self):
        from api.routes.screener import _build_where_clauses

        sql, params = _build_where_clauses(
            self._make_filters(recommendation="buy")
        )
        assert "LOWER(a.recommendation) = LOWER(?)" in sql
        assert "buy" in params

    def test_multiple_filters_combined(self):
        from api.routes.screener import _build_where_clauses

        sql, params = _build_where_clauses(
            self._make_filters(
                sector="Energy",
                pe_min=5.0,
                pe_max=20.0,
                dividend_yield_min=0.03,
            )
        )
        assert sql.startswith(" AND ")
        # Should have 4 clauses joined by AND
        assert sql.count(" AND ") >= 4
        assert len(params) == 4

    def test_clauses_start_with_and(self):
        from api.routes.screener import _build_where_clauses

        sql, _ = _build_where_clauses(self._make_filters(sector="Banks"))
        assert sql.startswith(" AND ")


class TestScreenerSearch:
    """POST /api/v1/screener/search"""

    @pytest.fixture(autouse=True)
    def _setup(self):
        self.app = _screener_app()
        self.client = TestClient(self.app)

    def _sample_row(self, **overrides):
        row = {
            "ticker": "2222.SR",
            "short_name": "Saudi Aramco",
            "sector": "Energy",
            "industry": "Oil & Gas",
            "current_price": 32.50,
            "change_pct": 0.31,
            "market_cap": 7000000000000,
            "volume": 15000000,
            "trailing_pe": 15.5,
            "forward_pe": 14.0,
            "price_to_book": 3.2,
            "roe": 0.25,
            "profit_margin": 0.30,
            "revenue_growth": 0.05,
            "dividend_yield": 0.06,
            "debt_to_equity": 0.15,
            "current_ratio": 1.5,
            "total_revenue": 1.5e12,
            "recommendation": "buy",
            "target_mean_price": 36.0,
            "analyst_count": 15,
        }
        row.update(overrides)
        return row

    def test_basic_search_returns_200(self):
        count_row = {"cnt": 1}
        data_rows = [self._sample_row()]
        with patch(
            "api.routes.screener.afetchone",
            new_callable=AsyncMock,
            return_value=count_row,
        ), patch(
            "api.routes.screener.afetchall",
            new_callable=AsyncMock,
            return_value=data_rows,
        ):
            resp = self.client.post(
                "/api/v1/screener/search", json={}
            )

        assert resp.status_code == 200
        body = resp.json()
        assert body["total_count"] == 1
        assert len(body["items"]) == 1
        assert body["items"][0]["ticker"] == "2222.SR"

    def test_empty_results(self):
        with patch(
            "api.routes.screener.afetchone",
            new_callable=AsyncMock,
            return_value={"cnt": 0},
        ), patch(
            "api.routes.screener.afetchall",
            new_callable=AsyncMock,
            return_value=[],
        ):
            resp = self.client.post("/api/v1/screener/search", json={})

        assert resp.status_code == 200
        body = resp.json()
        assert body["total_count"] == 0
        assert body["items"] == []

    def test_sector_filter_applied(self):
        with patch(
            "api.routes.screener.afetchone",
            new_callable=AsyncMock,
            return_value={"cnt": 1},
        ), patch(
            "api.routes.screener.afetchall",
            new_callable=AsyncMock,
            return_value=[self._sample_row()],
        ):
            resp = self.client.post(
                "/api/v1/screener/search", json={"sector": "Energy"}
            )

        body = resp.json()
        assert body["filters_applied"]["sector"] == "Energy"

    def test_multiple_filters_applied(self):
        with patch(
            "api.routes.screener.afetchone",
            new_callable=AsyncMock,
            return_value={"cnt": 1},
        ), patch(
            "api.routes.screener.afetchall",
            new_callable=AsyncMock,
            return_value=[self._sample_row()],
        ):
            resp = self.client.post(
                "/api/v1/screener/search",
                json={"sector": "Energy", "pe_min": 5.0, "pe_max": 20.0},
            )

        body = resp.json()
        assert "sector" in body["filters_applied"]
        assert "pe_min" in body["filters_applied"]
        assert "pe_max" in body["filters_applied"]

    def test_sort_by_invalid_column_defaults_to_market_cap(self):
        with patch(
            "api.routes.screener.afetchone",
            new_callable=AsyncMock,
            return_value={"cnt": 0},
        ), patch(
            "api.routes.screener.afetchall",
            new_callable=AsyncMock,
            return_value=[],
        ) as mock_fetch:
            resp = self.client.post(
                "/api/v1/screener/search",
                json={"sort_by": "DROP TABLE;--"},
            )

        assert resp.status_code == 200
        # The injected column should not appear in the SQL
        sql_used = mock_fetch.call_args[0][0]
        assert "DROP TABLE" not in sql_used
        assert "market_cap" in sql_used

    def test_sort_by_valid_column(self):
        with patch(
            "api.routes.screener.afetchone",
            new_callable=AsyncMock,
            return_value={"cnt": 0},
        ), patch(
            "api.routes.screener.afetchall",
            new_callable=AsyncMock,
            return_value=[],
        ) as mock_fetch:
            resp = self.client.post(
                "/api/v1/screener/search",
                json={"sort_by": "trailing_pe", "sort_dir": "asc"},
            )

        assert resp.status_code == 200
        sql_used = mock_fetch.call_args[0][0]
        assert "trailing_pe" in sql_used
        assert "ASC" in sql_used

    def test_sort_dir_defaults_to_desc(self):
        with patch(
            "api.routes.screener.afetchone",
            new_callable=AsyncMock,
            return_value={"cnt": 0},
        ), patch(
            "api.routes.screener.afetchall",
            new_callable=AsyncMock,
            return_value=[],
        ) as mock_fetch:
            resp = self.client.post(
                "/api/v1/screener/search",
                json={"sort_dir": "desc"},
            )

        assert resp.status_code == 200
        sql_used = mock_fetch.call_args[0][0]
        assert "DESC" in sql_used

    def test_pagination(self):
        with patch(
            "api.routes.screener.afetchone",
            new_callable=AsyncMock,
            return_value={"cnt": 100},
        ), patch(
            "api.routes.screener.afetchall",
            new_callable=AsyncMock,
            return_value=[],
        ) as mock_fetch:
            resp = self.client.post(
                "/api/v1/screener/search",
                json={"limit": 10, "offset": 20},
            )

        assert resp.status_code == 200
        # Verify limit and offset are passed
        data_params = mock_fetch.call_args[0][1]
        assert 10 in data_params
        assert 20 in data_params

    def test_limit_max_100(self):
        resp = self.client.post(
            "/api/v1/screener/search", json={"limit": 200}
        )
        assert resp.status_code == 422

    def test_limit_min_1(self):
        resp = self.client.post(
            "/api/v1/screener/search", json={"limit": 0}
        )
        assert resp.status_code == 422

    def test_offset_min_0(self):
        resp = self.client.post(
            "/api/v1/screener/search", json={"offset": -1}
        )
        assert resp.status_code == 422

    def test_change_pct_rounding(self):
        row = self._sample_row(change_pct=0.3149)
        with patch(
            "api.routes.screener.afetchone",
            new_callable=AsyncMock,
            return_value={"cnt": 1},
        ), patch(
            "api.routes.screener.afetchall",
            new_callable=AsyncMock,
            return_value=[row],
        ):
            resp = self.client.post("/api/v1/screener/search", json={})

        assert resp.json()["items"][0]["change_pct"] == 0.31

    def test_null_change_pct(self):
        row = self._sample_row(change_pct=None)
        with patch(
            "api.routes.screener.afetchone",
            new_callable=AsyncMock,
            return_value={"cnt": 1},
        ), patch(
            "api.routes.screener.afetchall",
            new_callable=AsyncMock,
            return_value=[row],
        ):
            resp = self.client.post("/api/v1/screener/search", json={})

        assert resp.json()["items"][0]["change_pct"] is None

    def test_null_analyst_count(self):
        row = self._sample_row(analyst_count=None)
        with patch(
            "api.routes.screener.afetchone",
            new_callable=AsyncMock,
            return_value={"cnt": 1},
        ), patch(
            "api.routes.screener.afetchall",
            new_callable=AsyncMock,
            return_value=[row],
        ):
            resp = self.client.post("/api/v1/screener/search", json={})

        assert resp.json()["items"][0]["analyst_count"] is None

    def test_count_returns_none_fallback_zero(self):
        with patch(
            "api.routes.screener.afetchone",
            new_callable=AsyncMock,
            return_value=None,
        ), patch(
            "api.routes.screener.afetchall",
            new_callable=AsyncMock,
            return_value=[],
        ):
            resp = self.client.post("/api/v1/screener/search", json={})

        assert resp.status_code == 200
        assert resp.json()["total_count"] == 0

    def test_filters_applied_excludes_pagination(self):
        with patch(
            "api.routes.screener.afetchone",
            new_callable=AsyncMock,
            return_value={"cnt": 0},
        ), patch(
            "api.routes.screener.afetchall",
            new_callable=AsyncMock,
            return_value=[],
        ):
            resp = self.client.post(
                "/api/v1/screener/search",
                json={"limit": 10, "offset": 5, "sector": "Energy"},
            )

        applied = resp.json()["filters_applied"]
        assert "limit" not in applied
        assert "offset" not in applied
        assert "sort_by" not in applied
        assert "sort_dir" not in applied
        assert "sector" in applied


class TestScreenerModels:
    """Test Pydantic models for the screener."""

    def test_screener_filters_defaults(self):
        from api.routes.screener import ScreenerFilters

        f = ScreenerFilters()
        assert f.sort_by == "market_cap"
        assert f.sort_dir == "desc"
        assert f.limit == 50
        assert f.offset == 0
        assert f.sector is None

    def test_screener_item_optional_fields(self):
        from api.routes.screener import ScreenerItem

        item = ScreenerItem(ticker="2222.SR")
        assert item.ticker == "2222.SR"
        assert item.short_name is None
        assert item.current_price is None

    def test_screener_response_defaults(self):
        from api.routes.screener import ScreenerResponse

        resp = ScreenerResponse()
        assert resp.items == []
        assert resp.total_count == 0
        assert resp.filters_applied == {}

    def test_allowed_sort_columns_set(self):
        from api.routes.screener import _ALLOWED_SORT_COLUMNS

        assert "ticker" in _ALLOWED_SORT_COLUMNS
        assert "market_cap" in _ALLOWED_SORT_COLUMNS
        assert "trailing_pe" in _ALLOWED_SORT_COLUMNS
        assert "dividend_yield" in _ALLOWED_SORT_COLUMNS
        # SQL injection attempts should not be in the set
        assert "DROP TABLE" not in _ALLOWED_SORT_COLUMNS


# ═══════════════════════════════════════════════════════════════════════════
# SQLite Entities  (api/routes/sqlite_entities.py)
# ═══════════════════════════════════════════════════════════════════════════


class TestListEntities:
    """GET /api/entities"""

    @pytest.fixture(autouse=True)
    def _setup(self):
        self.app = _entities_app()
        self.client = TestClient(self.app)

    def _sample_row(self, **overrides):
        row = {
            "ticker": "2222.SR",
            "short_name": "Saudi Aramco",
            "sector": "Energy",
            "industry": "Oil & Gas",
            "current_price": 32.50,
            "market_cap": 7000000000000,
            "change_pct": 0.31,
        }
        row.update(overrides)
        return row

    def test_returns_200_with_data(self):
        count_row = {"cnt": 2}
        data_rows = [
            self._sample_row(),
            self._sample_row(
                ticker="1010.SR",
                short_name="RIBL",
                sector="Financial Services",
                market_cap=3e11,
            ),
        ]
        with patch(
            "api.routes.sqlite_entities.afetchone",
            new_callable=AsyncMock,
            return_value=count_row,
        ), patch(
            "api.routes.sqlite_entities.afetchall",
            new_callable=AsyncMock,
            return_value=data_rows,
        ):
            resp = self.client.get("/api/entities")

        assert resp.status_code == 200
        body = resp.json()
        assert body["count"] == 2
        assert body["total"] == 2
        assert body["items"][0]["ticker"] == "2222.SR"

    def test_empty_results(self):
        with patch(
            "api.routes.sqlite_entities.afetchone",
            new_callable=AsyncMock,
            return_value={"cnt": 0},
        ), patch(
            "api.routes.sqlite_entities.afetchall",
            new_callable=AsyncMock,
            return_value=[],
        ):
            resp = self.client.get("/api/entities")

        assert resp.status_code == 200
        body = resp.json()
        assert body["count"] == 0
        assert body["total"] == 0
        assert body["items"] == []

    def test_sector_filter(self):
        with patch(
            "api.routes.sqlite_entities.afetchone",
            new_callable=AsyncMock,
            return_value={"cnt": 1},
        ), patch(
            "api.routes.sqlite_entities.afetchall",
            new_callable=AsyncMock,
            return_value=[self._sample_row()],
        ) as mock_fetch:
            resp = self.client.get("/api/entities?sector=Energy")

        assert resp.status_code == 200
        sql_used = mock_fetch.call_args[0][0]
        assert "LIKE" in sql_used

    def test_search_filter(self):
        with patch(
            "api.routes.sqlite_entities.afetchone",
            new_callable=AsyncMock,
            return_value={"cnt": 1},
        ), patch(
            "api.routes.sqlite_entities.afetchall",
            new_callable=AsyncMock,
            return_value=[self._sample_row()],
        ) as mock_fetch:
            resp = self.client.get("/api/entities?search=Aramco")

        assert resp.status_code == 200
        sql_used = mock_fetch.call_args[0][0]
        assert "ticker LIKE" in sql_used or "short_name LIKE" in sql_used

    def test_pagination_params(self):
        with patch(
            "api.routes.sqlite_entities.afetchone",
            new_callable=AsyncMock,
            return_value={"cnt": 100},
        ), patch(
            "api.routes.sqlite_entities.afetchall",
            new_callable=AsyncMock,
            return_value=[],
        ) as mock_fetch:
            resp = self.client.get("/api/entities?limit=10&offset=20")

        assert resp.status_code == 200
        params_used = mock_fetch.call_args[0][1]
        assert 10 in params_used
        assert 20 in params_used

    def test_limit_max_500(self):
        resp = self.client.get("/api/entities?limit=501")
        assert resp.status_code == 422

    def test_null_change_pct(self):
        row = self._sample_row(change_pct=None)
        with patch(
            "api.routes.sqlite_entities.afetchone",
            new_callable=AsyncMock,
            return_value={"cnt": 1},
        ), patch(
            "api.routes.sqlite_entities.afetchall",
            new_callable=AsyncMock,
            return_value=[row],
        ):
            resp = self.client.get("/api/entities")

        assert resp.json()["items"][0]["change_pct"] is None

    def test_change_pct_rounding(self):
        row = self._sample_row(change_pct=1.5678)
        with patch(
            "api.routes.sqlite_entities.afetchone",
            new_callable=AsyncMock,
            return_value={"cnt": 1},
        ), patch(
            "api.routes.sqlite_entities.afetchall",
            new_callable=AsyncMock,
            return_value=[row],
        ):
            resp = self.client.get("/api/entities")

        assert resp.json()["items"][0]["change_pct"] == 1.57

    def test_db_error_returns_503(self):
        with patch(
            "api.routes.sqlite_entities.afetchone",
            new_callable=AsyncMock,
            side_effect=RuntimeError("db down"),
        ):
            resp = self.client.get("/api/entities")

        assert resp.status_code == 503


class TestListSectors:
    """GET /api/entities/sectors"""

    @pytest.fixture(autouse=True)
    def _setup(self):
        self.app = _entities_app()
        self.client = TestClient(self.app)

    def test_returns_200_with_sectors(self):
        rows = [
            {"sector": "Energy", "company_count": 10},
            {"sector": "Financial Services", "company_count": 50},
        ]
        with patch(
            "api.routes.sqlite_entities.afetchall",
            new_callable=AsyncMock,
            return_value=rows,
        ):
            resp = self.client.get("/api/entities/sectors")

        assert resp.status_code == 200
        body = resp.json()
        assert len(body) == 2
        assert body[0]["sector"] == "Energy"
        assert body[0]["company_count"] == 10

    def test_empty_sectors(self):
        with patch(
            "api.routes.sqlite_entities.afetchall",
            new_callable=AsyncMock,
            return_value=[],
        ):
            resp = self.client.get("/api/entities/sectors")

        assert resp.status_code == 200
        assert resp.json() == []

    def test_db_error_returns_503(self):
        with patch(
            "api.routes.sqlite_entities.afetchall",
            new_callable=AsyncMock,
            side_effect=RuntimeError("db down"),
        ):
            resp = self.client.get("/api/entities/sectors")

        assert resp.status_code == 503


class TestGetEntity:
    """GET /api/entities/{ticker}"""

    @pytest.fixture(autouse=True)
    def _setup(self):
        self.app = _entities_app()
        self.client = TestClient(self.app)

    def _full_row(self, **overrides):
        row = {
            "ticker": "2222.SR",
            "short_name": "Saudi Aramco",
            "sector": "Energy",
            "industry": "Oil & Gas",
            "exchange": "SAU",
            "currency": "SAR",
            "current_price": 32.50,
            "previous_close": 32.40,
            "open_price": 32.45,
            "day_high": 32.80,
            "day_low": 32.10,
            "week_52_high": 38.0,
            "week_52_low": 28.0,
            "avg_50d": 33.0,
            "avg_200d": 31.5,
            "volume": 15000000,
            "avg_volume": 12000000,
            "beta": 0.5,
            "market_cap": 7000000000000,
            "shares_outstanding": 200000000000,
            "pct_held_insiders": 0.98,
            "pct_held_institutions": 0.02,
            "trailing_pe": 15.5,
            "forward_pe": 14.0,
            "price_to_book": 3.2,
            "price_to_sales": 4.5,
            "enterprise_value": 7500000000000,
            "ev_to_revenue": 5.0,
            "ev_to_ebitda": 8.0,
            "peg_ratio": 1.5,
            "trailing_eps": 2.10,
            "forward_eps": 2.30,
            "book_value": 10.15,
            "roa": 0.15,
            "roe": 0.25,
            "profit_margin": 0.30,
            "operating_margin": 0.35,
            "gross_margin": 0.55,
            "ebitda_margin": 0.40,
            "earnings_growth": 0.10,
            "revenue_growth": 0.05,
            "dividend_rate": 1.96,
            "dividend_yield": 0.06,
            "payout_ratio": 0.93,
            "ex_dividend_date": "2024-03-10",
            "total_revenue": 1500000000000,
            "total_debt": 100000000000,
            "debt_to_equity": 0.15,
            "current_ratio": 1.5,
            "free_cashflow": 400000000000,
            "operating_cashflow": 500000000000,
            "ebitda": 600000000000,
            "recommendation": "buy",
            "target_mean_price": 36.0,
            "target_high_price": 40.0,
            "target_low_price": 30.0,
            "target_median_price": 35.0,
            "analyst_count": 15,
            "change_pct": 0.31,
        }
        row.update(overrides)
        return row

    def test_returns_200_for_valid_ticker(self):
        with patch(
            "api.routes.sqlite_entities.afetchone",
            new_callable=AsyncMock,
            return_value=self._full_row(),
        ):
            resp = self.client.get("/api/entities/2222.SR")

        assert resp.status_code == 200
        body = resp.json()
        assert body["ticker"] == "2222.SR"
        assert body["short_name"] == "Saudi Aramco"
        assert body["sector"] == "Energy"
        assert body["current_price"] == 32.50

    def test_numeric_ticker_gets_sr_suffix(self):
        with patch(
            "api.routes.sqlite_entities.afetchone",
            new_callable=AsyncMock,
            return_value=self._full_row(),
        ) as mock_fetch:
            resp = self.client.get("/api/entities/2222")

        assert resp.status_code == 200
        # The ticker should be normalized to "2222.SR"
        call_args = mock_fetch.call_args[0][1]
        assert call_args == ("2222.SR",)

    def test_404_when_not_found(self):
        with patch(
            "api.routes.sqlite_entities.afetchone",
            new_callable=AsyncMock,
            return_value=None,
        ):
            resp = self.client.get("/api/entities/9999.SR")

        assert resp.status_code == 404
        assert "not found" in resp.json()["detail"].lower()

    def test_invalid_ticker_format_returns_400(self):
        resp = self.client.get("/api/entities/INVALID_TICKER!")
        assert resp.status_code == 400

    def test_ticker_too_long_returns_400(self):
        resp = self.client.get("/api/entities/12345678901")
        assert resp.status_code == 400

    def test_null_optional_fields(self):
        row = self._full_row(
            forward_pe=None,
            dividend_yield=None,
            analyst_count=None,
            change_pct=None,
        )
        with patch(
            "api.routes.sqlite_entities.afetchone",
            new_callable=AsyncMock,
            return_value=row,
        ):
            resp = self.client.get("/api/entities/2222.SR")

        body = resp.json()
        assert body["forward_pe"] is None
        assert body["dividend_yield"] is None
        assert body["analyst_count"] is None
        assert body["change_pct"] is None

    def test_change_pct_rounding(self):
        row = self._full_row(change_pct=1.5678)
        with patch(
            "api.routes.sqlite_entities.afetchone",
            new_callable=AsyncMock,
            return_value=row,
        ):
            resp = self.client.get("/api/entities/2222.SR")

        assert resp.json()["change_pct"] == 1.57

    def test_db_error_returns_503(self):
        with patch(
            "api.routes.sqlite_entities.afetchone",
            new_callable=AsyncMock,
            side_effect=RuntimeError("db down"),
        ):
            resp = self.client.get("/api/entities/2222.SR")

        assert resp.status_code == 503

    def test_tasi_index_ticker_accepted(self):
        with patch(
            "api.routes.sqlite_entities.afetchone",
            new_callable=AsyncMock,
            return_value=None,
        ):
            resp = self.client.get("/api/entities/^TASI")

        # Should pass validation but return 404 (not in the mock data)
        assert resp.status_code == 404


class TestNormalizeTicker:
    """Unit tests for _normalize_ticker."""

    def test_numeric_gets_sr_suffix(self):
        from api.routes.sqlite_entities import _normalize_ticker

        assert _normalize_ticker("2222") == "2222.SR"

    def test_already_has_sr(self):
        from api.routes.sqlite_entities import _normalize_ticker

        assert _normalize_ticker("2222.SR") == "2222.SR"

    def test_strips_whitespace(self):
        from api.routes.sqlite_entities import _normalize_ticker

        assert _normalize_ticker("  2222  ") == "2222.SR"

    def test_tasi_index_unchanged(self):
        from api.routes.sqlite_entities import _normalize_ticker

        assert _normalize_ticker("^TASI") == "^TASI"


class TestEntityModels:
    """Test Pydantic models for entities."""

    def test_company_summary_minimal(self):
        from api.routes.sqlite_entities import CompanySummary

        cs = CompanySummary(ticker="2222.SR")
        assert cs.ticker == "2222.SR"
        assert cs.short_name is None

    def test_entity_list_response(self):
        from api.routes.sqlite_entities import CompanySummary, EntityListResponse

        resp = EntityListResponse(
            items=[CompanySummary(ticker="2222.SR")],
            count=1,
            total=1,
        )
        assert resp.count == 1
        assert resp.total == 1

    def test_sector_info(self):
        from api.routes.sqlite_entities import SectorInfo

        si = SectorInfo(sector="Energy", company_count=10)
        assert si.sector == "Energy"
        assert si.company_count == 10

    def test_company_full_detail_minimal(self):
        from api.routes.sqlite_entities import CompanyFullDetail

        detail = CompanyFullDetail(ticker="2222.SR")
        assert detail.ticker == "2222.SR"
        assert detail.short_name is None
        assert detail.trailing_pe is None
