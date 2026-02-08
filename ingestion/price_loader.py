"""
price_loader.py
===============
Loads daily OHLCV price data into the price_history PostgreSQL table.

Supports two modes:
  1. **yfinance**: Fetch live data from Yahoo Finance for Saudi stocks (.SR suffix)
  2. **CSV**: Load from CSV files (per-ticker or combined)

Features:
  - Batch processing: N tickers at a time (default: 10)
  - Rate limiting: configurable sleep between batches (default: 2s)
  - Exponential backoff on Yahoo Finance rate limiting
  - Dedup by (ticker, trade_date) via ON CONFLICT DO NOTHING
  - Computes change_amount and change_pct from previous close
  - Handles partial failures (continues processing remaining tickers)
  - Progress tracking with logging

Usage:
    # Fetch prices from Yahoo Finance for specific tickers
    python ingestion/price_loader.py --tickers 2222.SR 1010.SR --from-date 2024-01-01

    # Fetch prices for ALL tickers in the companies table
    python ingestion/price_loader.py --all --from-date 2024-01-01

    # Load from a single CSV
    python ingestion/price_loader.py --file data/prices/2222.SR.csv --ticker 2222.SR

    # Load from a directory of per-ticker CSVs
    python ingestion/price_loader.py --dir data/prices/

    # Dry run
    python ingestion/price_loader.py --tickers 2222.SR --from-date 2024-01-01 --dry-run
"""

import argparse
import logging
import os
import sys
import time
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd

try:
    import yfinance as yf
except ImportError:
    yf = None

try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    psycopg2 = None

from ingestion.config import IngestionConfig

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
DB_BATCH_SIZE = 500

# Columns expected in CSV imports
REQUIRED_COLUMNS = {"trade_date", "open_price", "high_price", "low_price", "close_price", "volume"}

# Alternate column name mappings (common variations)
COLUMN_ALIASES = {
    "date": "trade_date",
    "Date": "trade_date",
    "open": "open_price",
    "Open": "open_price",
    "high": "high_price",
    "High": "high_price",
    "low": "low_price",
    "Low": "low_price",
    "close": "close_price",
    "Close": "close_price",
    "adj close": "close_price",
    "Adj Close": "close_price",
    "Volume": "volume",
    "Ticker": "ticker",
    "Symbol": "ticker",
    "symbol": "ticker",
}

# INSERT SQL with ON CONFLICT DO NOTHING for incremental loading
INSERT_COLUMNS = [
    "ticker", "trade_date", "open_price", "high_price", "low_price",
    "close_price", "volume", "change_amount", "change_pct",
]

INSERT_SQL = (
    f"INSERT INTO price_history ({', '.join(INSERT_COLUMNS)}) "
    f"VALUES ({', '.join(['%s'] * len(INSERT_COLUMNS))}) "
    f"ON CONFLICT (ticker, trade_date) DO NOTHING"
)


# ---------------------------------------------------------------------------
# PriceLoader class (yfinance-based)
# ---------------------------------------------------------------------------

class PriceLoader:
    """Fetches OHLCV price data from Yahoo Finance and loads into PostgreSQL."""

    def __init__(self, pg_conn=None, config: Optional[IngestionConfig] = None, dry_run: bool = False):
        """Initialize PriceLoader.

        Args:
            pg_conn: PostgreSQL connection (or None for dry run).
            config: Ingestion configuration for batch size / rate limits.
            dry_run: If True, don't write to database.
        """
        self.pg_conn = pg_conn
        self.config = config or IngestionConfig()
        self.dry_run = dry_run
        self.stats = {"tickers_processed": 0, "tickers_failed": 0, "rows_inserted": 0}

    def load_prices(
        self,
        tickers: list[str],
        from_date: date,
        to_date: Optional[date] = None,
    ) -> int:
        """Fetch and load price data for a list of tickers.

        Processes tickers in batches with rate limiting between batches.

        Args:
            tickers: List of ticker symbols (e.g., ["2222.SR", "1010.SR"]).
            from_date: Start date for price data.
            to_date: End date (default: today).

        Returns:
            Total number of rows inserted.
        """
        if yf is None:
            raise ImportError("yfinance is required: pip install yfinance")

        if to_date is None:
            to_date = date.today()

        total_inserted = 0
        batch_size = self.config.batch_size
        total_batches = (len(tickers) + batch_size - 1) // batch_size

        logger.info(
            "Loading prices for %d tickers (%s to %s) in %d batches",
            len(tickers), from_date, to_date, total_batches,
        )

        for batch_idx in range(0, len(tickers), batch_size):
            batch = tickers[batch_idx:batch_idx + batch_size]
            batch_num = (batch_idx // batch_size) + 1

            logger.info("Batch %d/%d: %s", batch_num, total_batches, ", ".join(batch))

            for ticker in batch:
                try:
                    count = self._fetch_and_insert_ticker(ticker, from_date, to_date)
                    total_inserted += count
                    self.stats["tickers_processed"] += 1
                    logger.info("  %s: %d rows inserted", ticker, count)
                except Exception as e:
                    self.stats["tickers_failed"] += 1
                    logger.error("  %s: FAILED - %s", ticker, e)

            # Rate limit between batches (skip after last batch)
            if batch_idx + batch_size < len(tickers):
                sleep_time = self.config.rate_limit_seconds
                logger.info("  Sleeping %.1fs before next batch...", sleep_time)
                time.sleep(sleep_time)

        self.stats["rows_inserted"] = total_inserted
        logger.info(
            "Done: %d tickers processed, %d failed, %d total rows inserted",
            self.stats["tickers_processed"],
            self.stats["tickers_failed"],
            total_inserted,
        )
        return total_inserted

    def load_all_prices(
        self,
        from_date: date,
        to_date: Optional[date] = None,
    ) -> int:
        """Fetch and load prices for ALL tickers in the companies table.

        Args:
            from_date: Start date for price data.
            to_date: End date (default: today).

        Returns:
            Total number of rows inserted.
        """
        if self.pg_conn is None:
            raise RuntimeError("Database connection required for load_all_prices")

        cur = self.pg_conn.cursor()
        cur.execute("SELECT ticker FROM companies WHERE ticker LIKE %s ORDER BY ticker", ("%.SR",))
        tickers = [row[0] for row in cur.fetchall()]
        cur.close()

        if not tickers:
            logger.warning("No .SR tickers found in companies table")
            return 0

        logger.info("Found %d .SR tickers in companies table", len(tickers))
        return self.load_prices(tickers, from_date, to_date)

    def _fetch_and_insert_ticker(
        self,
        ticker: str,
        from_date: date,
        to_date: date,
    ) -> int:
        """Fetch data from Yahoo Finance for a single ticker and insert.

        Uses exponential backoff on rate limiting.
        """
        df = self._fetch_with_retry(ticker, from_date, to_date)
        if df is None or df.empty:
            return 0

        # Normalize yfinance output to our schema
        df = self._normalize_yfinance_df(df, ticker)

        # Compute changes
        df = compute_changes(df)

        # Clean for insertion
        numeric = df.select_dtypes(include=[np.number]).columns
        df[numeric] = df[numeric].replace([np.inf, -np.inf], np.nan)

        rows = df_to_insert_tuples(df)
        return insert_prices(self.pg_conn, rows, self.dry_run)

    def _fetch_with_retry(
        self,
        ticker: str,
        from_date: date,
        to_date: date,
    ) -> Optional[pd.DataFrame]:
        """Fetch price data from yfinance with exponential backoff on failure."""
        max_retries = self.config.max_retries
        backoff = self.config.backoff_factor

        for attempt in range(max_retries):
            try:
                stock = yf.Ticker(ticker)
                df = stock.history(
                    start=from_date.isoformat(),
                    end=(to_date + timedelta(days=1)).isoformat(),
                    auto_adjust=True,
                )
                return df
            except Exception as e:
                wait = backoff ** attempt
                if attempt < max_retries - 1:
                    logger.warning(
                        "  %s attempt %d failed: %s (retrying in %.1fs)",
                        ticker, attempt + 1, e, wait,
                    )
                    time.sleep(wait)
                else:
                    logger.error(
                        "  %s: all %d attempts failed: %s", ticker, max_retries, e
                    )
                    return None

    @staticmethod
    def _normalize_yfinance_df(df: pd.DataFrame, ticker: str) -> pd.DataFrame:
        """Normalize yfinance DataFrame to match our price_history schema."""
        if df.empty:
            return df

        df = df.reset_index()

        # Rename columns from yfinance names to our schema
        rename_map = {
            "Date": "trade_date",
            "Open": "open_price",
            "High": "high_price",
            "Low": "low_price",
            "Close": "close_price",
            "Volume": "volume",
        }
        df = df.rename(columns=rename_map)

        # Add ticker
        df["ticker"] = ticker

        # Convert trade_date to date (yfinance returns datetime with timezone)
        if "trade_date" in df.columns:
            df["trade_date"] = pd.to_datetime(df["trade_date"]).dt.date

        # Keep only relevant columns
        keep_cols = ["ticker", "trade_date", "open_price", "high_price", "low_price", "close_price", "volume"]
        available = [c for c in keep_cols if c in df.columns]
        df = df[available]

        # Convert volume to Int64
        if "volume" in df.columns:
            df["volume"] = pd.to_numeric(df["volume"], errors="coerce").astype("Int64")

        # Drop rows with no close price
        df = df.dropna(subset=["trade_date", "close_price"])

        return df


# ---------------------------------------------------------------------------
# CSV data processing (shared utilities)
# ---------------------------------------------------------------------------

def normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Rename columns to match expected names using aliases."""
    rename_map = {}
    for col in df.columns:
        if col in COLUMN_ALIASES:
            rename_map[col] = COLUMN_ALIASES[col]
    if rename_map:
        df = df.rename(columns=rename_map)
    return df


def compute_changes(df: pd.DataFrame) -> pd.DataFrame:
    """Compute change_amount and change_pct from previous close.

    For each ticker, sorts by trade_date and computes:
    - change_amount = close_price - previous_close_price
    - change_pct = (change_amount / previous_close_price) * 100
    """
    df = df.sort_values(["ticker", "trade_date"]).copy()

    df["prev_close"] = df.groupby("ticker")["close_price"].shift(1)
    df["change_amount"] = df["close_price"] - df["prev_close"]
    df["change_pct"] = np.where(
        df["prev_close"] != 0,
        (df["change_amount"] / df["prev_close"]) * 100,
        None,
    )

    # First row for each ticker has no previous close
    df.loc[df["prev_close"].isna(), "change_amount"] = None
    df.loc[df["prev_close"].isna(), "change_pct"] = None

    df = df.drop(columns=["prev_close"])
    return df


def prepare_dataframe(df: pd.DataFrame, ticker: str = None) -> pd.DataFrame:
    """Clean and prepare a CSV DataFrame for loading."""
    df = normalize_columns(df)

    if "ticker" not in df.columns:
        if ticker is None:
            raise ValueError("CSV has no 'ticker' column and --ticker was not provided")
        df["ticker"] = ticker

    missing = REQUIRED_COLUMNS - set(df.columns)
    if missing:
        raise ValueError(f"Missing required columns: {missing}")

    df["trade_date"] = pd.to_datetime(df["trade_date"]).dt.date

    numeric_cols = ["open_price", "high_price", "low_price", "close_price"]
    for col in numeric_cols:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    df["volume"] = pd.to_numeric(df["volume"], errors="coerce").astype("Int64")
    df = df.dropna(subset=["trade_date", "close_price"])
    df = compute_changes(df)

    numeric = df.select_dtypes(include=[np.number]).columns
    df[numeric] = df[numeric].replace([np.inf, -np.inf], np.nan)

    return df


def _clean_val(val):
    """Convert NaN/NaT to None for psycopg2 compatibility."""
    if val is None:
        return None
    if isinstance(val, float) and (np.isnan(val) or np.isinf(val)):
        return None
    if pd.isna(val):
        return None
    return val


def df_to_insert_tuples(df: pd.DataFrame) -> list:
    """Convert DataFrame to list of tuples for INSERT."""
    tuples = []
    for _, row in df.iterrows():
        t = (
            row["ticker"],
            row["trade_date"],
            _clean_val(row.get("open_price")),
            _clean_val(row.get("high_price")),
            _clean_val(row.get("low_price")),
            _clean_val(row.get("close_price")),
            _clean_val(row.get("volume")),
            _clean_val(row.get("change_amount")),
            _clean_val(row.get("change_pct")),
        )
        tuples.append(t)
    return tuples


# ---------------------------------------------------------------------------
# Database operations
# ---------------------------------------------------------------------------

def insert_prices(pg_conn, rows: list, dry_run: bool = False) -> int:
    """Insert price rows into PostgreSQL. Returns count of rows inserted."""
    if not rows:
        return 0

    if dry_run:
        return len(rows)

    cur = pg_conn.cursor()
    inserted = 0
    for i in range(0, len(rows), DB_BATCH_SIZE):
        batch = rows[i:i + DB_BATCH_SIZE]
        psycopg2.extras.execute_batch(cur, INSERT_SQL, batch)
        inserted += len(batch)
    pg_conn.commit()
    return inserted


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def parse_args():
    parser = argparse.ArgumentParser(
        description="Load daily OHLCV price data into price_history table"
    )
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--tickers", nargs="+", help="Ticker symbols to fetch (e.g., 2222.SR 1010.SR)")
    source.add_argument("--all", action="store_true", help="Fetch all .SR tickers from companies table")
    source.add_argument("--file", type=str, help="Path to a single CSV file")
    source.add_argument("--dir", type=str, help="Directory of per-ticker CSV files")

    parser.add_argument("--ticker", type=str, help="Ticker for single-file CSV without ticker column")
    parser.add_argument("--from-date", type=str, default=None, help="Start date YYYY-MM-DD (default: 1 year ago)")
    parser.add_argument("--to-date", type=str, default=None, help="End date YYYY-MM-DD (default: today)")
    parser.add_argument("--pattern", type=str, default="*.csv", help="Glob pattern for --dir mode")
    parser.add_argument("--batch-size", type=int, default=None, help="Tickers per batch (default: 10)")
    parser.add_argument("--rate-limit", type=float, default=None, help="Seconds between batches (default: 2)")
    parser.add_argument("--dry-run", action="store_true", help="Print plan without writing")
    parser.add_argument("--pg-host", default=os.environ.get("PG_HOST", "localhost"))
    parser.add_argument("--pg-port", type=int, default=int(os.environ.get("PG_PORT", "5432")))
    parser.add_argument("--pg-dbname", default=os.environ.get("PG_DBNAME", "radai"))
    parser.add_argument("--pg-user", default=os.environ.get("PG_USER", "radai"))
    parser.add_argument("--pg-password", default=os.environ.get("PG_PASSWORD", ""))
    return parser.parse_args()


def load_single_csv(
    file_path: Path,
    ticker: str,
    pg_conn,
    dry_run: bool,
) -> int:
    """Load a single CSV file. Returns row count."""
    print(f"  Loading: {file_path.name}")

    try:
        df = pd.read_csv(str(file_path), encoding="utf-8-sig")
    except Exception as e:
        print(f"    ERROR reading CSV: {e}")
        return 0

    try:
        df = prepare_dataframe(df, ticker)
    except ValueError as e:
        print(f"    ERROR: {e}")
        return 0

    rows = df_to_insert_tuples(df)
    count = insert_prices(pg_conn, rows, dry_run)

    tickers = df["ticker"].nunique()
    dates = f"{df['trade_date'].min()} to {df['trade_date'].max()}" if not df.empty else "N/A"
    suffix = " (dry run)" if dry_run else ""
    print(f"    {count} rows, {tickers} ticker(s), {dates}{suffix}")

    return count


def main():
    args = parse_args()
    t_start = time.time()

    print("=" * 60)
    print("Price History Loader")
    print("=" * 60)
    if args.dry_run:
        print("MODE: DRY RUN")
    print()

    # Build config from args
    config = IngestionConfig(
        batch_size=args.batch_size,
        rate_limit_seconds=args.rate_limit,
    )

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
        total_rows = 0

        if args.tickers or args.all:
            # yfinance mode
            from_date_str = args.from_date or (date.today() - timedelta(days=365)).isoformat()
            from_date = date.fromisoformat(from_date_str)
            to_date = date.fromisoformat(args.to_date) if args.to_date else date.today()

            loader = PriceLoader(pg_conn=pg_conn, config=config, dry_run=args.dry_run)

            if args.all:
                total_rows = loader.load_all_prices(from_date, to_date)
            else:
                total_rows = loader.load_prices(args.tickers, from_date, to_date)

            print(f"\nProcessed: {loader.stats['tickers_processed']} tickers")
            print(f"Failed: {loader.stats['tickers_failed']} tickers")

        elif args.file:
            file_path = Path(args.file)
            if not file_path.exists():
                print(f"ERROR: File not found: {file_path}")
                sys.exit(1)
            total_rows = load_single_csv(file_path, args.ticker, pg_conn, args.dry_run)

        elif args.dir:
            dir_path = Path(args.dir)
            if not dir_path.exists():
                print(f"ERROR: Directory not found: {dir_path}")
                sys.exit(1)

            files = sorted(dir_path.glob(args.pattern))
            print(f"Found {len(files)} files matching '{args.pattern}'")
            print()

            for file_path in files:
                ticker = args.ticker
                if not ticker:
                    stem = file_path.stem
                    if ".SR" in stem:
                        ticker = stem.split("_")[0] if "_" in stem else stem
                    else:
                        ticker = None

                count = load_single_csv(file_path, ticker, pg_conn, args.dry_run)
                total_rows += count

        # Summary
        elapsed = time.time() - t_start
        print(f"\n{'=' * 60}")
        print(f"Total rows loaded: {total_rows:,}")
        print(f"Duration: {elapsed:.1f}s")

    finally:
        if pg_conn is not None:
            pg_conn.close()


if __name__ == "__main__":
    main()
