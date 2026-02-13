#!/bin/bash
# =============================================================================
# PostgreSQL Integration Test Runner
# =============================================================================
# Starts PostgreSQL via Docker Compose, sets environment variables, initializes
# the schema if needed, and runs ALL test suites with PG backend enabled.
#
# Usage:
#   bash scripts/run_pg_tests.sh              # Start PG, run tests, leave PG up
#   bash scripts/run_pg_tests.sh --down       # Tear down PG containers after tests
#   bash scripts/run_pg_tests.sh --pg-only    # Run only PG-specific tests (skip SQLite)
#   bash scripts/run_pg_tests.sh --down --pg-only
#
# Prerequisites:
#   - Docker and Docker Compose installed
#   - Python venv with psycopg2, pytest installed
#   - Run from project root (or script resolves it automatically)
#
# Environment variables (all have defaults):
#   POSTGRES_DB       (default: tasi_platform)
#   POSTGRES_USER     (default: tasi_user)
#   POSTGRES_PASSWORD (default: changeme)
#   POSTGRES_PORT     (default: 5432)
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

# Parse arguments
TEARDOWN=false
PG_ONLY=false
for arg in "$@"; do
    case "$arg" in
        --down)    TEARDOWN=true ;;
        --pg-only) PG_ONLY=true ;;
        *)         echo "Unknown argument: $arg"; exit 1 ;;
    esac
done

echo "============================================================"
echo " Ra'd AI - PostgreSQL Integration Test Runner"
echo "============================================================"
echo " Project:   $PROJECT_DIR"
echo " Teardown:  $TEARDOWN"
echo " PG-only:   $PG_ONLY"
echo "============================================================"
echo ""

# ---- Step 1: Start PostgreSQL via Docker Compose ----
echo "[1/6] Starting PostgreSQL via Docker Compose..."
export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-changeme}"
docker compose up -d postgres
echo ""

# ---- Step 2: Wait for PostgreSQL readiness ----
echo "[2/6] Waiting for PostgreSQL to become ready..."
MAX_WAIT=30
WAITED=0
PG_USER="${POSTGRES_USER:-tasi_user}"
PG_DB="${POSTGRES_DB:-tasi_platform}"
until docker compose exec -T postgres pg_isready -U "$PG_USER" -d "$PG_DB" 2>/dev/null; do
    WAITED=$((WAITED + 1))
    if [ "$WAITED" -ge "$MAX_WAIT" ]; then
        echo "ERROR: PostgreSQL did not become ready within ${MAX_WAIT}s"
        echo "Check: docker compose logs postgres"
        exit 1
    fi
    sleep 1
done
echo "PostgreSQL ready (waited ${WAITED}s)."
echo ""

# ---- Step 3: Set environment variables for test processes ----
echo "[3/6] Setting environment variables..."
export DB_BACKEND=postgres
export POSTGRES_HOST=localhost
export POSTGRES_PORT="${POSTGRES_PORT:-5432}"
export POSTGRES_DB="${POSTGRES_DB:-tasi_platform}"
export POSTGRES_USER="${POSTGRES_USER:-tasi_user}"
# PG_* aliases for csv_to_postgres.py compatibility
export PG_HOST="$POSTGRES_HOST"
export PG_PORT="$POSTGRES_PORT"
export PG_DBNAME="$POSTGRES_DB"
export PG_USER="$POSTGRES_USER"
export PG_PASSWORD="$POSTGRES_PASSWORD"

echo "  DB_BACKEND=$DB_BACKEND"
echo "  POSTGRES_HOST=$POSTGRES_HOST"
echo "  POSTGRES_PORT=$POSTGRES_PORT"
echo "  POSTGRES_DB=$POSTGRES_DB"
echo "  POSTGRES_USER=$POSTGRES_USER"
echo ""

# ---- Step 4: Initialize schema + load data if needed ----
echo "[4/6] Checking database initialization..."
TABLES_EXIST=$(python -c "
import psycopg2, os
conn = psycopg2.connect(
    host=os.environ['POSTGRES_HOST'],
    port=os.environ['POSTGRES_PORT'],
    dbname=os.environ['POSTGRES_DB'],
    user=os.environ['POSTGRES_USER'],
    password=os.environ['POSTGRES_PASSWORD']
)
cur = conn.cursor()
cur.execute(\"SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'companies'\")
print(cur.fetchone()[0])
cur.close()
conn.close()
" 2>/dev/null || echo "0")

if [ "$TABLES_EXIST" = "0" ]; then
    echo "  Database needs initialization. Loading schema + data..."
    if [ -f "database/csv_to_postgres.py" ]; then
        python database/csv_to_postgres.py \
            --pg-host "$POSTGRES_HOST" \
            --pg-port "$POSTGRES_PORT" \
            --pg-dbname "$POSTGRES_DB" \
            --pg-user "$POSTGRES_USER" \
            --pg-password "$POSTGRES_PASSWORD"
    else
        echo "  WARNING: database/csv_to_postgres.py not found. Schema may be incomplete."
        # Attempt to load schema.sql directly
        if [ -f "database/schema.sql" ]; then
            echo "  Loading schema.sql via psql..."
            docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < database/schema.sql
        fi
    fi
else
    echo "  Database already initialized (companies table exists)."
fi
echo ""

# ---- Step 5: Run test suites ----
echo "============================================================"
echo "[5/6] Running test suites"
echo "============================================================"
FAILURES=0
TOTAL_PASS=0
TOTAL_FAIL=0

# 5a: pytest tests/ (includes PG fixtures from conftest.py)
echo ""
echo "--- pytest tests/ ---"
if [ "$PG_ONLY" = true ]; then
    # Run only tests that use PG markers/fixtures
    python -m pytest tests/ -v --tb=short -k "PG or pg_" 2>&1 || FAILURES=$((FAILURES + 1))
else
    python -m pytest tests/ -v --tb=short 2>&1 || FAILURES=$((FAILURES + 1))
fi

# 5b: test_database.py (includes TestDatabaseIntegrityPG)
echo ""
echo "--- test_database.py ---"
if [ "$PG_ONLY" = true ]; then
    python -m pytest test_database.py -v --tb=short -k "PG" 2>&1 || FAILURES=$((FAILURES + 1))
else
    python test_database.py 2>&1 || FAILURES=$((FAILURES + 1))
fi

# 5c: test_app_assembly_v2.py (includes PG assembly tests)
echo ""
echo "--- test_app_assembly_v2.py ---"
python test_app_assembly_v2.py 2>&1 || FAILURES=$((FAILURES + 1))

# ---- Step 6: Report results & optional teardown ----
echo ""
echo "============================================================"
echo "[6/6] RESULTS"
echo "============================================================"
if [ "$FAILURES" -eq 0 ]; then
    echo "All test suites passed with PostgreSQL backend."
else
    echo "WARNING: $FAILURES test suite(s) had failures."
fi

if [ "$TEARDOWN" = true ]; then
    echo ""
    echo "Tearing down PostgreSQL container..."
    docker compose down
    echo "Done."
fi

exit $FAILURES
