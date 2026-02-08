"""
Generate SYSTEM_PROMPT from live database schema.

Connects to SQLite or PostgreSQL (auto-detected from DB_BACKEND env var),
reads table and column metadata, and prints a formatted system prompt string
matching the format used in app.py.

Usage:
    python scripts/generate_system_prompt.py              # print to stdout
    python scripts/generate_system_prompt.py > prompt.txt # save to file
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

# Allow running from repo root or scripts/
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv

load_dotenv()

DB_BACKEND = os.environ.get("DB_BACKEND", "sqlite").lower()

# Financial statement tables have multiple rows per company
_MULTI_ROW_TABLES = {"balance_sheet", "income_statement", "cash_flow"}


def _get_sqlite_schema() -> dict[str, list[tuple[str, str]]]:
    """Return {table_name: [(col_name, col_type), ...]} from SQLite."""
    import sqlite3

    db_path = Path(__file__).resolve().parent.parent / os.environ.get(
        "DB_SQLITE_PATH", "saudi_stocks.db"
    )
    conn = sqlite3.connect(str(db_path))
    try:
        cur = conn.cursor()
        cur.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        tables = [row[0] for row in cur.fetchall()]

        schema: dict[str, list[tuple[str, str]]] = {}
        for table in tables:
            cur.execute(f"PRAGMA table_info({table})")
            columns = [(row[1], row[2]) for row in cur.fetchall()]
            schema[table] = columns
        return schema
    finally:
        conn.close()


def _get_postgres_schema() -> dict[str, list[tuple[str, str]]]:
    """Return {table_name: [(col_name, col_type), ...]} from PostgreSQL."""
    import psycopg2

    conn = psycopg2.connect(
        host=os.environ.get("POSTGRES_HOST", "localhost"),
        port=int(os.environ.get("POSTGRES_PORT", "5432")),
        dbname=os.environ.get("POSTGRES_DB", "tasi_platform"),
        user=os.environ.get("POSTGRES_USER", "tasi_user"),
        password=os.environ.get("POSTGRES_PASSWORD", ""),
    )
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT table_name FROM information_schema.tables "
            "WHERE table_schema = 'public' ORDER BY table_name"
        )
        tables = [row[0] for row in cur.fetchall()]

        schema: dict[str, list[tuple[str, str]]] = {}
        for table in tables:
            cur.execute(
                "SELECT column_name, data_type "
                "FROM information_schema.columns "
                "WHERE table_schema = 'public' AND table_name = %s "
                "ORDER BY ordinal_position",
                (table,),
            )
            schema[table] = cur.fetchall()
        return schema
    finally:
        conn.close()


def _format_prompt(schema: dict[str, list[tuple[str, str]]]) -> str:
    """Format the schema dict into the system prompt string."""
    lines = [
        "You are a Saudi Stock Market financial analyst AI assistant. You help users",
        "query and analyze Saudi Arabian stock market data (TASI - Tadawul All Share Index).",
        "",
        "DATABASE SCHEMA",
        "===============",
        "The database contains comprehensive financial data for ~500 Saudi-listed companies.",
        "",
    ]

    for table, columns in sorted(schema.items()):
        if table in _MULTI_ROW_TABLES:
            lines.append(
                f"TABLE: {table} (NORMALIZED - multiple rows per company, one per reporting period)"
            )
        else:
            lines.append(f"TABLE: {table}")

        for col_name, col_type in columns:
            lines.append(f"- {col_name} ({col_type})")
        lines.append("")

    lines.extend([
        "QUERY TIPS",
        "==========",
        "- Join companies with other tables using ticker.",
        "- For financial statements, filter by period_type ('annual', 'quarterly', 'ttm')",
        "  and use period_index=0 for the latest period.",
        "- Market cap is in SAR (Saudi Riyal).",
        "- Use sector/industry from the companies table for sector analysis.",
        "- Common joins: companies JOIN market_data, companies JOIN balance_sheet, etc.",
        "",
        "VISUALIZATION",
        "=============",
        "After running a SQL query, you can visualize the results using the visualize_data tool.",
        "- The run_sql tool saves results to a CSV file (shown in the response as the filename).",
        "- Pass that filename to visualize_data to create an interactive Plotly chart.",
        "- Chart type is auto-selected based on data shape: bar, scatter, line, heatmap, histogram.",
        "- Always visualize results when the user asks for charts, graphs, comparisons, or trends.",
    ])

    return "\n".join(lines)


def main() -> None:
    if DB_BACKEND == "postgres":
        schema = _get_postgres_schema()
    else:
        schema = _get_sqlite_schema()

    prompt = _format_prompt(schema)
    print(prompt)


if __name__ == "__main__":
    main()
