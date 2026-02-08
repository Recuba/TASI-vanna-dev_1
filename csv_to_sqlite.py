"""
csv_to_sqlite.py
================
Converts the flat denormalized CSV file 'saudi_stocks_yahoo_data.csv' (500 stocks,
1062 columns) into a normalized SQLite database 'saudi_stocks.db'.

Tables created:
  - companies             (core company info)
  - market_data           (price / volume / shares)
  - valuation_metrics     (PE, PB, EV ratios)
  - profitability_metrics  (margins, growth)
  - dividend_data         (dividends)
  - financial_summary     (key financial aggregates)
  - analyst_data          (targets, recommendations)
  - balance_sheet         (unpivoted, multiple rows per ticker)
  - income_statement      (unpivoted, multiple rows per ticker)
  - cash_flow             (unpivoted, multiple rows per ticker)

Usage:
    python csv_to_sqlite.py
"""

import os
import sys
import time
import sqlite3
import pandas as pd

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CSV_PATH = os.path.join(SCRIPT_DIR, "saudi_stocks_yahoo_data.csv")
DB_PATH = os.path.join(SCRIPT_DIR, "saudi_stocks.db")

# ---------------------------------------------------------------------------
# Column mappings for the simple (one-row-per-ticker) tables
# Keys   = target column name in SQLite
# Values = source column name in the CSV
# ---------------------------------------------------------------------------

COMPANIES_COLS = {
    "ticker": "ticker",
    "short_name": "short_name",
    "sector": "sector",
    "industry": "industry",
    "exchange": "exchange",
    "quote_type": "quote_type",
    "currency": "currency",
    "financial_currency": "financial_currency",
    "market": "market",
}

MARKET_DATA_COLS = {
    "ticker": "ticker",
    "current_price": "current_price",
    "previous_close": "previous_close",
    "open_price": "open_price",
    "day_high": "day_high",
    "day_low": "day_low",
    "week_52_high": "week_52_high",
    "week_52_low": "week_52_low",
    "avg_50d": "avg_50d",
    "avg_200d": "avg_200d",
    "volume": "volume",
    "avg_volume": "avg_volume",
    "avg_volume_10d": "avg_volume_10d",
    "beta": "beta",
    "market_cap": "market_cap",
    "shares_outstanding": "shares_outstanding",
    "float_shares": "float_shares",
    "implied_shares_outstanding": "implied_shares_outstanding",
    "pct_held_insiders": "pct_held_insiders",
    "pct_held_institutions": "pct_held_institutions",
}

VALUATION_COLS = {
    "ticker": "ticker",
    "trailing_pe": "trailing_pe",
    "forward_pe": "forward_pe",
    "price_to_book": "price_to_book",
    "price_to_sales": "price_to_sales",
    "enterprise_value": "enterprise_value",
    "ev_to_revenue": "ev_to_revenue",
    "ev_to_ebitda": "ev_to_ebitda",
    "peg_ratio": "peg_ratio",
    "trailing_eps": "trailing_eps",
    "forward_eps": "forward_eps",
    "book_value": "book_value",
    "revenue_per_share": "revenue_per_share",
}

PROFITABILITY_COLS = {
    "ticker": "ticker",
    "roa": "roa",
    "roe": "roe",
    "profit_margin": "profit_margin",
    "operating_margin": "operating_margin",
    "gross_margin": "gross_margin",
    "ebitda_margin": "ebitda_margin",
    "earnings_growth": "earnings_growth",
    "revenue_growth": "revenue_growth",
    "earnings_quarterly_growth": "earnings_quarterly_growth",
}

DIVIDEND_COLS = {
    "ticker": "ticker",
    "dividend_rate": "dividend_rate",
    "dividend_yield": "dividend_yield",
    "ex_dividend_date": "ex_dividend_date",
    "payout_ratio": "payout_ratio",
    "avg_dividend_yield_5y": "avg_dividend_yield_5y",
    "last_dividend_value": "last_dividend_value",
    "last_dividend_date": "last_dividend_date",
    "trailing_annual_dividend_rate": "trailing_annual_dividend_rate",
    "trailing_annual_dividend_yield": "trailing_annual_dividend_yield",
}

# Note the renamed columns: info_total_debt -> total_debt, etc.
FINANCIAL_SUMMARY_COLS = {
    "ticker": "ticker",
    "total_revenue": "total_revenue",
    "total_cash": "total_cash",
    "total_cash_per_share": "total_cash_per_share",
    "total_debt": "info_total_debt",
    "debt_to_equity": "debt_to_equity",
    "current_ratio": "current_ratio",
    "quick_ratio": "quick_ratio",
    "operating_cashflow": "info_operating_cashflow",
    "free_cashflow": "info_free_cashflow",
    "ebitda": "info_ebitda",
    "gross_profits": "gross_profits",
    "net_income_to_common": "net_income_to_common",
}

ANALYST_COLS = {
    "ticker": "ticker",
    "target_mean_price": "target_mean_price",
    "target_high_price": "target_high_price",
    "target_low_price": "target_low_price",
    "target_median_price": "target_median_price",
    "analyst_count": "analyst_count",
    "recommendation": "recommendation",
    "recommendation_score": "recommendation_score",
    "most_recent_quarter": "most_recent_quarter",
    "last_fiscal_year_end": "last_fiscal_year_end",
}

# ---------------------------------------------------------------------------
# Financial statement field lists (after stripping the prefix + 'date')
# These are the Mixed_Case names as they appear in the CSV after the prefix.
# ---------------------------------------------------------------------------

BS_FIELDS = [
    "Total_Assets",
    "Current_Assets",
    "Cash_And_Cash_Equivalents",
    "Cash_Cash_Equivalents_And_Short_Term_Investments",
    "Accounts_Receivable",
    "Inventory",
    "Other_Current_Assets",
    "Total_Non_Current_Assets",
    "Net_PPE",
    "Goodwill_And_Other_Intangible_Assets",
    "Goodwill",
    "Other_Intangible_Assets",
    "Long_Term_Equity_Investment",
    "Other_Non_Current_Assets",
    "Total_Liabilities_Net_Minority_Interest",
    "Current_Liabilities",
    "Current_Debt",
    "Accounts_Payable",
    "Other_Current_Liabilities",
    "Total_Non_Current_Liabilities_Net_Minority_Interest",
    "Long_Term_Debt",
    "Long_Term_Capital_Lease_Obligation",
    "Capital_Lease_Obligations",
    "Other_Non_Current_Liabilities",
    "Total_Equity_Gross_Minority_Interest",
    "Stockholders_Equity",
    "Common_Stock_Equity",
    "Retained_Earnings",
    "Common_Stock",
    "Additional_Paid_In_Capital",
    "Treasury_Stock",
    "Minority_Interest",
    "Total_Capitalization",
    "Net_Tangible_Assets",
    "Working_Capital",
    "Invested_Capital",
    "Tangible_Book_Value",
    "Total_Debt",
    "Net_Debt",
    "Share_Issued",
    "Ordinary_Shares_Number",
    "Treasury_Shares_Number",
]

IS_FIELDS = [
    "Total_Revenue",
    "Operating_Revenue",
    "Cost_Of_Revenue",
    "Gross_Profit",
    "Operating_Expense",
    "Selling_General_And_Administration",
    "General_And_Administrative_Expense",
    "Research_And_Development",
    "Operating_Income",
    "Net_Non_Operating_Interest_Income_Expense",
    "Interest_Income",
    "Interest_Expense",
    "Other_Non_Operating_Income_Expenses",
    "Pretax_Income",
    "Tax_Provision",
    "Tax_Rate_For_Calcs",
    "Net_Income",
    "Net_Income_Common_Stockholders",
    "Net_Income_Continuous_Operations",
    "Net_Income_Including_Noncontrolling_Interests",
    "Diluted_EPS",
    "Basic_EPS",
    "Diluted_Average_Shares",
    "Basic_Average_Shares",
    "EBITDA",
    "EBIT",
    "Reconciled_Depreciation",
    "Total_Operating_Income_As_Reported",
    "Normalized_EBITDA",
    "Normalized_Income",
    "Net_Interest_Income",
    "Total_Expenses",
    "Minority_Interests",
]

CF_FIELDS = [
    "Operating_Cash_Flow",
    "Investing_Cash_Flow",
    "Financing_Cash_Flow",
    "Free_Cash_Flow",
    "Capital_Expenditure",
    "Depreciation_And_Amortization",
    "Change_In_Working_Capital",
    "Change_In_Receivables",
    "Change_In_Inventory",
    "Change_In_Payable",
    "Change_In_Prepaid_Assets",
    "Stock_Based_Compensation",
    "Net_Income_From_Continuing_Operations",
    "Dividends_Received_Cfi",
    "Interest_Paid_Cfo",
    "Interest_Received_Cfo",
    "Taxes_Refund_Paid",
    "Purchase_Of_Business",
    "Purchase_Of_Investment",
    "Sale_Of_Investment",
    "Net_Investment_Purchase_And_Sale",
    "Purchase_Of_PPE",
    "Sale_Of_PPE",
    "Net_PPE_Purchase_And_Sale",
    "Issuance_Of_Debt",
    "Long_Term_Debt_Issuance",
    "Long_Term_Debt_Payments",
    "Repayment_Of_Debt",
    "Issuance_Of_Capital_Stock",
    "Common_Stock_Issuance",
    "Net_Other_Financing_Charges",
    "Net_Other_Investing_Changes",
    "Beginning_Cash_Position",
    "End_Cash_Position",
    "Changes_In_Cash",
    "Other_Non_Cash_Items",
]

# Period prefix -> (period_type, period_index)
BS_PERIODS = {
    "bs_y0": ("annual", 0),
    "bs_y1": ("annual", 1),
    "bs_y2": ("annual", 2),
    "bs_y3": ("annual", 3),
    "bs_q0": ("quarterly", 0),
    "bs_q1": ("quarterly", 1),
    "bs_q2": ("quarterly", 2),
    "bs_q3": ("quarterly", 3),
}

IS_PERIODS = {
    "is_y0": ("annual", 0),
    "is_y1": ("annual", 1),
    "is_y2": ("annual", 2),
    "is_y3": ("annual", 3),
    "is_q0": ("quarterly", 0),
    "is_q1": ("quarterly", 1),
    "is_q2": ("quarterly", 2),
    "is_q3": ("quarterly", 3),
    "is_ttm": ("ttm", 0),
}

CF_PERIODS = {
    "cf_y0": ("annual", 0),
    "cf_y1": ("annual", 1),
    "cf_y2": ("annual", 2),
    "cf_y3": ("annual", 3),
    "cf_q0": ("quarterly", 0),
    "cf_q1": ("quarterly", 1),
    "cf_q2": ("quarterly", 2),
    "cf_q3": ("quarterly", 3),
    "cf_ttm": ("ttm", 0),
}

# ---------------------------------------------------------------------------
# DDL statements
# ---------------------------------------------------------------------------

DDL_COMPANIES = """
CREATE TABLE IF NOT EXISTS companies (
    ticker TEXT PRIMARY KEY,
    short_name TEXT,
    sector TEXT,
    industry TEXT,
    exchange TEXT,
    quote_type TEXT,
    currency TEXT,
    financial_currency TEXT,
    market TEXT
);
"""

DDL_MARKET_DATA = """
CREATE TABLE IF NOT EXISTS market_data (
    ticker TEXT PRIMARY KEY REFERENCES companies(ticker),
    current_price REAL,
    previous_close REAL,
    open_price REAL,
    day_high REAL,
    day_low REAL,
    week_52_high REAL,
    week_52_low REAL,
    avg_50d REAL,
    avg_200d REAL,
    volume INTEGER,
    avg_volume INTEGER,
    avg_volume_10d INTEGER,
    beta REAL,
    market_cap REAL,
    shares_outstanding REAL,
    float_shares REAL,
    implied_shares_outstanding REAL,
    pct_held_insiders REAL,
    pct_held_institutions REAL
);
"""

DDL_VALUATION = """
CREATE TABLE IF NOT EXISTS valuation_metrics (
    ticker TEXT PRIMARY KEY REFERENCES companies(ticker),
    trailing_pe REAL,
    forward_pe REAL,
    price_to_book REAL,
    price_to_sales REAL,
    enterprise_value REAL,
    ev_to_revenue REAL,
    ev_to_ebitda REAL,
    peg_ratio REAL,
    trailing_eps REAL,
    forward_eps REAL,
    book_value REAL,
    revenue_per_share REAL
);
"""

DDL_PROFITABILITY = """
CREATE TABLE IF NOT EXISTS profitability_metrics (
    ticker TEXT PRIMARY KEY REFERENCES companies(ticker),
    roa REAL,
    roe REAL,
    profit_margin REAL,
    operating_margin REAL,
    gross_margin REAL,
    ebitda_margin REAL,
    earnings_growth REAL,
    revenue_growth REAL,
    earnings_quarterly_growth REAL
);
"""

DDL_DIVIDEND = """
CREATE TABLE IF NOT EXISTS dividend_data (
    ticker TEXT PRIMARY KEY REFERENCES companies(ticker),
    dividend_rate REAL,
    dividend_yield REAL,
    ex_dividend_date TEXT,
    payout_ratio REAL,
    avg_dividend_yield_5y REAL,
    last_dividend_value REAL,
    last_dividend_date TEXT,
    trailing_annual_dividend_rate REAL,
    trailing_annual_dividend_yield REAL
);
"""

DDL_FINANCIAL_SUMMARY = """
CREATE TABLE IF NOT EXISTS financial_summary (
    ticker TEXT PRIMARY KEY REFERENCES companies(ticker),
    total_revenue REAL,
    total_cash REAL,
    total_cash_per_share REAL,
    total_debt REAL,
    debt_to_equity REAL,
    current_ratio REAL,
    quick_ratio REAL,
    operating_cashflow REAL,
    free_cashflow REAL,
    ebitda REAL,
    gross_profits REAL,
    net_income_to_common REAL
);
"""

DDL_ANALYST = """
CREATE TABLE IF NOT EXISTS analyst_data (
    ticker TEXT PRIMARY KEY REFERENCES companies(ticker),
    target_mean_price REAL,
    target_high_price REAL,
    target_low_price REAL,
    target_median_price REAL,
    analyst_count INTEGER,
    recommendation TEXT,
    recommendation_score REAL,
    most_recent_quarter TEXT,
    last_fiscal_year_end TEXT
);
"""

DDL_BALANCE_SHEET = """
CREATE TABLE IF NOT EXISTS balance_sheet (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker TEXT REFERENCES companies(ticker),
    period_type TEXT,
    period_index INTEGER,
    period_date TEXT,
    total_assets REAL,
    current_assets REAL,
    cash_and_cash_equivalents REAL,
    cash_cash_equivalents_and_short_term_investments REAL,
    accounts_receivable REAL,
    inventory REAL,
    other_current_assets REAL,
    total_non_current_assets REAL,
    net_ppe REAL,
    goodwill_and_other_intangible_assets REAL,
    goodwill REAL,
    other_intangible_assets REAL,
    long_term_equity_investment REAL,
    other_non_current_assets REAL,
    total_liabilities_net_minority_interest REAL,
    current_liabilities REAL,
    current_debt REAL,
    accounts_payable REAL,
    other_current_liabilities REAL,
    total_non_current_liabilities_net_minority_interest REAL,
    long_term_debt REAL,
    long_term_capital_lease_obligation REAL,
    capital_lease_obligations REAL,
    other_non_current_liabilities REAL,
    total_equity_gross_minority_interest REAL,
    stockholders_equity REAL,
    common_stock_equity REAL,
    retained_earnings REAL,
    common_stock REAL,
    additional_paid_in_capital REAL,
    treasury_stock REAL,
    minority_interest REAL,
    total_capitalization REAL,
    net_tangible_assets REAL,
    working_capital REAL,
    invested_capital REAL,
    tangible_book_value REAL,
    total_debt REAL,
    net_debt REAL,
    share_issued REAL,
    ordinary_shares_number REAL,
    treasury_shares_number REAL
);
"""

DDL_INCOME_STATEMENT = """
CREATE TABLE IF NOT EXISTS income_statement (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker TEXT REFERENCES companies(ticker),
    period_type TEXT,
    period_index INTEGER,
    period_date TEXT,
    total_revenue REAL,
    operating_revenue REAL,
    cost_of_revenue REAL,
    gross_profit REAL,
    operating_expense REAL,
    selling_general_and_administration REAL,
    general_and_administrative_expense REAL,
    research_and_development REAL,
    operating_income REAL,
    net_non_operating_interest_income_expense REAL,
    interest_income REAL,
    interest_expense REAL,
    other_non_operating_income_expenses REAL,
    pretax_income REAL,
    tax_provision REAL,
    tax_rate_for_calcs REAL,
    net_income REAL,
    net_income_common_stockholders REAL,
    net_income_continuous_operations REAL,
    net_income_including_noncontrolling_interests REAL,
    diluted_eps REAL,
    basic_eps REAL,
    diluted_average_shares REAL,
    basic_average_shares REAL,
    ebitda REAL,
    ebit REAL,
    reconciled_depreciation REAL,
    total_operating_income_as_reported REAL,
    normalized_ebitda REAL,
    normalized_income REAL,
    net_interest_income REAL,
    total_expenses REAL,
    minority_interests REAL
);
"""

DDL_CASH_FLOW = """
CREATE TABLE IF NOT EXISTS cash_flow (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker TEXT REFERENCES companies(ticker),
    period_type TEXT,
    period_index INTEGER,
    period_date TEXT,
    operating_cash_flow REAL,
    investing_cash_flow REAL,
    financing_cash_flow REAL,
    free_cash_flow REAL,
    capital_expenditure REAL,
    depreciation_and_amortization REAL,
    change_in_working_capital REAL,
    change_in_receivables REAL,
    change_in_inventory REAL,
    change_in_payable REAL,
    change_in_prepaid_assets REAL,
    stock_based_compensation REAL,
    net_income_from_continuing_operations REAL,
    dividends_received_cfi REAL,
    interest_paid_cfo REAL,
    interest_received_cfo REAL,
    taxes_refund_paid REAL,
    purchase_of_business REAL,
    purchase_of_investment REAL,
    sale_of_investment REAL,
    net_investment_purchase_and_sale REAL,
    purchase_of_ppe REAL,
    sale_of_ppe REAL,
    net_ppe_purchase_and_sale REAL,
    issuance_of_debt REAL,
    long_term_debt_issuance REAL,
    long_term_debt_payments REAL,
    repayment_of_debt REAL,
    issuance_of_capital_stock REAL,
    common_stock_issuance REAL,
    net_other_financing_charges REAL,
    net_other_investing_changes REAL,
    beginning_cash_position REAL,
    end_cash_position REAL,
    changes_in_cash REAL,
    other_non_cash_items REAL
);
"""

INDEX_DDL = [
    "CREATE INDEX IF NOT EXISTS idx_bs_ticker ON balance_sheet(ticker);",
    "CREATE INDEX IF NOT EXISTS idx_bs_ticker_period ON balance_sheet(ticker, period_type, period_date);",
    "CREATE INDEX IF NOT EXISTS idx_bs_period_type ON balance_sheet(period_type);",
    "CREATE INDEX IF NOT EXISTS idx_is_ticker ON income_statement(ticker);",
    "CREATE INDEX IF NOT EXISTS idx_is_ticker_period ON income_statement(ticker, period_type, period_date);",
    "CREATE INDEX IF NOT EXISTS idx_is_period_type ON income_statement(period_type);",
    "CREATE INDEX IF NOT EXISTS idx_cf_ticker ON cash_flow(ticker);",
    "CREATE INDEX IF NOT EXISTS idx_cf_ticker_period ON cash_flow(ticker, period_type, period_date);",
    "CREATE INDEX IF NOT EXISTS idx_cf_period_type ON cash_flow(period_type);",
]


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------


def extract_simple_table(df: pd.DataFrame, col_map: dict) -> pd.DataFrame:
    """Extract a subset of columns from the master DataFrame, renaming as needed."""
    src_cols = list(col_map.values())
    # Only keep columns that actually exist in the CSV
    existing = [c for c in src_cols if c in df.columns]
    missing = [c for c in src_cols if c not in df.columns]
    if missing:
        print(f"  WARNING: Missing CSV columns: {missing}")

    sub = df[existing].copy()
    # Build reverse map for renaming (src -> target)
    rename_map = {v: k for k, v in col_map.items() if v in existing}
    sub.rename(columns=rename_map, inplace=True)
    return sub


def unpivot_financial(
    df: pd.DataFrame,
    periods: dict,
    fields: list,
    table_name: str,
) -> pd.DataFrame:
    """
    Unpivot flat financial columns into normalized rows.

    For each ticker and each period prefix, extracts one row containing
    ticker, period_type, period_index, period_date, and all field values.
    Skips rows where period_date is null/empty.
    """
    all_rows = []
    tickers = df["ticker"].values
    total = len(tickers)

    for prefix, (period_type, period_index) in periods.items():
        date_col = f"{prefix}_date"
        if date_col not in df.columns:
            print(
                f"  WARNING: date column '{date_col}' not found -- skipping prefix '{prefix}'"
            )
            continue

        # Build the list of source column names for this prefix
        src_cols = [f"{prefix}_{f}" for f in fields]

        # Check which source columns exist
        existing_src = [c for c in src_cols if c in df.columns]
        existing_tgt = [
            fields[i].lower() for i, c in enumerate(src_cols) if c in df.columns
        ]
        missing_src = [c for c in src_cols if c not in df.columns]

        # Get date values
        dates = df[date_col].values

        # Get data for existing columns as a numpy array for speed
        if existing_src:
            data_block = df[existing_src].values
        else:
            continue

        for row_idx in range(total):
            date_val = dates[row_idx]
            # Skip if date is empty / NaN
            if pd.isna(date_val) or str(date_val).strip() == "":
                continue

            row_dict = {
                "ticker": tickers[row_idx],
                "period_type": period_type,
                "period_index": period_index,
                "period_date": str(date_val).strip(),
            }

            for col_idx, tgt in enumerate(existing_tgt):
                val = data_block[row_idx, col_idx]
                row_dict[tgt] = None if pd.isna(val) else val

            # Fill missing columns with None
            for c in missing_src:
                field_name = c.split(f"{prefix}_", 1)[1].lower()
                row_dict[field_name] = None

            all_rows.append(row_dict)

    if not all_rows:
        print(f"  WARNING: No rows produced for {table_name}")
        return pd.DataFrame()

    result = pd.DataFrame(all_rows)
    return result


def safe_to_sql(df: pd.DataFrame, table_name: str, conn: sqlite3.Connection):
    """Write DataFrame to SQLite, replacing NaN with None for proper NULL storage."""
    df = df.where(pd.notnull(df), None)
    df.to_sql(table_name, conn, if_exists="append", index=False)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main():
    t_start = time.time()

    # -- Read CSV --------------------------------------------------------
    print(f"Reading CSV: {CSV_PATH}")
    if not os.path.isfile(CSV_PATH):
        print(f"ERROR: CSV file not found at {CSV_PATH}")
        sys.exit(1)

    df = pd.read_csv(CSV_PATH, encoding="utf-8-sig", low_memory=False)
    n_rows, n_cols = df.shape
    print(f"  Loaded {n_rows} rows x {n_cols} columns")

    # -- Remove existing DB if present -----------------------------------
    if os.path.isfile(DB_PATH):
        os.remove(DB_PATH)
        print(f"  Removed existing database: {DB_PATH}")

    # -- Connect to SQLite -----------------------------------------------
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA foreign_keys=ON;")
        cur = conn.cursor()

        # -- Create tables ---------------------------------------------------
        print("Creating tables...")
        for ddl in [
            DDL_COMPANIES,
            DDL_MARKET_DATA,
            DDL_VALUATION,
            DDL_PROFITABILITY,
            DDL_DIVIDEND,
            DDL_FINANCIAL_SUMMARY,
            DDL_ANALYST,
            DDL_BALANCE_SHEET,
            DDL_INCOME_STATEMENT,
            DDL_CASH_FLOW,
        ]:
            cur.executescript(ddl)
        conn.commit()

        # -- Populate simple tables ------------------------------------------
        simple_tables = [
            ("companies", COMPANIES_COLS),
            ("market_data", MARKET_DATA_COLS),
            ("valuation_metrics", VALUATION_COLS),
            ("profitability_metrics", PROFITABILITY_COLS),
            ("dividend_data", DIVIDEND_COLS),
            ("financial_summary", FINANCIAL_SUMMARY_COLS),
            ("analyst_data", ANALYST_COLS),
        ]

        for table_name, col_map in simple_tables:
            print(f"Populating {table_name}...")
            sub = extract_simple_table(df, col_map)
            safe_to_sql(sub, table_name, conn)
            count = cur.execute(f"SELECT COUNT(*) FROM {table_name}").fetchone()[0]
            print(f"  -> {count} rows inserted")

        conn.commit()

        # -- Populate financial statement tables (unpivot) -------------------
        fin_tables = [
            ("balance_sheet", BS_PERIODS, BS_FIELDS),
            ("income_statement", IS_PERIODS, IS_FIELDS),
            ("cash_flow", CF_PERIODS, CF_FIELDS),
        ]

        for table_name, periods, fields in fin_tables:
            print(f"Unpivoting {table_name}...")
            result_df = unpivot_financial(df, periods, fields, table_name)
            if not result_df.empty:
                # Drop the 'id' column if accidentally present; AUTOINCREMENT handles it
                if "id" in result_df.columns:
                    result_df.drop(columns=["id"], inplace=True)
                safe_to_sql(result_df, table_name, conn)
            count = cur.execute(f"SELECT COUNT(*) FROM {table_name}").fetchone()[0]
            print(f"  -> {count} rows inserted")

        conn.commit()

        # -- Create indexes --------------------------------------------------
        print("Creating indexes...")
        for idx_ddl in INDEX_DDL:
            cur.execute(idx_ddl)
        conn.commit()

        # -- Summary statistics ----------------------------------------------
        elapsed = time.time() - t_start
        print("\n" + "=" * 60)
        print("SUMMARY")
        print("=" * 60)
        print(f"Database: {DB_PATH}")
        print(f"Duration: {elapsed:.1f}s")
        print(f"Source:   {n_rows} stocks x {n_cols} columns")
        print("-" * 60)
        print(f"{'Table':<30} {'Rows':>10}")
        print("-" * 60)

        all_tables = [
            "companies",
            "market_data",
            "valuation_metrics",
            "profitability_metrics",
            "dividend_data",
            "financial_summary",
            "analyst_data",
            "balance_sheet",
            "income_statement",
            "cash_flow",
        ]
        total_rows = 0
        for tbl in all_tables:
            count = cur.execute(f"SELECT COUNT(*) FROM {tbl}").fetchone()[0]
            print(f"  {tbl:<28} {count:>10,}")
            total_rows += count
        print("-" * 60)
        print(f"  {'TOTAL':<28} {total_rows:>10,}")
        print("=" * 60)
    finally:
        conn.close()
    print("\nDone.")


if __name__ == "__main__":
    main()
