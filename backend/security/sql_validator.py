"""SQL query validator for preventing SQL injection in AI-generated queries.

Uses sqlparse for proper SQL parsing to detect dangerous operations,
forbidden patterns, and potential injection attempts.
"""

from __future__ import annotations

import logging
import re

import sqlparse
from sqlparse.sql import (
    Comment,
    Function,
    Identifier,
    IdentifierList,
    Parenthesis,
    Where,
)
from sqlparse.tokens import DML, DDL, Keyword

from backend.security.models import ValidationResult

logger = logging.getLogger(__name__)

# Operations that are never allowed in AI-generated queries
FORBIDDEN_OPERATIONS: set[str] = {
    "INSERT",
    "UPDATE",
    "DELETE",
    "DROP",
    "ALTER",
    "CREATE",
    "TRUNCATE",
    "REPLACE",
    "MERGE",
    "GRANT",
    "REVOKE",
    "EXEC",
    "EXECUTE",
    "CALL",
    "INTO OUTFILE",
    "INTO DUMPFILE",
    "LOAD_FILE",
    "LOAD DATA",
    "COPY",
    "ATTACH",
    "DETACH",
    "PRAGMA",
    "VACUUM",
    "REINDEX",
    "ANALYZE",  # SQLite ANALYZE can modify internal stats tables
}

# Patterns that indicate injection attempts (case-insensitive)
INJECTION_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r";\s*(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE)", re.IGNORECASE),
    re.compile(r"UNION\s+ALL\s+SELECT\s+.*(FROM\s+sqlite_master|information_schema)", re.IGNORECASE),
    re.compile(r"(--|#|/\*)\s*(DROP|ALTER|DELETE|INSERT|UPDATE)", re.IGNORECASE),
    re.compile(r"0x[0-9a-fA-F]+"),  # Hex-encoded payloads
    re.compile(r"CHAR\s*\(\s*\d+(\s*,\s*\d+)*\s*\)", re.IGNORECASE),  # CHAR() obfuscation
    re.compile(r"CONCAT\s*\(", re.IGNORECASE),  # String concatenation tricks
    re.compile(r"(SLEEP|BENCHMARK|WAITFOR|PG_SLEEP)\s*\(", re.IGNORECASE),  # Time-based injection
    re.compile(r"(LOAD_FILE|INTO\s+OUTFILE|INTO\s+DUMPFILE)\s*\(", re.IGNORECASE),  # File access
    re.compile(r"sqlite_master|information_schema|pg_catalog|pg_tables", re.IGNORECASE),  # Schema probing
]

# Risk score weights for different violation types
RISK_WEIGHTS: dict[str, float] = {
    "forbidden_operation": 1.0,
    "stacked_query": 0.9,
    "injection_pattern": 0.8,
    "union_select": 0.5,
    "subquery": 0.1,
    "comment": 0.2,
    "schema_probe": 0.9,
}


class SqlQueryValidator:
    """Validates SQL queries for safety before execution.

    Uses sqlparse to parse and analyze SQL queries, detecting:
    - Write/DDL operations (INSERT, UPDATE, DELETE, DROP, etc.)
    - Stacked queries (multiple statements via semicolons)
    - UNION-based injection attempts
    - Comment-embedded SQL keywords
    - Schema probing (sqlite_master, information_schema)
    - Time-based and file-based injection patterns
    """

    def validate(self, sql: str) -> ValidationResult:
        """Run all validation checks on a SQL query.

        Args:
            sql: The SQL query string to validate.

        Returns:
            ValidationResult with is_valid, violations, risk_score, etc.
        """
        if not sql or not sql.strip():
            return ValidationResult(
                is_valid=False,
                violations=["Empty query"],
                risk_score=1.0,
            )

        violations: list[str] = []
        risk_scores: list[float] = []

        # Normalize whitespace for the sanitized version
        normalized = self._normalize_sql(sql)

        # Parse with sqlparse
        try:
            parsed_statements = sqlparse.parse(normalized)
        except Exception as e:
            logger.warning("sqlparse failed to parse query: %s", e)
            return ValidationResult(
                is_valid=False,
                violations=[f"Unparseable SQL: {e}"],
                risk_score=1.0,
            )

        # Check for stacked queries (multiple statements)
        if len(parsed_statements) > 1:
            violations.append("Stacked queries detected (multiple statements)")
            risk_scores.append(RISK_WEIGHTS["stacked_query"])

        # Analyze the primary statement
        stmt = parsed_statements[0] if parsed_statements else None
        if stmt is None:
            return ValidationResult(
                is_valid=False,
                violations=["No parseable statement found"],
                risk_score=1.0,
            )

        # Check read-only
        forbidden = self.contains_forbidden_operations(sql)
        if forbidden:
            violations.extend(
                f"Forbidden operation: {op}" for op in forbidden
            )
            risk_scores.extend(
                RISK_WEIGHTS["forbidden_operation"] for _ in forbidden
            )

        # Check injection patterns
        for pattern in INJECTION_PATTERNS:
            match = pattern.search(sql)
            if match:
                violations.append(
                    f"Injection pattern detected: {match.group()[:50]}"
                )
                risk_scores.append(RISK_WEIGHTS["injection_pattern"])

        # Check for comments containing SQL keywords
        comment_violations = self._check_comments(stmt)
        if comment_violations:
            violations.extend(comment_violations)
            risk_scores.extend(
                RISK_WEIGHTS["comment"] for _ in comment_violations
            )

        # Extract tables
        tables = self.extract_tables(sql)

        # Check for schema probing tables
        schema_tables = {"sqlite_master", "information_schema", "pg_catalog", "pg_tables"}
        probed = [t for t in tables if t.lower() in schema_tables]
        if probed:
            violations.append(f"Schema probing via: {', '.join(probed)}")
            risk_scores.append(RISK_WEIGHTS["schema_probe"])

        # Compute aggregate risk score (max of all, capped at 1.0)
        risk_score = min(max(risk_scores, default=0.0), 1.0)
        is_valid = len(violations) == 0

        return ValidationResult(
            is_valid=is_valid,
            violations=violations,
            sanitized_sql=normalized if is_valid else "",
            risk_score=risk_score,
            tables_accessed=tables,
        )

    def is_read_only(self, sql: str) -> bool:
        """Check if the SQL query is strictly read-only (SELECT only).

        Args:
            sql: The SQL query string to check.

        Returns:
            True if the query only performs read operations.
        """
        return len(self.contains_forbidden_operations(sql)) == 0

    def contains_forbidden_operations(self, sql: str) -> list[str]:
        """Detect forbidden SQL operations in the query.

        Checks both the parsed token types and raw text patterns
        to catch operations even inside comments or strings.

        Args:
            sql: The SQL query string to check.

        Returns:
            List of forbidden operation names found.
        """
        found: list[str] = []

        try:
            parsed_statements = sqlparse.parse(sql)
        except Exception:
            return ["UNPARSEABLE"]

        for stmt in parsed_statements:
            for token in stmt.flatten():
                # Check DML tokens (INSERT, UPDATE, DELETE, SELECT)
                if token.ttype is DML:
                    upper_val = token.value.upper()
                    if upper_val in FORBIDDEN_OPERATIONS:
                        found.append(upper_val)

                # Check DDL tokens (CREATE, ALTER, DROP)
                if token.ttype is DDL:
                    upper_val = token.value.upper()
                    if upper_val in FORBIDDEN_OPERATIONS:
                        found.append(upper_val)

                # Check keywords (TRUNCATE, GRANT, etc.)
                if token.ttype is Keyword or (
                    token.ttype is not None
                    and token.ttype in Keyword
                ):
                    upper_val = token.value.upper()
                    if upper_val in FORBIDDEN_OPERATIONS:
                        found.append(upper_val)

        # Also do a raw text scan for multi-word forbidden ops
        sql_upper = sql.upper()
        for op in ("INTO OUTFILE", "INTO DUMPFILE", "LOAD_FILE", "LOAD DATA"):
            if op in sql_upper:
                if op not in found:
                    found.append(op)

        return list(dict.fromkeys(found))  # Deduplicate preserving order

    def extract_tables(self, sql: str) -> list[str]:
        """Extract table names referenced in the SQL query.

        Handles FROM, JOIN, and subquery table references.

        Args:
            sql: The SQL query string to analyze.

        Returns:
            Deduplicated list of table names found.
        """
        tables: list[str] = []

        try:
            parsed_statements = sqlparse.parse(sql)
        except Exception:
            return []

        for stmt in parsed_statements:
            self._extract_tables_from_tokens(stmt.tokens, tables)

        # Deduplicate preserving order
        seen: set[str] = set()
        unique: list[str] = []
        for t in tables:
            lower = t.lower()
            if lower not in seen:
                seen.add(lower)
                unique.append(t)
        return unique

    def _extract_tables_from_tokens(
        self, tokens: list, tables: list[str]
    ) -> None:
        """Recursively extract table names from token list."""
        from_seen = False

        for token in tokens:
            # Skip comments
            if isinstance(token, Comment):
                continue

            # Recurse into parentheses (subqueries)
            if isinstance(token, Parenthesis):
                self._extract_tables_from_tokens(token.tokens, tables)
                continue

            # Recurse into WHERE clauses (may contain subqueries)
            if isinstance(token, Where):
                self._extract_tables_from_tokens(token.tokens, tables)
                continue

            # Track FROM / JOIN keywords
            if token.ttype is Keyword:
                upper_val = token.value.upper()
                if upper_val in ("FROM", "JOIN", "INNER JOIN", "LEFT JOIN",
                                 "RIGHT JOIN", "FULL JOIN", "CROSS JOIN",
                                 "LEFT OUTER JOIN", "RIGHT OUTER JOIN",
                                 "FULL OUTER JOIN", "NATURAL JOIN"):
                    from_seen = True
                    continue
                # Reset on other keywords like WHERE, GROUP BY, etc.
                if upper_val in ("WHERE", "GROUP", "ORDER", "HAVING",
                                 "LIMIT", "UNION", "EXCEPT", "INTERSECT",
                                 "ON", "SET", "VALUES"):
                    from_seen = False
                    continue

            if token.ttype is DML:
                from_seen = False
                continue

            # Extract table name after FROM/JOIN
            if from_seen:
                if isinstance(token, IdentifierList):
                    for identifier in token.get_identifiers():
                        name = self._get_table_name(identifier)
                        if name:
                            tables.append(name)
                    from_seen = False
                elif isinstance(token, Identifier):
                    name = self._get_table_name(token)
                    if name:
                        tables.append(name)
                    from_seen = False
                elif isinstance(token, Function):
                    # Table-valued function - skip
                    from_seen = False

    def _get_table_name(self, identifier: Identifier) -> str | None:
        """Extract the real table name from an Identifier token."""
        # If identifier contains a subquery, skip it
        if identifier.tokens and any(
            isinstance(t, Parenthesis) for t in identifier.tokens
        ):
            return None

        real_name = identifier.get_real_name()
        if real_name and not real_name.startswith("("):
            return real_name
        return None

    def _check_comments(self, stmt) -> list[str]:
        """Check for SQL keywords hidden inside comments."""
        violations: list[str] = []
        dangerous_in_comments = {
            "DROP", "DELETE", "INSERT", "UPDATE", "ALTER",
            "TRUNCATE", "EXEC", "EXECUTE",
        }

        for token in stmt.flatten():
            if token.ttype in sqlparse.tokens.Comment:
                comment_upper = token.value.upper()
                for keyword in dangerous_in_comments:
                    if keyword in comment_upper:
                        violations.append(
                            f"Dangerous keyword '{keyword}' found in comment"
                        )
        return violations

    def _normalize_sql(self, sql: str) -> str:
        """Normalize SQL whitespace and formatting."""
        # Strip leading/trailing whitespace
        normalized = sql.strip()
        # Collapse multiple whitespace to single space (preserving newlines
        # inside string literals is not critical for validation)
        normalized = re.sub(r"\s+", " ", normalized)
        # Remove trailing semicolons (we only allow single statements)
        normalized = normalized.rstrip(";").strip()
        return normalized
