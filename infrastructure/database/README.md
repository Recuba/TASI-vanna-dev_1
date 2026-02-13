# Database Infrastructure

Operations scripts and configuration for the Ra'd AI PostgreSQL database.

## Directory Contents

| File | Purpose |
|---|---|
| `indexes.sql` | Production indexes for audit and security tables |
| `backup.sh` | Automated pg_dump with integrity verification and 30-day retention |
| `restore.sh` | Interactive restore with safety confirmation |
| `wal_config.sql` | WAL archiving and checkpoint configuration |
| `health_checks.sql` | Standalone diagnostic queries (connections, bloat, locks, cache) |
| `tuning.md` | PostgreSQL tuning runbook for Railway |

## Backup and Restore

### Daily Backups

The `backup.sh` script creates compressed custom-format dumps using `pg_dump -Fc`:

```bash
# Set credentials (or use .pgpass / PGPASSWORD)
export PGHOST=localhost
export PGPORT=5432
export PGDATABASE=tasi_platform
export PGUSER=tasi_user
export PGPASSWORD='...'

# Run backup
./backup.sh

# Or specify a custom backup directory
./backup.sh /mnt/backups/raid-ai
```

**What it does:**
1. Creates a compressed dump (`-Fc -Z5`) with no owner/privilege commands
2. Verifies the dump by reading its table of contents with `pg_restore --list`
3. Deletes backups older than 30 days (configurable via `RETENTION_DAYS`)

**Cron setup (daily at 02:00):**
```bash
0 2 * * * /opt/raid-ai/infrastructure/database/backup.sh >> /var/log/raid-ai-backup.log 2>&1
```

### Restoring a Backup

```bash
# List backup contents (dry run, no changes)
./restore.sh /var/backups/raid-ai/tasi_platform_20260213_020000.dump --list

# Interactive restore (prompts for confirmation)
./restore.sh /var/backups/raid-ai/tasi_platform_20260213_020000.dump

# Automated restore (CI/pipeline, skips prompt)
./restore.sh /var/backups/raid-ai/tasi_platform_20260213_020000.dump --confirm
```

The restore script:
1. Verifies the backup file integrity
2. Requires typing `CONFIRM` (unless `--confirm` flag is passed)
3. Drops existing objects (`--clean --if-exists`) and restores
4. Shows row counts per table after restore

## WAL Archiving and Point-in-Time Recovery (PITR)

### Overview

WAL (Write-Ahead Log) archiving provides continuous backup by copying every WAL segment to an archive. Combined with a base backup (from `backup.sh`), this enables restoring the database to any point in time -- not just the moment of the last dump.

**Recovery granularity:** Transaction-level (any timestamp, transaction ID, or named restore point).

### How WAL Archiving Works

```
Client writes --> WAL buffer --> WAL segment files (16MB each)
                                        |
                                        v  (archive_command)
                                  WAL archive directory
                                  /var/lib/postgresql/wal_archive/
```

1. PostgreSQL writes all changes to WAL before applying them to data files
2. When a WAL segment fills up (16MB), the `archive_command` copies it to the archive
3. The archive accumulates all changes since the last base backup
4. To recover: restore the base backup, then replay WAL segments up to the target time

### Setup Steps

**Step 1: Create the WAL archive directory**
```bash
# On the PostgreSQL host
sudo mkdir -p /var/lib/postgresql/wal_archive
sudo chown postgres:postgres /var/lib/postgresql/wal_archive
sudo chmod 700 /var/lib/postgresql/wal_archive
```

**Step 2: Apply WAL configuration**
```bash
psql -U postgres -d tasi_platform -f infrastructure/database/wal_config.sql
```

**Step 3: Restart PostgreSQL**
```bash
# Docker
docker compose restart postgres

# Systemd
sudo systemctl restart postgresql
```

**Step 4: Verify archiving is active**
```sql
-- Check settings
SELECT name, setting, pending_restart
FROM pg_settings
WHERE name IN ('wal_level', 'archive_mode', 'archive_command')
ORDER BY name;

-- Check archiver status
SELECT archived_count, failed_count, last_archived_wal, last_archived_time
FROM pg_stat_archiver;
```

### Point-in-Time Recovery (PITR)

PITR lets you restore the database to a specific moment. This is critical for recovering from accidental data deletion or corruption.

**Prerequisites:**
- A base backup (from `backup.sh`) taken BEFORE the target recovery time
- Archived WAL segments covering the period from the base backup to the target time

**Step 1: Stop PostgreSQL**
```bash
sudo systemctl stop postgresql
```

**Step 2: Clear the data directory and restore the base backup**
```bash
# Move current data aside (safety)
sudo mv /var/lib/postgresql/16/main /var/lib/postgresql/16/main.old

# Create fresh data directory
sudo mkdir /var/lib/postgresql/16/main
sudo chown postgres:postgres /var/lib/postgresql/16/main

# Restore base backup
sudo -u postgres pg_restore \
    -Fd /var/backups/raid-ai/tasi_platform_20260213_020000.dump \
    -d tasi_platform \
    --clean --if-exists
```

**Step 3: Configure recovery**

Create `/var/lib/postgresql/16/main/postgresql.auto.conf` (or edit it):
```ini
# Point-in-Time Recovery target
restore_command = 'cp /var/lib/postgresql/wal_archive/%f %p'
recovery_target_time = '2026-02-13 15:30:00+03'
recovery_target_action = 'promote'
```

Create the recovery signal file:
```bash
sudo -u postgres touch /var/lib/postgresql/16/main/recovery.signal
```

**Step 4: Start PostgreSQL**
```bash
sudo systemctl start postgresql
```

PostgreSQL will:
1. Replay WAL from the archive up to `recovery_target_time`
2. Promote to read-write mode (`recovery_target_action = 'promote'`)
3. Delete `recovery.signal`

**Step 5: Verify**
```sql
-- Should show no recovery in progress
SELECT pg_is_in_recovery();  -- Expected: false

-- Check the latest transaction timestamp
SELECT MAX(created_at) FROM query_audit_log;
```

### PITR on Railway

Railway's managed PostgreSQL does not expose filesystem access, so traditional WAL archiving is not directly available. Options:

1. **Scheduled pg_dump backups:** Use `backup.sh` with Railway's `railway run` to create periodic dumps to external storage (S3, GCS).

2. **External replication:** Set up a read replica outside Railway using streaming replication, which automatically transfers WAL.

3. **Railway snapshots:** Railway provides automatic volume snapshots for the database service. Check your Railway dashboard for snapshot configuration.

```bash
# Example: backup via Railway CLI to S3
railway run ./infrastructure/database/backup.sh /tmp/raid-ai-backup
aws s3 cp /tmp/raid-ai-backup/ s3://raid-ai-backups/ --recursive
```

### Monitoring WAL Archiving

```sql
-- Archiver statistics
SELECT * FROM pg_stat_archiver;

-- Current WAL position vs last archived
SELECT
    pg_current_wal_lsn() AS current_lsn,
    last_archived_wal,
    last_failed_wal,
    failed_count
FROM pg_stat_archiver;

-- WAL files waiting to be archived
SELECT COUNT(*) AS pending_wal_files
FROM pg_ls_waldir()
WHERE name > (SELECT last_archived_wal FROM pg_stat_archiver);
```

**Alert thresholds:**
- `failed_count > 0`: Archiving has failed at least once -- investigate immediately
- `pending_wal_files > 100`: WAL is accumulating faster than archiving -- check disk/network
- `last_archived_time` older than 10 minutes: Archiver may be stuck

### Retention

WAL archive files consume disk space. Implement retention based on your RPO (Recovery Point Objective):

```bash
# Delete archived WAL segments older than 7 days
find /var/lib/postgresql/wal_archive -name "*.gz" -mtime +7 -delete

# If using pgBackRest
pgbackrest --stanza=raid-ai expire
```

Keep WAL archives at least as long as your oldest base backup that you might need to restore from.
