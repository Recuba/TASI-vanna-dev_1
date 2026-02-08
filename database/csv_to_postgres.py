"""
csv_to_postgres.py
==================
Converts the flat denormalized CSV file 'saudi_stocks_yahoo_data.csv' (500 stocks,
1062 columns) into a normalized PostgreSQL database.

Adapted from csv_to_sqlite.py with identical column mappings and unpivot logic.
Supports both initial load (create) and incremental upsert modes.

Tables created/populated:
  - companies             (core company info)
  - market_data           (price / volume / shares)
  - valuation_metrics     (PE, PB, EV ratios)
  - profitability_metrics (margins, growth)
  - dividend_data         (dividends)
  - financial_summary     (key financial aggregates)
  - analyst_data          (targets, recommendations)
  - balance_sheet         (unpivoted, multiple rows per ticker)
  - income_statement      (unpivoted, multiple rows per ticker)
  - cash_flow             (unpivoted, multiple rows per ticker)
  - sectors               (populated from unique sectors)
  - entities              (populated from companies)

Usage:
    # Initial load (applies schema, truncates, inserts)
    python database/csv_to_postgres.py

    # Upsert mode (updates existing rows, inserts new)
    python database/csv_to_postgres.py --upsert

    # Dry run
    python database/csv_to_postgres.py --dry-run

    # Custom CSV path
    python database/csv_to_postgres.py --csv-path /path/to/data.csv

Environment variables:
    PG_HOST, PG_PORT, PG_DBNAME, PG_USER, PG_PASSWORD
"""

import argparse
import math
import os
import sys
import time
from pathlib import Path

import pandas as pd
import numpy as np

try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    psycopg2 = None

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
CSV_PATH = PROJECT_DIR / "saudi_stocks_yahoo_data.csv"
SCHEMA_SQL_PATH = SCRIPT_DIR / "schema.sql"
BATCH_SIZE = 250

# ---------------------------------------------------------------------------
# Column mappings (identical to csv_to_sqlite.py)
# Keys   = target column name in PostgreSQL
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
# Financial statement field lists (identical to csv_to_sqlite.py)
# ---------------------------------------------------------------------------

BS_FIELDS = [
    "Total_Assets", "Current_Assets", "Cash_And_Cash_Equivalents",
    "Cash_Cash_Equivalents_And_Short_Term_Investments",
    "Accounts_Receivable", "Inventory", "Other_Current_Assets",
    "Total_Non_Current_Assets", "Net_PPE",
    "Goodwill_And_Other_Intangible_Assets", "Goodwill", "Other_Intangible_Assets",
    "Long_Term_Equity_Investment", "Other_Non_Current_Assets",
    "Total_Liabilities_Net_Minority_Interest",
    "Current_Liabilities", "Current_Debt", "Accounts_Payable", "Other_Current_Liabilities",
    "Total_Non_Current_Liabilities_Net_Minority_Interest",
    "Long_Term_Debt", "Long_Term_Capital_Lease_Obligation", "Capital_Lease_Obligations",
    "Other_Non_Current_Liabilities",
    "Total_Equity_Gross_Minority_Interest", "Stockholders_Equity", "Common_Stock_Equity",
    "Retained_Earnings", "Common_Stock", "Additional_Paid_In_Capital",
    "Treasury_Stock", "Minority_Interest",
    "Total_Capitalization", "Net_Tangible_Assets", "Working_Capital",
    "Invested_Capital", "Tangible_Book_Value",
    "Total_Debt", "Net_Debt",
    "Share_Issued", "Ordinary_Shares_Number", "Treasury_Shares_Number",
]

IS_FIELDS = [
    "Total_Revenue", "Operating_Revenue", "Cost_Of_Revenue", "Gross_Profit",
    "Operating_Expense", "Selling_General_And_Administration",
    "General_And_Administrative_Expense", "Research_And_Development",
    "Operating_Income",
    "Net_Non_Operating_Interest_Income_Expense", "Interest_Income", "Interest_Expense",
    "Other_Non_Operating_Income_Expenses",
    "Pretax_Income", "Tax_Provision", "Tax_Rate_For_Calcs",
    "Net_Income", "Net_Income_Common_Stockholders",
    "Net_Income_Continuous_Operations", "Net_Income_Including_Noncontrolling_Interests",
    "Diluted_EPS", "Basic_EPS",
    "Diluted_Average_Shares", "Basic_Average_Shares",
    "EBITDA", "EBIT", "Reconciled_Depreciation",
    "Total_Operating_Income_As_Reported", "Normalized_EBITDA", "Normalized_Income",
    "Net_Interest_Income", "Total_Expenses", "Minority_Interests",
]

CF_FIELDS = [
    "Operating_Cash_Flow", "Investing_Cash_Flow", "Financing_Cash_Flow",
    "Free_Cash_Flow", "Capital_Expenditure",
    "Depreciation_And_Amortization",
    "Change_In_Working_Capital", "Change_In_Receivables", "Change_In_Inventory",
    "Change_In_Payable", "Change_In_Prepaid_Assets",
    "Stock_Based_Compensation",
    "Net_Income_From_Continuing_Operations",
    "Dividends_Received_Cfi",
    "Interest_Paid_Cfo", "Interest_Received_Cfo", "Taxes_Refund_Paid",
    "Purchase_Of_Business",
    "Purchase_Of_Investment", "Sale_Of_Investment", "Net_Investment_Purchase_And_Sale",
    "Purchase_Of_PPE", "Sale_Of_PPE", "Net_PPE_Purchase_And_Sale",
    "Issuance_Of_Debt", "Long_Term_Debt_Issuance", "Long_Term_Debt_Payments",
    "Repayment_Of_Debt",
    "Issuance_Of_Capital_Stock", "Common_Stock_Issuance",
    "Net_Other_Financing_Charges", "Net_Other_Investing_Changes",
    "Beginning_Cash_Position", "End_Cash_Position", "Changes_In_Cash",
    "Other_Non_Cash_Items",
]

BS_PERIODS = {
    "bs_y0": ("annual", 0), "bs_y1": ("annual", 1),
    "bs_y2": ("annual", 2), "bs_y3": ("annual", 3),
    "bs_q0": ("quarterly", 0), "bs_q1": ("quarterly", 1),
    "bs_q2": ("quarterly", 2), "bs_q3": ("quarterly", 3),
}

IS_PERIODS = {
    "is_y0": ("annual", 0), "is_y1": ("annual", 1),
    "is_y2": ("annual", 2), "is_y3": ("annual", 3),
    "is_q0": ("quarterly", 0), "is_q1": ("quarterly", 1),
    "is_q2": ("quarterly", 2), "is_q3": ("quarterly", 3),
    "is_ttm": ("ttm", 0),
}

CF_PERIODS = {
    "cf_y0": ("annual", 0), "cf_y1": ("annual", 1),
    "cf_y2": ("annual", 2), "cf_y3": ("annual", 3),
    "cf_q0": ("quarterly", 0), "cf_q1": ("quarterly", 1),
    "cf_q2": ("quarterly", 2), "cf_q3": ("quarterly", 3),
    "cf_ttm": ("ttm", 0),
}


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------

def extract_simple_table(df: pd.DataFrame, col_map: dict) -> pd.DataFrame:
    """Extract a subset of columns from the master DataFrame, renaming as needed."""
    src_cols = list(col_map.values())
    existing = [c for c in src_cols if c in df.columns]
    missing = [c for c in src_cols if c not in df.columns]
    if missing:
        print(f"  WARNING: Missing CSV columns: {missing}")

    sub = df[existing].copy()
    rename_map = {v: k for k, v in col_map.items() if v in existing}
    sub.rename(columns=rename_map, inplace=True)
    return sub


def unpivot_financial(
    df: pd.DataFrame,
    periods: dict,
    fields: list,
    table_name: str,
) -> pd.DataFrame:
    """Unpivot flat financial columns into normalized rows.

    Identical logic to csv_to_sqlite.py.
    """
    all_rows = []
    tickers = df["ticker"].values
    total = len(tickers)

    for prefix, (period_type, period_index) in periods.items():
        date_col = f"{prefix}_date"
        if date_col not in df.columns:
            print(f"  WARNING: date column '{date_col}' not found -- skipping prefix '{prefix}'")
            continue

        src_cols = [f"{prefix}_{f}" for f in fields]
        tgt_cols = [f.lower() for f in fields]

        existing_src = [c for c in src_cols if c in df.columns]
        existing_tgt = [fields[i].lower() for i, c in enumerate(src_cols) if c in df.columns]

        dates = df[date_col].values

        if existing_src:
            data_block = df[existing_src].values
        else:
            continue

        for row_idx in range(total):
            date_val = dates[row_idx]
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
            missing_src = [c for c in src_cols if c not in df.columns]
            for c in missing_src:
                field_name = c.split(f"{prefix}_", 1)[1].lower()
                row_dict[field_name] = None

            all_rows.append(row_dict)

    if not all_rows:
        print(f"  WARNING: No rows produced for {table_name}")
        return pd.DataFrame()

    return pd.DataFrame(all_rows)


def clean_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    """Replace NaN/Inf with None for proper NULL storage in PostgreSQL."""
    df = df.replace([np.inf, -np.inf], np.nan)
    df = df.where(pd.notnull(df), None)
    return df


def df_to_tuples(df: pd.DataFrame) -> list:
    """Convert DataFrame rows to list of tuples for psycopg2."""
    return [tuple(None if pd.isna(v) else v for v in row) for row in df.values]


def build_insert_sql(table: str, columns: list) -> str:
    """Build a parameterized INSERT statement."""
    cols_str = ", ".join(columns)
    placeholders = ", ".join(["%s"] * len(columns))
    return f"INSERT INTO {table} ({cols_str}) VALUES ({placeholders})"


def build_upsert_sql(table: str, columns: list, pk_columns: list) -> str:
    """Build an INSERT ... ON CONFLICT DO UPDATE statement."""
    cols_str = ", ".join(columns)
    placeholders = ", ".join(["%s"] * len(columns))
    pk_str = ", ".join(pk_columns)
    update_cols = [c for c in columns if c not in pk_columns]
    updates = ", ".join([f"{c} = EXCLUDED.{c}" for c in update_cols])
    if updates:
        return (
            f"INSERT INTO {table} ({cols_str}) VALUES ({placeholders}) "
            f"ON CONFLICT ({pk_str}) DO UPDATE SET {updates}"
        )
    return (
        f"INSERT INTO {table} ({cols_str}) VALUES ({placeholders}) "
        f"ON CONFLICT ({pk_str}) DO NOTHING"
    )


# Primary keys for upsert mode
TABLE_PKS = {
    "companies": ["ticker"],
    "market_data": ["ticker"],
    "valuation_metrics": ["ticker"],
    "profitability_metrics": ["ticker"],
    "dividend_data": ["ticker"],
    "financial_summary": ["ticker"],
    "analyst_data": ["ticker"],
}

# Financial statement tables use (ticker, period_type, period_index) as logical key for upsert
FIN_UPSERT_KEY = ["ticker", "period_type", "period_index", "period_date"]


# ---------------------------------------------------------------------------
# Insert/Upsert logic
# ---------------------------------------------------------------------------

def insert_batch(pg_conn, sql: str, rows: list, batch_size: int) -> int:
    """Insert rows in batches. Returns total rows inserted."""
    cur = pg_conn.cursor()
    total = 0
    for i in range(0, len(rows), batch_size):
        batch = rows[i:i + batch_size]
        psycopg2.extras.execute_batch(cur, sql, batch)
        total += len(batch)
    pg_conn.commit()
    return total


def load_simple_table(
    df: pd.DataFrame,
    col_map: dict,
    table: str,
    pg_conn,
    upsert: bool,
    dry_run: bool,
) -> int:
    """Extract, clean, and load a simple table."""
    sub = extract_simple_table(df, col_map)
    sub = clean_dataframe(sub)
    columns = list(sub.columns)
    rows = df_to_tuples(sub)

    if dry_run:
        print(f"  {table}: {len(rows)} rows (dry run)")
        return len(rows)

    if upsert and table in TABLE_PKS:
        sql = build_upsert_sql(table, columns, TABLE_PKS[table])
    else:
        sql = build_insert_sql(table, columns)

    count = insert_batch(pg_conn, sql, rows, BATCH_SIZE)
    print(f"  {table}: {count} rows {'upserted' if upsert else 'inserted'}")
    return count


def load_financial_table(
    df: pd.DataFrame,
    periods: dict,
    fields: list,
    table: str,
    pg_conn,
    upsert: bool,
    dry_run: bool,
) -> int:
    """Unpivot and load a financial statement table."""
    result_df = unpivot_financial(df, periods, fields, table)
    if result_df.empty:
        print(f"  {table}: 0 rows")
        return 0

    result_df = clean_dataframe(result_df)
    columns = list(result_df.columns)
    rows = df_to_tuples(result_df)

    if dry_run:
        print(f"  {table}: {len(rows)} rows (dry run)")
        return len(rows)

    if upsert:
        sql = build_upsert_sql(table, columns, FIN_UPSERT_KEY)
    else:
        sql = build_insert_sql(table, columns)

    count = insert_batch(pg_conn, sql, rows, BATCH_SIZE)
    print(f"  {table}: {count} rows {'upserted' if upsert else 'inserted'}")
    return count


def populate_sectors(df: pd.DataFrame, pg_conn, dry_run: bool) -> dict:
    """Insert unique sectors and return name->id mapping."""
    sectors = sorted(df["sector"].dropna().unique())

    if dry_run:
        print(f"  sectors: {len(sectors)} unique sectors (dry run)")
        return {s: i for i, s in enumerate(sectors, 1)}

    cur = pg_conn.cursor()
    sector_map = {}
    for name in sectors:
        cur.execute(
            "INSERT INTO sectors (name_en) VALUES (%s) "
            "ON CONFLICT (name_en) DO NOTHING RETURNING id",
            (name,),
        )
        result = cur.fetchone()
        if result:
            sector_map[name] = result[0]
        else:
            cur.execute("SELECT id FROM sectors WHERE name_en = %s", (name,))
            sector_map[name] = cur.fetchone()[0]
    pg_conn.commit()
    print(f"  sectors: {len(sectors)} rows populated")
    return sector_map


def populate_entities(df: pd.DataFrame, sector_map: dict, pg_conn, dry_run: bool) -> int:
    """Populate entities table from companies data."""
    rows = []
    for _, row in df.iterrows():
        ticker = row.get("ticker")
        short_name = row.get("short_name")
        sector = row.get("sector")
        sector_id = sector_map.get(sector) if pd.notna(sector) else None
        rows.append((ticker, short_name, sector_id))

    if dry_run:
        print(f"  entities: {len(rows)} rows (dry run)")
        return len(rows)

    sql = (
        "INSERT INTO entities (ticker, name_en, sector_id) "
        "VALUES (%s, %s, %s) "
        "ON CONFLICT (ticker) DO UPDATE SET name_en = EXCLUDED.name_en, sector_id = EXCLUDED.sector_id"
    )
    count = insert_batch(pg_conn, sql, rows, BATCH_SIZE)
    print(f"  entities: {count} rows populated")
    return count


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def parse_args():
    parser = argparse.ArgumentParser(
        description="Load CSV data into PostgreSQL (adapted from csv_to_sqlite.py)"
    )
    parser.add_argument("--dry-run", action="store_true", help="Print plan without writing")
    parser.add_argument("--upsert", action="store_true", help="Use ON CONFLICT DO UPDATE instead of plain INSERT")
    parser.add_argument("--skip-schema", action="store_true", help="Skip applying schema.sql")
    parser.add_argument("--skip-truncate", action="store_true", help="Skip truncating tables before insert")
    parser.add_argument("--csv-path", type=str, default=str(CSV_PATH), help="Path to source CSV")
    parser.add_argument("--pg-host", default=os.environ.get("PG_HOST", "localhost"))
    parser.add_argument("--pg-port", type=int, default=int(os.environ.get("PG_PORT", "5432")))
    parser.add_argument("--pg-dbname", default=os.environ.get("PG_DBNAME", "radai"))
    parser.add_argument("--pg-user", default=os.environ.get("PG_USER", "radai"))
    parser.add_argument("--pg-password", default=os.environ.get("PG_PASSWORD", ""))
    return parser.parse_args()


def main():
    args = parse_args()
    t_start = time.time()

    print("=" * 60)
    print("CSV -> PostgreSQL Pipeline")
    print("=" * 60)
    mode = "DRY RUN" if args.dry_run else ("UPSERT" if args.upsert else "INSERT")
    print(f"Mode: {mode}")
    print(f"CSV source: {args.csv_path}")
    print(f"PostgreSQL: {args.pg_user}@{args.pg_host}:{args.pg_port}/{args.pg_dbname}")
    print()

    # Read CSV
    csv_path = Path(args.csv_path)
    if not csv_path.exists():
        print(f"ERROR: CSV file not found at {csv_path}")
        sys.exit(1)

    print("Reading CSV...")
    df = pd.read_csv(str(csv_path), encoding="utf-8-sig", low_memory=False)
    n_rows, n_cols = df.shape
    print(f"  Loaded {n_rows} rows x {n_cols} columns")
    print()

    # Connect to PostgreSQL
    pg_conn = None
    if not args.dry_run:
        if psycopg2 is None:
            print("ERROR: psycopg2 is not installed. Install with: pip install psycopg2-binary")
            sys.exit(1)
        try:
            pg_conn = psycopg2.connect(
                host=args.pg_host,
                port=args.pg_port,
                dbname=args.pg_dbname,
                user=args.pg_user,
                password=args.pg_password,
            )
            pg_conn.autocommit = False
        except psycopg2.OperationalError as e:
            print(f"ERROR: Cannot connect to PostgreSQL: {e}")
            sys.exit(1)

    try:
        # Step 1: Apply schema
        if not args.skip_schema:
            print("Step 1: Applying schema...")
            if args.dry_run:
                schema_sql = SCHEMA_SQL_PATH.read_text(encoding="utf-8")
                print(f"  Schema: {len(schema_sql)} chars from {SCHEMA_SQL_PATH.name} (dry run)")
            else:
                schema_sql = SCHEMA_SQL_PATH.read_text(encoding="utf-8")
                pg_conn.cursor().execute(schema_sql)
                pg_conn.commit()
                print(f"  Schema applied from {SCHEMA_SQL_PATH.name}")
        else:
            print("Step 1: Skipped (--skip-schema)")
        print()

        # Step 2: Truncate tables (unless upsert or skip-truncate)
        tables_to_truncate = [
            "cash_flow", "income_statement", "balance_sheet",
            "analyst_data", "financial_summary", "dividend_data",
            "profitability_metrics", "valuation_metrics", "market_data",
            "entities", "sectors", "companies",
        ]
        if not args.upsert and not args.skip_truncate and not args.dry_run:
            print("Step 2: Truncating existing data...")
            cur = pg_conn.cursor()
            for table in tables_to_truncate:
                cur.execute(f"TRUNCATE TABLE {table} CASCADE")
            pg_conn.commit()
            print(f"  Truncated {len(tables_to_truncate)} tables")
        else:
            reason = "upsert mode" if args.upsert else ("--skip-truncate" if args.skip_truncate else "dry run")
            print(f"Step 2: Truncation skipped ({reason})")
        print()

        # Step 3: Load simple tables
        print("Step 3: Loading simple tables...")
        simple_tables = [
            ("companies", COMPANIES_COLS),
            ("market_data", MARKET_DATA_COLS),
            ("valuation_metrics", VALUATION_COLS),
            ("profitability_metrics", PROFITABILITY_COLS),
            ("dividend_data", DIVIDEND_COLS),
            ("financial_summary", FINANCIAL_SUMMARY_COLS),
            ("analyst_data", ANALYST_COLS),
        ]

        total_rows = 0
        table_counts = {}
        for table, col_map in simple_tables:
            count = load_simple_table(df, col_map, table, pg_conn, args.upsert, args.dry_run)
            table_counts[table] = count
            total_rows += count
        print()

        # Step 4: Load financial statement tables
        print("Step 4: Loading financial statement tables...")
        fin_tables = [
            ("balance_sheet", BS_PERIODS, BS_FIELDS),
            ("income_statement", IS_PERIODS, IS_FIELDS),
            ("cash_flow", CF_PERIODS, CF_FIELDS),
        ]

        for table, periods, fields in fin_tables:
            count = load_financial_table(df, periods, fields, table, pg_conn, args.upsert, args.dry_run)
            table_counts[table] = count
            total_rows += count
        print()

        # Step 5: Populate reference tables
        print("Step 5: Populating reference tables...")
        sector_map = populate_sectors(df, pg_conn, args.dry_run)
        table_counts["sectors"] = len(sector_map)

        entities_count = populate_entities(df, sector_map, pg_conn, args.dry_run)
        table_counts["entities"] = entities_count
        total_rows += len(sector_map) + entities_count
        print()

        # Summary
        elapsed = time.time() - t_start
        print("=" * 60)
        print("SUMMARY")
        print("=" * 60)
        print(f"{'Table':<30} {'Rows':>10}")
        print("-" * 42)
        for table in [t for t, _ in simple_tables] + [t for t, _, _ in fin_tables] + ["sectors", "entities"]:
            print(f"  {table:<28} {table_counts.get(table, 0):>10,}")
        print("-" * 42)
        print(f"  {'TOTAL':<28} {total_rows:>10,}")
        print(f"\nDuration: {elapsed:.1f}s")
        if args.dry_run:
            print("\nDRY RUN complete. No data was written.")
        else:
            print(f"\nPipeline complete ({mode} mode).")

    finally:
        if pg_conn is not None:
            pg_conn.close()


if __name__ == "__main__":
    main()
