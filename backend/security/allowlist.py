"""Query allowlist with hot-reload support for Ra'd AI SQL security.

Manages lists of allowed tables and operations, loaded from a JSON
config file. Supports automatic reload when the config file changes
(checked via file modification time with a configurable TTL).
"""

from __future__ import annotations

import json
import logging
import os
import time
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# Default path to the allowlist config file
_DEFAULT_CONFIG_PATH = (
    Path(__file__).resolve().parent.parent.parent / "config" / "allowed_tables.json"
)

# How often to check if the config file has changed (seconds)
_DEFAULT_CACHE_TTL = 30.0


class QueryAllowlist:
    """Manages allowed tables and operations for SQL query validation.

    Loads configuration from a JSON file and supports hot-reload:
    on each access, checks if the file has been modified (with a TTL
    to avoid excessive stat calls) and reloads if needed.

    Args:
        config_path: Path to the allowed_tables.json file.
            Defaults to config/allowed_tables.json in the project root.
        cache_ttl: Seconds between file modification checks.
            Defaults to 30 seconds.
    """

    def __init__(
        self,
        config_path: str | Path | None = None,
        cache_ttl: float = _DEFAULT_CACHE_TTL,
    ) -> None:
        self._config_path = Path(config_path) if config_path else _DEFAULT_CONFIG_PATH
        self._cache_ttl = cache_ttl
        self._last_check_time: float = 0.0
        self._last_mtime: float = 0.0
        self._allowed_tables: set[str] = set()
        self._allowed_operations: set[str] = set()
        self._blocked_tables: set[str] = set()
        self._load()

    def _load(self) -> None:
        """Load the allowlist configuration from the JSON file."""
        try:
            with open(self._config_path, encoding="utf-8") as f:
                data: dict[str, Any] = json.load(f)

            self._allowed_tables = {t.lower() for t in data.get("allowed_tables", [])}
            self._allowed_operations = {
                op.upper() for op in data.get("allowed_operations", [])
            }
            self._blocked_tables = {t.lower() for t in data.get("blocked_tables", [])}
            self._last_mtime = os.path.getmtime(self._config_path)
            self._last_check_time = time.monotonic()

            logger.info(
                "Loaded allowlist: %d tables, %d operations, %d blocked",
                len(self._allowed_tables),
                len(self._allowed_operations),
                len(self._blocked_tables),
            )
        except FileNotFoundError:
            logger.error("Allowlist config not found: %s", self._config_path)
            # Fail safe: empty allowlist means nothing is allowed
            self._allowed_tables = set()
            self._allowed_operations = set()
            self._blocked_tables = set()
        except (json.JSONDecodeError, KeyError) as e:
            logger.error("Invalid allowlist config: %s", e)
            self._allowed_tables = set()
            self._allowed_operations = set()
            self._blocked_tables = set()

    def _maybe_reload(self) -> None:
        """Check if the config file has changed and reload if needed."""
        now = time.monotonic()
        if now - self._last_check_time < self._cache_ttl:
            return

        self._last_check_time = now
        try:
            current_mtime = os.path.getmtime(self._config_path)
            if current_mtime != self._last_mtime:
                logger.info("Allowlist config changed, reloading")
                self._load()
        except OSError:
            pass  # File might be temporarily unavailable

    def is_table_allowed(self, table_name: str) -> bool:
        """Check if a table name is in the allowlist.

        A table is allowed if it appears in the allowed_tables list
        and does NOT appear in the blocked_tables list.

        Args:
            table_name: The table name to check (case-insensitive).

        Returns:
            True if the table is allowed for querying.
        """
        self._maybe_reload()
        lower = table_name.lower()
        if lower in self._blocked_tables:
            return False
        return lower in self._allowed_tables

    def is_operation_allowed(self, operation: str) -> bool:
        """Check if a SQL operation is in the allowlist.

        Args:
            operation: The SQL operation to check (e.g., "SELECT").
                Case-insensitive.

        Returns:
            True if the operation is allowed.
        """
        self._maybe_reload()
        return operation.upper() in self._allowed_operations

    def get_allowed_tables(self) -> list[str]:
        """Return the current list of allowed table names.

        Returns:
            Sorted list of allowed table names.
        """
        self._maybe_reload()
        return sorted(self._allowed_tables)

    def get_blocked_tables(self) -> list[str]:
        """Return the current list of blocked table names.

        Returns:
            Sorted list of blocked table names.
        """
        self._maybe_reload()
        return sorted(self._blocked_tables)
