"""
News Store Tests
=================
Tests for services/news_store.py (SQLite-backed news storage).
Uses temporary databases via tempfile to avoid polluting real data.
"""

import os
import sys
import tempfile
import unittest
from datetime import datetime, timedelta

# Ensure project root is on sys.path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from services.news_store import NewsStore


def _make_article(
    title: str = "عنوان الخبر",
    body: str = "نص المقال",
    source_name: str = "العربية",
    source_url: str = "https://example.com/article/1",
    priority: int = 1,
    language: str = "ar",
    **overrides,
) -> dict:
    """Build a test article dict."""
    a = {
        "title": title,
        "body": body,
        "source_name": source_name,
        "source_url": source_url,
        "published_at": None,
        "priority": priority,
        "language": language,
    }
    a.update(overrides)
    return a


class TestTableCreation(unittest.TestCase):
    """Creating a NewsStore on a new DB file creates the table."""

    def test_table_created(self):
        with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
            db_path = f.name
        try:
            NewsStore(db_path)
            import sqlite3

            conn = sqlite3.connect(db_path)
            cursor = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='news_articles'"
            )
            row = cursor.fetchone()
            conn.close()
            self.assertIsNotNone(row)
        finally:
            os.unlink(db_path)

    def test_indexes_created(self):
        with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
            db_path = f.name
        try:
            NewsStore(db_path)
            import sqlite3

            conn = sqlite3.connect(db_path)
            rows = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_news_%'"
            ).fetchall()
            conn.close()
            # Expect at least 3 indexes
            self.assertGreaterEqual(len(rows), 3)
        finally:
            os.unlink(db_path)


class TestStoreArticles(unittest.TestCase):
    """store_articles inserts valid data and returns correct count."""

    def setUp(self):
        self._tmpfile = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        self.db_path = self._tmpfile.name
        self._tmpfile.close()
        self.store = NewsStore(self.db_path)

    def tearDown(self):
        os.unlink(self.db_path)

    def test_store_returns_inserted_count(self):
        articles = [_make_article(title="خبر 1"), _make_article(title="خبر 2")]
        count = self.store.store_articles(articles)
        self.assertEqual(count, 2)

    def test_store_empty_list(self):
        count = self.store.store_articles([])
        self.assertEqual(count, 0)

    def test_duplicate_prevention_same_title_and_source(self):
        a = _make_article(title="خبر مكرر", source_name="العربية")
        self.store.store_articles([a])
        count = self.store.store_articles([a])
        self.assertEqual(count, 0)

    def test_same_title_different_source_allowed(self):
        a1 = _make_article(title="خبر مشترك", source_name="العربية")
        a2 = _make_article(title="خبر مشترك", source_name="أرقام")
        self.store.store_articles([a1])
        count = self.store.store_articles([a2])
        self.assertEqual(count, 1)


class TestGetLatestNews(unittest.TestCase):
    """get_latest_news returns articles with correct ordering and filtering."""

    def setUp(self):
        self._tmpfile = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        self.db_path = self._tmpfile.name
        self._tmpfile.close()
        self.store = NewsStore(self.db_path)

    def tearDown(self):
        os.unlink(self.db_path)

    def _seed(self, n=5):
        articles = [
            _make_article(
                title=f"خبر رقم {i}",
                source_name="العربية" if i % 2 == 0 else "أرقام",
                priority=i,
            )
            for i in range(1, n + 1)
        ]
        self.store.store_articles(articles)
        return articles

    def test_returns_list(self):
        self._seed()
        result = self.store.get_latest_news()
        self.assertIsInstance(result, list)

    def test_ordered_by_priority(self):
        self._seed()
        result = self.store.get_latest_news(limit=10)
        priorities = [a["priority"] for a in result]
        self.assertEqual(priorities, sorted(priorities))

    def test_limit_parameter(self):
        self._seed(10)
        result = self.store.get_latest_news(limit=3)
        self.assertEqual(len(result), 3)

    def test_offset_parameter(self):
        self._seed(5)
        all_articles = self.store.get_latest_news(limit=100)
        offset_articles = self.store.get_latest_news(limit=100, offset=2)
        self.assertEqual(len(offset_articles), len(all_articles) - 2)

    def test_source_filter(self):
        self._seed(6)
        result = self.store.get_latest_news(source="العربية")
        for a in result:
            self.assertEqual(a["source_name"], "العربية")

    def test_source_filter_no_match(self):
        self._seed()
        result = self.store.get_latest_news(source="مصدر غير موجود")
        self.assertEqual(len(result), 0)


class TestGetArticleById(unittest.TestCase):
    """get_article_by_id retrieves single articles."""

    def setUp(self):
        self._tmpfile = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        self.db_path = self._tmpfile.name
        self._tmpfile.close()
        self.store = NewsStore(self.db_path)

    def tearDown(self):
        os.unlink(self.db_path)

    def test_returns_correct_article(self):
        a = _make_article(title="خبر محدد", id="test-id-1")
        self.store.store_articles([a])
        result = self.store.get_article_by_id("test-id-1")
        self.assertIsNotNone(result)
        self.assertEqual(result["title"], "خبر محدد")

    def test_nonexistent_id_returns_none(self):
        result = self.store.get_article_by_id("nonexistent-id")
        self.assertIsNone(result)


class TestCountArticles(unittest.TestCase):
    """count_articles returns correct totals."""

    def setUp(self):
        self._tmpfile = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        self.db_path = self._tmpfile.name
        self._tmpfile.close()
        self.store = NewsStore(self.db_path)

    def tearDown(self):
        os.unlink(self.db_path)

    def test_count_total(self):
        articles = [_make_article(title=f"خبر {i}") for i in range(5)]
        self.store.store_articles(articles)
        self.assertEqual(self.store.count_articles(), 5)

    def test_count_by_source(self):
        self.store.store_articles(
            [
                _make_article(title="خبر أ", source_name="العربية"),
                _make_article(title="خبر ب", source_name="العربية"),
                _make_article(title="خبر ج", source_name="أرقام"),
            ]
        )
        self.assertEqual(self.store.count_articles(source="العربية"), 2)
        self.assertEqual(self.store.count_articles(source="أرقام"), 1)

    def test_count_empty_db(self):
        self.assertEqual(self.store.count_articles(), 0)


class TestGetSources(unittest.TestCase):
    """get_sources returns source names with counts."""

    def setUp(self):
        self._tmpfile = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        self.db_path = self._tmpfile.name
        self._tmpfile.close()
        self.store = NewsStore(self.db_path)

    def tearDown(self):
        os.unlink(self.db_path)

    def test_returns_sources(self):
        self.store.store_articles(
            [
                _make_article(title="خبر 1", source_name="العربية"),
                _make_article(title="خبر 2", source_name="أرقام"),
            ]
        )
        sources = self.store.get_sources()
        self.assertEqual(len(sources), 2)
        names = [s["source_name"] for s in sources]
        self.assertIn("العربية", names)
        self.assertIn("أرقام", names)

    def test_counts_are_correct(self):
        self.store.store_articles(
            [
                _make_article(title="أ", source_name="العربية"),
                _make_article(title="ب", source_name="العربية"),
                _make_article(title="ج", source_name="أرقام"),
            ]
        )
        sources = self.store.get_sources()
        src_dict = {s["source_name"]: s["count"] for s in sources}
        self.assertEqual(src_dict["العربية"], 2)
        self.assertEqual(src_dict["أرقام"], 1)

    def test_empty_db_returns_empty(self):
        sources = self.store.get_sources()
        self.assertEqual(len(sources), 0)


class TestCleanupOld(unittest.TestCase):
    """cleanup_old removes articles older than N days."""

    def setUp(self):
        self._tmpfile = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        self.db_path = self._tmpfile.name
        self._tmpfile.close()
        self.store = NewsStore(self.db_path)

    def tearDown(self):
        os.unlink(self.db_path)

    def test_cleanup_removes_old_articles(self):
        # Insert an article, then manually backdate it
        self.store.store_articles([_make_article(title="خبر قديم", id="old-1")])
        import sqlite3

        old_date = (datetime.utcnow() - timedelta(days=30)).isoformat()
        conn = sqlite3.connect(self.db_path)
        conn.execute(
            "UPDATE news_articles SET created_at = ? WHERE id = 'old-1'", (old_date,)
        )
        conn.commit()
        conn.close()

        deleted = self.store.cleanup_old(days=7)
        self.assertEqual(deleted, 1)
        self.assertEqual(self.store.count_articles(), 0)

    def test_cleanup_keeps_recent_articles(self):
        self.store.store_articles([_make_article(title="خبر جديد")])
        deleted = self.store.cleanup_old(days=7)
        self.assertEqual(deleted, 0)
        self.assertEqual(self.store.count_articles(), 1)


class TestSearchArticles(unittest.TestCase):
    """search_articles finds articles by title/body text."""

    def setUp(self):
        self._tmpfile = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        self.db_path = self._tmpfile.name
        self._tmpfile.close()
        self.store = NewsStore(self.db_path)

    def tearDown(self):
        os.unlink(self.db_path)

    def test_search_by_title(self):
        self.store.store_articles(
            [
                _make_article(title="أرامكو تعلن عن أرباح"),
                _make_article(title="سابك تحقق نموا"),
            ]
        )
        result = self.store.search_articles("أرامكو")
        self.assertEqual(len(result), 1)
        self.assertIn("أرامكو", result[0]["title"])

    def test_search_no_match(self):
        self.store.store_articles([_make_article(title="خبر ما")])
        result = self.store.search_articles("nonexistent")
        self.assertEqual(len(result), 0)


if __name__ == "__main__":
    unittest.main()
