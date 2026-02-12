"""
News Feed API routes (SQLite-backed).

Provides endpoints for the live news feed aggregated by the news scrapers.
Works with any database backend (uses its own SQLite store for news_articles).
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from services.news_store import NewsStore

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/news", tags=["news-feed"])

# ---------------------------------------------------------------------------
# Singleton store -- uses the same directory as the main database
# ---------------------------------------------------------------------------
_HERE = Path(__file__).resolve().parent.parent.parent
_DB_PATH = str(_HERE / "saudi_stocks.db")
_store = NewsStore(_DB_PATH)


def get_store() -> NewsStore:
    """Return the module-level NewsStore singleton."""
    return _store


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------


class NewsArticle(BaseModel):
    id: str
    ticker: Optional[str] = None
    title: str
    body: Optional[str] = None
    source_name: Optional[str] = None
    source_url: Optional[str] = None
    published_at: Optional[str] = None
    sentiment_score: Optional[float] = None
    sentiment_label: Optional[str] = None
    language: str = "ar"
    priority: int = 3
    created_at: Optional[str] = None


class NewsFeedResponse(BaseModel):
    items: List[NewsArticle]
    total: int
    page: int
    limit: int


class NewsSourceInfo(BaseModel):
    source_name: str
    count: int


class NewsSourcesResponse(BaseModel):
    sources: List[NewsSourceInfo]


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.get("/feed", response_model=NewsFeedResponse)
async def get_news_feed(
    limit: int = Query(20, ge=1, le=100, description="Articles per page"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    source: Optional[str] = Query(None, description="Filter by source name"),
) -> NewsFeedResponse:
    """Get latest news articles with optional source filtering and pagination."""
    store = get_store()
    articles = store.get_latest_news(limit=limit, offset=offset, source=source)
    total = store.count_articles(source=source)
    page = (offset // limit) + 1 if limit > 0 else 1

    return NewsFeedResponse(
        items=[NewsArticle(**a) for a in articles],
        total=total,
        page=page,
        limit=limit,
    )


@router.get("/feed/{article_id}", response_model=NewsArticle)
async def get_article(article_id: str) -> NewsArticle:
    """Get a single article by ID."""
    store = get_store()
    article = store.get_article_by_id(article_id)
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")
    return NewsArticle(**article)


@router.get("/search", response_model=NewsFeedResponse)
async def search_articles(
    q: str = Query(..., min_length=1, description="Search query"),
    limit: int = Query(20, ge=1, le=100, description="Articles per page"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
) -> NewsFeedResponse:
    """Search articles by title or body text."""
    store = get_store()
    articles = store.search_articles(query=q, limit=limit, offset=offset)
    page = (offset // limit) + 1 if limit > 0 else 1

    return NewsFeedResponse(
        items=[NewsArticle(**a) for a in articles],
        total=len(articles),
        page=page,
        limit=limit,
    )


@router.get("/sources", response_model=NewsSourcesResponse)
async def get_sources() -> NewsSourcesResponse:
    """Get available news sources with article counts."""
    store = get_store()
    sources = store.get_sources()
    return NewsSourcesResponse(sources=[NewsSourceInfo(**s) for s in sources])
