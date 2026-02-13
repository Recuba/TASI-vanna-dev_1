-- Migration 001: Query Audit Log table
-- Extended version of the query_audit_log table from database/schema.sql
-- with additional columns for correlation IDs, validation results, and risk scoring.
--
-- This migration is idempotent (uses IF NOT EXISTS).

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS query_audit_log (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_id              VARCHAR(64),
    user_id                 UUID,
    natural_language_query   TEXT NOT NULL,
    generated_sql           TEXT,
    validation_result       VARCHAR(64),
    execution_time_ms       INTEGER,
    row_count               INTEGER,
    was_successful          BOOLEAN DEFAULT TRUE,
    error_message           TEXT,
    ip_address              INET,
    risk_score              DOUBLE PRECISION,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_audit_request_id
    ON query_audit_log(request_id);
CREATE INDEX IF NOT EXISTS idx_audit_user_date
    ON query_audit_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_created
    ON query_audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_risk_score
    ON query_audit_log(risk_score)
    WHERE risk_score IS NOT NULL;
