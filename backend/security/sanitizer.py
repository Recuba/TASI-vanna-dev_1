"""Input sanitization for natural language queries and SQL identifiers.

Provides functions to clean user input before it reaches the LLM,
preventing prompt injection and ensuring safe identifier usage.
"""

from __future__ import annotations

import html
import logging
import re
import unicodedata

logger = logging.getLogger(__name__)

# Maximum allowed length for natural language queries
MAX_NL_QUERY_LENGTH = 2000

# Maximum allowed length for SQL identifiers
MAX_IDENTIFIER_LENGTH = 128

# Valid SQL identifier pattern: starts with letter or underscore,
# followed by letters, digits, or underscores
_IDENTIFIER_PATTERN = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_]*$")

# Control characters to strip (C0 and C1 control chars, excluding \n \r \t)
_CONTROL_CHARS_PATTERN = re.compile(
    r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]"
)

# Pattern to detect input that is purely SQL (not natural language)
_PURE_SQL_PATTERN = re.compile(
    r"^\s*(SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|"
    r"WITH|EXPLAIN|PRAGMA|ATTACH|DETACH|VACUUM)\b",
    re.IGNORECASE,
)


def sanitize_nl_query(user_input: str) -> str:
    """Sanitize a natural language query from the user.

    Performs the following steps:
    1. Strip control characters (keeping newlines, tabs)
    2. Normalize Unicode (NFC form) to prevent homoglyph attacks
    3. Truncate to MAX_NL_QUERY_LENGTH characters
    4. Escape HTML entities to prevent XSS if rendered
    5. Reject input that appears to be raw SQL

    Args:
        user_input: The raw user input string.

    Returns:
        The sanitized input string.

    Raises:
        ValueError: If the input appears to be a raw SQL query rather
            than a natural language question.
    """
    if not user_input:
        return ""

    # Strip control characters (keep \n, \r, \t)
    cleaned = _CONTROL_CHARS_PATTERN.sub("", user_input)

    # Normalize Unicode to NFC form
    cleaned = unicodedata.normalize("NFC", cleaned)

    # Strip leading/trailing whitespace
    cleaned = cleaned.strip()

    # Truncate to max length
    if len(cleaned) > MAX_NL_QUERY_LENGTH:
        logger.warning(
            "Natural language query truncated from %d to %d chars",
            len(cleaned),
            MAX_NL_QUERY_LENGTH,
        )
        cleaned = cleaned[:MAX_NL_QUERY_LENGTH]

    # Escape HTML entities
    cleaned = html.escape(cleaned, quote=True)

    # Reject pure SQL input
    if _PURE_SQL_PATTERN.match(cleaned):
        raise ValueError(
            "Input appears to be a raw SQL query. "
            "Please use natural language to describe your question."
        )

    return cleaned


def sanitize_identifiers(identifier: str) -> str:
    """Validate and sanitize a SQL identifier (table name, column name).

    Only allows identifiers matching [a-zA-Z_][a-zA-Z0-9_]* pattern.
    This prevents SQL injection through dynamic identifier construction.

    Args:
        identifier: The identifier string to validate.

    Returns:
        The validated identifier (unchanged if valid).

    Raises:
        ValueError: If the identifier contains invalid characters or
            exceeds the maximum length.
    """
    if not identifier:
        raise ValueError("Identifier cannot be empty")

    # Strip whitespace
    cleaned = identifier.strip()

    if len(cleaned) > MAX_IDENTIFIER_LENGTH:
        raise ValueError(
            f"Identifier exceeds maximum length of {MAX_IDENTIFIER_LENGTH}: "
            f"got {len(cleaned)} chars"
        )

    if not _IDENTIFIER_PATTERN.match(cleaned):
        raise ValueError(
            f"Invalid SQL identifier: '{cleaned}'. "
            "Must match pattern [a-zA-Z_][a-zA-Z0-9_]*"
        )

    return cleaned
