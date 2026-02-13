-- =============================================================================
-- Ra'd AI - PostgreSQL Health Check Queries
-- =============================================================================
-- Standalone diagnostic queries for monitoring database health. Run these
-- manually via psql or integrate them into monitoring dashboards (Grafana,
-- Datadog, etc.).
--
-- Usage:
--   psql -U tasi_user -d tasi_platform -f health_checks.sql
--   psql -U tasi_user -d tasi_platform -c "< paste individual query >"
-- =============================================================================


-- ===========================================================================
-- 1. Active Connections
-- ===========================================================================
-- Shows all active connections grouped by state and application.
-- Alert if total connections exceed 80% of max_connections.
-- ---------------------------------------------------------------------------
SELECT
    '=== ACTIVE CONNECTIONS ===' AS section;

SELECT
    state,
    usename AS user,
    application_name AS app,
    client_addr AS ip,
    COUNT(*) AS count
FROM pg_stat_activity
WHERE pid <> pg_backend_pid()
GROUP BY state, usename, application_name, client_addr
ORDER BY count DESC;

-- Connection utilization percentage
SELECT
    numbackends AS active_connections,
    current_setting('max_connections')::int AS max_connections,
    ROUND(numbackends::numeric / current_setting('max_connections')::int * 100, 1) AS utilization_pct
FROM pg_stat_database
WHERE datname = current_database();


-- ===========================================================================
-- 2. Table Bloat Estimate
-- ===========================================================================
-- Estimates dead tuple bloat per table. Tables with >20% dead tuples
-- may benefit from VACUUM FULL or targeted autovacuum tuning.
-- ---------------------------------------------------------------------------
SELECT
    '=== TABLE BLOAT ===' AS section;

SELECT
    schemaname || '.' || relname AS table_name,
    n_live_tup AS live_rows,
    n_dead_tup AS dead_rows,
    CASE
        WHEN n_live_tup + n_dead_tup = 0 THEN 0
        ELSE ROUND(n_dead_tup::numeric / (n_live_tup + n_dead_tup) * 100, 1)
    END AS dead_pct,
    last_vacuum,
    last_autovacuum,
    last_analyze,
    last_autoanalyze
FROM pg_stat_user_tables
WHERE n_dead_tup > 0
ORDER BY n_dead_tup DESC
LIMIT 20;


-- ===========================================================================
-- 3. Index Usage Statistics
-- ===========================================================================
-- Shows index usage ratios. Indexes with idx_scan = 0 may be unused and
-- candidates for removal (saves write overhead and disk space).
-- ---------------------------------------------------------------------------
SELECT
    '=== INDEX USAGE ===' AS section;

-- Table-level: sequential scans vs index scans
SELECT
    schemaname || '.' || relname AS table_name,
    seq_scan,
    idx_scan,
    CASE
        WHEN seq_scan + idx_scan = 0 THEN 0
        ELSE ROUND(idx_scan::numeric / (seq_scan + idx_scan) * 100, 1)
    END AS idx_usage_pct,
    n_live_tup AS rows
FROM pg_stat_user_tables
WHERE n_live_tup > 100
ORDER BY idx_usage_pct ASC
LIMIT 20;

-- Individual index usage (find unused indexes)
SELECT
    schemaname || '.' || indexrelname AS index_name,
    schemaname || '.' || relname AS table_name,
    idx_scan AS scans,
    idx_tup_read AS rows_read,
    idx_tup_fetch AS rows_fetched,
    pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
WHERE idx_scan = 0
    AND schemaname = 'public'
ORDER BY pg_relation_size(indexrelid) DESC
LIMIT 20;


-- ===========================================================================
-- 4. Long-Running Queries
-- ===========================================================================
-- Shows queries running longer than 30 seconds. These may be holding locks,
-- consuming resources, or indicating missing indexes.
-- ---------------------------------------------------------------------------
SELECT
    '=== LONG-RUNNING QUERIES ===' AS section;

SELECT
    pid,
    usename AS user,
    state,
    EXTRACT(EPOCH FROM (NOW() - query_start))::int AS runtime_seconds,
    wait_event_type,
    wait_event,
    LEFT(query, 200) AS query_preview
FROM pg_stat_activity
WHERE state = 'active'
    AND pid <> pg_backend_pid()
    AND query_start < NOW() - INTERVAL '30 seconds'
ORDER BY runtime_seconds DESC;


-- ===========================================================================
-- 5. Lock Contention
-- ===========================================================================
-- Shows blocked queries and what is blocking them. Lock contention causes
-- query timeouts and application errors.
-- ---------------------------------------------------------------------------
SELECT
    '=== LOCK CONTENTION ===' AS section;

SELECT
    blocked.pid AS blocked_pid,
    blocked.usename AS blocked_user,
    LEFT(blocked.query, 150) AS blocked_query,
    EXTRACT(EPOCH FROM (NOW() - blocked.query_start))::int AS waiting_seconds,
    blocking.pid AS blocking_pid,
    blocking.usename AS blocking_user,
    LEFT(blocking.query, 150) AS blocking_query
FROM pg_stat_activity AS blocked
JOIN pg_locks AS blocked_locks
    ON blocked.pid = blocked_locks.pid
    AND NOT blocked_locks.granted
JOIN pg_locks AS blocking_locks
    ON blocked_locks.locktype = blocking_locks.locktype
    AND blocked_locks.database IS NOT DISTINCT FROM blocking_locks.database
    AND blocked_locks.relation IS NOT DISTINCT FROM blocking_locks.relation
    AND blocked_locks.page IS NOT DISTINCT FROM blocking_locks.page
    AND blocked_locks.tuple IS NOT DISTINCT FROM blocking_locks.tuple
    AND blocked_locks.virtualxid IS NOT DISTINCT FROM blocking_locks.virtualxid
    AND blocked_locks.transactionid IS NOT DISTINCT FROM blocking_locks.transactionid
    AND blocked_locks.classid IS NOT DISTINCT FROM blocking_locks.classid
    AND blocked_locks.objid IS NOT DISTINCT FROM blocking_locks.objid
    AND blocked_locks.objsubid IS NOT DISTINCT FROM blocking_locks.objsubid
    AND blocking_locks.granted
JOIN pg_stat_activity AS blocking
    ON blocking.pid = blocking_locks.pid
WHERE blocked.pid <> blocking.pid
ORDER BY waiting_seconds DESC;


-- ===========================================================================
-- 6. Cache Hit Ratio
-- ===========================================================================
-- Shows the buffer cache hit ratio. Values below 99% for an OLTP workload
-- indicate that shared_buffers may be too small or working set exceeds memory.
-- ---------------------------------------------------------------------------
SELECT
    '=== CACHE HIT RATIO ===' AS section;

-- Database-level cache hit ratio
SELECT
    datname AS database,
    blks_hit,
    blks_read,
    CASE
        WHEN blks_hit + blks_read = 0 THEN 100
        ELSE ROUND(blks_hit::numeric / (blks_hit + blks_read) * 100, 2)
    END AS cache_hit_pct
FROM pg_stat_database
WHERE datname = current_database();

-- Table-level cache hit ratio (top 20 most-accessed tables)
SELECT
    schemaname || '.' || relname AS table_name,
    heap_blks_hit,
    heap_blks_read,
    CASE
        WHEN heap_blks_hit + heap_blks_read = 0 THEN 100
        ELSE ROUND(heap_blks_hit::numeric / (heap_blks_hit + heap_blks_read) * 100, 2)
    END AS cache_hit_pct
FROM pg_statio_user_tables
WHERE heap_blks_hit + heap_blks_read > 0
ORDER BY heap_blks_hit + heap_blks_read DESC
LIMIT 20;

-- Index cache hit ratio
SELECT
    schemaname || '.' || indexrelname AS index_name,
    idx_blks_hit,
    idx_blks_read,
    CASE
        WHEN idx_blks_hit + idx_blks_read = 0 THEN 100
        ELSE ROUND(idx_blks_hit::numeric / (idx_blks_hit + idx_blks_read) * 100, 2)
    END AS cache_hit_pct
FROM pg_statio_user_indexes
WHERE idx_blks_hit + idx_blks_read > 0
ORDER BY idx_blks_hit + idx_blks_read DESC
LIMIT 20;


-- ===========================================================================
-- 7. Table Sizes
-- ===========================================================================
-- Shows total table size (data + indexes + TOAST) for all user tables.
-- ---------------------------------------------------------------------------
SELECT
    '=== TABLE SIZES ===' AS section;

SELECT
    schemaname || '.' || tablename AS table_name,
    pg_size_pretty(pg_total_relation_size(schemaname || '.' || tablename)) AS total_size,
    pg_size_pretty(pg_relation_size(schemaname || '.' || tablename)) AS data_size,
    pg_size_pretty(
        pg_total_relation_size(schemaname || '.' || tablename) -
        pg_relation_size(schemaname || '.' || tablename)
    ) AS index_toast_size,
    (SELECT n_live_tup FROM pg_stat_user_tables t
     WHERE t.schemaname = tables.schemaname AND t.relname = tables.tablename) AS est_rows
FROM information_schema.tables AS tables
WHERE table_schema = 'public'
    AND table_type = 'BASE TABLE'
ORDER BY pg_total_relation_size(schemaname || '.' || tablename) DESC;

-- Database total size
SELECT
    pg_size_pretty(pg_database_size(current_database())) AS database_size;


-- ===========================================================================
-- 8. Replication and WAL Status
-- ===========================================================================
-- Shows WAL archiving status and replication lag (if replicas exist).
-- ---------------------------------------------------------------------------
SELECT
    '=== WAL & REPLICATION ===' AS section;

-- Archiver status
SELECT
    archived_count,
    failed_count,
    last_archived_wal,
    last_archived_time,
    last_failed_wal,
    last_failed_time
FROM pg_stat_archiver;

-- Current WAL position
SELECT
    pg_current_wal_lsn() AS current_wal_lsn,
    pg_walfile_name(pg_current_wal_lsn()) AS current_wal_file;

-- Replication slots (if any)
SELECT
    slot_name,
    slot_type,
    active,
    restart_lsn,
    confirmed_flush_lsn
FROM pg_replication_slots;


-- ===========================================================================
-- 9. Summary Dashboard
-- ===========================================================================
-- Single-row summary of key health indicators.
-- ---------------------------------------------------------------------------
SELECT
    '=== HEALTH SUMMARY ===' AS section;

SELECT
    (SELECT numbackends FROM pg_stat_database WHERE datname = current_database()) AS connections,
    (SELECT current_setting('max_connections')::int) AS max_connections,
    (SELECT pg_size_pretty(pg_database_size(current_database()))) AS db_size,
    (SELECT CASE WHEN blks_hit + blks_read = 0 THEN 100
            ELSE ROUND(blks_hit::numeric / (blks_hit + blks_read) * 100, 2)
            END
     FROM pg_stat_database WHERE datname = current_database()) AS cache_hit_pct,
    (SELECT COUNT(*) FROM pg_stat_activity
     WHERE state = 'active' AND query_start < NOW() - INTERVAL '30 seconds'
       AND pid <> pg_backend_pid()) AS long_running_queries,
    (SELECT COUNT(*) FROM pg_locks WHERE NOT granted) AS waiting_locks,
    (SELECT SUM(n_dead_tup) FROM pg_stat_user_tables) AS total_dead_tuples;
