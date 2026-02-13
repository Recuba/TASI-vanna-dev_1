-- Migration 002: Security Events table
-- Records security-relevant occurrences such as SQL injection attempts,
-- rate-limit breaches, authentication failures, and suspicious patterns.
--
-- This migration is idempotent (uses IF NOT EXISTS).

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS security_events (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    timestamp           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    event_type          VARCHAR(64) NOT NULL,
    severity            VARCHAR(16) NOT NULL,
    user_id             UUID,
    ip_address          INET,
    details             TEXT,
    request_id          VARCHAR(64)
);

-- Indexes for security event queries
CREATE INDEX IF NOT EXISTS idx_security_events_type
    ON security_events(event_type);
CREATE INDEX IF NOT EXISTS idx_security_events_severity
    ON security_events(severity);
CREATE INDEX IF NOT EXISTS idx_security_events_timestamp
    ON security_events(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_request_id
    ON security_events(request_id);
CREATE INDEX IF NOT EXISTS idx_security_events_ip
    ON security_events(ip_address)
    WHERE ip_address IS NOT NULL;
