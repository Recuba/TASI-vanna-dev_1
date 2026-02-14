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
    echo "Checking if database needs initialization..."
    python -c "
import psycopg2, os, sys
conn = psycopg2.connect(
    host=os.environ['PG_HOST'],
    port=os.environ['PG_PORT'],
    dbname=os.environ['PG_DBNAME'],
    user=os.environ['PG_USER'],
    password=os.environ['PG_PASSWORD']
)
cur = conn.cursor()
cur.execute(\"SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'companies'\")
exists = cur.fetchone()[0] > 0
cur.close()
conn.close()
if exists:
    print('TABLES_EXIST')
else:
    print('NEED_INIT')
" > /tmp/db_check.txt 2>&1 || echo "NEED_INIT" > /tmp/db_check.txt

    DB_STATUS=$(cat /tmp/db_check.txt)

    if echo "$DB_STATUS" | grep -q "NEED_INIT"; then
        echo "Initializing database schema..."
        PGPASSWORD="$PG_PASSWORD" psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$PG_DBNAME" -f database/schema.sql 2>&1 || echo "Schema init via psql failed, trying Python..."

        echo "Loading data from CSV..."
        python database/csv_to_postgres.py --csv-path saudi_stocks_yahoo_data.csv 2>&1 || echo "WARNING: Data loading failed, app will start with empty database"
        echo "Database initialization complete."
    else
        echo "Database already initialized, skipping."
    fi
fi

# Start the application
exec uvicorn app:app --host 0.0.0.0 --port ${PORT:-8084} --timeout-graceful-shutdown 30
