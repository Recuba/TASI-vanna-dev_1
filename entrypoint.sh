#!/bin/bash
set -e

# Map POSTGRES_* vars to PG_* vars expected by csv_to_postgres.py
export PG_HOST="${POSTGRES_HOST:-localhost}"
export PG_PORT="${POSTGRES_PORT:-5432}"
export PG_DBNAME="${POSTGRES_DB:-raid_ai}"
export PG_USER="${POSTGRES_USER:-raid}"
export PG_PASSWORD="${POSTGRES_PASSWORD:-}"

# Initialize database schema and load data on first run
if [ "$DB_BACKEND" = "postgres" ]; then

    # Wait for PostgreSQL to accept connections (max 60 seconds).
    # Railway can start the app container before the PG service is fully ready.
    echo "Waiting for PostgreSQL at ${PG_HOST}:${PG_PORT}..."
    WAIT_MAX=60
    WAIT_COUNT=0
    until python -c "
import psycopg2, os, sys
try:
    conn = psycopg2.connect(
        host=os.environ['PG_HOST'],
        port=os.environ['PG_PORT'],
        dbname=os.environ['PG_DBNAME'],
        user=os.environ['PG_USER'],
        password=os.environ['PG_PASSWORD'],
        connect_timeout=3,
    )
    conn.close()
    sys.exit(0)
except Exception:
    sys.exit(1)
" 2>/dev/null; do
        WAIT_COUNT=$((WAIT_COUNT + 1))
        if [ "$WAIT_COUNT" -ge "$WAIT_MAX" ]; then
            echo "ERROR: PostgreSQL not ready after ${WAIT_MAX}s — starting app anyway." >&2
            break
        fi
        echo "  PostgreSQL not ready, retrying... (${WAIT_COUNT}/${WAIT_MAX}s)"
        sleep 1
    done

    echo "Checking if database needs initialization..."
    python -c "
import psycopg2, os, sys
try:
    conn = psycopg2.connect(
        host=os.environ['PG_HOST'],
        port=os.environ['PG_PORT'],
        dbname=os.environ['PG_DBNAME'],
        user=os.environ['PG_USER'],
        password=os.environ['PG_PASSWORD'],
        connect_timeout=5,
    )
    cur = conn.cursor()
    cur.execute(\"SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'companies'\")
    exists = cur.fetchone()[0] > 0
    cur.close()
    conn.close()
    print('TABLES_EXIST' if exists else 'NEED_INIT')
except Exception as e:
    print(f'DB_CHECK_ERROR: {e}', file=sys.stderr)
    print('NEED_INIT')
" > /tmp/db_check.txt 2>&1 || echo "NEED_INIT" > /tmp/db_check.txt

    DB_STATUS=$(cat /tmp/db_check.txt)

    if echo "$DB_STATUS" | grep -q "NEED_INIT"; then
        echo "Initializing database schema..."
        if ! PGPASSWORD="$PG_PASSWORD" psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" \
             -d "$PG_DBNAME" -f database/schema.sql 2>&1; then
            echo "ERROR: Schema initialization failed. Check database/schema.sql and DB credentials." >&2
            exit 1
        fi

        echo "Loading data from CSV..."
        if [ ! -f database/csv_to_postgres.py ]; then
            echo "ERROR: CSV loader not found at database/csv_to_postgres.py" >&2
            exit 1
        fi
        if ! python database/csv_to_postgres.py --csv-path saudi_stocks_yahoo_data.csv; then
            echo "ERROR: CSV data loading failed. App cannot start without data." >&2
            exit 1
        fi
        echo "Database initialization complete."
    else
        echo "Database already initialized, skipping."
    fi
fi

# Start the application
exec uvicorn app:app --host 0.0.0.0 --port ${PORT:-8084} --timeout-graceful-shutdown 30
