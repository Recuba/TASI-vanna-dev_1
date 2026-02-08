-- =============================================================================
-- Ra'd AI - TASI Saudi Stock Market Platform
-- PostgreSQL Schema
-- =============================================================================
-- This schema preserves all 10 existing SQLite tables with IDENTICAL column
-- names and adds new tables for XBRL data, price history, news/announcements,
-- user management, and audit logging.
--
-- Type mapping from SQLite:
--   REAL          -> NUMERIC(20,4)    (financial precision)
--   INTEGER       -> BIGINT           (volumes, counts)
--   AUTOINCREMENT -> SERIAL           (migrated tables)
--   TEXT          -> TEXT             (unchanged)
--
-- New tables use UUID primary keys via uuid-ossp extension.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ===========================================================================
-- SECTION 1: Existing SQLite Tables (10 tables, identical column names)
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- companies (core company info, 500 rows)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS companies (
    ticker                  TEXT PRIMARY KEY,
    short_name              TEXT,
    sector                  TEXT,
    industry                TEXT,
    exchange                TEXT,
    quote_type              TEXT,
    currency                TEXT,
    financial_currency      TEXT,
    market                  TEXT
);

-- ---------------------------------------------------------------------------
-- market_data (price / volume / shares, 1 row per ticker)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS market_data (
    ticker                      TEXT PRIMARY KEY REFERENCES companies(ticker),
    current_price               NUMERIC(20,4),
    previous_close              NUMERIC(20,4),
    open_price                  NUMERIC(20,4),
    day_high                    NUMERIC(20,4),
    day_low                     NUMERIC(20,4),
    week_52_high                NUMERIC(20,4),
    week_52_low                 NUMERIC(20,4),
    avg_50d                     NUMERIC(20,4),
    avg_200d                    NUMERIC(20,4),
    volume                      BIGINT,
    avg_volume                  BIGINT,
    avg_volume_10d              BIGINT,
    beta                        NUMERIC(20,4),
    market_cap                  NUMERIC(20,4),
    shares_outstanding          NUMERIC(20,4),
    float_shares                NUMERIC(20,4),
    implied_shares_outstanding  NUMERIC(20,4),
    pct_held_insiders           NUMERIC(20,4),
    pct_held_institutions       NUMERIC(20,4)
);

-- ---------------------------------------------------------------------------
-- valuation_metrics (PE, PB, EV ratios, 1 row per ticker)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS valuation_metrics (
    ticker              TEXT PRIMARY KEY REFERENCES companies(ticker),
    trailing_pe         NUMERIC(20,4),
    forward_pe          NUMERIC(20,4),
    price_to_book       NUMERIC(20,4),
    price_to_sales      NUMERIC(20,4),
    enterprise_value    NUMERIC(20,4),
    ev_to_revenue       NUMERIC(20,4),
    ev_to_ebitda        NUMERIC(20,4),
    peg_ratio           NUMERIC(20,4),
    trailing_eps        NUMERIC(20,4),
    forward_eps         NUMERIC(20,4),
    book_value          NUMERIC(20,4),
    revenue_per_share   NUMERIC(20,4)
);

-- ---------------------------------------------------------------------------
-- profitability_metrics (margins, growth, 1 row per ticker)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS profitability_metrics (
    ticker                      TEXT PRIMARY KEY REFERENCES companies(ticker),
    roa                         NUMERIC(20,4),
    roe                         NUMERIC(20,4),
    profit_margin               NUMERIC(20,4),
    operating_margin            NUMERIC(20,4),
    gross_margin                NUMERIC(20,4),
    ebitda_margin               NUMERIC(20,4),
    earnings_growth             NUMERIC(20,4),
    revenue_growth              NUMERIC(20,4),
    earnings_quarterly_growth   NUMERIC(20,4)
);

-- ---------------------------------------------------------------------------
-- dividend_data (dividends, 1 row per ticker)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dividend_data (
    ticker                          TEXT PRIMARY KEY REFERENCES companies(ticker),
    dividend_rate                   NUMERIC(20,4),
    dividend_yield                  NUMERIC(20,4),
    ex_dividend_date                TEXT,
    payout_ratio                    NUMERIC(20,4),
    avg_dividend_yield_5y           NUMERIC(20,4),
    last_dividend_value             NUMERIC(20,4),
    last_dividend_date              TEXT,
    trailing_annual_dividend_rate   NUMERIC(20,4),
    trailing_annual_dividend_yield  NUMERIC(20,4)
);

-- ---------------------------------------------------------------------------
-- financial_summary (key financial aggregates, 1 row per ticker)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS financial_summary (
    ticker                  TEXT PRIMARY KEY REFERENCES companies(ticker),
    total_revenue           NUMERIC(20,4),
    total_cash              NUMERIC(20,4),
    total_cash_per_share    NUMERIC(20,4),
    total_debt              NUMERIC(20,4),
    debt_to_equity          NUMERIC(20,4),
    current_ratio           NUMERIC(20,4),
    quick_ratio             NUMERIC(20,4),
    operating_cashflow      NUMERIC(20,4),
    free_cashflow           NUMERIC(20,4),
    ebitda                  NUMERIC(20,4),
    gross_profits           NUMERIC(20,4),
    net_income_to_common    NUMERIC(20,4)
);

-- ---------------------------------------------------------------------------
-- analyst_data (targets, recommendations, 1 row per ticker)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS analyst_data (
    ticker                  TEXT PRIMARY KEY REFERENCES companies(ticker),
    target_mean_price       NUMERIC(20,4),
    target_high_price       NUMERIC(20,4),
    target_low_price        NUMERIC(20,4),
    target_median_price     NUMERIC(20,4),
    analyst_count           BIGINT,
    recommendation          TEXT,
    recommendation_score    NUMERIC(20,4),
    most_recent_quarter     TEXT,
    last_fiscal_year_end    TEXT
);

-- ---------------------------------------------------------------------------
-- balance_sheet (unpivoted, multiple rows per ticker)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS balance_sheet (
    id                                              SERIAL PRIMARY KEY,
    ticker                                          TEXT REFERENCES companies(ticker),
    period_type                                     TEXT,
    period_index                                    INTEGER,
    period_date                                     TEXT,
    total_assets                                    NUMERIC(20,4),
    current_assets                                  NUMERIC(20,4),
    cash_and_cash_equivalents                       NUMERIC(20,4),
    cash_cash_equivalents_and_short_term_investments NUMERIC(20,4),
    accounts_receivable                             NUMERIC(20,4),
    inventory                                       NUMERIC(20,4),
    other_current_assets                            NUMERIC(20,4),
    total_non_current_assets                        NUMERIC(20,4),
    net_ppe                                         NUMERIC(20,4),
    goodwill_and_other_intangible_assets            NUMERIC(20,4),
    goodwill                                        NUMERIC(20,4),
    other_intangible_assets                         NUMERIC(20,4),
    long_term_equity_investment                     NUMERIC(20,4),
    other_non_current_assets                        NUMERIC(20,4),
    total_liabilities_net_minority_interest          NUMERIC(20,4),
    current_liabilities                             NUMERIC(20,4),
    current_debt                                    NUMERIC(20,4),
    accounts_payable                                NUMERIC(20,4),
    other_current_liabilities                       NUMERIC(20,4),
    total_non_current_liabilities_net_minority_interest NUMERIC(20,4),
    long_term_debt                                  NUMERIC(20,4),
    long_term_capital_lease_obligation              NUMERIC(20,4),
    capital_lease_obligations                       NUMERIC(20,4),
    other_non_current_liabilities                   NUMERIC(20,4),
    total_equity_gross_minority_interest            NUMERIC(20,4),
    stockholders_equity                             NUMERIC(20,4),
    common_stock_equity                             NUMERIC(20,4),
    retained_earnings                               NUMERIC(20,4),
    common_stock                                    NUMERIC(20,4),
    additional_paid_in_capital                      NUMERIC(20,4),
    treasury_stock                                  NUMERIC(20,4),
    minority_interest                               NUMERIC(20,4),
    total_capitalization                            NUMERIC(20,4),
    net_tangible_assets                             NUMERIC(20,4),
    working_capital                                 NUMERIC(20,4),
    invested_capital                                NUMERIC(20,4),
    tangible_book_value                             NUMERIC(20,4),
    total_debt                                      NUMERIC(20,4),
    net_debt                                        NUMERIC(20,4),
    share_issued                                    NUMERIC(20,4),
    ordinary_shares_number                          NUMERIC(20,4),
    treasury_shares_number                          NUMERIC(20,4)
);

-- ---------------------------------------------------------------------------
-- income_statement (unpivoted, multiple rows per ticker)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS income_statement (
    id                                          SERIAL PRIMARY KEY,
    ticker                                      TEXT REFERENCES companies(ticker),
    period_type                                 TEXT,
    period_index                                INTEGER,
    period_date                                 TEXT,
    total_revenue                               NUMERIC(20,4),
    operating_revenue                           NUMERIC(20,4),
    cost_of_revenue                             NUMERIC(20,4),
    gross_profit                                NUMERIC(20,4),
    operating_expense                           NUMERIC(20,4),
    selling_general_and_administration          NUMERIC(20,4),
    general_and_administrative_expense          NUMERIC(20,4),
    research_and_development                    NUMERIC(20,4),
    operating_income                            NUMERIC(20,4),
    net_non_operating_interest_income_expense   NUMERIC(20,4),
    interest_income                             NUMERIC(20,4),
    interest_expense                            NUMERIC(20,4),
    other_non_operating_income_expenses         NUMERIC(20,4),
    pretax_income                               NUMERIC(20,4),
    tax_provision                               NUMERIC(20,4),
    tax_rate_for_calcs                          NUMERIC(20,4),
    net_income                                  NUMERIC(20,4),
    net_income_common_stockholders              NUMERIC(20,4),
    net_income_continuous_operations            NUMERIC(20,4),
    net_income_including_noncontrolling_interests NUMERIC(20,4),
    diluted_eps                                 NUMERIC(20,4),
    basic_eps                                   NUMERIC(20,4),
    diluted_average_shares                      NUMERIC(20,4),
    basic_average_shares                        NUMERIC(20,4),
    ebitda                                      NUMERIC(20,4),
    ebit                                        NUMERIC(20,4),
    reconciled_depreciation                     NUMERIC(20,4),
    total_operating_income_as_reported          NUMERIC(20,4),
    normalized_ebitda                           NUMERIC(20,4),
    normalized_income                           NUMERIC(20,4),
    net_interest_income                         NUMERIC(20,4),
    total_expenses                              NUMERIC(20,4),
    minority_interests                          NUMERIC(20,4)
);

-- ---------------------------------------------------------------------------
-- cash_flow (unpivoted, multiple rows per ticker)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cash_flow (
    id                                  SERIAL PRIMARY KEY,
    ticker                              TEXT REFERENCES companies(ticker),
    period_type                         TEXT,
    period_index                        INTEGER,
    period_date                         TEXT,
    operating_cash_flow                 NUMERIC(20,4),
    investing_cash_flow                 NUMERIC(20,4),
    financing_cash_flow                 NUMERIC(20,4),
    free_cash_flow                      NUMERIC(20,4),
    capital_expenditure                 NUMERIC(20,4),
    depreciation_and_amortization       NUMERIC(20,4),
    change_in_working_capital           NUMERIC(20,4),
    change_in_receivables               NUMERIC(20,4),
    change_in_inventory                 NUMERIC(20,4),
    change_in_payable                   NUMERIC(20,4),
    change_in_prepaid_assets            NUMERIC(20,4),
    stock_based_compensation            NUMERIC(20,4),
    net_income_from_continuing_operations NUMERIC(20,4),
    dividends_received_cfi              NUMERIC(20,4),
    interest_paid_cfo                   NUMERIC(20,4),
    interest_received_cfo               NUMERIC(20,4),
    taxes_refund_paid                   NUMERIC(20,4),
    purchase_of_business                NUMERIC(20,4),
    purchase_of_investment              NUMERIC(20,4),
    sale_of_investment                  NUMERIC(20,4),
    net_investment_purchase_and_sale     NUMERIC(20,4),
    purchase_of_ppe                     NUMERIC(20,4),
    sale_of_ppe                         NUMERIC(20,4),
    net_ppe_purchase_and_sale           NUMERIC(20,4),
    issuance_of_debt                    NUMERIC(20,4),
    long_term_debt_issuance             NUMERIC(20,4),
    long_term_debt_payments             NUMERIC(20,4),
    repayment_of_debt                   NUMERIC(20,4),
    issuance_of_capital_stock           NUMERIC(20,4),
    common_stock_issuance               NUMERIC(20,4),
    net_other_financing_charges         NUMERIC(20,4),
    net_other_investing_changes         NUMERIC(20,4),
    beginning_cash_position             NUMERIC(20,4),
    end_cash_position                   NUMERIC(20,4),
    changes_in_cash                     NUMERIC(20,4),
    other_non_cash_items                NUMERIC(20,4)
);


-- ===========================================================================
-- SECTION 2: New Reference Tables
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- sectors (reference table with Arabic/English names)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sectors (
    id          SERIAL PRIMARY KEY,
    name_en     TEXT UNIQUE NOT NULL,
    name_ar     TEXT,
    code        TEXT UNIQUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- entities (enhanced company info with Arabic names, identifiers)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS entities (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticker          TEXT UNIQUE NOT NULL REFERENCES companies(ticker),
    name_ar         TEXT,
    name_en         TEXT,
    sector_id       INTEGER REFERENCES sectors(id),
    listing_date    DATE,
    isin            TEXT UNIQUE,
    cma_id          TEXT,
    tadawul_id      TEXT,
    website         TEXT,
    description_ar  TEXT,
    description_en  TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ===========================================================================
-- SECTION 3: New Financial Data Tables
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- filings (filing metadata - must be created before xbrl_facts for FK)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS filings (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticker          TEXT NOT NULL REFERENCES companies(ticker),
    filing_type     TEXT NOT NULL,       -- 'annual', 'quarterly', 'interim'
    filing_date     DATE NOT NULL,
    period_start    DATE,
    period_end      DATE,
    source          TEXT,                -- 'CMA', 'Tadawul'
    source_url      TEXT,
    document_url    TEXT,
    status          TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'processing', 'completed', 'failed'
    processed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- xbrl_facts (XBRL financial data with concept identification)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS xbrl_facts (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticker              TEXT NOT NULL REFERENCES companies(ticker),
    filing_id           UUID REFERENCES filings(id),
    concept             TEXT NOT NULL,       -- XBRL concept (e.g., 'ifrs-full:Revenue')
    label_en            TEXT,
    label_ar            TEXT,
    value_numeric       NUMERIC(20,4),
    value_text          TEXT,
    value_boolean       BOOLEAN,
    unit                TEXT,                -- e.g., 'SAR', 'shares'
    decimals            INTEGER,
    period_start        DATE,
    period_end          DATE,
    period_instant      DATE,
    dimension_member    TEXT,                -- XBRL dimension member
    dimension_value     TEXT,                -- XBRL dimension value
    source_url          TEXT,
    content_hash        TEXT UNIQUE,         -- SHA-256 for dedup
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- computed_metrics (derived ratios, growth rates, custom calculations)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS computed_metrics (
    id              SERIAL PRIMARY KEY,
    ticker          TEXT NOT NULL REFERENCES companies(ticker),
    metric_name     TEXT NOT NULL,
    metric_value    NUMERIC(20,4),
    period_date     DATE,
    period_type     TEXT,                -- 'annual', 'quarterly', 'ttm'
    computed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (ticker, metric_name, period_date, period_type)
);

-- ---------------------------------------------------------------------------
-- price_history (daily OHLCV with computed changes and moving averages)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS price_history (
    id              SERIAL PRIMARY KEY,
    ticker          TEXT NOT NULL REFERENCES companies(ticker),
    trade_date      DATE NOT NULL,
    open_price      NUMERIC(12,4),
    high_price      NUMERIC(12,4),
    low_price       NUMERIC(12,4),
    close_price     NUMERIC(12,4),
    volume          BIGINT,
    value_traded    NUMERIC(20,4),
    num_trades      INTEGER,
    change_amount   NUMERIC(12,4),
    change_pct      NUMERIC(8,4),
    ma_5            NUMERIC(12,4),
    ma_10           NUMERIC(12,4),
    ma_20           NUMERIC(12,4),
    ma_50           NUMERIC(12,4),
    ma_200          NUMERIC(12,4),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (ticker, trade_date)
);


-- ===========================================================================
-- SECTION 4: New Content Tables
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- announcements (CMA/Tadawul with Arabic content, classification)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS announcements (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticker              TEXT REFERENCES companies(ticker),
    title_ar            TEXT,
    title_en            TEXT,
    body_ar             TEXT,
    body_en             TEXT,
    source              TEXT,                -- 'CMA', 'Tadawul'
    announcement_date   TIMESTAMPTZ NOT NULL,
    category            TEXT,
    classification      TEXT,
    is_material         BOOLEAN NOT NULL DEFAULT FALSE,
    embedding_flag      BOOLEAN NOT NULL DEFAULT FALSE,
    source_url          TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- news_articles (multi-source with sentiment, entity extraction)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS news_articles (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticker              TEXT REFERENCES companies(ticker),
    title               TEXT NOT NULL,
    body                TEXT,
    source_name         TEXT,
    source_url          TEXT,
    published_at        TIMESTAMPTZ,
    sentiment_score     NUMERIC(5,4),
    sentiment_label     TEXT,                -- 'positive', 'negative', 'neutral'
    entities_extracted  JSONB,
    language            TEXT NOT NULL DEFAULT 'ar',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- technical_reports (analyst research with recommendations/targets)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS technical_reports (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticker                  TEXT REFERENCES companies(ticker),
    title                   TEXT NOT NULL,
    summary                 TEXT,
    author                  TEXT,
    source_name             TEXT,
    source_url              TEXT,
    published_at            TIMESTAMPTZ,
    recommendation          TEXT,            -- 'buy', 'hold', 'sell', 'overweight', etc.
    target_price            NUMERIC(12,4),
    current_price_at_report NUMERIC(12,4),
    report_type             TEXT,            -- 'initiation', 'update', 'sector_review'
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ===========================================================================
-- SECTION 5: New User / Auth Tables
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- users (auth provider, profile, subscription tier, usage tracking)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    auth_provider       TEXT NOT NULL,       -- 'local', 'google', 'microsoft'
    auth_provider_id    TEXT,
    email               TEXT UNIQUE NOT NULL,
    display_name        TEXT,
    avatar_url          TEXT,
    subscription_tier   TEXT NOT NULL DEFAULT 'free',  -- 'free', 'pro', 'enterprise'
    usage_count         INTEGER NOT NULL DEFAULT 0,
    last_query_at       TIMESTAMPTZ,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (auth_provider, auth_provider_id)
);

-- ---------------------------------------------------------------------------
-- user_watchlists (ticker arrays per user)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_watchlists (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT NOT NULL DEFAULT 'Default',
    tickers     TEXT[] NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, name)
);

-- ---------------------------------------------------------------------------
-- user_alerts (price/event alerts per user per ticker)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_alerts (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ticker              TEXT NOT NULL REFERENCES companies(ticker),
    alert_type          TEXT NOT NULL,       -- 'price_above', 'price_below', 'volume_spike', 'event'
    threshold_value     NUMERIC(20,4),
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    last_triggered_at   TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- query_audit_log (full query logging for analytics and debugging)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS query_audit_log (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id                 UUID REFERENCES users(id) ON DELETE SET NULL,
    natural_language_query   TEXT NOT NULL,
    generated_sql           TEXT,
    execution_time_ms       INTEGER,
    row_count               INTEGER,
    was_successful          BOOLEAN,
    error_message           TEXT,
    ip_address              INET,
    user_agent              TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ===========================================================================
-- SECTION 6: Indexes
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Existing table indexes (matching SQLite originals)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_bs_ticker
    ON balance_sheet(ticker);
CREATE INDEX IF NOT EXISTS idx_bs_ticker_period
    ON balance_sheet(ticker, period_type, period_date);
CREATE INDEX IF NOT EXISTS idx_bs_period_type
    ON balance_sheet(period_type);

CREATE INDEX IF NOT EXISTS idx_is_ticker
    ON income_statement(ticker);
CREATE INDEX IF NOT EXISTS idx_is_ticker_period
    ON income_statement(ticker, period_type, period_date);
CREATE INDEX IF NOT EXISTS idx_is_period_type
    ON income_statement(period_type);

CREATE INDEX IF NOT EXISTS idx_cf_ticker
    ON cash_flow(ticker);
CREATE INDEX IF NOT EXISTS idx_cf_ticker_period
    ON cash_flow(ticker, period_type, period_date);
CREATE INDEX IF NOT EXISTS idx_cf_period_type
    ON cash_flow(period_type);

-- ---------------------------------------------------------------------------
-- companies indexes (sector/industry lookups)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_companies_sector
    ON companies(sector);
CREATE INDEX IF NOT EXISTS idx_companies_industry
    ON companies(industry);

-- ---------------------------------------------------------------------------
-- entities indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_entities_sector_id
    ON entities(sector_id);
CREATE INDEX IF NOT EXISTS idx_entities_name_ar_trgm
    ON entities USING GIN (name_ar gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_entities_name_en_trgm
    ON entities USING GIN (name_en gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- filings indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_filings_ticker_date
    ON filings(ticker, filing_date DESC);
CREATE INDEX IF NOT EXISTS idx_filings_status
    ON filings(status);

-- ---------------------------------------------------------------------------
-- xbrl_facts indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_xbrl_ticker_concept
    ON xbrl_facts(ticker, concept);
CREATE INDEX IF NOT EXISTS idx_xbrl_filing_id
    ON xbrl_facts(filing_id);
CREATE INDEX IF NOT EXISTS idx_xbrl_period_end
    ON xbrl_facts(period_end);

-- ---------------------------------------------------------------------------
-- computed_metrics indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_computed_ticker_metric
    ON computed_metrics(ticker, metric_name);

-- ---------------------------------------------------------------------------
-- price_history indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_price_ticker_date
    ON price_history(ticker, trade_date DESC);
CREATE INDEX IF NOT EXISTS idx_price_trade_date
    ON price_history(trade_date);

-- ---------------------------------------------------------------------------
-- announcements indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_announcements_ticker_date
    ON announcements(ticker, announcement_date DESC);
CREATE INDEX IF NOT EXISTS idx_announcements_title_ar_trgm
    ON announcements USING GIN (title_ar gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_announcements_body_ar_trgm
    ON announcements USING GIN (body_ar gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_announcements_category
    ON announcements(category);

-- ---------------------------------------------------------------------------
-- news_articles indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_news_ticker_date
    ON news_articles(ticker, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_sentiment
    ON news_articles(sentiment_label);
CREATE INDEX IF NOT EXISTS idx_news_entities_gin
    ON news_articles USING GIN (entities_extracted);

-- ---------------------------------------------------------------------------
-- technical_reports indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_reports_ticker_date
    ON technical_reports(ticker, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_recommendation
    ON technical_reports(recommendation);

-- ---------------------------------------------------------------------------
-- users indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_users_email
    ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_auth_provider
    ON users(auth_provider, auth_provider_id);

-- ---------------------------------------------------------------------------
-- user_alerts indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_alerts_user_active
    ON user_alerts(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_alerts_ticker
    ON user_alerts(ticker);

-- ---------------------------------------------------------------------------
-- query_audit_log indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_audit_user_date
    ON query_audit_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_created
    ON query_audit_log(created_at);


-- ===========================================================================
-- SECTION 7: Views
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- v_latest_annual_metrics
-- Joins companies with the most recent annual financial statements
-- (period_type='annual', period_index=0) for a single-row-per-company snapshot.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_latest_annual_metrics AS
SELECT
    c.ticker,
    c.short_name,
    c.sector,
    c.industry,
    -- Balance sheet (latest annual)
    bs.period_date          AS bs_period_date,
    bs.total_assets,
    bs.current_assets,
    bs.cash_and_cash_equivalents,
    bs.total_liabilities_net_minority_interest,
    bs.current_liabilities,
    bs.total_equity_gross_minority_interest,
    bs.stockholders_equity,
    bs.retained_earnings,
    bs.total_debt           AS bs_total_debt,
    bs.net_debt,
    bs.working_capital,
    -- Income statement (latest annual)
    ist.period_date         AS is_period_date,
    ist.total_revenue,
    ist.gross_profit,
    ist.operating_income,
    ist.net_income,
    ist.net_income_common_stockholders,
    ist.ebitda,
    ist.ebit,
    ist.diluted_eps,
    ist.basic_eps,
    -- Cash flow (latest annual)
    cf.period_date          AS cf_period_date,
    cf.operating_cash_flow,
    cf.investing_cash_flow,
    cf.financing_cash_flow,
    cf.free_cash_flow,
    cf.capital_expenditure
FROM companies c
LEFT JOIN balance_sheet bs
    ON bs.ticker = c.ticker
    AND bs.period_type = 'annual'
    AND bs.period_index = 0
LEFT JOIN income_statement ist
    ON ist.ticker = c.ticker
    AND ist.period_type = 'annual'
    AND ist.period_index = 0
LEFT JOIN cash_flow cf
    ON cf.ticker = c.ticker
    AND cf.period_type = 'annual'
    AND cf.period_index = 0;

-- ---------------------------------------------------------------------------
-- v_company_summary
-- Comprehensive company overview joining core tables plus entity details.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_company_summary AS
SELECT
    c.ticker,
    c.short_name,
    c.sector,
    c.industry,
    c.currency,
    -- Entity details
    e.name_ar,
    e.name_en,
    e.listing_date,
    e.isin,
    s.name_en               AS sector_name_en,
    s.name_ar               AS sector_name_ar,
    -- Market data
    md.current_price,
    md.previous_close,
    md.market_cap,
    md.volume,
    md.avg_volume,
    md.beta,
    md.week_52_high,
    md.week_52_low,
    md.shares_outstanding,
    -- Valuation
    vm.trailing_pe,
    vm.forward_pe,
    vm.price_to_book,
    vm.price_to_sales,
    vm.ev_to_ebitda,
    vm.trailing_eps,
    vm.forward_eps,
    -- Profitability
    pm.roa,
    pm.roe,
    pm.profit_margin,
    pm.operating_margin,
    pm.gross_margin,
    pm.revenue_growth,
    pm.earnings_growth
FROM companies c
LEFT JOIN entities e        ON e.ticker = c.ticker
LEFT JOIN sectors s         ON s.id = e.sector_id
LEFT JOIN market_data md    ON md.ticker = c.ticker
LEFT JOIN valuation_metrics vm  ON vm.ticker = c.ticker
LEFT JOIN profitability_metrics pm ON pm.ticker = c.ticker;
