#!/usr/bin/env bash
# =============================================================================
# Ra'd AI - PostgreSQL Backup Script
# =============================================================================
# Creates a compressed custom-format pg_dump, verifies integrity, and enforces
# a 30-day retention policy.
#
# Usage:
#   ./backup.sh                          # Uses env vars or defaults
#   ./backup.sh /custom/backup/dir       # Override backup directory
#
# Environment variables (all optional, sensible defaults provided):
#   PGHOST       - PostgreSQL host       (default: localhost)
#   PGPORT       - PostgreSQL port       (default: 5432)
#   PGDATABASE   - Database name         (default: tasi_platform)
#   PGUSER       - Database user         (default: tasi_user)
#   PGPASSWORD   - Database password     (reads from .pgpass if not set)
#   BACKUP_DIR   - Backup directory      (default: /var/backups/raid-ai)
#   RETENTION_DAYS - Days to keep backups (default: 30)
#
# Cron example (daily at 02:00):
#   0 2 * * * /opt/raid-ai/infrastructure/database/backup.sh >> /var/log/raid-ai-backup.log 2>&1
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5432}"
PGDATABASE="${PGDATABASE:-tasi_platform}"
PGUSER="${PGUSER:-tasi_user}"
BACKUP_DIR="${1:-${BACKUP_DIR:-/var/backups/raid-ai}}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_FILE="${BACKUP_DIR}/${PGDATABASE}_${TIMESTAMP}.dump"
LOG_PREFIX="[backup]"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
log()  { echo "${LOG_PREFIX} $(date '+%Y-%m-%d %H:%M:%S') $*"; }
fail() { log "ERROR: $*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------
command -v pg_dump    >/dev/null 2>&1 || fail "pg_dump not found in PATH"
command -v pg_restore >/dev/null 2>&1 || fail "pg_restore not found in PATH"

mkdir -p "${BACKUP_DIR}" || fail "Cannot create backup directory: ${BACKUP_DIR}"

log "Starting backup of ${PGDATABASE}@${PGHOST}:${PGPORT}"
log "Backup file: ${BACKUP_FILE}"

# ---------------------------------------------------------------------------
# Step 1: Create compressed custom-format dump
# ---------------------------------------------------------------------------
# -Fc  = custom format (compressed, supports selective restore)
# -v   = verbose (logs table names as they are dumped)
# -Z5  = compression level 5 (good balance of speed vs size)
# --no-owner       = omit ownership commands (portable across environments)
# --no-privileges  = omit GRANT/REVOKE (re-applied by deploy scripts)
# ---------------------------------------------------------------------------
log "Running pg_dump..."
pg_dump \
    -h "${PGHOST}" \
    -p "${PGPORT}" \
    -U "${PGUSER}" \
    -d "${PGDATABASE}" \
    -Fc \
    -Z5 \
    --no-owner \
    --no-privileges \
    -f "${BACKUP_FILE}" \
    || fail "pg_dump failed with exit code $?"

BACKUP_SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
log "Dump created: ${BACKUP_FILE} (${BACKUP_SIZE})"

# ---------------------------------------------------------------------------
# Step 2: Verify backup integrity
# ---------------------------------------------------------------------------
# pg_restore --list reads the TOC (table of contents) from the dump file.
# If the file is corrupt or truncated, this will fail.
# ---------------------------------------------------------------------------
log "Verifying backup integrity..."
pg_restore --list "${BACKUP_FILE}" > /dev/null 2>&1 \
    || fail "Backup verification FAILED - dump file may be corrupt: ${BACKUP_FILE}"

TABLE_COUNT=$(pg_restore --list "${BACKUP_FILE}" 2>/dev/null | grep -c "TABLE" || true)
log "Verification passed (${TABLE_COUNT} table entries in TOC)"

# ---------------------------------------------------------------------------
# Step 3: Enforce retention policy (delete backups older than N days)
# ---------------------------------------------------------------------------
log "Enforcing ${RETENTION_DAYS}-day retention policy..."
DELETED_COUNT=0
while IFS= read -r old_file; do
    rm -f "${old_file}"
    log "  Deleted: $(basename "${old_file}")"
    DELETED_COUNT=$((DELETED_COUNT + 1))
done < <(find "${BACKUP_DIR}" -name "${PGDATABASE}_*.dump" -type f -mtime "+${RETENTION_DAYS}" 2>/dev/null)

if [ "${DELETED_COUNT}" -eq 0 ]; then
    log "No expired backups to remove"
else
    log "Removed ${DELETED_COUNT} backup(s) older than ${RETENTION_DAYS} days"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
REMAINING=$(find "${BACKUP_DIR}" -name "${PGDATABASE}_*.dump" -type f | wc -l)
log "Backup complete. ${REMAINING} backup(s) in ${BACKUP_DIR}"
log "Done."
