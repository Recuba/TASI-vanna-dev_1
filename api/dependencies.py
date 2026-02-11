"""
Shared FastAPI dependencies for the TASI AI platform API.

Provides database connection factory and service instances
for dependency injection into route handlers.

Connections are managed through ``DatabaseManager`` which handles pool
integration, backend selection (SQLite/PostgreSQL), and configuration.
"""

from __future__ import annotations

import logging
from functools import lru_cache
from typing import Generator

from database.manager import DatabaseManager, get_database_manager
from services.news_service import NewsAggregationService
from services.reports_service import TechnicalReportsService
from services.announcement_service import AnnouncementService
from services.user_service import UserService
from services.audit_service import AuditService

logger = logging.getLogger(__name__)


def get_db_connection():
    """Get a database connection via the centralized DatabaseManager.

    Returns a raw connection. The caller is responsible for closing it
    (typically in a try/finally block). For pool-backed connections,
    close() returns the connection to the pool with an automatic rollback
    of uncommitted work.

    This function is used both as a direct call in route handlers and as
    a callable passed to services (get_conn=get_db_connection).
    """
    db = get_database_manager()
    return db._get_raw_connection()


def get_db_connection_dep() -> Generator:
    """FastAPI generator dependency that auto-closes connections.

    Use with ``Depends(get_db_connection_dep)`` for route handlers that
    need a connection with guaranteed cleanup::

        @router.get("/items")
        async def list_items(conn=Depends(get_db_connection_dep)):
            cur = conn.cursor()
            ...
    """
    conn = get_db_connection()
    try:
        yield conn
    finally:
        conn.close()


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
