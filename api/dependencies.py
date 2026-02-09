"""
Shared FastAPI dependencies for the TASI AI platform API.

Provides database connection factory and service instances
for dependency injection into route handlers.

Uses the connection pool when available, falling back to direct connections.
"""

from __future__ import annotations

import logging
import os
from functools import lru_cache

import psycopg2

from services.news_service import NewsAggregationService
from services.reports_service import TechnicalReportsService
from services.announcement_service import AnnouncementService
from services.user_service import UserService
from services.audit_service import AuditService

logger = logging.getLogger(__name__)

_use_pool = False

try:
    from database.pool import get_pool_connection, is_pool_initialized

    _use_pool = True
except ImportError:
    pass


def get_db_connection():
    """Get a database connection, preferring the pool if initialized.

    When the connection pool is available and initialized, connections are
    checked out from the pool and returned on close(). Otherwise, a direct
    psycopg2 connection is created.
    """
    if _use_pool and is_pool_initialized():
        return get_pool_connection()

    return psycopg2.connect(
        host=os.environ.get("POSTGRES_HOST", "localhost"),
        port=int(os.environ.get("POSTGRES_PORT", "5432")),
        dbname=os.environ.get("POSTGRES_DB", "saudi_stocks"),
        user=os.environ.get("POSTGRES_USER", "postgres"),
        password=os.environ.get("POSTGRES_PASSWORD", ""),
    )


# ---------------------------------------------------------------------------
# Service singletons (each holds a reference to get_db_connection)
# ---------------------------------------------------------------------------


@lru_cache(maxsize=1)
def get_news_service() -> NewsAggregationService:
    return NewsAggregationService(get_conn=get_db_connection)


@lru_cache(maxsize=1)
def get_reports_service() -> TechnicalReportsService:
    return TechnicalReportsService(get_conn=get_db_connection)


@lru_cache(maxsize=1)
def get_announcement_service() -> AnnouncementService:
    return AnnouncementService(get_conn=get_db_connection)


@lru_cache(maxsize=1)
def get_user_service() -> UserService:
    return UserService(get_conn=get_db_connection)


@lru_cache(maxsize=1)
def get_audit_service() -> AuditService:
    return AuditService(get_conn=get_db_connection)
