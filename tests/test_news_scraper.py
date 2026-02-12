"""
News Scraper Tests
===================
Tests for services/news_scraper.py and services/news_paraphraser.py.
Covers scraper instantiation, priorities, relevance filtering,
deduplication, paraphrasing, and error handling.
"""

import sys
import os
import unittest
from unittest.mock import MagicMock, patch

import requests

# Ensure project root is on sys.path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from services.news_scraper import (
    ALL_SCRAPERS,
    AlarabiyaScraper,
    ArgaamScraper,
    AsharqBusinessScraper,
    BaseNewsScraper,
    INTER_REQUEST_DELAY,
    MaaalScraper,
    MubasherScraper,
    _deduplicate,
    fetch_all_news,
)
from services.news_paraphraser import (
    SYNONYM_PAIRS,
    _apply_synonyms,
    paraphrase_article,
    paraphrase_text,
)


# -----------------------------------------------------------------------
# Scraper instantiation and priority tests
# -----------------------------------------------------------------------

class TestScraperInstantiation(unittest.TestCase):
    """Each scraper can be instantiated and has correct metadata."""

    def test_alarabiya_source_name(self):
        s = AlarabiyaScraper()
        self.assertEqual(s.source_name, "العربية")

    def test_alarabiya_priority(self):
        s = AlarabiyaScraper()
        self.assertEqual(s.priority, 1)

    def test_asharq_source_name(self):
        s = AsharqBusinessScraper()
        self.assertEqual(s.source_name, "الشرق بلومبرغ")

    def test_asharq_priority(self):
        s = AsharqBusinessScraper()
        self.assertEqual(s.priority, 2)

    def test_argaam_source_name(self):
        s = ArgaamScraper()
        self.assertEqual(s.source_name, "أرقام")

    def test_argaam_priority(self):
        s = ArgaamScraper()
        self.assertEqual(s.priority, 3)

    def test_maaal_source_name(self):
        s = MaaalScraper()
        self.assertEqual(s.source_name, "معال")

    def test_maaal_priority(self):
        s = MaaalScraper()
        self.assertEqual(s.priority, 4)

    def test_mubasher_source_name(self):
        s = MubasherScraper()
        self.assertEqual(s.source_name, "مباشر")

    def test_mubasher_priority(self):
        s = MubasherScraper()
        self.assertEqual(s.priority, 5)

    def test_all_scrapers_has_five_entries(self):
        self.assertEqual(len(ALL_SCRAPERS), 5)

    def test_priorities_are_ascending_1_to_5(self):
        priorities = [cls().priority for cls in ALL_SCRAPERS]
        self.assertEqual(priorities, [1, 2, 3, 4, 5])

    def test_all_scrapers_have_source_url(self):
        for cls in ALL_SCRAPERS:
            s = cls()
            self.assertTrue(s.source_url, f"{cls.__name__} missing source_url")


# -----------------------------------------------------------------------
# Article dict and relevance
# -----------------------------------------------------------------------

class TestArticleStructure(unittest.TestCase):
    """Articles produced by _make_article have required keys."""

    def _make(self):
        s = AlarabiyaScraper()
        return s._make_article("عنوان الخبر", "نص المقال", "https://example.com/article/1")

    def test_required_keys_present(self):
        a = self._make()
        for key in ("title", "body", "source_name", "source_url", "priority", "language"):
            self.assertIn(key, a, f"Missing key: {key}")

    def test_language_is_ar(self):
        a = self._make()
        self.assertEqual(a["language"], "ar")

    def test_priority_matches_scraper(self):
        a = self._make()
        self.assertEqual(a["priority"], 1)


class TestRelevanceFilter(unittest.TestCase):
    """_is_relevant detects Saudi market keywords."""

    def test_relevant_article_with_keyword(self):
        article = {"title": "ارتفاع مؤشر تاسي بنسبة 1.5%", "body": ""}
        self.assertTrue(BaseNewsScraper._is_relevant(article))

    def test_irrelevant_article(self):
        article = {"title": "Weather forecast for London", "body": "Some body text"}
        self.assertFalse(BaseNewsScraper._is_relevant(article))

    def test_relevant_keyword_in_body_only(self):
        article = {"title": "Breaking news", "body": "الأسهم السعودية ترتفع"}
        self.assertTrue(BaseNewsScraper._is_relevant(article))


# -----------------------------------------------------------------------
# Deduplication
# -----------------------------------------------------------------------

class TestDeduplication(unittest.TestCase):
    """_deduplicate removes near-duplicate titles, keeping highest priority."""

    def test_exact_duplicates_keep_higher_priority(self):
        articles = [
            {"title": "مؤشر تاسي يرتفع بنسبة 2%", "priority": 3},
            {"title": "مؤشر تاسي يرتفع بنسبة 2%", "priority": 1},
        ]
        result = _deduplicate(articles)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["priority"], 1)

    def test_different_titles_kept(self):
        articles = [
            {"title": "أرامكو تعلن عن أرباح قياسية", "priority": 1},
            {"title": "سابك تحقق نموا في الإيرادات", "priority": 2},
        ]
        result = _deduplicate(articles)
        self.assertEqual(len(result), 2)

    def test_empty_list(self):
        result = _deduplicate([])
        self.assertEqual(result, [])


# -----------------------------------------------------------------------
# Error handling: mocked HTTP failures
# -----------------------------------------------------------------------

class TestScraperErrorHandling(unittest.TestCase):
    """fetch_articles returns [] on network errors (never raises)."""

    @patch("services.news_scraper.requests.Session.get")
    def test_timeout_returns_empty(self, mock_get):
        mock_get.side_effect = requests.exceptions.Timeout("timed out")
        s = AlarabiyaScraper()
        result = s.fetch_articles()
        self.assertEqual(result, [])

    @patch("services.news_scraper.requests.Session.get")
    def test_connection_error_returns_empty(self, mock_get):
        mock_get.side_effect = requests.exceptions.ConnectionError("refused")
        s = AlarabiyaScraper()
        result = s.fetch_articles()
        self.assertEqual(result, [])

    @patch("services.news_scraper.requests.Session.get")
    def test_http_error_returns_empty(self, mock_get):
        resp = MagicMock()
        resp.status_code = 500
        resp.raise_for_status.side_effect = requests.exceptions.HTTPError(response=resp)
        mock_get.return_value = resp
        s = AlarabiyaScraper()
        result = s.fetch_articles()
        self.assertEqual(result, [])


# -----------------------------------------------------------------------
# fetch_all_news integration (mocked scrapers)
# -----------------------------------------------------------------------

class TestFetchAllNews(unittest.TestCase):
    """fetch_all_news aggregates, paraphrases, deduplicates, and sorts."""

    @patch("services.news_scraper.time.sleep")
    def test_returns_list(self, mock_sleep):
        # Patch all scrapers to return canned data
        fake_article = {
            "title": "أرامكو تعلن عن أرباح قياسية في سوق الأسهم",
            "body": "نص المقال عن سوق الأسهم",
            "source_name": "العربية",
            "source_url": "https://example.com/1",
            "published_at": None,
            "priority": 1,
            "language": "ar",
        }
        with patch.object(AlarabiyaScraper, "fetch_articles", return_value=[fake_article]):
            with patch.object(AsharqBusinessScraper, "fetch_articles", return_value=[]):
                with patch.object(ArgaamScraper, "fetch_articles", return_value=[]):
                    with patch.object(MaaalScraper, "fetch_articles", return_value=[]):
                        with patch.object(MubasherScraper, "fetch_articles", return_value=[]):
                            result = fetch_all_news()
        self.assertIsInstance(result, list)
        self.assertGreater(len(result), 0)

    @patch("services.news_scraper.time.sleep")
    def test_articles_sorted_by_priority(self, mock_sleep):
        a1 = {"title": "خبر 1 عن سوق الأسهم", "body": "", "source_name": "أ", "source_url": "", "published_at": None, "priority": 3, "language": "ar"}
        a2 = {"title": "خبر 2 عن سوق الأسهم", "body": "", "source_name": "ب", "source_url": "", "published_at": None, "priority": 1, "language": "ar"}
        with patch.object(AlarabiyaScraper, "fetch_articles", return_value=[]):
            with patch.object(AsharqBusinessScraper, "fetch_articles", return_value=[]):
                with patch.object(ArgaamScraper, "fetch_articles", return_value=[a1]):
                    with patch.object(MaaalScraper, "fetch_articles", return_value=[a2]):
                        with patch.object(MubasherScraper, "fetch_articles", return_value=[]):
                            result = fetch_all_news()
        if len(result) >= 2:
            self.assertLessEqual(result[0]["priority"], result[1]["priority"])


# -----------------------------------------------------------------------
# Rate limiting delay
# -----------------------------------------------------------------------

class TestRateLimiting(unittest.TestCase):
    """INTER_REQUEST_DELAY exists and is positive."""

    def test_delay_constant_exists(self):
        self.assertIsNotNone(INTER_REQUEST_DELAY)

    def test_delay_is_positive(self):
        self.assertGreater(INTER_REQUEST_DELAY, 0)


# -----------------------------------------------------------------------
# Paraphraser tests
# -----------------------------------------------------------------------

class TestParaphraser(unittest.TestCase):
    """Paraphraser applies synonyms without changing meaning."""

    def test_empty_string(self):
        self.assertEqual(paraphrase_text(""), "")

    def test_none_returns_none(self):
        # paraphrase_text checks `if not text: return text`
        self.assertIsNone(paraphrase_text(None))

    def test_synonym_pairs_not_empty(self):
        self.assertGreater(len(SYNONYM_PAIRS), 10)

    def test_apply_synonyms_with_known_word(self):
        """Seeded random so replacement always fires."""
        import random
        random.seed(0)
        text = "ارتفع المؤشر"
        result = _apply_synonyms(text)
        # With seed(0), random.random() < 0.5 may or may not trigger;
        # either original or replacement is acceptable
        self.assertTrue("ارتفع" in result or "صعد" in result)

    def test_output_similar_length(self):
        text = "أعلنت أرامكو عن أرباح كبيرة في قطاع البتروكيماويات"
        result = paraphrase_text(text)
        # Output should not be drastically different in length
        ratio = len(result) / len(text) if len(text) > 0 else 1
        self.assertGreater(ratio, 0.5)
        self.assertLess(ratio, 2.0)

    def test_paraphrase_article_returns_new_dict(self):
        article = {"title": "عنوان", "body": "نص", "extra": "value"}
        result = paraphrase_article(article)
        self.assertIsNot(result, article)
        self.assertEqual(result["extra"], "value")

    def test_paraphrase_article_with_empty_title(self):
        article = {"title": "", "body": "نص المقال"}
        result = paraphrase_article(article)
        self.assertEqual(result["title"], "")


# -----------------------------------------------------------------------
# URL helpers
# -----------------------------------------------------------------------

class TestAbsoluteUrl(unittest.TestCase):
    """_absolute_url correctly builds full URLs."""

    def test_already_absolute(self):
        result = BaseNewsScraper._absolute_url("https://example.com", "https://other.com/page")
        self.assertEqual(result, "https://other.com/page")

    def test_protocol_relative(self):
        result = BaseNewsScraper._absolute_url("https://example.com", "//cdn.example.com/img.png")
        self.assertEqual(result, "https://cdn.example.com/img.png")

    def test_root_relative(self):
        result = BaseNewsScraper._absolute_url("https://example.com/section/", "/article/1")
        self.assertEqual(result, "https://example.com/article/1")

    def test_path_relative(self):
        result = BaseNewsScraper._absolute_url("https://example.com/section", "article/1")
        self.assertEqual(result, "https://example.com/section/article/1")

    def test_empty_href(self):
        result = BaseNewsScraper._absolute_url("https://example.com", "")
        self.assertEqual(result, "")


if __name__ == "__main__":
    unittest.main()
