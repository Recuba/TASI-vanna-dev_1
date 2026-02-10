# Data Freshness Assessment

**Date:** 2026-02-10
**Status:** Mixed -- static CSV snapshot for Vanna queries, live yfinance for index charts

---

## 1. Current Data Architecture

```
                     DATA FLOW DIAGRAM
                     =================

  saudi_stocks_yahoo_data.csv (one-time fetch, ~Feb 2026)
          |
          v
  csv_to_sqlite.py / csv_to_postgres.py
          |
          v
  +-----------------------+
  | SQLite / PostgreSQL   |  <-- STATIC: 10 normalized tables
  | (companies,           |      500 tickers, 11,263 rows
  |  market_data,         |      Financial periods: FY2021-FY2024 (annual)
  |  balance_sheet,       |                         Q0-Q3 ~2025 (quarterly)
  |  income_statement,    |      Price data: single snapshot, NOT updated
  |  cash_flow, ...)      |
  +-----------------------+
          |
          v
  Vanna AI (text-to-SQL)  --> Returns STALE data from static DB
          |
          v
  User sees static prices, static financials


  yfinance API (live, on-demand)
          |
          v
  services/tasi_index.py  --> 5-min in-memory cache, circuit breaker
          |
          v
  /api/v1/charts/tasi/index  --> Returns LIVE TASI index OHLCV
          |
          v
  TradingView candlestick charts on frontend
```

### The Staleness Gap

When a user asks Vanna "What is the current price of SABIC?", the system:
1. Generates SQL: `SELECT current_price FROM market_data WHERE ticker = '2010.SR'`
2. Returns the price snapshot from the CSV fetch date (~early Feb 2026)
3. This price is NOT live -- it was frozen at CSV extraction time

Meanwhile, the TradingView charts on the market page show live TASI index data
fetched in real-time via yfinance. This creates user confusion: charts show
today's prices while Vanna reports stale prices from the database.

---

## 2. CSV Data Staleness

**File:** `saudi_stocks_yahoo_data.csv` (501 lines: 1 header + 500 tickers)

### Date Evidence

Examining date columns across multiple tickers:

| Field | Example Value | Meaning |
|-------|--------------|---------|
| `ex_dividend_date` (1020.SR) | 2026-02-09 | Yesterday -- CSV fetched very recently |
| `most_recent_quarter` | 2025-09-30 | Q3 2025 is latest quarterly data |
| `last_fiscal_year_end` | 2024-12-31 | FY 2024 is latest annual data |
| `bs_q0_date` | 2025-06-30 | Most recent quarterly balance sheet |
| `is_ttm_date` | 2025-09-30 | TTM income statement through Q3 2025 |
| `cf_ttm_date` | 2025-09-30 | TTM cash flow through Q3 2025 |
| `bs_y0_date` | 2024-12-31 | Most recent annual balance sheet |

### Conclusions

- **CSV fetch date:** Approximately early February 2026 (based on ex-dividend dates)
- **Price data:** Single point-in-time snapshot from the fetch date; NOT updated
- **Financial statements:** Quarterly data up to Q3 2025 (6 months old for some companies); Annual data up to FY 2024 (14 months old)
- **TTM data:** Trailing twelve months through Q3 2025
- **Coverage:** Some smaller companies have NO financial statement data at all (empty columns), e.g., 9650.SR, 9651.SR

---

## 3. Vanna Query Freshness

**Source:** `app.py` lines 106-324 (SYSTEM_PROMPT)

The system prompt tells the LLM about all 10 database tables but provides NO
warning about data staleness. When Vanna generates SQL queries:

- `market_data.current_price` -- stale (snapshot from CSV fetch date)
- `market_data.volume` -- stale (daily volume from a single day)
- `market_data.market_cap` -- stale
- `balance_sheet`, `income_statement`, `cash_flow` -- reasonably fresh for fundamental analysis (Q3 2025 quarterly, FY2024 annual)
- `analyst_data.recommendation` -- stale (snapshot)
- `dividend_data.dividend_yield` -- stale (uses snapshot price)

**Key risk:** Users expect "current price" to mean today's price. The database
column is literally named `current_price`, reinforcing this misconception.

---

## 4. TASI Index (Live Data)

**Source:** `services/tasi_index.py` + `api/routes/tasi_index.py`

The TASI index endpoint is the ONLY live data source currently operational:

- **Symbols tried:** `^TASI` (primary), `TASI.SR` (fallback)
- **Cache TTL:** 300 seconds (5 minutes), thread-safe with `threading.Lock`
- **Circuit breaker:** Opens after 5 consecutive failures, 15-minute cooldown
- **Fallback chain:** Fresh cache -> yfinance -> Stale cache -> Deterministic mock
- **`.SR` suffix:** Works for Saudi stocks via yfinance (confirmed in code)

This endpoint serves the TradingView charts on the market overview page. It does
NOT serve per-stock price data -- only the TASI index.

---

## 5. Ingestion Pipeline Assessment

### 5.1 ingestion/config.py -- OPERATIONAL (utility)

| Attribute | Value |
|-----------|-------|
| **Purpose** | Configuration dataclass for batch size, rate limits, retries |
| **Status** | Operational utility class, used by price_loader and scheduler |
| **Data source** | N/A (configuration only) |
| **Error handling** | Environment variable fallback defaults |
| **Scheduling** | N/A |

### 5.2 ingestion/validators.py -- OPERATIONAL (utility)

| Attribute | Value |
|-----------|-------|
| **Purpose** | Validation functions for price data, XBRL facts, ticker format |
| **Status** | Operational utility module; all functions are complete and testable |
| **Data source** | N/A (validation only) |
| **Error handling** | Returns lists of error strings |
| **Scheduling** | N/A |

### 5.3 ingestion/price_loader.py -- BUILT, NEVER RUN IN PRODUCTION

| Attribute | Value |
|-----------|-------|
| **Purpose** | Fetch daily OHLCV prices via yfinance into `price_history` PG table |
| **Status** | Fully implemented (~670 lines), CLI-ready, but never deployed |
| **Data source** | yfinance (`.SR` suffix tickers) or CSV files |
| **Error handling** | Exponential backoff, batch processing, partial failure handling, NaN/Inf cleanup |
| **Scheduling** | Designed for scheduler.py (daily at 17:00), also runnable via CLI |
| **Database target** | PostgreSQL `price_history` table (not SQLite) |
| **Why not running** | No `price_history` table in SQLite schema; PG deployment not active; no `data/` directory exists |

Key features that ARE implemented:
- Batch processing with configurable size (default: 10 tickers per batch)
- Rate limiting between batches (default: 2s sleep)
- ON CONFLICT DO NOTHING for incremental/idempotent loads
- CSV import mode (single file or directory)
- Dry run mode
- Change amount/percentage computation

### 5.4 ingestion/xbrl_processor.py -- BUILT, NEVER RUN IN PRODUCTION

| Attribute | Value |
|-----------|-------|
| **Purpose** | Parse XBRL XML filings and Excel workbooks into `xbrl_facts` PG table |
| **Status** | Fully implemented (~1190 lines), supports XML (lxml) and Excel (openpyxl) |
| **Data source** | XBRL XML filings, Excel workbooks, or URLs |
| **Error handling** | Per-file error tracking, SHA-256 content hash dedup, filing status tracking |
| **Scheduling** | Designed for scheduler.py (weekly Friday at 20:00) |
| **Database target** | PostgreSQL `xbrl_facts` and `filings` tables |
| **Why not running** | No `data/filings/` directory exists; no XBRL filing sources configured; PG not active |

Key features that ARE implemented:
- IFRS taxonomy awareness (28 concept mappings)
- Arabic text detection
- Context/period parsing from XBRL elements
- URL download capability
- Batch insert with dedup by content_hash

### 5.5 ingestion/scheduler.py -- BUILT, NEVER RUN IN PRODUCTION

| Attribute | Value |
|-----------|-------|
| **Purpose** | APScheduler-based cron scheduler for automated data loading |
| **Status** | Fully implemented, but never deployed |
| **Schedule** | Price loader: daily 17:00 (after Saudi market close); XBRL: weekly Friday 20:00 |
| **Data source** | Orchestrates price_loader and xbrl_processor |
| **Error handling** | Signal handlers (SIGINT/SIGTERM), per-job try/finally with connection cleanup |
| **Why not running** | Requires PostgreSQL; not containerized; not referenced in Docker setup |

---

## 6. Per-Stock yfinance Capability

From `services/tasi_index.py` lines 215-216, the code tries two symbols:
```python
symbols = ["^TASI", "TASI.SR"]
```

The `.SR` suffix is the standard yfinance convention for Tadawul-listed stocks.
For individual stocks, the format is `{4-digit-number}.SR` (e.g., `2222.SR` for
Saudi Aramco, `1010.SR` for Riyad Bank). This is the same format used in the
database `ticker` column and the CSV.

The `ingestion/price_loader.py` already uses this format correctly:
```python
cur.execute("SELECT ticker FROM companies WHERE ticker LIKE %s", ("%.SR",))
```

yfinance `.SR` support for Saudi stocks is functional -- the entire CSV was
originally sourced from yfinance using these exact tickers.

---

## 7. Risk Summary

| Risk | Severity | Description |
|------|----------|-------------|
| **Stale price confusion** | HIGH | Vanna returns `current_price` from static DB while charts show live data |
| **No automated refresh** | HIGH | CSV loaded once; no recurring pipeline running |
| **User trust erosion** | MEDIUM | Financial professionals will notice stale prices immediately |
| **Missing price_history** | MEDIUM | SQLite schema has no `price_history` table; ingestion pipeline only targets PG |
| **XBRL never used** | LOW | Built but blocked on: no filing sources, no PG deployment |
| **TTM data aging** | LOW | TTM through Q3 2025 is acceptable for fundamental analysis |

---

## 8. Recommended Strategy

### Short Term (this week)

1. **Add staleness disclaimer to system prompt:** Update `SYSTEM_PROMPT` in
   `app.py` to warn the LLM that `market_data` prices are snapshots, not live.
   The LLM should caveat price queries with the data date.

2. **Rename misleading columns:** Consider renaming `current_price` to
   `snapshot_price` or adding a `data_as_of` column to `market_data`.

3. **Wire per-stock OHLCV endpoint:** The stock OHLCV endpoint (task #2) will
   provide live per-stock prices via yfinance, similar to the TASI index
   endpoint. This closes the gap for chart data.

### Medium Term (1-2 weeks)

4. **Deploy PostgreSQL + price_history pipeline:** The ingestion modules are
   fully built. To activate them:
   - Deploy with `DB_BACKEND=postgres`
   - Run `price_loader.py --all --from-date 2024-01-01` for initial backfill
   - Start `scheduler.py` to run daily at 17:00

5. **Add "live price" tool to Vanna:** Register a new Vanna tool that fetches
   real-time price from yfinance when the user asks about current prices,
   instead of querying the static database.

6. **Re-fetch CSV periodically:** Run the original Yahoo Finance scraper
   monthly to refresh fundamental data, analyst ratings, and financial summaries.

### Long Term (1+ month)

7. **Hybrid query routing:** Teach the system prompt to route price queries to
   the live yfinance tool and fundamental queries to the database. This gives
   users real-time prices AND historical financial data.

8. **XBRL pipeline activation:** Source XBRL filings from Tadawul/CMA
   disclosure portal. The processor is ready; it needs filing URLs and a
   scheduled scraper to discover new filings.

9. **Data freshness metadata:** Add a `data_sources` table tracking when each
   table was last refreshed, and expose this in the UI so users know how fresh
   their answers are.

---

## 9. Ingestion Pipeline Dependency Map

```
CURRENTLY RUNNING:
  services/tasi_index.py  -->  /api/v1/charts/tasi/index  (LIVE, yfinance)

BUILT BUT NOT RUNNING (requires PostgreSQL):
  ingestion/scheduler.py
      |
      +-- job_load_prices()  -->  ingestion/price_loader.py  -->  price_history table
      |                              uses: yfinance, ingestion/config.py
      |                              validates: ingestion/validators.py
      |
      +-- job_process_xbrl() -->  ingestion/xbrl_processor.py  -->  xbrl_facts table
                                     uses: lxml, openpyxl, requests
                                     needs: data/filings/ directory (does not exist)

NOT BUILT:
  - Per-stock live price tool for Vanna (planned)
  - Automated CSV re-fetch pipeline
  - Tadawul filing scraper/discovery
```
