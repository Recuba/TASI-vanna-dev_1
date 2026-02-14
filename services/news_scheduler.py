"""
News Scheduler
===============
Background scheduler that periodically runs the news scrapers and stores
results into the NewsStore (SQLite).

Usage:
    from services.news_store import NewsStore
    from services.news_scheduler import NewsScheduler

    store = NewsStore("saudi_stocks.db")
    scheduler = NewsScheduler(store)
    scheduler.start()   # non-blocking, runs in a daemon thread
    ...
    scheduler.stop()
"""

from __future__ import annotations

import logging
import threading
import time

from config import get_settings
from services.news_store import NewsStore

logger = logging.getLogger(__name__)

_scraper_cfg = get_settings().scraper
FETCH_INTERVAL_SECONDS = _scraper_cfg.fetch_interval_seconds


class NewsScheduler:
    """Background news fetcher that runs scrapers on a timer."""

    def __init__(self, store: NewsStore):
        self.store = store
        self._running = False
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        """Start background thread that fetches news periodically."""
        if self._running:
            logger.warning("NewsScheduler already running")
            return

        self._running = True
        self._thread = threading.Thread(target=self._run_loop, daemon=True)
        self._thread.start()
        logger.info("NewsScheduler started (interval=%ds)", FETCH_INTERVAL_SECONDS)

    def stop(self) -> None:
        """Stop the scheduler gracefully."""
        if not self._running:
            return
        self._running = False
        logger.info("NewsScheduler stopping")

    def _run_loop(self) -> None:
        """Main loop: fetch immediately, then sleep between cycles."""
        # Fetch immediately on start
        self._fetch_cycle()

        while self._running:
            # Sleep in small increments so stop() is responsive
            for _ in range(FETCH_INTERVAL_SECONDS):
                if not self._running:
                    return
                time.sleep(1)

            if self._running:
                self._fetch_cycle()

    def _fetch_cycle(self) -> None:
        """One fetch cycle: run all scrapers, store results, clean old."""
        try:
            from services.news_scraper import fetch_all_news

            logger.info("News fetch cycle starting")
            articles = fetch_all_news()
            if articles:
                inserted = self.store.store_articles(articles)
                logger.info(
                    "News fetch cycle complete: %d fetched, %d new",
                    len(articles),
                    inserted,
                )
            else:
                logger.info("News fetch cycle complete: no articles returned")

            self.store.cleanup_old(days=_scraper_cfg.cleanup_age_days)

        except Exception:
            logger.warning("News fetch cycle failed", exc_info=True)
