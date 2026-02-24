"""
Tests for CRUD services: NewsAggregationService, AnnouncementService, UserService.

All three services accept a ``get_conn`` callable and follow the same pattern:
acquire connection, execute SQL, commit/rollback, close. Tests mock the
psycopg2 connection and cursor to verify correct SQL execution, error handling,
and connection lifecycle.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from unittest.mock import MagicMock, patch, call

import pytest

from services.news_service import NewsAggregationService, NewsArticle
from services.announcement_service import AnnouncementService, Announcement
from services.user_service import UserService, UserProfile, Watchlist, UserAlert


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------


def _make_mock_conn():
    """Create a mock psycopg2 connection with cursor context manager support."""
    conn = MagicMock()
    cursor = MagicMock()
    # Support both `with conn.cursor() as cur:` and `with conn.cursor(cursor_factory=...) as cur:`
    conn.cursor.return_value.__enter__ = MagicMock(return_value=cursor)
    conn.cursor.return_value.__exit__ = MagicMock(return_value=False)
    return conn, cursor


def _news_row(**overrides):
    """Build a fake news_articles row dict."""
    defaults = {
        "id": str(uuid.uuid4()),
        "ticker": "2222.SR",
        "title": "Aramco Q4 results",
        "body": "Full article body",
        "source_name": "Argaam",
        "source_url": "https://argaam.com/article/1",
        "published_at": datetime(2026, 1, 15, 10, 0),
        "sentiment_score": 0.85,
        "sentiment_label": "positive",
        "entities_extracted": {"companies": ["Aramco"]},
        "language": "ar",
        "created_at": datetime(2026, 1, 15, 10, 5),
    }
    defaults.update(overrides)
    return defaults


def _announcement_row(**overrides):
    """Build a fake announcements row dict."""
    defaults = {
        "id": str(uuid.uuid4()),
        "ticker": "1010.SR",
        "title_ar": "اعلان مهم",
        "title_en": "Important announcement",
        "body_ar": "تفاصيل",
        "body_en": "Details",
        "source": "CMA",
        "announcement_date": datetime(2026, 2, 1, 8, 0),
        "category": "Earnings",
        "classification": "Material",
        "is_material": True,
        "embedding_flag": False,
        "source_url": "https://cma.org.sa/ann/1",
        "created_at": datetime(2026, 2, 1, 8, 5),
    }
    defaults.update(overrides)
    return defaults


def _user_row(**overrides):
    """Build a fake users row dict."""
    defaults = {
        "id": str(uuid.uuid4()),
        "auth_provider": "local",
        "auth_provider_id": None,
        "email": "user@example.com",
        "display_name": "Test User",
        "avatar_url": None,
        "subscription_tier": "free",
        "usage_count": 5,
        "last_query_at": datetime(2026, 2, 20),
        "is_active": True,
        "created_at": datetime(2026, 1, 1),
        "updated_at": datetime(2026, 2, 20),
    }
    defaults.update(overrides)
    return defaults


def _watchlist_row(**overrides):
    """Build a fake user_watchlists row dict."""
    defaults = {
        "id": str(uuid.uuid4()),
        "user_id": str(uuid.uuid4()),
        "name": "Default",
        "tickers": ["2222.SR", "1010.SR"],
        "created_at": datetime(2026, 1, 1),
        "updated_at": datetime(2026, 2, 1),
    }
    defaults.update(overrides)
    return defaults


def _alert_row(**overrides):
    """Build a fake user_alerts row dict."""
    defaults = {
        "id": str(uuid.uuid4()),
        "user_id": str(uuid.uuid4()),
        "ticker": "2222.SR",
        "alert_type": "price_above",
        "threshold_value": 35.0,
        "is_active": True,
        "last_triggered_at": None,
        "created_at": datetime(2026, 2, 10),
    }
    defaults.update(overrides)
    return defaults


# ===========================================================================
# NewsAggregationService
# ===========================================================================


class TestNewsArticleDataclass:
    """Tests for the NewsArticle dataclass and its to_dict method."""

    def test_default_values(self):
        article = NewsArticle()
        assert article.title == ""
        assert article.language == "ar"
        assert article.id  # UUID auto-generated

    def test_to_dict_removes_none_created_at(self):
        article = NewsArticle(title="Test")
        d = article.to_dict()
        assert "created_at" not in d
        assert d["title"] == "Test"

    def test_to_dict_keeps_created_at_when_set(self):
        ts = datetime(2026, 1, 1)
        article = NewsArticle(title="Test", created_at=ts)
        d = article.to_dict()
        assert d["created_at"] == ts


class TestNewsAggregationService:
    """Tests for NewsAggregationService CRUD operations."""

    def setup_method(self):
        self.conn, self.cursor = _make_mock_conn()
        self.svc = NewsAggregationService(get_conn=lambda: self.conn)

    # -- store_articles -------------------------------------------------------

    def test_store_articles_empty_list(self):
        result = self.svc.store_articles([])
        assert result == 0
        self.conn.cursor.assert_not_called()

    def test_store_articles_success(self):
        articles = [
            NewsArticle(title="Article 1", ticker="2222.SR"),
            NewsArticle(title="Article 2", ticker="1010.SR"),
        ]
        result = self.svc.store_articles(articles)
        assert result == 2
        self.cursor.executemany.assert_called_once()
        self.conn.commit.assert_called_once()
        self.conn.close.assert_called_once()

    def test_store_articles_wraps_entities_with_json_adapter(self):
        articles = [NewsArticle(title="A", entities_extracted={"key": "val"})]
        self.svc.store_articles(articles)
        call_args = self.cursor.executemany.call_args
        rows = call_args[0][1]
        # The entities_extracted should be wrapped in psycopg2.extras.Json
        from psycopg2.extras import Json
        assert isinstance(rows[0]["entities_extracted"], Json)

    def test_store_articles_rollback_on_error(self):
        self.cursor.executemany.side_effect = Exception("DB error")
        articles = [NewsArticle(title="A")]
        with pytest.raises(Exception, match="DB error"):
            self.svc.store_articles(articles)
        self.conn.rollback.assert_called_once()
        self.conn.close.assert_called_once()

    # -- get_latest_news ------------------------------------------------------

    def test_get_latest_news_defaults(self):
        row = _news_row()
        self.cursor.fetchall.return_value = [row]
        result = self.svc.get_latest_news()
        assert len(result) == 1
        assert isinstance(result[0], NewsArticle)
        assert result[0].title == row["title"]
        self.conn.close.assert_called_once()

    def test_get_latest_news_with_language_filter(self):
        self.cursor.fetchall.return_value = []
        self.svc.get_latest_news(language="en")
        sql_arg = self.cursor.execute.call_args[0][0]
        assert "language" in sql_arg.lower()
        params = self.cursor.execute.call_args[0][1]
        assert params["language"] == "en"

    def test_get_latest_news_without_language_no_where(self):
        self.cursor.fetchall.return_value = []
        self.svc.get_latest_news()
        sql_arg = self.cursor.execute.call_args[0][0]
        assert "WHERE" not in sql_arg

    def test_get_latest_news_custom_limit_offset(self):
        self.cursor.fetchall.return_value = []
        self.svc.get_latest_news(limit=5, offset=10)
        params = self.cursor.execute.call_args[0][1]
        assert params["limit"] == 5
        assert params["offset"] == 10

    def test_get_latest_news_empty(self):
        self.cursor.fetchall.return_value = []
        result = self.svc.get_latest_news()
        assert result == []

    # -- get_news_by_ticker ---------------------------------------------------

    def test_get_news_by_ticker_basic(self):
        row = _news_row(ticker="2222.SR")
        self.cursor.fetchall.return_value = [row]
        result = self.svc.get_news_by_ticker("2222.SR")
        assert len(result) == 1
        assert result[0].ticker == "2222.SR"
        params = self.cursor.execute.call_args[0][1]
        assert params["ticker"] == "2222.SR"

    def test_get_news_by_ticker_with_sentiment_filter(self):
        self.cursor.fetchall.return_value = []
        self.svc.get_news_by_ticker("2222.SR", sentiment_label="positive")
        params = self.cursor.execute.call_args[0][1]
        assert params["sentiment_label"] == "positive"
        sql_arg = self.cursor.execute.call_args[0][0]
        assert "sentiment_label" in sql_arg

    def test_get_news_by_ticker_with_since_filter(self):
        since = datetime(2026, 1, 1)
        self.cursor.fetchall.return_value = []
        self.svc.get_news_by_ticker("2222.SR", since=since)
        params = self.cursor.execute.call_args[0][1]
        assert params["since"] == since
        sql_arg = self.cursor.execute.call_args[0][0]
        assert "published_at" in sql_arg

    def test_get_news_by_ticker_with_all_filters(self):
        since = datetime(2026, 1, 1)
        self.cursor.fetchall.return_value = []
        self.svc.get_news_by_ticker(
            "1010.SR", limit=10, offset=5, sentiment_label="negative", since=since
        )
        params = self.cursor.execute.call_args[0][1]
        assert params["ticker"] == "1010.SR"
        assert params["limit"] == 10
        assert params["offset"] == 5
        assert params["sentiment_label"] == "negative"
        assert params["since"] == since

    # -- get_news_by_sector ---------------------------------------------------

    def test_get_news_by_sector_basic(self):
        self.cursor.fetchall.return_value = [_news_row()]
        result = self.svc.get_news_by_sector("Energy")
        assert len(result) == 1
        sql_arg = self.cursor.execute.call_args[0][0]
        assert "JOIN companies" in sql_arg
        assert "ILIKE" in sql_arg
        params = self.cursor.execute.call_args[0][1]
        assert params["sector"] == "Energy"

    def test_get_news_by_sector_with_since(self):
        since = datetime(2026, 1, 1)
        self.cursor.fetchall.return_value = []
        self.svc.get_news_by_sector("Energy", since=since)
        params = self.cursor.execute.call_args[0][1]
        assert params["since"] == since

    # -- get_article_by_id ----------------------------------------------------

    def test_get_article_by_id_found(self):
        row = _news_row()
        self.cursor.fetchone.return_value = row
        result = self.svc.get_article_by_id(row["id"])
        assert result is not None
        assert result.id == row["id"]

    def test_get_article_by_id_not_found(self):
        self.cursor.fetchone.return_value = None
        result = self.svc.get_article_by_id("nonexistent-id")
        assert result is None

    # -- count_articles -------------------------------------------------------

    def test_count_articles_no_filter(self):
        self.cursor.fetchone.return_value = (42,)
        result = self.svc.count_articles()
        assert result == 42
        sql_arg = self.cursor.execute.call_args[0][0]
        assert "WHERE" not in sql_arg

    def test_count_articles_by_ticker(self):
        self.cursor.fetchone.return_value = (10,)
        result = self.svc.count_articles(ticker="2222.SR")
        assert result == 10
        params = self.cursor.execute.call_args[0][1]
        assert params["ticker"] == "2222.SR"

    def test_count_articles_by_sector(self):
        self.cursor.fetchone.return_value = (5,)
        result = self.svc.count_articles(sector="Energy")
        assert result == 5
        sql_arg = self.cursor.execute.call_args[0][0]
        assert "JOIN companies" in sql_arg
        assert "ILIKE" in sql_arg

    def test_count_articles_by_ticker_and_sector(self):
        self.cursor.fetchone.return_value = (3,)
        result = self.svc.count_articles(ticker="2222.SR", sector="Energy")
        assert result == 3
        sql_arg = self.cursor.execute.call_args[0][0]
        assert "JOIN companies" in sql_arg

    # -- _row_to_article edge cases -------------------------------------------

    def test_row_to_article_none_sentiment(self):
        row = _news_row(sentiment_score=None)
        article = NewsAggregationService._row_to_article(row)
        assert article.sentiment_score is None

    def test_row_to_article_missing_optional_fields(self):
        minimal = {"id": "abc", "title": "T"}
        article = NewsAggregationService._row_to_article(minimal)
        assert article.id == "abc"
        assert article.ticker is None
        assert article.language == "ar"

    # -- connection lifecycle -------------------------------------------------

    def test_get_latest_news_closes_conn_on_exception(self):
        self.cursor.execute.side_effect = Exception("query fail")
        with pytest.raises(Exception, match="query fail"):
            self.svc.get_latest_news()
        self.conn.close.assert_called_once()

    def test_get_news_by_ticker_closes_conn_on_exception(self):
        self.cursor.execute.side_effect = Exception("fail")
        with pytest.raises(Exception):
            self.svc.get_news_by_ticker("2222.SR")
        self.conn.close.assert_called_once()

    def test_count_articles_closes_conn_on_exception(self):
        self.cursor.execute.side_effect = Exception("fail")
        with pytest.raises(Exception):
            self.svc.count_articles()
        self.conn.close.assert_called_once()


# ===========================================================================
# AnnouncementService
# ===========================================================================


class TestAnnouncementDataclass:
    """Tests for the Announcement dataclass and its to_dict method."""

    def test_default_values(self):
        ann = Announcement()
        assert ann.is_material is False
        assert ann.embedding_flag is False
        assert ann.id  # UUID auto-generated

    def test_to_dict_removes_none_created_at(self):
        ann = Announcement(title_ar="Test")
        d = ann.to_dict()
        assert "created_at" not in d

    def test_to_dict_keeps_created_at_when_set(self):
        ts = datetime(2026, 1, 1)
        ann = Announcement(created_at=ts)
        d = ann.to_dict()
        assert d["created_at"] == ts


class TestAnnouncementService:
    """Tests for AnnouncementService CRUD operations."""

    def setup_method(self):
        self.conn, self.cursor = _make_mock_conn()
        self.svc = AnnouncementService(get_conn=lambda: self.conn)

    # -- store_announcements --------------------------------------------------

    def test_store_announcements_empty_list(self):
        result = self.svc.store_announcements([])
        assert result == 0
        self.conn.cursor.assert_not_called()

    def test_store_announcements_success(self):
        anns = [
            Announcement(title_ar="اعلان 1", ticker="2222.SR"),
            Announcement(title_ar="اعلان 2", ticker="1010.SR"),
        ]
        result = self.svc.store_announcements(anns)
        assert result == 2
        self.cursor.executemany.assert_called_once()
        self.conn.commit.assert_called_once()
        self.conn.close.assert_called_once()

    def test_store_announcements_rollback_on_error(self):
        self.cursor.executemany.side_effect = Exception("DB error")
        with pytest.raises(Exception, match="DB error"):
            self.svc.store_announcements([Announcement(title_ar="X")])
        self.conn.rollback.assert_called_once()
        self.conn.close.assert_called_once()

    # -- get_announcements ----------------------------------------------------

    def test_get_announcements_no_filter(self):
        row = _announcement_row()
        self.cursor.fetchall.return_value = [row]
        result = self.svc.get_announcements()
        assert len(result) == 1
        assert isinstance(result[0], Announcement)
        sql_arg = self.cursor.execute.call_args[0][0]
        assert "WHERE" not in sql_arg

    def test_get_announcements_with_ticker(self):
        self.cursor.fetchall.return_value = []
        self.svc.get_announcements(ticker="1010.SR")
        params = self.cursor.execute.call_args[0][1]
        assert params["ticker"] == "1010.SR"

    def test_get_announcements_with_category(self):
        self.cursor.fetchall.return_value = []
        self.svc.get_announcements(category="Earnings")
        params = self.cursor.execute.call_args[0][1]
        assert params["category"] == "Earnings"
        sql_arg = self.cursor.execute.call_args[0][0]
        assert "ILIKE" in sql_arg

    def test_get_announcements_with_source(self):
        self.cursor.fetchall.return_value = []
        self.svc.get_announcements(source="CMA")
        params = self.cursor.execute.call_args[0][1]
        assert params["source"] == "CMA"

    def test_get_announcements_with_since(self):
        since = datetime(2026, 1, 1)
        self.cursor.fetchall.return_value = []
        self.svc.get_announcements(since=since)
        params = self.cursor.execute.call_args[0][1]
        assert params["since"] == since

    def test_get_announcements_all_filters(self):
        since = datetime(2026, 1, 1)
        self.cursor.fetchall.return_value = []
        self.svc.get_announcements(
            ticker="2222.SR",
            category="Dividend",
            source="Tadawul",
            since=since,
            limit=10,
            offset=5,
        )
        params = self.cursor.execute.call_args[0][1]
        assert params["ticker"] == "2222.SR"
        assert params["category"] == "Dividend"
        assert params["source"] == "Tadawul"
        assert params["since"] == since
        assert params["limit"] == 10
        assert params["offset"] == 5

    def test_get_announcements_empty(self):
        self.cursor.fetchall.return_value = []
        result = self.svc.get_announcements()
        assert result == []

    # -- get_material_events --------------------------------------------------

    def test_get_material_events_basic(self):
        row = _announcement_row(is_material=True)
        self.cursor.fetchall.return_value = [row]
        result = self.svc.get_material_events()
        assert len(result) == 1
        assert result[0].is_material is True
        sql_arg = self.cursor.execute.call_args[0][0]
        assert "is_material = TRUE" in sql_arg

    def test_get_material_events_with_ticker(self):
        self.cursor.fetchall.return_value = []
        self.svc.get_material_events(ticker="2222.SR")
        params = self.cursor.execute.call_args[0][1]
        assert params["ticker"] == "2222.SR"

    def test_get_material_events_with_since(self):
        since = datetime(2026, 1, 1)
        self.cursor.fetchall.return_value = []
        self.svc.get_material_events(since=since)
        params = self.cursor.execute.call_args[0][1]
        assert params["since"] == since

    def test_get_material_events_with_limit_offset(self):
        self.cursor.fetchall.return_value = []
        self.svc.get_material_events(limit=5, offset=10)
        params = self.cursor.execute.call_args[0][1]
        assert params["limit"] == 5
        assert params["offset"] == 10

    # -- get_announcements_by_sector ------------------------------------------

    def test_get_announcements_by_sector_basic(self):
        self.cursor.fetchall.return_value = [_announcement_row()]
        result = self.svc.get_announcements_by_sector("Financial Services")
        assert len(result) == 1
        sql_arg = self.cursor.execute.call_args[0][0]
        assert "JOIN companies" in sql_arg
        assert "ILIKE" in sql_arg
        params = self.cursor.execute.call_args[0][1]
        assert params["sector"] == "Financial Services"

    def test_get_announcements_by_sector_with_since(self):
        since = datetime(2026, 1, 1)
        self.cursor.fetchall.return_value = []
        self.svc.get_announcements_by_sector("Energy", since=since)
        params = self.cursor.execute.call_args[0][1]
        assert params["since"] == since

    # -- get_announcement_by_id -----------------------------------------------

    def test_get_announcement_by_id_found(self):
        row = _announcement_row()
        self.cursor.fetchone.return_value = row
        result = self.svc.get_announcement_by_id(row["id"])
        assert result is not None
        assert result.id == row["id"]
        assert result.title_ar == row["title_ar"]

    def test_get_announcement_by_id_not_found(self):
        self.cursor.fetchone.return_value = None
        result = self.svc.get_announcement_by_id("nonexistent-id")
        assert result is None

    # -- count_announcements --------------------------------------------------

    def test_count_announcements_no_filter(self):
        self.cursor.fetchone.return_value = (100,)
        result = self.svc.count_announcements()
        assert result == 100
        sql_arg = self.cursor.execute.call_args[0][0]
        assert "WHERE" not in sql_arg

    def test_count_announcements_by_ticker(self):
        self.cursor.fetchone.return_value = (15,)
        result = self.svc.count_announcements(ticker="2222.SR")
        assert result == 15
        params = self.cursor.execute.call_args[0][1]
        assert params["ticker"] == "2222.SR"

    def test_count_announcements_by_materiality(self):
        self.cursor.fetchone.return_value = (8,)
        result = self.svc.count_announcements(is_material=True)
        assert result == 8
        params = self.cursor.execute.call_args[0][1]
        assert params["is_material"] is True

    def test_count_announcements_is_material_false(self):
        self.cursor.fetchone.return_value = (50,)
        result = self.svc.count_announcements(is_material=False)
        assert result == 50
        params = self.cursor.execute.call_args[0][1]
        assert params["is_material"] is False

    def test_count_announcements_ticker_and_material(self):
        self.cursor.fetchone.return_value = (2,)
        result = self.svc.count_announcements(ticker="1010.SR", is_material=True)
        assert result == 2

    # -- _row_to_announcement edge cases --------------------------------------

    def test_row_to_announcement_missing_optional_fields(self):
        minimal = {"id": "abc"}
        ann = AnnouncementService._row_to_announcement(minimal)
        assert ann.id == "abc"
        assert ann.ticker is None
        assert ann.is_material is False
        assert ann.embedding_flag is False

    # -- connection lifecycle -------------------------------------------------

    def test_get_announcements_closes_conn_on_exception(self):
        self.cursor.execute.side_effect = Exception("query fail")
        with pytest.raises(Exception, match="query fail"):
            self.svc.get_announcements()
        self.conn.close.assert_called_once()

    def test_get_material_events_closes_conn_on_exception(self):
        self.cursor.execute.side_effect = Exception("fail")
        with pytest.raises(Exception):
            self.svc.get_material_events()
        self.conn.close.assert_called_once()

    def test_count_announcements_closes_conn_on_exception(self):
        self.cursor.execute.side_effect = Exception("fail")
        with pytest.raises(Exception):
            self.svc.count_announcements()
        self.conn.close.assert_called_once()

    def test_get_announcement_by_id_closes_conn_on_exception(self):
        self.cursor.execute.side_effect = Exception("fail")
        with pytest.raises(Exception):
            self.svc.get_announcement_by_id("some-id")
        self.conn.close.assert_called_once()

    def test_store_announcements_closes_conn_on_success(self):
        self.svc.store_announcements([Announcement(title_ar="X")])
        self.conn.close.assert_called_once()


# ===========================================================================
# UserService
# ===========================================================================


class TestUserProfileDataclass:
    """Tests for UserProfile, Watchlist, and UserAlert dataclasses."""

    def test_user_profile_defaults(self):
        user = UserProfile()
        assert user.auth_provider == "local"
        assert user.subscription_tier == "free"
        assert user.usage_count == 0
        assert user.is_active is True
        assert user.email == ""
        assert user.id  # UUID auto-generated

    def test_watchlist_defaults(self):
        wl = Watchlist()
        assert wl.name == "Default"
        assert wl.tickers == []
        assert wl.user_id == ""

    def test_alert_defaults(self):
        alert = UserAlert()
        assert alert.alert_type == ""
        assert alert.is_active is True
        assert alert.threshold_value is None


class TestUserServiceUserMethods:
    """Tests for UserService user-related methods."""

    def setup_method(self):
        self.conn, self.cursor = _make_mock_conn()
        self.svc = UserService(get_conn=lambda: self.conn)

    # -- get_or_create_user ---------------------------------------------------

    def test_get_or_create_user_success(self):
        row = _user_row(email="test@example.com")
        self.cursor.fetchone.return_value = row
        result = self.svc.get_or_create_user("test@example.com")
        assert isinstance(result, UserProfile)
        assert result.email == "test@example.com"
        # Should execute INSERT then SELECT
        assert self.cursor.execute.call_count == 2
        self.conn.commit.assert_called_once()
        self.conn.close.assert_called_once()

    def test_get_or_create_user_with_all_params(self):
        row = _user_row(email="x@y.com", auth_provider="google", display_name="X")
        self.cursor.fetchone.return_value = row
        result = self.svc.get_or_create_user(
            "x@y.com",
            auth_provider="google",
            auth_provider_id="g-123",
            display_name="X",
        )
        assert result.email == "x@y.com"
        insert_params = self.cursor.execute.call_args_list[0][0][1]
        assert insert_params["auth_provider"] == "google"
        assert insert_params["auth_provider_id"] == "g-123"
        assert insert_params["display_name"] == "X"

    def test_get_or_create_user_rollback_on_error(self):
        self.cursor.execute.side_effect = Exception("insert fail")
        with pytest.raises(Exception, match="insert fail"):
            self.svc.get_or_create_user("test@example.com")
        self.conn.rollback.assert_called_once()
        self.conn.close.assert_called_once()

    # -- get_user_by_id -------------------------------------------------------

    def test_get_user_by_id_found(self):
        row = _user_row()
        self.cursor.fetchone.return_value = row
        result = self.svc.get_user_by_id(row["id"])
        assert result is not None
        assert result.id == row["id"]
        self.conn.close.assert_called_once()

    def test_get_user_by_id_not_found(self):
        self.cursor.fetchone.return_value = None
        result = self.svc.get_user_by_id("nonexistent")
        assert result is None
        self.conn.close.assert_called_once()

    # -- get_user_by_email ----------------------------------------------------

    def test_get_user_by_email_found(self):
        row = _user_row(email="found@example.com")
        self.cursor.fetchone.return_value = row
        result = self.svc.get_user_by_email("found@example.com")
        assert result is not None
        assert result.email == "found@example.com"
        params = self.cursor.execute.call_args[0][1]
        assert params["email"] == "found@example.com"

    def test_get_user_by_email_not_found(self):
        self.cursor.fetchone.return_value = None
        result = self.svc.get_user_by_email("nope@example.com")
        assert result is None

    # -- increment_usage ------------------------------------------------------

    def test_increment_usage_success(self):
        self.svc.increment_usage("user-123")
        self.cursor.execute.assert_called_once()
        params = self.cursor.execute.call_args[0][1]
        assert params["id"] == "user-123"
        self.conn.commit.assert_called_once()
        self.conn.close.assert_called_once()

    def test_increment_usage_rollback_on_error(self):
        self.cursor.execute.side_effect = Exception("update fail")
        with pytest.raises(Exception, match="update fail"):
            self.svc.increment_usage("user-123")
        self.conn.rollback.assert_called_once()
        self.conn.close.assert_called_once()

    # -- connection lifecycle -------------------------------------------------

    def test_get_user_by_id_closes_conn_on_exception(self):
        self.cursor.execute.side_effect = Exception("fail")
        with pytest.raises(Exception):
            self.svc.get_user_by_id("x")
        self.conn.close.assert_called_once()

    def test_get_user_by_email_closes_conn_on_exception(self):
        self.cursor.execute.side_effect = Exception("fail")
        with pytest.raises(Exception):
            self.svc.get_user_by_email("x@y.com")
        self.conn.close.assert_called_once()


class TestUserServiceWatchlistMethods:
    """Tests for UserService watchlist-related methods."""

    def setup_method(self):
        self.conn, self.cursor = _make_mock_conn()
        self.svc = UserService(get_conn=lambda: self.conn)

    # -- get_watchlists -------------------------------------------------------

    def test_get_watchlists_returns_list(self):
        rows = [_watchlist_row(), _watchlist_row(name="Tech")]
        self.cursor.fetchall.return_value = rows
        result = self.svc.get_watchlists("user-1")
        assert len(result) == 2
        assert all(isinstance(w, Watchlist) for w in result)
        params = self.cursor.execute.call_args[0][1]
        assert params["user_id"] == "user-1"
        self.conn.close.assert_called_once()

    def test_get_watchlists_empty(self):
        self.cursor.fetchall.return_value = []
        result = self.svc.get_watchlists("user-1")
        assert result == []

    # -- create_watchlist -----------------------------------------------------

    def test_create_watchlist_success(self):
        row = _watchlist_row(name="My List", tickers=["2222.SR"])
        self.cursor.fetchone.return_value = row
        result = self.svc.create_watchlist("user-1", name="My List", tickers=["2222.SR"])
        assert isinstance(result, Watchlist)
        assert result.name == "My List"
        self.conn.commit.assert_called_once()
        self.conn.close.assert_called_once()

    def test_create_watchlist_default_values(self):
        row = _watchlist_row(name="Default", tickers=[])
        self.cursor.fetchone.return_value = row
        result = self.svc.create_watchlist("user-1")
        assert result.name == "Default"
        insert_params = self.cursor.execute.call_args[0][1]
        assert insert_params["name"] == "Default"
        assert insert_params["tickers"] == []

    def test_create_watchlist_rollback_on_error(self):
        self.cursor.execute.side_effect = Exception("unique violation")
        with pytest.raises(Exception, match="unique violation"):
            self.svc.create_watchlist("user-1", name="Dup")
        self.conn.rollback.assert_called_once()
        self.conn.close.assert_called_once()

    # -- update_watchlist -----------------------------------------------------

    def test_update_watchlist_name_only(self):
        row = _watchlist_row(name="New Name")
        self.cursor.fetchone.return_value = row
        result = self.svc.update_watchlist("wl-1", "user-1", name="New Name")
        assert result is not None
        assert result.name == "New Name"
        sql_arg = self.cursor.execute.call_args[0][0]
        assert "name = %(name)s" in sql_arg
        self.conn.commit.assert_called_once()

    def test_update_watchlist_tickers_only(self):
        row = _watchlist_row(tickers=["2222.SR", "1010.SR"])
        self.cursor.fetchone.return_value = row
        result = self.svc.update_watchlist("wl-1", "user-1", tickers=["2222.SR", "1010.SR"])
        assert result is not None
        sql_arg = self.cursor.execute.call_args[0][0]
        assert "tickers = %(tickers)s" in sql_arg

    def test_update_watchlist_both(self):
        row = _watchlist_row(name="Updated", tickers=["3030.SR"])
        self.cursor.fetchone.return_value = row
        result = self.svc.update_watchlist(
            "wl-1", "user-1", name="Updated", tickers=["3030.SR"]
        )
        assert result is not None
        sql_arg = self.cursor.execute.call_args[0][0]
        assert "name = %(name)s" in sql_arg
        assert "tickers = %(tickers)s" in sql_arg

    def test_update_watchlist_not_found(self):
        self.cursor.fetchone.return_value = None
        result = self.svc.update_watchlist("wl-999", "user-1", name="X")
        assert result is None
        self.conn.commit.assert_called_once()

    def test_update_watchlist_rollback_on_error(self):
        self.cursor.execute.side_effect = Exception("fail")
        with pytest.raises(Exception):
            self.svc.update_watchlist("wl-1", "user-1", name="X")
        self.conn.rollback.assert_called_once()
        self.conn.close.assert_called_once()

    # -- delete_watchlist -----------------------------------------------------

    def test_delete_watchlist_success(self):
        self.cursor.rowcount = 1
        result = self.svc.delete_watchlist("wl-1", "user-1")
        assert result is True
        self.conn.commit.assert_called_once()
        self.conn.close.assert_called_once()

    def test_delete_watchlist_not_found(self):
        self.cursor.rowcount = 0
        result = self.svc.delete_watchlist("wl-999", "user-1")
        assert result is False
        self.conn.commit.assert_called_once()

    def test_delete_watchlist_rollback_on_error(self):
        self.cursor.execute.side_effect = Exception("fail")
        with pytest.raises(Exception):
            self.svc.delete_watchlist("wl-1", "user-1")
        self.conn.rollback.assert_called_once()
        self.conn.close.assert_called_once()

    # -- _row_to_watchlist edge cases -----------------------------------------

    def test_row_to_watchlist_null_tickers(self):
        row = _watchlist_row(tickers=None)
        wl = UserService._row_to_watchlist(row)
        assert wl.tickers == []


class TestUserServiceAlertMethods:
    """Tests for UserService alert-related methods."""

    def setup_method(self):
        self.conn, self.cursor = _make_mock_conn()
        self.svc = UserService(get_conn=lambda: self.conn)

    # -- create_alert ---------------------------------------------------------

    def test_create_alert_success(self):
        row = _alert_row(ticker="2222.SR", alert_type="price_above", threshold_value=35.0)
        self.cursor.fetchone.return_value = row
        result = self.svc.create_alert("user-1", "2222.SR", "price_above", 35.0)
        assert isinstance(result, UserAlert)
        assert result.ticker == "2222.SR"
        assert result.alert_type == "price_above"
        assert result.threshold_value == 35.0
        self.conn.commit.assert_called_once()
        self.conn.close.assert_called_once()

    def test_create_alert_no_threshold(self):
        row = _alert_row(alert_type="event", threshold_value=None)
        self.cursor.fetchone.return_value = row
        result = self.svc.create_alert("user-1", "2222.SR", "event")
        assert result.threshold_value is None
        insert_params = self.cursor.execute.call_args[0][1]
        assert insert_params["threshold_value"] is None

    def test_create_alert_rollback_on_error(self):
        self.cursor.execute.side_effect = Exception("fail")
        with pytest.raises(Exception):
            self.svc.create_alert("user-1", "2222.SR", "price_below", 30.0)
        self.conn.rollback.assert_called_once()
        self.conn.close.assert_called_once()

    # -- get_active_alerts ----------------------------------------------------

    def test_get_active_alerts_basic(self):
        rows = [_alert_row(), _alert_row(ticker="1010.SR")]
        self.cursor.fetchall.return_value = rows
        result = self.svc.get_active_alerts("user-1")
        assert len(result) == 2
        assert all(isinstance(a, UserAlert) for a in result)
        sql_arg = self.cursor.execute.call_args[0][0]
        assert "is_active = TRUE" in sql_arg
        params = self.cursor.execute.call_args[0][1]
        assert params["user_id"] == "user-1"

    def test_get_active_alerts_with_ticker(self):
        self.cursor.fetchall.return_value = []
        self.svc.get_active_alerts("user-1", ticker="2222.SR")
        params = self.cursor.execute.call_args[0][1]
        assert params["ticker"] == "2222.SR"

    def test_get_active_alerts_empty(self):
        self.cursor.fetchall.return_value = []
        result = self.svc.get_active_alerts("user-1")
        assert result == []

    # -- deactivate_alert -----------------------------------------------------

    def test_deactivate_alert_success(self):
        self.cursor.rowcount = 1
        result = self.svc.deactivate_alert("alert-1", "user-1")
        assert result is True
        self.conn.commit.assert_called_once()
        self.conn.close.assert_called_once()

    def test_deactivate_alert_not_found(self):
        self.cursor.rowcount = 0
        result = self.svc.deactivate_alert("alert-999", "user-1")
        assert result is False
        self.conn.commit.assert_called_once()

    def test_deactivate_alert_rollback_on_error(self):
        self.cursor.execute.side_effect = Exception("fail")
        with pytest.raises(Exception):
            self.svc.deactivate_alert("alert-1", "user-1")
        self.conn.rollback.assert_called_once()
        self.conn.close.assert_called_once()

    # -- _row_to_alert edge cases ---------------------------------------------

    def test_row_to_alert_none_threshold(self):
        row = _alert_row(threshold_value=None)
        alert = UserService._row_to_alert(row)
        assert alert.threshold_value is None

    def test_row_to_alert_missing_optional_fields(self):
        minimal = {
            "id": "abc",
            "user_id": "u1",
            "ticker": "2222.SR",
            "alert_type": "price_above",
        }
        alert = UserService._row_to_alert(minimal)
        assert alert.id == "abc"
        assert alert.is_active is True
        assert alert.threshold_value is None

    # -- connection lifecycle -------------------------------------------------

    def test_get_active_alerts_closes_conn_on_exception(self):
        self.cursor.execute.side_effect = Exception("fail")
        with pytest.raises(Exception):
            self.svc.get_active_alerts("user-1")
        self.conn.close.assert_called_once()

    def test_create_alert_closes_conn_on_success(self):
        row = _alert_row()
        self.cursor.fetchone.return_value = row
        self.svc.create_alert("user-1", "2222.SR", "price_above", 35.0)
        self.conn.close.assert_called_once()


# ===========================================================================
# Cross-service: _row_to_* with float conversion
# ===========================================================================


class TestRowConversions:
    """Test that float conversions in _row_to_* methods handle edge cases."""

    def test_news_sentiment_score_string_conversion(self):
        """sentiment_score might come as string from some drivers."""
        row = _news_row(sentiment_score="0.75")
        article = NewsAggregationService._row_to_article(row)
        assert article.sentiment_score == 0.75

    def test_alert_threshold_string_conversion(self):
        """threshold_value might come as string from some drivers."""
        row = _alert_row(threshold_value="42.5")
        alert = UserService._row_to_alert(row)
        assert alert.threshold_value == 42.5
