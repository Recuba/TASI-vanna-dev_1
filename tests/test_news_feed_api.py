"""
News Feed API Tests
====================
Tests for api/routes/news_feed.py endpoints using FastAPI's TestClient.
Uses a temporary SQLite database to isolate test state.
"""

import os
import sys
import tempfile
import unittest
from unittest.mock import patch

# Ensure project root is on sys.path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.routes.news_feed import router
from services.news_store import NewsStore


def _make_article(
    title: str = "عنوان الخبر",
    body: str = "نص المقال",
    source_name: str = "العربية",
    **overrides,
) -> dict:
    a = {
        "title": title,
        "body": body,
        "source_name": source_name,
        "source_url": "https://example.com/1",
        "published_at": None,
        "priority": 1,
        "language": "ar",
    }
    a.update(overrides)
    return a


class NewsFeedAPITestCase(unittest.TestCase):
    """Base class that sets up a test FastAPI app with a temp DB."""

    def setUp(self):
        self._tmpfile = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        self.db_path = self._tmpfile.name
        self._tmpfile.close()
        self.store = NewsStore(self.db_path)

        # Patch get_store to use our temp store
        self._patcher = patch("api.routes.news_feed.get_store", return_value=self.store)
        self._patcher.start()

        self.app = FastAPI()
        self.app.include_router(router)
        self.client = TestClient(self.app)

    def tearDown(self):
        self._patcher.stop()
        os.unlink(self.db_path)


class TestGetNewsFeed(NewsFeedAPITestCase):
    """GET /api/v1/news/feed"""

    def test_returns_200(self):
        resp = self.client.get("/api/v1/news/feed")
        self.assertEqual(resp.status_code, 200)

    def test_response_format(self):
        resp = self.client.get("/api/v1/news/feed")
        data = resp.json()
        self.assertIn("items", data)
        self.assertIn("total", data)
        self.assertIn("page", data)
        self.assertIn("limit", data)

    def test_pagination_limit(self):
        self.store.store_articles([_make_article(title=f"خبر {i}") for i in range(10)])
        resp = self.client.get("/api/v1/news/feed?limit=3")
        data = resp.json()
        self.assertEqual(len(data["items"]), 3)

    def test_pagination_offset(self):
        self.store.store_articles([_make_article(title=f"خبر {i}") for i in range(5)])
        resp = self.client.get("/api/v1/news/feed?limit=100&offset=2")
        data = resp.json()
        self.assertEqual(len(data["items"]), 3)

    def test_source_filter(self):
        self.store.store_articles(
            [
                _make_article(title="خبر أ", source_name="العربية"),
                _make_article(title="خبر ب", source_name="أرقام"),
            ]
        )
        resp = self.client.get("/api/v1/news/feed?source=العربية")
        data = resp.json()
        self.assertEqual(len(data["items"]), 1)
        self.assertEqual(data["items"][0]["source_name"], "العربية")

    def test_items_have_required_fields(self):
        self.store.store_articles([_make_article()])
        resp = self.client.get("/api/v1/news/feed")
        item = resp.json()["items"][0]
        for field in ("id", "title", "source_name", "language", "priority"):
            self.assertIn(field, item, f"Missing field: {field}")


class TestGetArticleById(NewsFeedAPITestCase):
    """GET /api/v1/news/feed/{article_id}"""

    def test_returns_article(self):
        self.store.store_articles([_make_article(title="خبر محدد", id="feed-test-1")])
        resp = self.client.get("/api/v1/news/feed/feed-test-1")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["title"], "خبر محدد")

    def test_nonexistent_returns_404(self):
        resp = self.client.get("/api/v1/news/feed/nonexistent-id")
        self.assertEqual(resp.status_code, 404)


class TestGetSources(NewsFeedAPITestCase):
    """GET /api/v1/news/sources"""

    def test_returns_sources(self):
        self.store.store_articles(
            [
                _make_article(title="خبر 1", source_name="العربية"),
                _make_article(title="خبر 2", source_name="أرقام"),
            ]
        )
        resp = self.client.get("/api/v1/news/sources")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("sources", data)
        names = [s["source_name"] for s in data["sources"]]
        self.assertIn("العربية", names)
        self.assertIn("أرقام", names)

    def test_empty_db_returns_empty_sources(self):
        resp = self.client.get("/api/v1/news/sources")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.json()["sources"]), 0)


class TestSearchEndpoint(NewsFeedAPITestCase):
    """GET /api/v1/news/search"""

    def test_search_returns_results(self):
        self.store.store_articles(
            [
                _make_article(title="أرامكو تعلن عن أرباح"),
                _make_article(title="سابك تحقق نموا"),
            ]
        )
        resp = self.client.get("/api/v1/news/search?q=أرامكو")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(len(data["items"]), 1)

    def test_search_requires_query(self):
        resp = self.client.get("/api/v1/news/search")
        # FastAPI returns 422 for missing required query param
        self.assertEqual(resp.status_code, 422)


if __name__ == "__main__":
    unittest.main()
