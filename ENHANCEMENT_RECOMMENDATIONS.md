# Enhancement Recommendations for Ra'd AI (TASI Vanna 2.0)

Comprehensive analysis of the repository with practical, significant enhancements ranked by impact.

---

## 1. Custom Stock Screener Tool (HIGH IMPACT)

**Problem:** The agent only has `RunSqlTool` and `VisualizeDataTool`. Users must know what SQL to ask for. There's no structured way to do multi-criteria stock screening — the most common task for equity analysts.

**Recommendation:** Build a custom `StockScreenerTool` that accepts structured filters (sector, P/E range, market cap range, dividend yield threshold, growth rate, etc.) and returns matching companies with a summary table.

```python
class ScreenerArgs(BaseModel):
    sector: Optional[str] = Field(None, description="Filter by sector")
    min_market_cap: Optional[float] = Field(None, description="Minimum market cap in SAR")
    max_pe: Optional[float] = Field(None, description="Maximum trailing P/E ratio")
    min_dividend_yield: Optional[float] = Field(None, description="Minimum dividend yield")
    min_roe: Optional[float] = Field(None, description="Minimum return on equity")
    sort_by: str = Field("market_cap", description="Column to sort results by")
    limit: int = Field(20, description="Max results to return")

class StockScreenerTool(Tool[ScreenerArgs]):
    # Builds and executes a multi-table JOIN with WHERE clauses
    # Returns formatted table + summary statistics
```

**Why it matters:** This gives the LLM a structured, reliable way to answer screening questions ("Show me undervalued banks with high dividends") without generating ad-hoc SQL that might miss joins or columns. It reduces LLM errors and improves response quality for the #1 use case.

**Files to modify:** `app.py` (register new tool), new file `tools/stock_screener.py`

---

## 2. Arabic Language Support in System Prompt and UI (HIGH IMPACT)

**Problem:** This is a Saudi stock market tool, but the system prompt, query tips, and all AI responses are English-only. The UI uses Tajawal (an Arabic-friendly font) but has zero Arabic content. Saudi users would benefit enormously from bilingual support.

**Recommendation:**
- Add Arabic instructions to the system prompt so the LLM responds in Arabic when the user writes in Arabic
- Add bilingual suggestion chips (Arabic + English)
- Add an Arabic/English toggle in the UI header
- Add company name aliases in Arabic to the `companies` table (many Saudi users know companies by Arabic names)

**System prompt addition:**
```
LANGUAGE
========
- If the user writes in Arabic, respond in Arabic.
- If the user writes in English, respond in English.
- Always keep SQL in English (column/table names are English).
- When showing company names, include both English and Arabic names if available.
```

**Database enhancement:** Add `name_ar` column to `companies` table with Arabic company names (e.g., "أرامكو السعودية" for Saudi Aramco).

**Why it matters:** The primary user base is Saudi. Arabic support transforms this from a developer demo to a tool real Saudi analysts would actually use.

**Files to modify:** `app.py` (system prompt), `templates/index.html` (UI), `csv_to_sqlite.py` (if adding Arabic names)

---

## 3. Persistent Conversation Storage with SQLite (MEDIUM-HIGH IMPACT)

**Problem:** `DemoAgentMemory(max_items=10000)` stores everything in memory. All conversation history is lost on every server restart. This means users can't reference previous queries, and there's no way to analyze usage patterns.

**Recommendation:** Implement `SqliteConversationStorage` that writes conversations to a `conversations` table in a separate SQLite file (not the stock data DB). Vanna 2.0's `ConversationStorage` interface supports this directly.

```python
class SqliteConversationStorage(ConversationStorage):
    def __init__(self, db_path: str):
        self.db_path = db_path
        self._init_db()

    def _init_db(self):
        conn = sqlite3.connect(self.db_path)
        try:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS conversations (
                    id TEXT PRIMARY KEY,
                    user_id TEXT,
                    messages TEXT,  -- JSON
                    created_at TEXT DEFAULT (datetime('now')),
                    updated_at TEXT DEFAULT (datetime('now'))
                )
            """)
            conn.commit()
        finally:
            conn.close()

    async def save(self, conversation_id, messages):
        # Insert/update conversation
    async def load(self, conversation_id):
        # Retrieve conversation history
```

**Why it matters:** Persistent history enables conversation continuity across sessions, usage analytics, and the foundation for a "saved queries" feature. It's also required for any production deployment.

**Files to modify:** `app.py` (swap DemoAgentMemory), new file `storage.py`

---

## 4. SQL Validation Pre-Execution Hook (MEDIUM-HIGH IMPACT)

**Problem:** LLM-generated SQL is executed directly against the database with no validation. While SQLite is read-only by nature of the data, there's no guard against:
- Extremely expensive queries (full cross-joins on financial tables: 2600 × 2600 × 2600 rows)
- Queries that don't use the schema correctly (e.g., joining on wrong columns)
- DROP/INSERT/UPDATE statements (if the DB file permissions allow writes)

**Recommendation:** Add a pre-execution hook that validates SQL before running:

```python
async def sql_safety_hook(context):
    # 1. Block DDL/DML statements (only allow SELECT)
    # 2. Require LIMIT clause on queries touching financial tables
    # 3. Warn on queries without WHERE clause on large tables
    # 4. Block CROSS JOINs and cartesian products
    # 5. Set SQLite query timeout (PRAGMA busy_timeout)
```

Also open the database connection in read-only mode:
```python
sql_runner = SqliteRunner(str(_HERE / "saudi_stocks.db") + "?mode=ro")
```

**Why it matters:** Defense in depth. Even though the LLM *usually* generates correct SQL, one bad query can hang the server or corrupt data. This is table stakes for any production deployment.

**Files to modify:** `app.py` (add hook to AgentConfig, change DB connection mode)

---

## 5. Computed Analytical Views (MEDIUM IMPACT)

**Problem:** Common analytical queries require complex multi-table JOINs every time. The LLM must reconstruct these joins for every question, increasing latency and error probability.

**Recommendation:** Add pre-computed SQLite views for the most common analysis patterns:

```sql
-- Comprehensive stock overview (joins 7 tables)
CREATE VIEW v_stock_overview AS
SELECT
    c.ticker, c.short_name, c.sector, c.industry,
    m.current_price, m.market_cap, m.beta,
    v.trailing_pe, v.forward_pe, v.price_to_book,
    p.roe, p.profit_margin, p.revenue_growth,
    d.dividend_yield, d.payout_ratio,
    f.total_revenue, f.total_debt, f.debt_to_equity,
    a.recommendation, a.target_mean_price,
    ROUND((a.target_mean_price - m.current_price) / m.current_price * 100, 2) AS upside_pct
FROM companies c
LEFT JOIN market_data m ON c.ticker = m.ticker
LEFT JOIN valuation_metrics v ON c.ticker = v.ticker
LEFT JOIN profitability_metrics p ON c.ticker = p.ticker
LEFT JOIN dividend_data d ON c.ticker = d.ticker
LEFT JOIN financial_summary f ON c.ticker = f.ticker
LEFT JOIN analyst_data a ON c.ticker = a.ticker;

-- Latest annual financials per company
CREATE VIEW v_latest_annual_financials AS
SELECT bs.ticker, bs.period_date,
    bs.total_assets, bs.total_liabilities_net_minority_interest,
    bs.stockholders_equity, bs.total_debt, bs.net_debt,
    i.total_revenue, i.gross_profit, i.operating_income, i.net_income,
    cf.operating_cash_flow, cf.free_cash_flow, cf.capital_expenditure
FROM balance_sheet bs
JOIN income_statement i ON bs.ticker = i.ticker
    AND i.period_type = 'annual' AND i.period_index = 0
JOIN cash_flow cf ON bs.ticker = cf.ticker
    AND cf.period_type = 'annual' AND cf.period_index = 0
WHERE bs.period_type = 'annual' AND bs.period_index = 0;

-- Sector aggregates
CREATE VIEW v_sector_summary AS
SELECT c.sector,
    COUNT(*) AS company_count,
    ROUND(AVG(v.trailing_pe), 2) AS avg_pe,
    ROUND(AVG(p.roe), 4) AS avg_roe,
    ROUND(SUM(m.market_cap), 0) AS total_market_cap,
    ROUND(AVG(d.dividend_yield), 4) AS avg_dividend_yield
FROM companies c
LEFT JOIN valuation_metrics v ON c.ticker = v.ticker
LEFT JOIN profitability_metrics p ON c.ticker = p.ticker
LEFT JOIN market_data m ON c.ticker = m.ticker
LEFT JOIN dividend_data d ON c.ticker = d.ticker
GROUP BY c.sector;
```

**Then document them in the system prompt** so the LLM uses `v_stock_overview` instead of writing 7-table joins.

**Why it matters:** Reduces LLM token usage (shorter SQL), reduces errors (no missed joins), and makes queries faster. The `upside_pct` computed column in `v_stock_overview` is especially valuable — it's one of the most asked-for metrics.

**Files to modify:** `csv_to_sqlite.py` (create views after tables), `app.py` (document views in system prompt)

---

## 6. Cross-Platform Test Portability (MEDIUM IMPACT)

**Problem:** Both test files have hardcoded Windows paths:
```python
DB_PATH = r"C:\Users\...\saudi_stocks.db"  # Windows-only
```
Tests fail on Linux/macOS/CI without manual path editing. This is explicitly called out in CLAUDE.md as a known gotcha but hasn't been fixed.

**Recommendation:** Use the same script-relative path pattern as `app.py`:

```python
from pathlib import Path
_HERE = Path(__file__).resolve().parent
DB_PATH = str(_HERE / "saudi_stocks.db")
```

**Why it matters:** Tests that don't run on CI are tests that don't run. This is a quick fix that unblocks automated testing on any platform.

**Files to modify:** `test_database.py`, `test_app_assembly_v2.py`

---

## 7. Lifecycle Hooks for Audit Logging and Usage Tracking (MEDIUM IMPACT)

**Problem:** No audit trail exists. There's no record of what queries users asked, what SQL was generated, whether it succeeded, or how long it took. This is a missed opportunity for both security and product improvement.

**Recommendation:** Implement pre/post execution hooks using Vanna 2.0's built-in hook system:

```python
import logging
from datetime import datetime

query_log = []  # or write to SQLite/file

async def log_query_start(context):
    context.metadata = {"start_time": datetime.utcnow()}
    logging.info(f"Query from {context.user.id}: {context.message}")

async def log_query_complete(context, result):
    elapsed = (datetime.utcnow() - context.metadata["start_time"]).total_seconds()
    logging.info(f"Query completed in {elapsed:.2f}s, tokens: {result.token_usage}")
    # Write to audit table for analytics

config = AgentConfig(
    stream_responses=True,
    max_tool_iterations=10,
    pre_execution_hooks=[log_query_start],
    post_execution_hooks=[log_query_complete],
)
```

**Why it matters:** Audit logging is a prerequisite for understanding usage, debugging production issues, and satisfying compliance requirements. The hook system makes this trivial to add.

**Files to modify:** `app.py`

---

## 8. Enhanced System Prompt with Example Queries (MEDIUM IMPACT)

**Problem:** The current system prompt is a comprehensive schema reference (242 lines), but it lacks:
- Example SQL queries for common patterns
- Saudi-specific financial context (e.g., Zakat vs income tax, Sukuk vs bonds)
- Guidance on handling NULL values (71% financial statement coverage means many NULLs)
- Instructions for presenting monetary values (SAR formatting)

**Recommendation:** Add these sections to the system prompt:

```
EXAMPLE QUERIES
===============
-- Top 10 companies by market cap:
SELECT c.ticker, c.short_name, c.sector, m.market_cap
FROM companies c JOIN market_data m ON c.ticker = m.ticker
ORDER BY m.market_cap DESC LIMIT 10;

-- Year-over-year revenue growth for a company:
SELECT period_date, total_revenue
FROM income_statement
WHERE ticker = '2222.SR' AND period_type = 'annual'
ORDER BY period_index ASC;

-- Sector comparison:
SELECT c.sector, COUNT(*) as companies,
    ROUND(AVG(v.trailing_pe),1) as avg_pe
FROM companies c JOIN valuation_metrics v ON c.ticker = v.ticker
GROUP BY c.sector ORDER BY avg_pe;

SAUDI MARKET CONTEXT
====================
- Currency is Saudi Riyal (SAR). 1 USD ≈ 3.75 SAR.
- TASI = Tadawul All Share Index (Saudi Arabia's main stock index).
- Companies pay Zakat (Islamic tax) instead of corporate income tax.
- '2222.SR' is Saudi Aramco, the world's largest oil company.
- Financial sector includes Islamic banks (Shariah-compliant).
- Format large SAR values with commas (e.g., SAR 1,234,567).

NULL HANDLING
=============
- ~29% of companies lack financial statements. When a user asks about
  a specific company, check if data exists before drawing conclusions.
- Use COALESCE or explicit NULL checks in aggregations.
```

**Why it matters:** Example queries dramatically reduce SQL generation errors — they serve as few-shot examples for the LLM. Saudi market context prevents culturally incorrect responses.

**Files to modify:** `app.py` (SYSTEM_PROMPT string)

---

## 9. Error Recovery and Retry Logic in the Frontend (LOW-MEDIUM IMPACT)

**Problem:** The frontend has no error handling for:
- SSE connection drops (network issues)
- LLM API rate limits or timeouts
- Server restarts during a conversation
- Failed chart rendering

The `<vanna-chat>` component silently fails, and the only fallback is a static message shown if the component doesn't load at all.

**Recommendation:**
- Add SSE reconnection logic with exponential backoff
- Show user-friendly error messages for common failures
- Add a "retry" button for failed queries
- Add a connection status indicator (currently the green dot is hardcoded, not reflecting real connection state)

```javascript
// Monitor vanna-chat for errors
const chat = document.querySelector('vanna-chat');
chat.addEventListener('error', (e) => {
    showErrorToast('Connection lost. Reconnecting...');
    setTimeout(() => chat.reconnect(), 2000);
});
```

**Files to modify:** `templates/index.html`

---

## 10. Add a `requirements.txt` or `pyproject.toml` (LOW-MEDIUM IMPACT)

**Problem:** There is no dependency file. The README/AGENTS.md mentions `pip install vanna fastapi uvicorn python-dotenv` but doesn't pin versions. Key gotcha: FastAPI must be 0.115.6+ (older versions cause Starlette middleware errors), but this constraint isn't captured anywhere machine-readable.

**Recommendation:** Add `requirements.txt`:

```
vanna>=2.0.2
fastapi>=0.115.6
uvicorn>=0.34.0
python-dotenv>=1.0.0
pandas>=2.0.0
numpy>=1.24.0
```

Or better, a `pyproject.toml` with a `[project.dependencies]` section for modern Python packaging.

**Files to create:** `requirements.txt`

---

## Summary: Prioritized Roadmap

| # | Enhancement | Impact | Effort | Priority |
|---|------------|--------|--------|----------|
| 1 | Stock Screener Tool | High | Medium | **P0** |
| 2 | Arabic Language Support | High | Medium | **P0** |
| 3 | Persistent Conversation Storage | Medium-High | Low | **P1** |
| 4 | SQL Validation Hook | Medium-High | Low | **P1** |
| 5 | Computed Analytical Views | Medium | Low | **P1** |
| 6 | Cross-Platform Test Paths | Medium | Trivial | **P1** |
| 7 | Audit Logging Hooks | Medium | Low | **P2** |
| 8 | Enhanced System Prompt | Medium | Low | **P2** |
| 9 | Frontend Error Recovery | Low-Medium | Medium | **P2** |
| 10 | requirements.txt | Low-Medium | Trivial | **P2** |

**Quick wins (can be done in under an hour each):** #6, #10, #4, #5
**Highest ROI:** #1 (Stock Screener) and #2 (Arabic) fundamentally change the product's utility for Saudi analysts.
