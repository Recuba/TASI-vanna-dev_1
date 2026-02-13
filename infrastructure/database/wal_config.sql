-- =============================================================================
-- Ra'd AI - PostgreSQL WAL Archiving Configuration
-- =============================================================================
-- This file configures Write-Ahead Log (WAL) archiving for Point-in-Time
-- Recovery (PITR). Run with superuser privileges:
--
--   psql -U postgres -d tasi_platform -f wal_config.sql
--
-- After applying, restart PostgreSQL for archive_mode to take effect.
--
-- NOTE: ALTER SYSTEM writes to postgresql.auto.conf, which overrides
-- postgresql.conf. These settings persist across restarts.
-- =============================================================================


-- ===========================================================================
-- SECTION 1: WAL Settings
-- ===========================================================================

-- Set WAL level to 'replica' (required for archiving and streaming replication).
-- 'replica' is the minimum level that generates enough WAL for PITR.
-- Default is 'replica' in PG 16, but we set it explicitly for clarity.
ALTER SYSTEM SET wal_level = 'replica';

-- Enable WAL archiving. Requires a restart to take effect.
ALTER SYSTEM SET archive_mode = 'on';

-- Archive command: copy completed WAL segments to the archive directory.
-- %p = full path to the WAL file to archive
-- %f = filename only (without path)
-- The command must return 0 on success. Using cp with test ensures we don't
-- overwrite an existing archived segment (safety against double-archiving).
--
-- For production, replace this with your preferred archiving tool:
--   - pgBackRest:  pgbackrest --stanza=raid-ai archive-push %p
--   - WAL-G:       wal-g wal-push %p
--   - S3:          aws s3 cp %p s3://raid-ai-wal-archive/%f
ALTER SYSTEM SET archive_command = 'test ! -f /var/lib/postgresql/wal_archive/%f && cp %p /var/lib/postgresql/wal_archive/%f';

-- Timeout for archive_command (seconds). If the command takes longer than this,
-- it is killed and WAL archiving is retried. Set higher for remote storage.
ALTER SYSTEM SET archive_timeout = '300';


-- ===========================================================================
-- SECTION 2: WAL Sizing
-- ===========================================================================

-- Maximum size of WAL files before a checkpoint is triggered.
-- Default is 1GB. For a small-to-medium database like TASI (~500 companies),
-- 512MB is sufficient. Increase for write-heavy workloads.
ALTER SYSTEM SET max_wal_size = '1GB';

-- Minimum WAL size to retain. PostgreSQL will try to keep at least this much
-- WAL on disk. Helps avoid frequent checkpoint I/O spikes.
ALTER SYSTEM SET min_wal_size = '256MB';

-- Number of WAL segments kept for streaming replication standby servers.
-- 64 segments * 16MB = 1GB of WAL retained. Set to 0 if no replicas.
ALTER SYSTEM SET wal_keep_size = '1GB';


-- ===========================================================================
-- SECTION 3: Checkpoint Tuning
-- ===========================================================================

-- Target ratio of checkpoint completion vs interval between checkpoints.
-- 0.9 means spread checkpoint writes over 90% of the interval, reducing
-- I/O spikes. Default is 0.9 in PG 16.
ALTER SYSTEM SET checkpoint_completion_target = '0.9';

-- Time between automatic checkpoints (seconds). 10 minutes is a good default.
ALTER SYSTEM SET checkpoint_timeout = '10min';


-- ===========================================================================
-- SECTION 4: WAL Compression (PG 15+)
-- ===========================================================================

-- Compress full-page writes in WAL. Reduces WAL volume by ~30-50% with
-- minimal CPU overhead. Uses LZ4 if available, falls back to pglz.
ALTER SYSTEM SET wal_compression = 'on';


-- ===========================================================================
-- SECTION 5: Verification
-- ===========================================================================
-- After restarting PostgreSQL, verify settings:
--
--   SELECT name, setting, pending_restart
--   FROM pg_settings
--   WHERE name IN (
--       'wal_level', 'archive_mode', 'archive_command', 'archive_timeout',
--       'max_wal_size', 'min_wal_size', 'wal_keep_size',
--       'checkpoint_completion_target', 'checkpoint_timeout',
--       'wal_compression'
--   )
--   ORDER BY name;
--
-- Check archiving status:
--   SELECT * FROM pg_stat_archiver;
-- =============================================================================
