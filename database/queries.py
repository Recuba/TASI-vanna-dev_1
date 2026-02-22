"""
Centralized SQL query constants.

Named SQL strings used across route handlers. Keeping them here avoids
scattering raw SQL throughout the codebase and makes queries easier to
audit, test, and maintain.
"""

# ---------------------------------------------------------------------------
# stock_data queries
# ---------------------------------------------------------------------------

COMPANY_EXISTS = "SELECT 1 FROM companies WHERE ticker = ?"

DIVIDEND_DATA_BY_TICKER = (
    "SELECT ticker, dividend_rate, dividend_yield, payout_ratio,"
    " trailing_annual_dividend_rate, trailing_annual_dividend_yield,"
    " avg_dividend_yield_5y, ex_dividend_date, last_dividend_value,"
    " last_dividend_date FROM dividend_data WHERE ticker = ?"
)

FINANCIAL_SUMMARY_BY_TICKER = (
    "SELECT ticker, total_revenue, total_cash, total_cash_per_share,"
    " total_debt, debt_to_equity, current_ratio, quick_ratio,"
    " free_cashflow, operating_cashflow, ebitda, gross_profits,"
    " net_income_to_common FROM financial_summary WHERE ticker = ?"
)

COMPANY_NAMES_BY_TICKERS = (
    "SELECT ticker, short_name FROM companies WHERE ticker IN ({placeholders})"
)

BATCH_QUOTES_SQL = """
    SELECT
        c.ticker,
        c.short_name,
        m.current_price,
        m.previous_close,
        CASE WHEN m.previous_close > 0
             THEN ((m.current_price - m.previous_close) / m.previous_close) * 100
             ELSE NULL
        END AS change_pct,
        m.volume
    FROM companies c
    LEFT JOIN market_data m ON m.ticker = c.ticker
    WHERE c.ticker IN ({placeholders})
"""

# ---------------------------------------------------------------------------
# market_analytics queries
# ---------------------------------------------------------------------------

MOVERS_BASE = """
    SELECT
        c.ticker,
        c.short_name,
        m.current_price,
        m.previous_close,
        CASE WHEN m.previous_close > 0
             THEN ((m.current_price - m.previous_close) / m.previous_close) * 100
             ELSE NULL
        END AS change_pct,
        m.volume,
        c.sector
    FROM companies c
    JOIN market_data m ON m.ticker = c.ticker
    WHERE m.current_price IS NOT NULL AND m.previous_close IS NOT NULL AND m.previous_close > 0
"""

MARKET_SUMMARY_AGGREGATES = """
    SELECT
        COALESCE(SUM(m.market_cap), 0) AS total_market_cap,
        COALESCE(SUM(m.volume), 0) AS total_volume,
        SUM(CASE WHEN m.previous_close > 0 AND m.current_price > m.previous_close THEN 1 ELSE 0 END) AS gainers_count,
        SUM(CASE WHEN m.previous_close > 0 AND m.current_price < m.previous_close THEN 1 ELSE 0 END) AS losers_count,
        SUM(CASE WHEN m.previous_close > 0 AND m.current_price = m.previous_close THEN 1 ELSE 0 END) AS unchanged_count
    FROM market_data m
    WHERE m.current_price IS NOT NULL
"""

SECTOR_ANALYTICS = """
    SELECT
        c.sector,
        AVG(CASE WHEN m.previous_close > 0
             THEN ((m.current_price - m.previous_close) / m.previous_close) * 100
             ELSE NULL END) AS avg_change_pct,
        COALESCE(SUM(m.volume), 0) AS total_volume,
        COALESCE(SUM(m.market_cap), 0) AS total_market_cap,
        COUNT(*) AS company_count,
        SUM(CASE WHEN m.previous_close > 0 AND m.current_price > m.previous_close THEN 1 ELSE 0 END) AS gainers,
        SUM(CASE WHEN m.previous_close > 0 AND m.current_price < m.previous_close THEN 1 ELSE 0 END) AS losers
    FROM companies c
    JOIN market_data m ON m.ticker = c.ticker
    WHERE c.sector IS NOT NULL AND m.current_price IS NOT NULL
    GROUP BY c.sector
    ORDER BY total_market_cap DESC
"""

HEATMAP = """
    SELECT
        c.ticker,
        c.short_name AS name,
        c.sector,
        m.market_cap,
        CASE WHEN m.previous_close > 0
             THEN ((m.current_price - m.previous_close) / m.previous_close) * 100
             ELSE NULL
        END AS change_pct
    FROM companies c
    JOIN market_data m ON m.ticker = c.ticker
    WHERE m.current_price IS NOT NULL AND m.market_cap IS NOT NULL
    ORDER BY m.market_cap DESC
"""

# ---------------------------------------------------------------------------
# charts_analytics queries
# ---------------------------------------------------------------------------

SECTOR_MARKET_CAP = """
    SELECT c.sector AS label, SUM(m.market_cap) AS value
    FROM companies c
    JOIN market_data m ON m.ticker = c.ticker
    WHERE c.sector IS NOT NULL AND m.market_cap IS NOT NULL
    GROUP BY c.sector
    ORDER BY value DESC
"""

SECTOR_AVG_PE = """
    SELECT c.sector AS label, AVG(v.trailing_pe) AS value
    FROM companies c
    JOIN valuation_metrics v ON v.ticker = c.ticker
    WHERE c.sector IS NOT NULL AND v.trailing_pe IS NOT NULL
        AND v.trailing_pe > 0 AND v.trailing_pe < 200
    GROUP BY c.sector
    ORDER BY value DESC
"""

DIVIDEND_YIELD_TOP = """
    SELECT c.short_name AS label, d.dividend_yield AS value
    FROM companies c
    JOIN dividend_data d ON d.ticker = c.ticker
    WHERE d.dividend_yield IS NOT NULL AND d.dividend_yield > 0
    ORDER BY d.dividend_yield DESC
    LIMIT ?
"""

# ---------------------------------------------------------------------------
# sqlite_entities queries
# ---------------------------------------------------------------------------

SECTOR_LIST = """
    SELECT c.sector, COUNT(*) AS company_count
    FROM companies c
    LEFT JOIN market_data m ON m.ticker = c.ticker
    WHERE c.sector IS NOT NULL
      AND (m.current_price IS NOT NULL OR m.market_cap IS NOT NULL)
    GROUP BY c.sector
    ORDER BY company_count DESC
"""

ENTITY_FULL_DETAIL = """
    SELECT
        c.ticker, c.short_name, c.sector, c.industry, c.exchange, c.currency,
        m.current_price, m.previous_close, m.open_price, m.day_high, m.day_low,
        m.week_52_high, m.week_52_low, m.avg_50d, m.avg_200d,
        m.volume, m.avg_volume, m.beta, m.market_cap,
        m.shares_outstanding, m.pct_held_insiders, m.pct_held_institutions,
        v.trailing_pe, v.forward_pe, v.price_to_book, v.price_to_sales,
        v.enterprise_value, v.ev_to_revenue, v.ev_to_ebitda, v.peg_ratio,
        v.trailing_eps, v.forward_eps, v.book_value,
        p.roa, p.roe, p.profit_margin, p.operating_margin,
        p.gross_margin, p.ebitda_margin, p.earnings_growth, p.revenue_growth,
        d.dividend_rate, d.dividend_yield, d.payout_ratio, d.ex_dividend_date,
        f.total_revenue, f.total_debt, f.debt_to_equity, f.current_ratio,
        f.free_cashflow, f.operating_cashflow, f.ebitda,
        a.recommendation, a.target_mean_price, a.target_high_price,
        a.target_low_price, a.target_median_price, a.analyst_count,
        CASE WHEN m.previous_close > 0
             THEN ((m.current_price - m.previous_close) / m.previous_close) * 100
             ELSE NULL
        END AS change_pct
    FROM companies c
    LEFT JOIN market_data m ON m.ticker = c.ticker
    LEFT JOIN valuation_metrics v ON v.ticker = c.ticker
    LEFT JOIN profitability_metrics p ON p.ticker = c.ticker
    LEFT JOIN dividend_data d ON d.ticker = c.ticker
    LEFT JOIN financial_summary f ON f.ticker = c.ticker
    LEFT JOIN analyst_data a ON a.ticker = c.ticker
    WHERE c.ticker = ?
"""

# ---------------------------------------------------------------------------
# market_breadth queries
# ---------------------------------------------------------------------------

MARKET_BREADTH = """
    SELECT
        SUM(CASE WHEN m.previous_close > 0 AND m.current_price > m.previous_close THEN 1 ELSE 0 END) AS advancing,
        SUM(CASE WHEN m.previous_close > 0 AND m.current_price < m.previous_close THEN 1 ELSE 0 END) AS declining,
        SUM(CASE WHEN m.previous_close > 0 AND m.current_price = m.previous_close THEN 1 ELSE 0 END) AS unchanged,
        SUM(CASE WHEN m.current_price >= m.week_52_high AND m.week_52_high IS NOT NULL THEN 1 ELSE 0 END) AS new_52w_highs,
        SUM(CASE WHEN m.current_price <= m.week_52_low AND m.week_52_low IS NOT NULL THEN 1 ELSE 0 END) AS new_52w_lows
    FROM market_data m
    WHERE m.current_price IS NOT NULL AND m.previous_close IS NOT NULL AND m.previous_close > 0
"""

# ---------------------------------------------------------------------------
# screener queries
# ---------------------------------------------------------------------------

SCREENER_BASE = """
    SELECT
        c.ticker, c.short_name, c.sector, c.industry,
        m.current_price, m.previous_close, m.market_cap, m.volume,
        CASE WHEN m.previous_close > 0
             THEN ((m.current_price - m.previous_close) / m.previous_close) * 100
             ELSE NULL
        END AS change_pct,
        v.trailing_pe, v.forward_pe, v.price_to_book, v.price_to_sales,
        p.roe, p.profit_margin, p.revenue_growth, p.earnings_growth,
        d.dividend_yield,
        f.debt_to_equity, f.current_ratio, f.total_revenue,
        a.recommendation, a.target_mean_price, a.analyst_count
    FROM companies c
    LEFT JOIN market_data m ON m.ticker = c.ticker
    LEFT JOIN valuation_metrics v ON v.ticker = c.ticker
    LEFT JOIN profitability_metrics p ON p.ticker = c.ticker
    LEFT JOIN dividend_data d ON d.ticker = c.ticker
    LEFT JOIN financial_summary f ON f.ticker = c.ticker
    LEFT JOIN analyst_data a ON a.ticker = c.ticker
    WHERE m.current_price IS NOT NULL
"""
