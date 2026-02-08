"""Pydantic v2 request/response schemas for the TASI AI platform API."""

from api.schemas.common import ErrorResponse, PaginatedResponse, PaginationParams
from api.schemas.news import NewsCreate, NewsResponse, NewsUpdate
from api.schemas.reports import ReportCreate, ReportResponse, ReportUpdate
from api.schemas.announcements import AnnouncementCreate, AnnouncementResponse
from api.schemas.entities import CompanyDetail, CompanySummary, EntityListResponse, SectorInfo
from api.schemas.watchlists import (
    AlertCreateRequest,
    AlertResponse,
    WatchlistAddRequest,
    WatchlistCreateRequest,
    WatchlistResponse,
    WatchlistUpdateRequest,
)
from api.schemas.charts import ChartDataPoint, ChartRequest, ChartResponse
from api.schemas.health import ComponentHealthResponse, HealthResponse

__all__ = [
    "ErrorResponse",
    "PaginatedResponse",
    "PaginationParams",
    "NewsCreate",
    "NewsResponse",
    "NewsUpdate",
    "ReportCreate",
    "ReportResponse",
    "ReportUpdate",
    "AnnouncementCreate",
    "AnnouncementResponse",
    "CompanyDetail",
    "CompanySummary",
    "EntityListResponse",
    "SectorInfo",
    "AlertCreateRequest",
    "AlertResponse",
    "WatchlistAddRequest",
    "WatchlistCreateRequest",
    "WatchlistResponse",
    "WatchlistUpdateRequest",
    "ChartDataPoint",
    "ChartRequest",
    "ChartResponse",
    "ComponentHealthResponse",
    "HealthResponse",
]
