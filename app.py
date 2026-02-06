"""
Vanna 2.0 Saudi Stock Market Analyst
=====================================
Connects to a local SQLite database of ~500 Saudi-listed companies
and exposes a FastAPI chat interface powered by Claude Sonnet 4.5
via the Anthropic API.
"""

import base64
import json
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, List, Optional
from dotenv import load_dotenv

load_dotenv()

from vanna import Agent, AgentConfig, ToolRegistry
from vanna.core.audit import AuditLogger
from vanna.core.system_prompt.base import SystemPromptBuilder
from vanna.core.user.resolver import UserResolver, RequestContext, User
from vanna.integrations.local.agent_memory.in_memory import DemoAgentMemory
from vanna.integrations.anthropic import AnthropicLlmService
from vanna.integrations.sqlite import SqliteRunner
from vanna.servers.fastapi import VannaFastAPIServer
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from vanna.tools import RunSqlTool, VisualizeDataTool

# ---------------------------------------------------------------------------
# 1. LLM -- Claude Sonnet 4.5 via Anthropic API
# ---------------------------------------------------------------------------
llm = AnthropicLlmService(
    model="claude-sonnet-4-5-20250929",
    api_key=os.environ.get("ANTHROPIC_API_KEY", ""),
)

# ---------------------------------------------------------------------------
# 2. SQL runner -- local SQLite database
# ---------------------------------------------------------------------------
_HERE = Path(__file__).resolve().parent
sql_runner = SqliteRunner(str(_HERE / "saudi_stocks.db"))

# ---------------------------------------------------------------------------
# 3. Tool registry
# ---------------------------------------------------------------------------
tools = ToolRegistry()
tools.register_local_tool(RunSqlTool(sql_runner=sql_runner), access_groups=["admin", "user"])
tools.register_local_tool(VisualizeDataTool(), access_groups=["admin", "user"])

# ---------------------------------------------------------------------------
# 4. User resolver (JWT or header-based auth, with default fallback)
# ---------------------------------------------------------------------------
def _base64url_decode(value: str) -> bytes:
    padding_needed = 4 - (len(value) % 4)
    if padding_needed and padding_needed != 4:
        value += "=" * padding_needed
    return base64.urlsafe_b64decode(value.encode("utf-8"))


def _decode_jwt_payload(token: str) -> Optional[dict]:
    try:
        parts = token.split(".")
        if len(parts) < 2:
            return None
        payload = _base64url_decode(parts[1])
        return json.loads(payload.decode("utf-8"))
    except (ValueError, json.JSONDecodeError):
        return None


class HeaderOrJwtUserResolver(UserResolver):
    async def resolve_user(self, request_context: RequestContext) -> User:
        default_user_id = os.environ.get("DEFAULT_USER_ID", "default_user")
        default_email = os.environ.get("DEFAULT_USER_EMAIL", "user@localhost")
        default_groups = os.environ.get("DEFAULT_USER_GROUPS", "admin,user")
        auth_mode = os.environ.get("AUTH_MODE", "optional").lower()

        auth_header = request_context.get_header("Authorization")
        bearer_token = None
        if auth_header and auth_header.lower().startswith("bearer "):
            bearer_token = auth_header.split(" ", 1)[1].strip()

        payload = _decode_jwt_payload(bearer_token) if bearer_token else None
        header_user_id = request_context.get_header("X-User-Id")
        header_email = request_context.get_header("X-User-Email")
        header_groups = request_context.get_header("X-User-Groups")

        if payload or header_user_id or header_email or header_groups:
            user_id = (
                (payload or {}).get("id")
                or (payload or {}).get("user_id")
                or header_user_id
                or default_user_id
            )
            email = (payload or {}).get("email") or header_email or default_email
            groups = (
                (payload or {}).get("groups")
                or (payload or {}).get("group_memberships")
                or (header_groups.split(",") if header_groups else None)
                or default_groups.split(",")
            )
            if isinstance(groups, str):
                groups = groups.split(",")
            return User(
                id=str(user_id),
                email=str(email),
                group_memberships=[group.strip() for group in groups if group],
                metadata=(payload or {}).get("metadata", {}) if payload else {},
            )

        if auth_mode == "required":
            raise ValueError("Authentication required but no credentials provided.")

        return User(
            id=default_user_id,
            email=default_email,
            group_memberships=[group.strip() for group in default_groups.split(",") if group],
        )


class SqliteAuditLogger(AuditLogger):
    def __init__(self, db_path: Path) -> None:
        self._db_path = db_path
        self._init_db()

    def _init_db(self) -> None:
        conn = sqlite3.connect(self._db_path)
        try:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS audit_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT,
                    query TEXT,
                    sql TEXT,
                    row_count INTEGER,
                    execution_time_ms REAL,
                    created_at TEXT
                );
                """
            )
            conn.commit()
        finally:
            conn.close()

    async def log_query(
        self,
        user_id: str,
        query: str,
        sql: str,
        result: Any,
        execution_time: float,
    ) -> None:
        row_count = None
        if result is not None and hasattr(result, "__len__"):
            try:
                row_count = len(result)
            except TypeError:
                row_count = None

        conn = sqlite3.connect(self._db_path)
        try:
            conn.execute(
                """
                INSERT INTO audit_logs (
                    user_id,
                    query,
                    sql,
                    row_count,
                    execution_time_ms,
                    created_at
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    user_id,
                    query,
                    sql,
                    row_count,
                    execution_time * 1000.0,
                    datetime.now(timezone.utc).isoformat(),
                ),
            )
            conn.commit()
        finally:
            conn.close()

# ---------------------------------------------------------------------------
# 5. System prompt builder -- comprehensive schema documentation
# ---------------------------------------------------------------------------
SYSTEM_PROMPT = """\
You are a Saudi Stock Market financial analyst AI assistant. You help users \
query and analyze Saudi Arabian stock market data (TASI - Tadawul All Share Index).

DATABASE SCHEMA
===============
The database contains comprehensive financial data for ~500 Saudi-listed companies.

TABLE: companies
- ticker (TEXT, PK) - Saudi stock ticker (e.g., '1020.SR', '2222.SR')
- short_name (TEXT) - Company name
- sector (TEXT) - Industry sector (e.g., 'Financial Services', 'Energy', 'Technology')
- industry (TEXT) - Specific industry
- exchange (TEXT) - Exchange code
- quote_type (TEXT) - Always 'EQUITY'
- currency (TEXT) - Trading currency (SAR)
- financial_currency (TEXT) - Financial reporting currency
- market (TEXT) - Market identifier

TABLE: market_data
- ticker (TEXT, PK, FK->companies)
- current_price, previous_close, open_price, day_high, day_low (REAL) - Daily price data
- week_52_high, week_52_low (REAL) - 52-week range
- avg_50d, avg_200d (REAL) - Moving averages
- volume, avg_volume, avg_volume_10d (INTEGER) - Volume data
- beta (REAL) - Market beta
- market_cap (REAL) - Market capitalization in SAR
- shares_outstanding, float_shares, implied_shares_outstanding (REAL)
- pct_held_insiders, pct_held_institutions (REAL) - Ownership percentages

TABLE: valuation_metrics
- ticker (TEXT, PK, FK->companies)
- trailing_pe, forward_pe (REAL) - P/E ratios
- price_to_book, price_to_sales (REAL) - Price ratios
- enterprise_value, ev_to_revenue, ev_to_ebitda (REAL) - Enterprise value metrics
- peg_ratio (REAL) - PEG ratio
- trailing_eps, forward_eps (REAL) - Earnings per share
- book_value, revenue_per_share (REAL)

TABLE: profitability_metrics
- ticker (TEXT, PK, FK->companies)
- roa, roe (REAL) - Return ratios
- profit_margin, operating_margin, gross_margin, ebitda_margin (REAL) - Margin ratios
- earnings_growth, revenue_growth, earnings_quarterly_growth (REAL) - Growth rates

TABLE: dividend_data
- ticker (TEXT, PK, FK->companies)
- dividend_rate, dividend_yield (REAL) - Current dividend metrics
- ex_dividend_date (TEXT) - Ex-dividend date
- payout_ratio, avg_dividend_yield_5y (REAL)
- last_dividend_value (REAL), last_dividend_date (TEXT)
- trailing_annual_dividend_rate, trailing_annual_dividend_yield (REAL)

TABLE: financial_summary
- ticker (TEXT, PK, FK->companies)
- total_revenue, total_cash, total_cash_per_share (REAL)
- total_debt, debt_to_equity (REAL)
- current_ratio, quick_ratio (REAL) - Liquidity ratios
- operating_cashflow, free_cashflow (REAL)
- ebitda, gross_profits, net_income_to_common (REAL)

TABLE: analyst_data
- ticker (TEXT, PK, FK->companies)
- target_mean_price, target_high_price, target_low_price, target_median_price (REAL)
- analyst_count (INTEGER)
- recommendation (TEXT) - e.g., 'buy', 'hold', 'sell'
- recommendation_score (REAL) - 1=strong buy, 5=strong sell
- most_recent_quarter, last_fiscal_year_end (TEXT)

TABLE: balance_sheet (NORMALIZED - multiple rows per company, one per reporting period)
- id (INTEGER, PK, auto)
- ticker (TEXT, FK->companies)
- period_type (TEXT) - 'annual' or 'quarterly'
- period_index (INTEGER) - 0=most recent, 1=prior period, etc.
- period_date (TEXT) - e.g., '2024-12-31'
-- Assets
- total_assets, current_assets, cash_and_cash_equivalents (REAL)
- cash_cash_equivalents_and_short_term_investments (REAL)
- accounts_receivable, inventory, other_current_assets (REAL)
- total_non_current_assets, net_ppe (REAL)
- goodwill_and_other_intangible_assets, goodwill, other_intangible_assets (REAL)
- long_term_equity_investment, other_non_current_assets (REAL)
-- Liabilities
- total_liabilities_net_minority_interest (REAL)
- current_liabilities, current_debt, accounts_payable, other_current_liabilities (REAL)
- total_non_current_liabilities_net_minority_interest (REAL)
- long_term_debt, long_term_capital_lease_obligation, capital_lease_obligations (REAL)
- other_non_current_liabilities (REAL)
-- Equity
- total_equity_gross_minority_interest, stockholders_equity, common_stock_equity (REAL)
- retained_earnings, common_stock, additional_paid_in_capital (REAL)
- treasury_stock, minority_interest (REAL)
-- Derived
- total_capitalization, net_tangible_assets, working_capital (REAL)
- invested_capital, tangible_book_value (REAL)
- total_debt, net_debt (REAL)
- share_issued, ordinary_shares_number, treasury_shares_number (REAL)

TABLE: income_statement (NORMALIZED - multiple rows per company)
- id (INTEGER, PK, auto)
- ticker (TEXT, FK->companies)
- period_type (TEXT) - 'annual', 'quarterly', or 'ttm'
- period_index (INTEGER)
- period_date (TEXT)
-- Revenue & Profit
- total_revenue, operating_revenue, cost_of_revenue, gross_profit (REAL)
-- Expenses
- operating_expense (REAL)
- selling_general_and_administration, general_and_administrative_expense (REAL)
- research_and_development (REAL)
- operating_income (REAL)
-- Interest & Other
- net_non_operating_interest_income_expense (REAL)
- interest_income, interest_expense (REAL)
- other_non_operating_income_expenses (REAL)
-- Income & Tax
- pretax_income, tax_provision, tax_rate_for_calcs (REAL)
- net_income, net_income_common_stockholders (REAL)
- net_income_continuous_operations, net_income_including_noncontrolling_interests (REAL)
-- Per Share
- diluted_eps, basic_eps (REAL)
- diluted_average_shares, basic_average_shares (REAL)
-- EBITDA & Other
- ebitda, ebit, reconciled_depreciation (REAL)
- total_operating_income_as_reported, normalized_ebitda, normalized_income (REAL)
- net_interest_income, total_expenses (REAL)
- minority_interests (REAL)

TABLE: cash_flow (NORMALIZED - multiple rows per company)
- id (INTEGER, PK, auto)
- ticker (TEXT, FK->companies)
- period_type (TEXT) - 'annual', 'quarterly', or 'ttm'
- period_index (INTEGER)
- period_date (TEXT)
-- Operating Activities
- operating_cash_flow (REAL)
- change_in_working_capital, change_in_receivables (REAL)
- change_in_inventory, change_in_payable, change_in_prepaid_assets (REAL)
- stock_based_compensation (REAL)
- net_income_from_continuing_operations (REAL)
- depreciation_and_amortization (REAL)
- interest_paid_cfo, interest_received_cfo, taxes_refund_paid (REAL)
-- Investing Activities
- investing_cash_flow (REAL)
- capital_expenditure (REAL)
- purchase_of_business (REAL)
- purchase_of_investment, sale_of_investment, net_investment_purchase_and_sale (REAL)
- purchase_of_ppe, sale_of_ppe, net_ppe_purchase_and_sale (REAL)
- dividends_received_cfi (REAL)
-- Financing Activities
- financing_cash_flow (REAL)
- issuance_of_debt, long_term_debt_issuance, long_term_debt_payments (REAL)
- repayment_of_debt (REAL)
- issuance_of_capital_stock, common_stock_issuance (REAL)
- net_other_financing_charges (REAL)
-- Derived
- free_cash_flow (REAL)
- net_other_investing_changes (REAL)
- beginning_cash_position, end_cash_position, changes_in_cash (REAL)
- other_non_cash_items (REAL)

QUERY TIPS
==========
- Join companies with other tables using ticker.
- For financial statements, filter by period_type ('annual', 'quarterly', 'ttm') \
and use period_index=0 for the latest period.
- Market cap is in SAR (Saudi Riyal).
- Use sector/industry from the companies table for sector analysis.
- Common joins: companies JOIN market_data, companies JOIN balance_sheet, etc.

VISUALIZATION
=============
After running a SQL query, you can visualize the results using the visualize_data tool.
- The run_sql tool saves results to a CSV file (shown in the response as the filename).
- Pass that filename to visualize_data to create an interactive Plotly chart.
- Chart type is auto-selected based on data shape: bar, scatter, line, heatmap, histogram.
- Always visualize results when the user asks for charts, graphs, comparisons, or trends.
- For heatmaps: query multiple numeric columns (3+) for the same set of entities.
- For time series: include a date column and numeric columns.
- For comparisons: include a categorical column (e.g., sector, short_name) and numeric values.
"""


class SaudiStocksSystemPromptBuilder(SystemPromptBuilder):
    """Provides the LLM with full schema documentation for the Saudi stocks DB."""

    async def build_system_prompt(
        self, user: User, tools: List["ToolSchema"]
    ) -> Optional[str]:
        return SYSTEM_PROMPT

# ---------------------------------------------------------------------------
# 6. Agent configuration
# ---------------------------------------------------------------------------
config = AgentConfig(
    stream_responses=True,
    max_tool_iterations=10,
)

# ---------------------------------------------------------------------------
# 7. Assemble the agent
# ---------------------------------------------------------------------------
agent = Agent(
    llm_service=llm,
    tool_registry=tools,
    user_resolver=HeaderOrJwtUserResolver(),
    agent_memory=DemoAgentMemory(max_items=10000),
    system_prompt_builder=SaudiStocksSystemPromptBuilder(),
    audit_logger=SqliteAuditLogger(_HERE / "audit_logs.db"),
    config=config,
)

# ---------------------------------------------------------------------------
# 8. FastAPI server
# ---------------------------------------------------------------------------
server = VannaFastAPIServer(agent)
app = server.create_app()

# Remove Vanna's default "/" route so our custom template takes precedence
app.routes[:] = [r for r in app.routes if not (hasattr(r, "path") and r.path == "/" and hasattr(r, "methods") and "GET" in r.methods)]

@app.get("/", response_class=HTMLResponse)
async def custom_index():
    template_path = _HERE / "templates" / "index.html"
    return template_path.read_text(encoding="utf-8")

# Serve static assets (logo, favicon, etc.)
_TEMPLATES_DIR = _HERE / "templates"
app.mount("/static", StaticFiles(directory=str(_TEMPLATES_DIR)), name="static")

@app.get("/favicon.ico")
async def favicon():
    favicon_path = _HERE / "templates" / "favicon.svg"
    if favicon_path.exists():
        return FileResponse(str(favicon_path), media_type="image/svg+xml")
    return HTMLResponse("")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8084)
