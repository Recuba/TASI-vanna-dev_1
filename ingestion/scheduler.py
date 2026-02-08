"""
scheduler.py
============
APScheduler-based ingestion scheduler for automated data loading.

Schedules:
  - price_loader: daily at 17:00 (after Saudi market close at 15:00 + buffer)
  - xbrl_processor: weekly on Friday at 20:00

Usage:
    python -m ingestion.scheduler

    # With custom PostgreSQL settings
    PG_HOST=myhost PG_PORT=5432 python -m ingestion.scheduler

Environment variables:
    PG_HOST, PG_PORT, PG_DBNAME, PG_USER, PG_PASSWORD
    INGESTION_BATCH_SIZE, INGESTION_RATE_LIMIT_SECONDS
"""

import logging
import os
import signal
import sys
from datetime import date, timedelta
from pathlib import Path

try:
    from apscheduler.schedulers.blocking import BlockingScheduler
    from apscheduler.triggers.cron import CronTrigger
except ImportError:
    BlockingScheduler = None
    CronTrigger = None

try:
    import psycopg2
except ImportError:
    psycopg2 = None

from ingestion.config import IngestionConfig
from ingestion.price_loader import PriceLoader

logger = logging.getLogger(__name__)

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent


def _get_pg_conn():
    """Create a PostgreSQL connection from environment variables."""
    if psycopg2 is None:
        raise ImportError("psycopg2 is required: pip install psycopg2-binary")

    return psycopg2.connect(
        host=os.environ.get("PG_HOST", "localhost"),
        port=int(os.environ.get("PG_PORT", "5432")),
        dbname=os.environ.get("PG_DBNAME", "radai"),
        user=os.environ.get("PG_USER", "radai"),
        password=os.environ.get("PG_PASSWORD", ""),
    )


def job_load_prices():
    """Scheduled job: fetch yesterday's prices for all Saudi stocks."""
    logger.info("=== Scheduled price load starting ===")
    pg_conn = None
    try:
        pg_conn = _get_pg_conn()
        pg_conn.autocommit = False

        config = IngestionConfig()
        loader = PriceLoader(pg_conn=pg_conn, config=config)

        # Fetch last 3 days to handle weekends/holidays
        from_date = date.today() - timedelta(days=3)
        to_date = date.today()

        total = loader.load_all_prices(from_date, to_date)
        logger.info(
            "Price load complete: %d rows inserted, %d tickers processed, %d failed",
            total, loader.stats["tickers_processed"], loader.stats["tickers_failed"],
        )
    except Exception as e:
        logger.error("Price load job failed: %s", e)
    finally:
        if pg_conn is not None:
            pg_conn.close()


def job_process_xbrl():
    """Scheduled job: process any new XBRL filings in the ingestion directory."""
    logger.info("=== Scheduled XBRL processing starting ===")

    from ingestion.xbrl_processor import XBRLProcessor, insert_facts, create_filing, mark_filing_complete

    filings_dir = PROJECT_DIR / "data" / "filings"
    if not filings_dir.exists():
        logger.info("No filings directory found at %s - skipping", filings_dir)
        return

    pg_conn = None
    try:
        pg_conn = _get_pg_conn()
        pg_conn.autocommit = False

        supported = {".xml", ".xbrl", ".xlsx", ".xls"}
        files = [f for f in sorted(filings_dir.iterdir()) if f.suffix.lower() in supported]

        if not files:
            logger.info("No filing files found in %s", filings_dir)
            return

        total_facts = 0
        for file_path in files:
            # Extract ticker from filename (e.g., '2222.SR_annual.xml')
            stem = file_path.stem
            parts = stem.split("_")
            if parts and ".SR" in parts[0]:
                ticker = parts[0]
            else:
                logger.warning("Skipping %s: cannot determine ticker from filename", file_path.name)
                continue

            filing_id = create_filing(
                pg_conn, ticker, "annual", date.today(),
                "Tadawul", str(file_path),
            )

            processor = XBRLProcessor(
                ticker=ticker,
                filing_id=filing_id,
                source_url=str(file_path),
            )
            facts = processor.process_filing(file_path)

            if facts:
                count = insert_facts(pg_conn, facts)
                total_facts += count
                mark_filing_complete(pg_conn, filing_id)
                logger.info("  %s: %d facts inserted", file_path.name, count)

            if processor.errors:
                for err in processor.errors[:3]:
                    logger.warning("  %s: %s", file_path.name, err)

        logger.info("XBRL processing complete: %d total facts inserted", total_facts)

    except Exception as e:
        logger.error("XBRL processing job failed: %s", e)
    finally:
        if pg_conn is not None:
            pg_conn.close()


def main():
    """Start the ingestion scheduler."""
    if BlockingScheduler is None:
        print("ERROR: APScheduler is required: pip install apscheduler>=3.10.0")
        sys.exit(1)

    # Configure logging
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    scheduler = BlockingScheduler()

    # Price loader: daily at 17:00 (Saudi market closes at 15:00, +2h buffer)
    scheduler.add_job(
        job_load_prices,
        CronTrigger(hour=17, minute=0),
        id="price_loader",
        name="Daily Price Loader",
        misfire_grace_time=3600,
    )

    # XBRL processor: weekly on Friday at 20:00
    scheduler.add_job(
        job_process_xbrl,
        CronTrigger(day_of_week="fri", hour=20, minute=0),
        id="xbrl_processor",
        name="Weekly XBRL Processor",
        misfire_grace_time=7200,
    )

    # Graceful shutdown
    def handle_signal(signum, frame):
        logger.info("Received signal %d, shutting down scheduler...", signum)
        scheduler.shutdown(wait=False)

    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)

    logger.info("Ingestion scheduler starting...")
    logger.info("  Price loader: daily at 17:00")
    logger.info("  XBRL processor: weekly Friday at 20:00")

    try:
        scheduler.start()
    except (KeyboardInterrupt, SystemExit):
        logger.info("Scheduler stopped")


if __name__ == "__main__":
    main()
