-- =============================================================================
-- Ra'd AI - TASI Platform
-- Additional Production Indexes for Audit & Security Tables
-- =============================================================================
-- This file creates indexes that support production query patterns for the
-- query_audit_log and security_events tables. All statements are idempotent
-- (CREATE INDEX IF NOT EXISTS) and safe to re-run.
--
-- CONCURRENTLY indexes are provided as comments because:
--   1. CREATE INDEX CONCURRENTLY cannot run inside a transaction block
--   2. Many migration runners (Flyway, Alembic, psql -f) wrap files in transactions
-- To use CONCURRENTLY, run each statement individually outside a transaction:
--   psql -d raid_ai -c "CREATE INDEX CONCURRENTLY IF NOT EXISTS ..."
-- =============================================================================


-- ===========================================================================
-- PREREQUISITE: security_events table
-- ===========================================================================
-- The security_events table may not exist yet (created by audit-logger).
-- We create it here so the indexes can be applied independently.
-- If the audit-logger creates it first, this is a no-op (IF NOT EXISTS).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS security_events (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_type      TEXT NOT NULL,           -- 'auth_failure', 'rate_limit', 'sql_injection', 'forbidden_table', etc.
    severity        TEXT NOT NULL DEFAULT 'medium',  -- 'low', 'medium', 'high', 'critical'
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    ip_address      INET,
    user_agent      TEXT,
    request_path    TEXT,
    request_method  TEXT,
    detail          JSONB,                   -- event-specific payload (blocked query, error, etc.)
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ===========================================================================
-- PREREQUISITE: request_id column on query_audit_log
-- ===========================================================================
-- The original schema.sql does not include request_id. We add it here so the
-- index can be created. If it already exists, the DO block is a no-op.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'query_audit_log' AND column_name = 'request_id'
    ) THEN
        ALTER TABLE query_audit_log ADD COLUMN request_id TEXT;
    END IF;
END
$$;


-- ===========================================================================
-- SECTION 1: query_audit_log indexes
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- idx_audit_log_user_ts: query_audit_log(user_id, created_at DESC)
-- Purpose: Efficiently retrieve a user's query history in reverse chronological
--          order. Supports the "my recent queries" dashboard panel and
--          per-user usage analytics. DESC on timestamp avoids an extra sort.
-- Query pattern:
--   SELECT * FROM query_audit_log
--   WHERE user_id = $1
--   ORDER BY created_at DESC
--   LIMIT 50;
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_audit_log_user_ts
    ON query_audit_log (user_id, created_at DESC);

-- Non-blocking alternative (run outside a transaction):
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_log_user_ts
--     ON query_audit_log (user_id, created_at DESC);


-- ---------------------------------------------------------------------------
-- idx_audit_log_request_id: query_audit_log(request_id)
-- Purpose: Look up the audit trail for a specific API request. The correlation
--          ID middleware attaches a unique request_id to each HTTP request;
--          this index enables O(1) lookup for debugging and incident response.
-- Query pattern:
--   SELECT * FROM query_audit_log WHERE request_id = $1;
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_audit_log_request_id
    ON query_audit_log (request_id);

-- Non-blocking alternative (run outside a transaction):
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_log_request_id
--     ON query_audit_log (request_id);


-- ---------------------------------------------------------------------------
-- idx_audit_log_created: query_audit_log(created_at)
-- Purpose: Time-range scans for global analytics (e.g., "queries in the last
--          24h") and retention/cleanup jobs that purge old audit rows.
-- Query pattern:
--   SELECT COUNT(*) FROM query_audit_log
--   WHERE created_at >= NOW() - INTERVAL '24 hours';
--
--   DELETE FROM query_audit_log WHERE created_at < NOW() - INTERVAL '90 days';
-- Note: This index already exists in schema.sql (idx_audit_created).
--       Included here for documentation completeness; IF NOT EXISTS is a no-op.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_audit_created
    ON query_audit_log (created_at);


-- ---------------------------------------------------------------------------
-- idx_audit_log_success: query_audit_log(was_successful, created_at DESC)
-- Purpose: Quickly filter failed queries for error dashboards, alerting, and
--          troubleshooting. Partial index on was_successful = false would be
--          even more efficient but is less portable.
-- Query pattern:
--   SELECT * FROM query_audit_log
--   WHERE was_successful = false
--   ORDER BY created_at DESC
--   LIMIT 100;
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_audit_log_success
    ON query_audit_log (was_successful, created_at DESC);

-- Non-blocking alternative (run outside a transaction):
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_log_success
--     ON query_audit_log (was_successful, created_at DESC);


-- ===========================================================================
-- SECTION 2: security_events indexes
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- idx_security_event_type_ts: security_events(event_type, timestamp DESC)
-- Purpose: Filter security events by type in reverse chronological order.
--          Powers the security dashboard that shows "recent auth failures",
--          "recent rate limit hits", etc. DESC ordering avoids a sort step.
-- Query pattern:
--   SELECT * FROM security_events
--   WHERE event_type = 'auth_failure'
--   ORDER BY timestamp DESC
--   LIMIT 50;
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_security_event_type_ts
    ON security_events (event_type, timestamp DESC);

-- Non-blocking alternative (run outside a transaction):
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_security_event_type_ts
--     ON security_events (event_type, timestamp DESC);


-- ---------------------------------------------------------------------------
-- idx_security_user_ts: security_events(user_id, timestamp DESC)
-- Purpose: Retrieve all security events for a specific user in reverse
--          chronological order. Used for investigating suspicious accounts
--          and building per-user security profiles.
-- Query pattern:
--   SELECT * FROM security_events
--   WHERE user_id = $1
--   ORDER BY timestamp DESC;
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_security_user_ts
    ON security_events (user_id, timestamp DESC);

-- Non-blocking alternative (run outside a transaction):
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_security_user_ts
--     ON security_events (user_id, timestamp DESC);


-- ---------------------------------------------------------------------------
-- idx_security_severity_ts: security_events(severity, timestamp DESC)
-- Purpose: Filter by severity for alerting pipelines. High/critical events
--          trigger immediate notifications; this index supports efficient
--          polling for unacknowledged critical events.
-- Query pattern:
--   SELECT * FROM security_events
--   WHERE severity = 'critical'
--   ORDER BY timestamp DESC
--   LIMIT 20;
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_security_severity_ts
    ON security_events (severity, timestamp DESC);

-- Non-blocking alternative (run outside a transaction):
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_security_severity_ts
--     ON security_events (severity, timestamp DESC);


-- ---------------------------------------------------------------------------
-- idx_security_ip: security_events(ip_address, timestamp DESC)
-- Purpose: Investigate activity from a specific IP address. Supports
--          brute-force detection and IP-based blocking decisions.
-- Query pattern:
--   SELECT COUNT(*) FROM security_events
--   WHERE ip_address = $1
--     AND event_type = 'auth_failure'
--     AND timestamp >= NOW() - INTERVAL '15 minutes';
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_security_ip
    ON security_events (ip_address, timestamp DESC);

-- Non-blocking alternative (run outside a transaction):
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_security_ip
--     ON security_events (ip_address, timestamp DESC);


-- ---------------------------------------------------------------------------
-- idx_security_timestamp: security_events(timestamp)
-- Purpose: Global time-range scans for retention cleanup and aggregate
--          analytics (e.g., "security events in the last hour").
-- Query pattern:
--   DELETE FROM security_events WHERE timestamp < NOW() - INTERVAL '180 days';
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_security_timestamp
    ON security_events (timestamp);

-- Non-blocking alternative (run outside a transaction):
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_security_timestamp
--     ON security_events (timestamp);
