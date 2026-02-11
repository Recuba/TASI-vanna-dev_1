"""
User Service
=============
CRUD operations for users, user_watchlists, and user_alerts tables.
Provides user management, watchlist management, and alert management.

Requires a psycopg2 connection factory passed at init.
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional

import psycopg2
import psycopg2.extras

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------
@dataclass
class UserProfile:
    """Mirrors the users table in database/schema.sql."""

    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    auth_provider: str = "local"
    auth_provider_id: Optional[str] = None
    email: str = ""
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    subscription_tier: str = "free"
    usage_count: int = 0
    last_query_at: Optional[datetime] = None
    is_active: bool = True
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


@dataclass
class Watchlist:
    """Mirrors the user_watchlists table in database/schema.sql."""

    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str = ""
    name: str = "Default"
    tickers: List[str] = field(default_factory=list)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


@dataclass
class UserAlert:
    """Mirrors the user_alerts table in database/schema.sql."""

    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str = ""
    ticker: str = ""
    alert_type: str = ""  # 'price_above', 'price_below', 'volume_spike', 'event'
    threshold_value: Optional[float] = None
    is_active: bool = True
    last_triggered_at: Optional[datetime] = None
    created_at: Optional[datetime] = None


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------
class UserService:
    """Service layer for users, user_watchlists, and user_alerts tables.

    Parameters
    ----------
    get_conn : callable
        A zero-argument callable that returns a psycopg2 connection.
        The service calls ``conn.close()`` after each operation.
    """

    def __init__(self, get_conn):
        self._get_conn = get_conn

    # -- helpers -------------------------------------------------------------

    def _conn(self):
        return self._get_conn()

    @staticmethod
    def _row_to_user(row: Dict[str, Any]) -> UserProfile:
        return UserProfile(
            id=str(row["id"]),
            auth_provider=row["auth_provider"],
            auth_provider_id=row.get("auth_provider_id"),
            email=row["email"],
            display_name=row.get("display_name"),
            avatar_url=row.get("avatar_url"),
            subscription_tier=row.get("subscription_tier", "free"),
            usage_count=row.get("usage_count", 0),
            last_query_at=row.get("last_query_at"),
            is_active=row.get("is_active", True),
            created_at=row.get("created_at"),
            updated_at=row.get("updated_at"),
        )

    @staticmethod
    def _row_to_watchlist(row: Dict[str, Any]) -> Watchlist:
        return Watchlist(
            id=str(row["id"]),
            user_id=str(row["user_id"]),
            name=row["name"],
            tickers=row.get("tickers") or [],
            created_at=row.get("created_at"),
            updated_at=row.get("updated_at"),
        )

    @staticmethod
    def _row_to_alert(row: Dict[str, Any]) -> UserAlert:
        return UserAlert(
            id=str(row["id"]),
            user_id=str(row["user_id"]),
            ticker=row["ticker"],
            alert_type=row["alert_type"],
            threshold_value=float(row["threshold_value"])
            if row.get("threshold_value") is not None
            else None,
            is_active=row.get("is_active", True),
            last_triggered_at=row.get("last_triggered_at"),
            created_at=row.get("created_at"),
        )

    # -----------------------------------------------------------------------
    # User methods
    # -----------------------------------------------------------------------

    def get_or_create_user(
        self,
        email: str,
        auth_provider: str = "local",
        auth_provider_id: Optional[str] = None,
        display_name: Optional[str] = None,
    ) -> UserProfile:
        """Return an existing user by email, or create a new one.

        Uses INSERT ... ON CONFLICT (email) DO NOTHING then SELECT
        to handle races safely.
        """
        user_id = str(uuid.uuid4())

        sql_insert = """
            INSERT INTO users (id, auth_provider, auth_provider_id, email, display_name)
            VALUES (%(id)s, %(auth_provider)s, %(auth_provider_id)s,
                    %(email)s, %(display_name)s)
            ON CONFLICT (email) DO NOTHING
        """
        sql_select = "SELECT * FROM users WHERE email = %(email)s"

        conn = self._conn()
        try:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(
                    sql_insert,
                    {
                        "id": user_id,
                        "auth_provider": auth_provider,
                        "auth_provider_id": auth_provider_id,
                        "email": email,
                        "display_name": display_name,
                    },
                )
                conn.commit()
                cur.execute(sql_select, {"email": email})
                row = cur.fetchone()
                return self._row_to_user(row)
        except Exception:
            conn.rollback()
            logger.error("Failed to get_or_create user %s", email, exc_info=True)
            raise
        finally:
            conn.close()

    def get_user_by_id(self, user_id: str) -> Optional[UserProfile]:
        """Return a user by UUID, or None."""
        sql = "SELECT * FROM users WHERE id = %(id)s"

        conn = self._conn()
        try:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(sql, {"id": user_id})
                row = cur.fetchone()
                if row is None:
                    return None
                return self._row_to_user(row)
        finally:
            conn.close()

    def get_user_by_email(self, email: str) -> Optional[UserProfile]:
        """Return a user by email, or None."""
        sql = "SELECT * FROM users WHERE email = %(email)s"

        conn = self._conn()
        try:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(sql, {"email": email})
                row = cur.fetchone()
                if row is None:
                    return None
                return self._row_to_user(row)
        finally:
            conn.close()

    def increment_usage(self, user_id: str) -> None:
        """Increment usage_count and update last_query_at for a user."""
        sql = """
            UPDATE users
            SET usage_count = usage_count + 1,
                last_query_at = NOW(),
                updated_at = NOW()
            WHERE id = %(id)s
        """

        conn = self._conn()
        try:
            with conn.cursor() as cur:
                cur.execute(sql, {"id": user_id})
            conn.commit()
        except Exception:
            conn.rollback()
            logger.error("Failed to increment usage for user %s", user_id, exc_info=True)
            raise
        finally:
            conn.close()

    # -----------------------------------------------------------------------
    # Watchlist methods
    # -----------------------------------------------------------------------

    def get_watchlists(self, user_id: str) -> List[Watchlist]:
        """Return all watchlists for a user."""
        sql = """
            SELECT * FROM user_watchlists
            WHERE user_id = %(user_id)s
            ORDER BY created_at
        """

        conn = self._conn()
        try:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(sql, {"user_id": user_id})
                return [self._row_to_watchlist(r) for r in cur.fetchall()]
        finally:
            conn.close()

    def create_watchlist(
        self,
        user_id: str,
        name: str = "Default",
        tickers: Optional[List[str]] = None,
    ) -> Watchlist:
        """Create a new watchlist. Returns the created watchlist.

        Raises psycopg2.errors.UniqueViolation if (user_id, name) already exists.
        """
        wl_id = str(uuid.uuid4())
        tickers = tickers or []

        sql = """
            INSERT INTO user_watchlists (id, user_id, name, tickers)
            VALUES (%(id)s, %(user_id)s, %(name)s, %(tickers)s)
            RETURNING *
        """

        conn = self._conn()
        try:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(
                    sql,
                    {
                        "id": wl_id,
                        "user_id": user_id,
                        "name": name,
                        "tickers": tickers,
                    },
                )
                row = cur.fetchone()
            conn.commit()
            return self._row_to_watchlist(row)
        except Exception:
            conn.rollback()
            logger.error("Failed to create watchlist for user %s", user_id, exc_info=True)
            raise
        finally:
            conn.close()

    def update_watchlist(
        self,
        watchlist_id: str,
        user_id: str,
        name: Optional[str] = None,
        tickers: Optional[List[str]] = None,
    ) -> Optional[Watchlist]:
        """Update a watchlist's name and/or tickers. Returns updated watchlist or None."""
        sets: List[str] = ["updated_at = NOW()"]
        params: Dict[str, Any] = {"id": watchlist_id, "user_id": user_id}

        if name is not None:
            sets.append("name = %(name)s")
            params["name"] = name

        if tickers is not None:
            sets.append("tickers = %(tickers)s")
            params["tickers"] = tickers

        sql = f"""
            UPDATE user_watchlists
            SET {", ".join(sets)}
            WHERE id = %(id)s AND user_id = %(user_id)s
            RETURNING *
        """

        conn = self._conn()
        try:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(sql, params)
                row = cur.fetchone()
            conn.commit()
            if row is None:
                return None
            return self._row_to_watchlist(row)
        except Exception:
            conn.rollback()
            logger.error("Failed to update watchlist %s", watchlist_id, exc_info=True)
            raise
        finally:
            conn.close()

    def delete_watchlist(self, watchlist_id: str, user_id: str) -> bool:
        """Delete a watchlist. Returns True if a row was deleted."""
        sql = """
            DELETE FROM user_watchlists
            WHERE id = %(id)s AND user_id = %(user_id)s
        """

        conn = self._conn()
        try:
            with conn.cursor() as cur:
                cur.execute(sql, {"id": watchlist_id, "user_id": user_id})
                deleted = cur.rowcount > 0
            conn.commit()
            return deleted
        except Exception:
            conn.rollback()
            logger.error("Failed to delete watchlist %s", watchlist_id, exc_info=True)
            raise
        finally:
            conn.close()

    # -----------------------------------------------------------------------
    # Alert methods
    # -----------------------------------------------------------------------

    def create_alert(
        self,
        user_id: str,
        ticker: str,
        alert_type: str,
        threshold_value: Optional[float] = None,
    ) -> UserAlert:
        """Create a new alert. Returns the created alert."""
        alert_id = str(uuid.uuid4())

        sql = """
            INSERT INTO user_alerts
                (id, user_id, ticker, alert_type, threshold_value)
            VALUES
                (%(id)s, %(user_id)s, %(ticker)s, %(alert_type)s,
                 %(threshold_value)s)
            RETURNING *
        """

        conn = self._conn()
        try:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(
                    sql,
                    {
                        "id": alert_id,
                        "user_id": user_id,
                        "ticker": ticker,
                        "alert_type": alert_type,
                        "threshold_value": threshold_value,
                    },
                )
                row = cur.fetchone()
            conn.commit()
            return self._row_to_alert(row)
        except Exception:
            conn.rollback()
            logger.error("Failed to create alert for user %s ticker %s", user_id, ticker, exc_info=True)
            raise
        finally:
            conn.close()

    def get_active_alerts(
        self,
        user_id: str,
        ticker: Optional[str] = None,
    ) -> List[UserAlert]:
        """Return all active alerts for a user, optionally filtered by ticker."""
        clauses = ["a.user_id = %(user_id)s", "a.is_active = TRUE"]
        params: Dict[str, Any] = {"user_id": user_id}

        if ticker:
            clauses.append("a.ticker = %(ticker)s")
            params["ticker"] = ticker

        where = "WHERE " + " AND ".join(clauses)

        sql = f"""
            SELECT a.*
            FROM user_alerts a
            {where}
            ORDER BY a.created_at DESC
        """

        conn = self._conn()
        try:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(sql, params)
                return [self._row_to_alert(r) for r in cur.fetchall()]
        finally:
            conn.close()

    def deactivate_alert(self, alert_id: str, user_id: str) -> bool:
        """Deactivate an alert. Returns True if a row was updated."""
        sql = """
            UPDATE user_alerts
            SET is_active = FALSE
            WHERE id = %(id)s AND user_id = %(user_id)s
        """

        conn = self._conn()
        try:
            with conn.cursor() as cur:
                cur.execute(sql, {"id": alert_id, "user_id": user_id})
                updated = cur.rowcount > 0
            conn.commit()
            return updated
        except Exception:
            conn.rollback()
            logger.error("Failed to deactivate alert %s", alert_id, exc_info=True)
            raise
        finally:
            conn.close()
