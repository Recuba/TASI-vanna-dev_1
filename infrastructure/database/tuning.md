# PostgreSQL Tuning Runbook

Tuning guide for the Ra'd AI TASI Platform PostgreSQL database, with specific recommendations for Railway deployment.

## Resource Allocation

### Shared Buffers

The most impactful single parameter. Sets the size of PostgreSQL's shared memory cache.

**Rule of thumb:** 25% of total system RAM, capped at ~8GB.

| Environment | RAM | shared_buffers |
|---|---|---|
| Railway (512MB) | 512MB | 128MB |
| Railway (1GB) | 1GB | 256MB |
| Docker (2GB) | 2GB | 512MB |
| Dedicated (8GB+) | 8GB | 2GB |

```sql
ALTER SYSTEM SET shared_buffers = '256MB';  -- Adjust for your tier
```

### Effective Cache Size

Tells the query planner how much OS page cache to expect. Does not allocate memory -- only affects planning decisions.

**Rule of thumb:** 75% of total system RAM.

```sql
ALTER SYSTEM SET effective_cache_size = '768MB';  -- For 1GB Railway tier
```

### Work Memory

Per-operation memory for sorts, hash joins, etc. Multiplied by the number of concurrent operations, so keep it conservative.

**Rule of thumb:** Total RAM / (max_connections * 4).

```sql
-- For 1GB RAM, 100 max_connections: 1024MB / (100 * 4) = ~2.5MB
ALTER SYSTEM SET work_mem = '4MB';
```

For complex analytical queries (common in TASI analysis), temporarily increase per-session:

```sql
SET work_mem = '64MB';  -- For a heavy analytical query
```

### Maintenance Work Memory

Memory for VACUUM, CREATE INDEX, ALTER TABLE ADD FOREIGN KEY.

**Rule of thumb:** 5-10% of RAM, up to 1GB.

```sql
ALTER SYSTEM SET maintenance_work_mem = '128MB';  -- For 1GB Railway tier
```

## Connection Management

### Max Connections

Railway PostgreSQL defaults vary by plan. The application uses connection pooling (via psycopg2), so the database doesn't need many direct connections.

```sql
ALTER SYSTEM SET max_connections = '100';  -- Sufficient for most workloads
```

For higher concurrency, use PgBouncer rather than increasing max_connections:

```
# PgBouncer config (transaction pooling)
pool_mode = transaction
max_client_conn = 500
default_pool_size = 25
```

### Idle Connection Timeout

Kill idle connections that forgot to disconnect:

```sql
ALTER SYSTEM SET idle_in_transaction_session_timeout = '300000';  -- 5 minutes (ms)
ALTER SYSTEM SET idle_session_timeout = '1800000';  -- 30 minutes (ms), PG 16+
```

### Statement Timeout

Prevent runaway queries from consuming resources indefinitely:

```sql
ALTER SYSTEM SET statement_timeout = '30000';  -- 30 seconds (ms)
```

Override per-session for long-running analytics:

```sql
SET statement_timeout = '300000';  -- 5 minutes for this session
```

## Autovacuum Tuning

### Default Settings

PostgreSQL autovacuum defaults are reasonable for most tables. The TASI platform has ~500 rows in core tables, but audit and security tables grow unboundedly.

```sql
-- Global defaults (already sensible)
ALTER SYSTEM SET autovacuum_vacuum_threshold = '50';
ALTER SYSTEM SET autovacuum_vacuum_scale_factor = '0.1';  -- VACUUM when 10% of rows are dead
ALTER SYSTEM SET autovacuum_analyze_threshold = '50';
ALTER SYSTEM SET autovacuum_analyze_scale_factor = '0.05';  -- ANALYZE when 5% of rows change
```

### Audit Table Tuning

`query_audit_log` and `security_events` are append-heavy tables that grow continuously. They need more aggressive autovacuum to prevent bloat.

```sql
-- query_audit_log: more aggressive vacuum (5% dead threshold instead of 10%)
ALTER TABLE query_audit_log SET (
    autovacuum_vacuum_scale_factor = 0.05,
    autovacuum_vacuum_threshold = 100,
    autovacuum_analyze_scale_factor = 0.02,
    autovacuum_analyze_threshold = 100,
    autovacuum_vacuum_cost_delay = 10  -- Run vacuum faster (ms delay between pages)
);

-- security_events: same aggressive settings
ALTER TABLE security_events SET (
    autovacuum_vacuum_scale_factor = 0.05,
    autovacuum_vacuum_threshold = 100,
    autovacuum_analyze_scale_factor = 0.02,
    autovacuum_analyze_threshold = 100,
    autovacuum_vacuum_cost_delay = 10
);

-- news_articles: moderate growth, slightly more aggressive than default
ALTER TABLE news_articles SET (
    autovacuum_vacuum_scale_factor = 0.08,
    autovacuum_analyze_scale_factor = 0.04
);

-- price_history: large table with daily inserts
ALTER TABLE price_history SET (
    autovacuum_vacuum_scale_factor = 0.05,
    autovacuum_vacuum_threshold = 200,
    autovacuum_analyze_scale_factor = 0.02
);
```

### Autovacuum Workers

For databases with many tables that need vacuuming concurrently:

```sql
ALTER SYSTEM SET autovacuum_max_workers = '4';  -- Default is 3
ALTER SYSTEM SET autovacuum_naptime = '30';      -- Check every 30 seconds (default: 60)
```

## Query Planner

### Cost Parameters

These affect how the planner estimates query costs. Adjust based on storage type:

```sql
-- SSD storage (Railway, most cloud providers)
ALTER SYSTEM SET random_page_cost = '1.1';    -- Default 4.0 (for spinning disks)
ALTER SYSTEM SET seq_page_cost = '1.0';        -- Keep at 1.0
ALTER SYSTEM SET effective_io_concurrency = '200';  -- SSD can handle parallel I/O
```

### JIT Compilation

JIT compilation helps complex analytical queries but adds overhead for simple OLTP. For a mixed workload like TASI:

```sql
ALTER SYSTEM SET jit = 'on';
ALTER SYSTEM SET jit_above_cost = '100000';       -- Only for expensive queries
ALTER SYSTEM SET jit_inline_above_cost = '500000';
ALTER SYSTEM SET jit_optimize_above_cost = '500000';
```

## Logging

### Slow Query Log

Log queries slower than a threshold for performance analysis:

```sql
ALTER SYSTEM SET log_min_duration_statement = '1000';  -- Log queries > 1 second
ALTER SYSTEM SET log_statement = 'none';                -- Don't log all statements
ALTER SYSTEM SET log_lock_waits = 'on';                 -- Log lock waits > deadlock_timeout
ALTER SYSTEM SET deadlock_timeout = '1000';              -- 1 second
```

### Log Format

```sql
ALTER SYSTEM SET log_line_prefix = '%t [%p] %q%u@%d ';  -- timestamp, pid, user@db
ALTER SYSTEM SET log_checkpoints = 'on';
ALTER SYSTEM SET log_connections = 'on';
ALTER SYSTEM SET log_disconnections = 'on';
ALTER SYSTEM SET log_temp_files = '0';  -- Log all temp file usage
```

## Railway-Specific Recommendations

### Tier-Based Configuration

Railway allocates resources based on plan tier. Apply these settings via `railway run psql`:

**Starter (512MB RAM, shared CPU):**
```sql
ALTER SYSTEM SET shared_buffers = '128MB';
ALTER SYSTEM SET effective_cache_size = '384MB';
ALTER SYSTEM SET work_mem = '2MB';
ALTER SYSTEM SET maintenance_work_mem = '64MB';
ALTER SYSTEM SET max_connections = '50';
ALTER SYSTEM SET random_page_cost = '1.1';
ALTER SYSTEM SET effective_io_concurrency = '200';
```

**Pro (1GB RAM, dedicated CPU):**
```sql
ALTER SYSTEM SET shared_buffers = '256MB';
ALTER SYSTEM SET effective_cache_size = '768MB';
ALTER SYSTEM SET work_mem = '4MB';
ALTER SYSTEM SET maintenance_work_mem = '128MB';
ALTER SYSTEM SET max_connections = '100';
ALTER SYSTEM SET random_page_cost = '1.1';
ALTER SYSTEM SET effective_io_concurrency = '200';
```

**Team (2GB+ RAM):**
```sql
ALTER SYSTEM SET shared_buffers = '512MB';
ALTER SYSTEM SET effective_cache_size = '1536MB';
ALTER SYSTEM SET work_mem = '8MB';
ALTER SYSTEM SET maintenance_work_mem = '256MB';
ALTER SYSTEM SET max_connections = '150';
ALTER SYSTEM SET random_page_cost = '1.1';
ALTER SYSTEM SET effective_io_concurrency = '200';
```

### Applying Changes on Railway

```bash
# Connect to Railway PostgreSQL
railway run psql

# Apply settings (most take effect immediately)
ALTER SYSTEM SET shared_buffers = '256MB';
-- ... more settings ...

# For settings requiring restart:
SELECT pg_reload_conf();

# Verify
SELECT name, setting, unit, pending_restart
FROM pg_settings
WHERE name IN ('shared_buffers', 'effective_cache_size', 'work_mem')
ORDER BY name;
```

Note: `shared_buffers` and `max_connections` require a PostgreSQL restart. On Railway, this happens when the service redeploys or restarts.

### Monitoring on Railway

Railway does not expose `pg_stat_*` views through its dashboard. Use the health check queries in `health_checks.sql` via `railway run psql`:

```bash
railway run psql -f infrastructure/database/health_checks.sql
```

## Applying All Changes

After modifying settings with `ALTER SYSTEM`:

```sql
-- Reload configuration (applies most settings immediately)
SELECT pg_reload_conf();

-- Check which settings need a restart
SELECT name, setting, pending_restart
FROM pg_settings
WHERE pending_restart = true;
```

Settings requiring a restart: `shared_buffers`, `max_connections`, `wal_level`, `archive_mode`, `max_worker_processes`.

## Verification Checklist

After tuning, verify these health indicators:

| Metric | Target | Query |
|---|---|---|
| Cache hit ratio | > 99% | `SELECT ... FROM pg_stat_database` (see health_checks.sql #6) |
| Connection utilization | < 80% | `SELECT numbackends / max_connections` (see health_checks.sql #1) |
| Dead tuple ratio | < 10% per table | `SELECT n_dead_tup / n_live_tup` (see health_checks.sql #2) |
| Index usage ratio | > 90% for large tables | `SELECT idx_scan / (seq_scan + idx_scan)` (see health_checks.sql #3) |
| Long-running queries | 0 queries > 60s | (see health_checks.sql #4) |
| Lock contention | 0 blocked queries | (see health_checks.sql #5) |
| WAL archiver failures | 0 | `SELECT failed_count FROM pg_stat_archiver` |
