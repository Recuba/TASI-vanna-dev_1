"""
News articles API routes.

Provides read endpoints (public) and a write endpoint (authenticated).
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from api.dependencies import get_news_service
from api.schemas.common import PaginatedResponse, PaginationParams
from api.schemas.news import NewsCreate, NewsResponse

# Backward-compatible aliases used by tests/test_api_routes.py
NewsArticleResponse = NewsResponse


class NewsListResponse(BaseModel):
    """Legacy response model kept for backward compatibility."""
    items: List[NewsResponse]
    count: int
from auth.dependencies import get_current_user
from services.news_service import NewsAggregationService, NewsArticle

router = APIRouter(prefix="/api/news", tags=["news"])


def _to_response(a: NewsArticle) -> NewsResponse:
    return NewsResponse(
        id=a.id,
        ticker=a.ticker,
        title=a.title,
        body=a.body,
        source_name=a.source_name,
        source_url=a.source_url,
        published_at=a.published_at,
        sentiment_score=a.sentiment_score,
        sentiment_label=a.sentiment_label,
        language=a.language,
        created_at=a.created_at,
    )


# ---------------------------------------------------------------------------
# Read endpoints (public)
# ---------------------------------------------------------------------------
@router.get("", response_model=PaginatedResponse[NewsResponse])
async def list_news(
    pagination: PaginationParams = Depends(),
    language: Optional[str] = Query(None),
    svc: NewsAggregationService = Depends(get_news_service),
) -> PaginatedResponse[NewsResponse]:
    """Return the latest news articles across all tickers."""
    articles = svc.get_latest_news(
        limit=pagination.limit, offset=pagination.offset, language=language
    )
    total = svc.count_articles()
    return PaginatedResponse.build(
        items=[_to_response(a) for a in articles],
        total=total,
        page=pagination.page,
        page_size=pagination.page_size,
    )


@router.get("/ticker/{ticker}", response_model=PaginatedResponse[NewsResponse])
async def news_by_ticker(
    ticker: str,
    pagination: PaginationParams = Depends(),
    sentiment: Optional[str] = Query(None),
    since: Optional[datetime] = Query(None),
    svc: NewsAggregationService = Depends(get_news_service),
) -> PaginatedResponse[NewsResponse]:
    """Return news articles for a specific ticker."""
    articles = svc.get_news_by_ticker(
        ticker=ticker,
        limit=pagination.limit,
        offset=pagination.offset,
        sentiment_label=sentiment,
        since=since,
    )
    total = svc.count_articles(ticker=ticker)
    return PaginatedResponse.build(
        items=[_to_response(a) for a in articles],
        total=total,
        page=pagination.page,
        page_size=pagination.page_size,
    )


@router.get("/sector/{sector}", response_model=PaginatedResponse[NewsResponse])
async def news_by_sector(
    sector: str,
    pagination: PaginationParams = Depends(),
    since: Optional[datetime] = Query(None),
    svc: NewsAggregationService = Depends(get_news_service),
) -> PaginatedResponse[NewsResponse]:
    """Return news articles for all companies in a sector."""
    articles = svc.get_news_by_sector(
        sector=sector,
        limit=pagination.limit,
        offset=pagination.offset,
        since=since,
    )
    total = svc.count_articles(sector=sector)
    return PaginatedResponse.build(
        items=[_to_response(a) for a in articles],
        total=total,
        page=pagination.page,
        page_size=pagination.page_size,
    )


@router.get("/{article_id}", response_model=NewsResponse)
async def get_article(
    article_id: str,
    svc: NewsAggregationService = Depends(get_news_service),
) -> NewsResponse:
    """Return a single news article by ID."""
    article = svc.get_article_by_id(article_id)
    if article is None:
        raise HTTPException(status_code=404, detail="Article not found")
    return _to_response(article)


# ---------------------------------------------------------------------------
# Write endpoints (authenticated)
# ---------------------------------------------------------------------------
@router.post("", response_model=NewsResponse, status_code=201)
async def create_article(
    body: NewsCreate,
    current_user: Dict[str, Any] = Depends(get_current_user),
    svc: NewsAggregationService = Depends(get_news_service),
) -> NewsResponse:
    """Create a new news article. Requires authentication."""
    article = NewsArticle(
        title=body.title,
        body=body.content,
        ticker=body.ticker,
        source_name=body.source,
        source_url=body.source_url,
        language=body.language,
        sentiment_score=body.sentiment_score,
        sentiment_label=body.sentiment_label,
        published_at=datetime.now(timezone.utc),
    )
    svc.store_articles([article])
    return _to_response(article)
