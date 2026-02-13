#!/usr/bin/env bash
# =============================================================================
# Ra'd AI - PostgreSQL Restore Script
# =============================================================================
# Restores a custom-format pg_dump backup into the target database.
# Includes a mandatory confirmation prompt to prevent accidental overwrites.
#
# Usage:
#   ./restore.sh <backup_file>                        # Interactive confirmation
#   ./restore.sh <backup_file> --confirm              # Skip prompt (CI/automation)
#   ./restore.sh <backup_file> --list                 # List contents only (dry run)
#
# Environment variables:
#   PGHOST       - PostgreSQL host       (default: localhost)
#   PGPORT       - PostgreSQL port       (default: 5432)
#   PGDATABASE   - Target database name  (default: tasi_platform)
#   PGUSER       - Database user         (default: tasi_user)
#   PGPASSWORD   - Database password     (reads from .pgpass if not set)
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5432}"
PGDATABASE="${PGDATABASE:-tasi_platform}"
PGUSER="${PGUSER:-tasi_user}"
LOG_PREFIX="[restore]"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
log()  { echo "${LOG_PREFIX} $(date '+%Y-%m-%d %H:%M:%S') $*"; }
fail() { log "ERROR: $*" >&2; exit 1; }

usage() {
    echo "Usage: $0 <backup_file> [--confirm | --list]"
    echo ""
    echo "Options:"
    echo "  --confirm    Skip interactive confirmation (for CI/automation)"
    echo "  --list       List backup contents without restoring (dry run)"
    echo ""
    echo "Examples:"
    echo "  $0 /var/backups/raid-ai/tasi_platform_20260213_020000.dump"
    echo "  $0 /var/backups/raid-ai/tasi_platform_20260213_020000.dump --confirm"
    echo "  $0 /var/backups/raid-ai/tasi_platform_20260213_020000.dump --list"
    exit 1
}

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------
BACKUP_FILE="${1:-}"
MODE="${2:-}"

[ -z "${BACKUP_FILE}" ] && usage

[ -f "${BACKUP_FILE}" ] || fail "Backup file not found: ${BACKUP_FILE}"

command -v pg_restore >/dev/null 2>&1 || fail "pg_restore not found in PATH"

# ---------------------------------------------------------------------------
# Verify backup integrity first
# ---------------------------------------------------------------------------
log "Verifying backup: ${BACKUP_FILE}"
pg_restore --list "${BACKUP_FILE}" > /dev/null 2>&1 \
    || fail "Backup file is corrupt or not a valid custom-format dump"

BACKUP_SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
TABLE_COUNT=$(pg_restore --list "${BACKUP_FILE}" 2>/dev/null | grep -c "TABLE" || true)
log "Backup verified: ${BACKUP_SIZE}, ${TABLE_COUNT} table entries"

# ---------------------------------------------------------------------------
# List-only mode (dry run)
# ---------------------------------------------------------------------------
if [ "${MODE}" = "--list" ]; then
    log "Contents of ${BACKUP_FILE}:"
    echo "---"
    pg_restore --list "${BACKUP_FILE}" 2>/dev/null
    echo "---"
    log "Dry run complete. No changes made."
    exit 0
fi

# ---------------------------------------------------------------------------
# Safety confirmation
# ---------------------------------------------------------------------------
log "Target: ${PGDATABASE}@${PGHOST}:${PGPORT} (user: ${PGUSER})"

if [ "${MODE}" != "--confirm" ]; then
    echo ""
    echo "================================================================="
    echo "  WARNING: This will overwrite data in database '${PGDATABASE}'"
    echo "  on ${PGHOST}:${PGPORT} as user '${PGUSER}'."
    echo ""
    echo "  Backup file: ${BACKUP_FILE}"
    echo "  Size: ${BACKUP_SIZE} | Tables: ${TABLE_COUNT}"
    echo "================================================================="
    echo ""
    read -rp "Type 'CONFIRM' to proceed with restore: " RESPONSE
    if [ "${RESPONSE}" != "CONFIRM" ]; then
        log "Restore cancelled by user."
        exit 0
    fi
fi

# ---------------------------------------------------------------------------
# Step 1: Restore the backup
# ---------------------------------------------------------------------------
# --clean        = Drop existing objects before restoring
# --if-exists    = Don't error if objects don't exist yet
# --no-owner     = Don't set ownership (use current user)
# --no-privileges= Don't restore GRANT/REVOKE
# -j 4           = Use 4 parallel jobs for faster restore
# --exit-on-error= Stop on first error
# ---------------------------------------------------------------------------
log "Starting restore..."
pg_restore \
    -h "${PGHOST}" \
    -p "${PGPORT}" \
    -U "${PGUSER}" \
    -d "${PGDATABASE}" \
    --clean \
    --if-exists \
    --no-owner \
    --no-privileges \
    -j 4 \
    "${BACKUP_FILE}" \
    || fail "pg_restore failed with exit code $?"

# ---------------------------------------------------------------------------
# Step 2: Post-restore verification
# ---------------------------------------------------------------------------
log "Verifying restore..."

ROW_COUNTS=$(psql \
    -h "${PGHOST}" \
    -p "${PGPORT}" \
    -U "${PGUSER}" \
    -d "${PGDATABASE}" \
    -t -A \
    -c "SELECT tablename, n_live_tup FROM pg_stat_user_tables ORDER BY tablename;" \
    2>/dev/null || echo "(verification query failed)")

log "Table row counts after restore:"
echo "${ROW_COUNTS}" | while IFS='|' read -r tbl cnt; do
    [ -n "${tbl}" ] && log "  ${tbl}: ${cnt} rows"
done

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
log "Restore complete."
log "  Source: ${BACKUP_FILE}"
log "  Target: ${PGDATABASE}@${PGHOST}:${PGPORT}"
log "Done."
