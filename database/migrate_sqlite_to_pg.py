"""
migrate_sqlite_to_pg.py
=======================
Migrates all data from the SQLite database (saudi_stocks.db) into PostgreSQL.

Reads the 10 existing SQLite tables, maps types (REAL->NUMERIC, INTEGER->BIGINT),
handles NaN->NULL, populates the new 'sectors' and 'entities' tables from the
companies table, and inserts data in batches.

Usage:
    # Dry run (prints SQL, does not write)
    python database/migrate_sqlite_to_pg.py --dry-run

    # Full migration (requires PG connection)
    python database/migrate_sqlite_to_pg.py

    # With custom connection
    python database/migrate_sqlite_to_pg.py --pg-host localhost --pg-port 5432 \\
        --pg-dbname radai --pg-user radai --pg-password secret

    # Custom batch size
    python database/migrate_sqlite_to_pg.py --batch-size 500

Environment variables (override with CLI flags):
    PG_HOST, PG_PORT, PG_DBNAME, PG_USER, PG_PASSWORD
"""

import argparse
import math
import os
import sqlite3
import sys
import time
from pathlib import Path

try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    psycopg2 = None

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
SQLITE_DB_PATH = PROJECT_DIR / "saudi_stocks.db"
SCHEMA_SQL_PATH = SCRIPT_DIR / "schema.sql"

# Tables to migrate in dependency order (companies first for FK references)
TABLES_ORDERED = [
    "companies",
    "market_data",
    "valuation_metrics",
    "profitability_metrics",
    "dividend_data",
    "financial_summary",
    "analyst_data",
    "balance_sheet",
    "income_statement",
    "cash_flow",
]

# Columns that are INTEGER in SQLite and should remain BIGINT in PG
# (volumes, counts - not the SERIAL 'id' columns which are auto-generated)
BIGINT_COLUMNS = {
    "market_data": {"volume", "avg_volume", "avg_volume_10d"},
    "analyst_data": {"analyst_count"},
}

# The 'id' column in financial statement tables is SERIAL in PG
# and must be excluded from INSERT so the sequence auto-generates
SERIAL_ID_TABLES = {"balance_sheet", "income_statement", "cash_flow"}

DEFAULT_BATCH_SIZE = 250


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def get_sqlite_connection(db_path: Path) -> sqlite3.Connection:
    """Open a read-only SQLite connection."""
    if not db_path.exists():
        print(f"ERROR: SQLite database not found at {db_path}")
        sys.exit(1)
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    return conn


def get_sqlite_columns(conn: sqlite3.Connection, table: str) -> list:
    """Return column names for a SQLite table."""
    rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
    return [row["name"] for row in rows]


def clean_value(val):
    """Convert SQLite values for PostgreSQL compatibility.

    - NaN (float) -> None (NULL)
    - Infinity -> None (NULL)
    - Empty strings for numeric context -> None
    """
    if val is None:
        return None
    if isinstance(val, float):
        if math.isnan(val) or math.isinf(val):
            return None
    return val


def build_insert_sql(table: str, columns: list) -> str:
    """Build a parameterized INSERT statement."""
    cols_str = ", ".join(columns)
    placeholders = ", ".join(["%s"] * len(columns))
    return f"INSERT INTO {table} ({cols_str}) VALUES ({placeholders})"


def extract_sectors(sqlite_conn: sqlite3.Connection) -> list:
    """Extract unique sectors from the companies table for the sectors reference table."""
    rows = sqlite_conn.execute(
        "SELECT DISTINCT sector FROM companies WHERE sector IS NOT NULL AND sector != '' ORDER BY sector"
    ).fetchall()
    return [row["sector"] for row in rows]


def extract_entities(sqlite_conn: sqlite3.Connection) -> list:
    """Extract data for the entities table from companies."""
    rows = sqlite_conn.execute(
        "SELECT ticker, short_name, sector FROM companies"
    ).fetchall()
    return [(row["ticker"], row["short_name"], row["sector"]) for row in rows]


# ---------------------------------------------------------------------------
# Migration logic
# ---------------------------------------------------------------------------

def migrate_table(
    sqlite_conn: sqlite3.Connection,
    pg_conn,
    table: str,
    batch_size: int,
    dry_run: bool,
) -> int:
    """Migrate a single table from SQLite to PostgreSQL.

    Returns the number of rows migrated.
    """
    # Get columns from SQLite
    all_columns = get_sqlite_columns(sqlite_conn, table)

    # For SERIAL id tables, skip the 'id' column (PG auto-generates)
    if table in SERIAL_ID_TABLES:
        columns = [c for c in all_columns if c != "id"]
    else:
        columns = all_columns

    # Read all rows from SQLite
    rows = sqlite_conn.execute(f"SELECT * FROM {table}").fetchall()
    total = len(rows)

    if total == 0:
        print(f"  {table}: 0 rows (empty)")
        return 0

    # Build INSERT SQL
    insert_sql = build_insert_sql(table, columns)

    if dry_run:
        print(f"  {table}: {total} rows (dry run)")
        print(f"    SQL: {insert_sql}")
        sample = rows[0]
        sample_vals = tuple(clean_value(sample[c]) for c in columns)
        print(f"    Sample row: {sample_vals[:5]}...")
        return total

    # Batch insert
    pg_cur = pg_conn.cursor()
    inserted = 0

    for batch_start in range(0, total, batch_size):
        batch_end = min(batch_start + batch_size, total)
        batch_rows = rows[batch_start:batch_end]

        values_list = []
        for row in batch_rows:
            vals = tuple(clean_value(row[c]) for c in columns)
            values_list.append(vals)

        psycopg2.extras.execute_batch(pg_cur, insert_sql, values_list)
        inserted += len(values_list)

    pg_conn.commit()
    print(f"  {table}: {inserted} rows migrated")
    return inserted


def populate_sectors(
    sqlite_conn: sqlite3.Connection,
    pg_conn,
    dry_run: bool,
) -> dict:
    """Populate the sectors table from unique sectors in companies.

    Returns a dict mapping sector name -> sector id.
    """
    sectors = extract_sectors(sqlite_conn)
    sector_map = {}

    if dry_run:
        print(f"  sectors: {len(sectors)} unique sectors (dry run)")
        for i, s in enumerate(sectors, 1):
            sector_map[s] = i
            if i <= 3:
                print(f"    {i}: {s}")
        if len(sectors) > 3:
            print(f"    ... and {len(sectors) - 3} more")
        return sector_map

    pg_cur = pg_conn.cursor()
    for sector_name in sectors:
        pg_cur.execute(
            "INSERT INTO sectors (name_en) VALUES (%s) ON CONFLICT (name_en) DO NOTHING RETURNING id",
            (sector_name,),
        )
        result = pg_cur.fetchone()
        if result:
            sector_map[sector_name] = result[0]
        else:
            pg_cur.execute("SELECT id FROM sectors WHERE name_en = %s", (sector_name,))
            sector_map[sector_name] = pg_cur.fetchone()[0]

    pg_conn.commit()
    print(f"  sectors: {len(sectors)} rows populated")
    return sector_map


def populate_entities(
    sqlite_conn: sqlite3.Connection,
    pg_conn,
    sector_map: dict,
    dry_run: bool,
) -> int:
    """Populate the entities table from companies data."""
    entities = extract_entities(sqlite_conn)
    total = len(entities)

    if dry_run:
        print(f"  entities: {total} rows (dry run)")
        return total

    pg_cur = pg_conn.cursor()
    insert_sql = (
        "INSERT INTO entities (ticker, name_en, sector_id) "
        "VALUES (%s, %s, %s) "
        "ON CONFLICT (ticker) DO NOTHING"
    )

    values_list = []
    for ticker, short_name, sector in entities:
        sector_id = sector_map.get(sector)
        values_list.append((ticker, short_name, sector_id))

    psycopg2.extras.execute_batch(pg_cur, insert_sql, values_list)
    pg_conn.commit()
    print(f"  entities: {total} rows populated")
    return total


def apply_schema(pg_conn, dry_run: bool) -> None:
    """Apply the PostgreSQL schema from schema.sql."""
    if not SCHEMA_SQL_PATH.exists():
        print(f"ERROR: Schema file not found at {SCHEMA_SQL_PATH}")
        sys.exit(1)

    schema_sql = SCHEMA_SQL_PATH.read_text(encoding="utf-8")

    if dry_run:
        print(f"  Schema: {len(schema_sql)} characters from {SCHEMA_SQL_PATH.name} (dry run)")
        return

    pg_cur = pg_conn.cursor()
    pg_cur.execute(schema_sql)
    pg_conn.commit()
    print(f"  Schema applied from {SCHEMA_SQL_PATH.name}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def parse_args():
    parser = argparse.ArgumentParser(
        description="Migrate data from SQLite (saudi_stocks.db) to PostgreSQL"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print migration plan without writing to PostgreSQL",
    )
    parser.add_argument(
        "--skip-schema",
        action="store_true",
        help="Skip applying schema.sql (assume tables already exist)",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=DEFAULT_BATCH_SIZE,
        help=f"Number of rows per INSERT batch (default: {DEFAULT_BATCH_SIZE})",
    )
    parser.add_argument(
        "--sqlite-path",
        type=str,
        default=str(SQLITE_DB_PATH),
        help=f"Path to SQLite database (default: {SQLITE_DB_PATH})",
    )
    parser.add_argument("--pg-host", default=os.environ.get("PG_HOST", "localhost"))
    parser.add_argument("--pg-port", type=int, default=int(os.environ.get("PG_PORT", "5432")))
    parser.add_argument("--pg-dbname", default=os.environ.get("PG_DBNAME", "radai"))
    parser.add_argument("--pg-user", default=os.environ.get("PG_USER", "radai"))
    parser.add_argument("--pg-password", default=os.environ.get("PG_PASSWORD", ""))
    return parser.parse_args()


def main():
    args = parse_args()
    t_start = time.time()

    print("=" * 60)
    print("SQLite -> PostgreSQL Migration")
    print("=" * 60)
    if args.dry_run:
        print("MODE: DRY RUN (no changes will be made)")
    print(f"SQLite source: {args.sqlite_path}")
    print(f"PostgreSQL target: {args.pg_user}@{args.pg_host}:{args.pg_port}/{args.pg_dbname}")
    print(f"Batch size: {args.batch_size}")
    print()

    # Open SQLite
    sqlite_conn = get_sqlite_connection(Path(args.sqlite_path))

    # Open PostgreSQL (or skip if dry run)
    pg_conn = None
    if not args.dry_run:
        if psycopg2 is None:
            print("ERROR: psycopg2 is not installed. Install with: pip install psycopg2-binary")
            sys.exit(1)
        try:
            pg_conn = psycopg2.connect(
                host=args.pg_host,
                port=args.pg_port,
                dbname=args.pg_dbname,
                user=args.pg_user,
                password=args.pg_password,
            )
            pg_conn.autocommit = False
        except psycopg2.OperationalError as e:
            print(f"ERROR: Cannot connect to PostgreSQL: {e}")
            sys.exit(1)

    try:
        # Step 1: Apply schema
        if not args.skip_schema:
            print("Step 1: Applying schema...")
            apply_schema(pg_conn, args.dry_run)
        else:
            print("Step 1: Schema application skipped (--skip-schema)")
        print()

        # Step 2: Migrate existing 10 tables
        print("Step 2: Migrating existing tables...")
        total_rows = 0
        table_counts = {}
        for table in TABLES_ORDERED:
            count = migrate_table(sqlite_conn, pg_conn, table, args.batch_size, args.dry_run)
            table_counts[table] = count
            total_rows += count
        print()

        # Step 3: Populate sectors reference table
        print("Step 3: Populating new reference tables...")
        sector_map = populate_sectors(sqlite_conn, pg_conn, args.dry_run)

        # Step 4: Populate entities from companies
        entities_count = populate_entities(sqlite_conn, pg_conn, sector_map, args.dry_run)
        print()

        # Summary
        elapsed = time.time() - t_start
        print("=" * 60)
        print("MIGRATION SUMMARY")
        print("=" * 60)
        print(f"{'Table':<30} {'Rows':>10}")
        print("-" * 42)
        for table in TABLES_ORDERED:
            print(f"  {table:<28} {table_counts[table]:>10,}")
        print(f"  {'sectors':<28} {len(sector_map):>10,}")
        print(f"  {'entities':<28} {entities_count:>10,}")
        print("-" * 42)
        grand_total = total_rows + len(sector_map) + entities_count
        print(f"  {'TOTAL':<28} {grand_total:>10,}")
        print(f"\nDuration: {elapsed:.1f}s")
        if args.dry_run:
            print("\nDRY RUN complete. No data was written.")
        else:
            print("\nMigration complete.")

    finally:
        sqlite_conn.close()
        if pg_conn is not None:
            pg_conn.close()


if __name__ == "__main__":
    main()
