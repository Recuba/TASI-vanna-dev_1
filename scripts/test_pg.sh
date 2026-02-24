#!/bin/bash
# =============================================================================
# PostgreSQL Test Runner
# =============================================================================
# Starts PostgreSQL via Docker Compose, waits for health, runs all tests
# with the PG backend, and reports results.
#
# Usage:
#   bash scripts/test_pg.sh          # Start PG, run tests, leave PG running
#   bash scripts/test_pg.sh --down   # Run tests then stop PG after
#
# Prerequisites:
#   - Docker and Docker Compose available
#   - Project root as working directory
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

TEARDOWN=false
if [[ "${1:-}" == "--down" ]]; then
    TEARDOWN=true
fi

echo "============================================================"
echo "PostgreSQL Test Runner"
echo "============================================================"
echo "Project: $PROJECT_DIR"
echo "Teardown after tests: $TEARDOWN"
echo ""

# ---- Step 1: Start PostgreSQL ----
echo "Step 1: Starting PostgreSQL via Docker Compose..."
docker compose up -d postgres
echo ""

# ---- Step 2: Wait for PG to be ready ----
echo "Step 2: Waiting for PostgreSQL to be ready..."
MAX_WAIT=30
WAITED=0
until docker compose exec -T postgres pg_isready -U "${POSTGRES_USER:-tasi_user}" -d "${POSTGRES_DB:-tasi_platform}" 2>/dev/null; do
    WAITED=$((WAITED + 1))
    if [ "$WAITED" -ge "$MAX_WAIT" ]; then
        echo "ERROR: PostgreSQL did not become ready within ${MAX_WAIT}s"
        exit 1
    fi
    sleep 1
done
echo "PostgreSQL is ready (waited ${WAITED}s)."
echo ""

# ---- Step 3: Set environment variables ----
echo "Step 3: Setting environment variables..."
export DB_BACKEND=postgres
export POSTGRES_HOST=localhost
export POSTGRES_PORT="${POSTGRES_PORT:-5432}"
export POSTGRES_DB="${POSTGRES_DB:-tasi_platform}"
export POSTGRES_USER="${POSTGRES_USER:-tasi_user}"
export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-changeme}"
# Also set PG_* vars for csv_to_postgres.py compatibility
export PG_HOST="$POSTGRES_HOST"
export PG_PORT="$POSTGRES_PORT"
export PG_DBNAME="$POSTGRES_DB"
export PG_USER="$POSTGRES_USER"
export PG_PASSWORD="$POSTGRES_PASSWORD"

echo "  DB_BACKEND=$DB_BACKEND"
echo "  POSTGRES_HOST=$POSTGRES_HOST"
echo "  POSTGRES_DB=$POSTGRES_DB"
echo "  POSTGRES_USER=$POSTGRES_USER"
echo ""

# ---- Step 4: Initialize schema + load data if needed ----
echo "Step 4: Checking if database needs initialization..."
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
    python database/csv_to_postgres.py \
        --pg-host "$POSTGRES_HOST" \
        --pg-port "$POSTGRES_PORT" \
        --pg-dbname "$POSTGRES_DB" \
        --pg-user "$POSTGRES_USER" \
        --pg-password "$POSTGRES_PASSWORD"
    echo ""
else
    echo "  Database already initialized (companies table exists)."
fi
echo ""

# ---- Step 5: Run tests ----
echo "============================================================"
echo "Step 5: Running test suites"
echo "============================================================"
FAILURES=0

echo ""
echo "--- pytest tests/ ---"
python -m pytest tests/ -v --tb=short 2>&1 || FAILURES=$((FAILURES + 1))

echo ""
echo "--- test_database.py ---"
python test_database.py 2>&1 || FAILURES=$((FAILURES + 1))

echo ""
echo "--- test_app_assembly_v2.py ---"
python test_app_assembly_v2.py 2>&1 || FAILURES=$((FAILURES + 1))

echo ""
echo "============================================================"
echo "TEST RESULTS"
echo "============================================================"
if [ "$FAILURES" -eq 0 ]; then
    echo "All test suites passed."
else
    echo "WARNING: $FAILURES test suite(s) had failures."
fi

# ---- Step 6: Teardown ----
if [ "$TEARDOWN" = true ]; then
    echo ""
    echo "Step 6: Tearing down PostgreSQL..."
    docker compose down postgres
fi

exit $FAILURES
