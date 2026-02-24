"""
Tests for services/news_scheduler.py
======================================
Covers NewsScheduler lifecycle (start/stop), _fetch_cycle with mocked
scrapers, error counting, stats reporting, and the run loop without
actually starting threads.
"""

import sys
import threading
import time
from pathlib import Path
from unittest.mock import MagicMock, patch, PropertyMock

import pytest

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_store():
    """Mock NewsStore with store_articles and cleanup_old."""
    store = MagicMock()
    store.store_articles.return_value = 5  # 5 articles inserted
    store.cleanup_old.return_value = 2  # 2 articles cleaned
    return store


@pytest.fixture
def scheduler(mock_store):
    """Create a NewsScheduler with a mock store."""
    from services.news_scheduler import NewsScheduler

    return NewsScheduler(mock_store)


class FakeScraper:
    """A fake scraper class for testing."""

    source_name = "FakeSource"

    def fetch_articles(self):
        return [
            {"title": "Article 1", "source_name": "FakeSource"},
            {"title": "Article 2", "source_name": "FakeSource"},
        ]


class FailingScraper:
    """A scraper that always raises."""

    source_name = "FailingSource"

    def fetch_articles(self):
        raise ConnectionError("Network error")


# ===========================================================================
# NewsScheduler init and state
# ===========================================================================


class TestNewsSchedulerInit:
    """Tests for initial scheduler state."""

    def test_initial_state(self, scheduler):
        assert scheduler._running is False
        assert scheduler._thread is None
        assert scheduler._run_count == 0
        assert scheduler._total_articles_stored == 0
        assert scheduler._last_run_at is None

    def test_get_stats_initial(self, scheduler):
        stats = scheduler.get_stats()
        assert stats["run_count"] == 0
        assert stats["last_run_at"] is None
        assert stats["total_articles_stored"] == 0
        assert stats["source_errors"] == {}
        assert stats["is_running"] is False

    def test_get_source_error_counts_initial(self, scheduler):
        assert scheduler.get_source_error_counts() == {}


# ===========================================================================
# _fetch_cycle tests (core logic, no threads)
# ===========================================================================


class TestFetchCycle:
    """Tests for _fetch_cycle with mocked scrapers."""

    @patch("services.news_scheduler.time")
    def test_fetch_cycle_success(self, mock_time, scheduler, mock_store):
        """Successful fetch cycle stores articles and cleans old ones."""
        fake_scrapers = [FakeScraper]

        with patch(
            "services.news_scraper.ALL_SCRAPERS", fake_scrapers
        ), patch(
            "services.news_scraper.INTER_REQUEST_DELAY", 0
        ):
            inserted = scheduler._fetch_cycle()

        assert inserted == 5  # mock_store.store_articles returns 5
        mock_store.store_articles.assert_called_once()
        mock_store.cleanup_old.assert_called_once()

        # Verify the articles passed to store
        args = mock_store.store_articles.call_args[0][0]
        assert len(args) == 2
        assert args[0]["title"] == "Article 1"

    @patch("services.news_scheduler.time")
    def test_fetch_cycle_with_failing_scraper(self, mock_time, scheduler, mock_store):
        """Failing scrapers increment error counts but don't break the cycle."""
        fake_scrapers = [FakeScraper, FailingScraper]

        with patch(
            "services.news_scraper.ALL_SCRAPERS", fake_scrapers
        ), patch(
            "services.news_scraper.INTER_REQUEST_DELAY", 0
        ):
            inserted = scheduler._fetch_cycle()

        # FakeScraper articles should still be stored
        assert inserted == 5
        mock_store.store_articles.assert_called_once()

        # FailingSource should have 1 error
        errors = scheduler.get_source_error_counts()
        assert errors.get("FailingSource") == 1

    @patch("services.news_scheduler.time")
    def test_fetch_cycle_all_scrapers_fail(self, mock_time, scheduler, mock_store):
        """When all scrapers fail, no articles are stored."""
        with patch(
            "services.news_scraper.ALL_SCRAPERS", [FailingScraper]
        ), patch(
            "services.news_scraper.INTER_REQUEST_DELAY", 0
        ):
            inserted = scheduler._fetch_cycle()

        assert inserted == 0
        mock_store.store_articles.assert_not_called()  # no articles to store
        errors = scheduler.get_source_error_counts()
        assert errors.get("FailingSource") == 1

    @patch("services.news_scheduler.time")
    def test_fetch_cycle_no_scrapers(self, mock_time, scheduler, mock_store):
        """Empty scraper list results in no articles."""
        with patch(
            "services.news_scraper.ALL_SCRAPERS", []
        ), patch(
            "services.news_scraper.INTER_REQUEST_DELAY", 0
        ):
            inserted = scheduler._fetch_cycle()

        assert inserted == 0
        mock_store.store_articles.assert_not_called()

    @patch("services.news_scheduler.time")
    def test_fetch_cycle_cumulative_errors(self, mock_time, scheduler, mock_store):
        """Error counts accumulate across cycles."""
        with patch(
            "services.news_scraper.ALL_SCRAPERS", [FailingScraper]
        ), patch(
            "services.news_scraper.INTER_REQUEST_DELAY", 0
        ):
            scheduler._fetch_cycle()
            scheduler._fetch_cycle()

        errors = scheduler.get_source_error_counts()
        assert errors.get("FailingSource") == 2

    @patch("services.news_scheduler.time")
    def test_fetch_cycle_store_exception_caught(self, mock_time, scheduler, mock_store):
        """If store.store_articles raises, cycle catches and returns 0."""
        mock_store.store_articles.side_effect = Exception("DB write failed")

        with patch(
            "services.news_scraper.ALL_SCRAPERS", [FakeScraper]
        ), patch(
            "services.news_scraper.INTER_REQUEST_DELAY", 0
        ):
            inserted = scheduler._fetch_cycle()

        # The outer try/except catches the exception
        assert inserted == 0


# ===========================================================================
# start / stop lifecycle
# ===========================================================================


class TestNewsSchedulerLifecycle:
    """Tests for start() and stop() without running the actual loop."""

    def test_start_sets_running(self, scheduler):
        """start() creates a daemon thread and sets _running."""
        with patch.object(scheduler, "_run_loop"):
            scheduler.start()
            assert scheduler._running is True
            assert scheduler._thread is not None
            assert scheduler._thread.daemon is True
            scheduler.stop()

    def test_start_twice_logs_warning(self, scheduler):
        """Calling start() when already running is a no-op."""
        with patch.object(scheduler, "_run_loop"):
            scheduler.start()
            original_thread = scheduler._thread
            scheduler.start()  # should not create new thread
            assert scheduler._thread is original_thread
            scheduler.stop()

    def test_stop_sets_not_running(self, scheduler):
        """stop() clears _running flag."""
        scheduler._running = True
        scheduler.stop()
        assert scheduler._running is False

    def test_stop_when_not_running_is_noop(self, scheduler):
        """stop() when not running does nothing."""
        scheduler.stop()  # should not raise
        assert scheduler._running is False


# ===========================================================================
# _run_loop behavior
# ===========================================================================


class TestRunLoop:
    """Tests for _run_loop logic (without real threads/sleeps)."""

    @patch("services.news_scheduler.time")
    def test_run_loop_executes_fetch_then_stops(self, mock_time, scheduler, mock_store):
        """_run_loop executes one fetch cycle, then stops when _running is False."""
        # Make the first call to _fetch_cycle succeed, then immediately stop
        call_count = 0

        def fake_fetch_cycle():
            nonlocal call_count
            call_count += 1
            scheduler._running = False  # stop after first fetch
            return 3

        with patch.object(scheduler, "_fetch_cycle", side_effect=fake_fetch_cycle):
            scheduler._running = True
            scheduler._run_loop()

        assert call_count == 1
        assert scheduler._run_count == 1
        assert scheduler._total_articles_stored == 3
        assert scheduler._last_run_at is not None


# ===========================================================================
# Stats reporting
# ===========================================================================


class TestSchedulerStats:
    """Tests for get_stats()."""

    def test_stats_after_manual_fetch(self, scheduler, mock_store):
        """Stats update after a manual _fetch_cycle call."""
        with patch(
            "services.news_scraper.ALL_SCRAPERS", [FakeScraper]
        ), patch(
            "services.news_scraper.INTER_REQUEST_DELAY", 0
        ):
            inserted = scheduler._fetch_cycle()

        scheduler._total_articles_stored += inserted
        scheduler._run_count += 1

        stats = scheduler.get_stats()
        assert stats["run_count"] == 1
        assert stats["total_articles_stored"] == 5
        assert stats["is_running"] is False

    def test_stats_reflects_running_state(self, scheduler):
        scheduler._running = True
        assert scheduler.get_stats()["is_running"] is True
        scheduler._running = False
        assert scheduler.get_stats()["is_running"] is False
