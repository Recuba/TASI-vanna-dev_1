#!/bin/bash
# =============================================================================
# Ra'd AI Platform - Pre-Deployment Build Check
# =============================================================================
# Runs all test suites and build steps to verify the project is deployable.
# Usage: ./scripts/build_check.sh
#
# Exit code: number of failed steps (0 = all green)
# =============================================================================

set -uo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

PASS=0
FAIL=0
SKIP=0

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

run_step() {
    local name="$1"
    shift
    echo ""
    echo "--- $name ---"
    if "$@" 2>&1; then
        echo "  PASS: $name"
        ((PASS++))
    else
        echo "  FAIL: $name (exit code $?)"
        ((FAIL++))
    fi
}

run_step_optional() {
    local name="$1"
    shift
    echo ""
    echo "--- $name (optional) ---"
    if command -v "${1}" &>/dev/null; then
        if "$@" 2>&1; then
            echo "  PASS: $name"
            ((PASS++))
        else
            echo "  FAIL: $name (exit code $?)"
            ((FAIL++))
        fi
    else
        echo "  SKIP: $name (${1} not found)"
        ((SKIP++))
    fi
}

# ---------------------------------------------------------------------------
# Python Tests
# ---------------------------------------------------------------------------

echo "============================================="
echo "  Ra'd AI Platform - Build Check"
echo "============================================="
echo "Project: $PROJECT_DIR"
echo "Time:    $(date -u '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || date)"
echo "Python:  $(python --version 2>&1)"

# Core test suites
run_step "Database integrity tests (test_database.py)" python -m pytest test_database.py -v --tb=short
run_step "Vanna assembly tests (test_app_assembly_v2.py)" python -m pytest test_app_assembly_v2.py -v --tb=short
run_step "Unit/integration tests (tests/)" python -m pytest tests/ -v --tb=short -x

# ---------------------------------------------------------------------------
# Frontend Build
# ---------------------------------------------------------------------------

if [ -d "frontend" ] && [ -f "frontend/package.json" ]; then
    echo ""
    echo "--- Frontend ---"
    if command -v npm &>/dev/null; then
        # Install dependencies if needed
        if [ ! -d "frontend/node_modules" ]; then
            echo "Installing frontend dependencies..."
            (cd frontend && npm install --prefer-offline 2>&1) || true
        fi
        run_step "Next.js build" bash -c "cd frontend && npm run build"
        run_step_optional "Frontend tests (vitest)" bash -c "cd frontend && npx vitest run 2>&1"
    else
        echo "  SKIP: Frontend build (npm not found)"
        ((SKIP++))
    fi
else
    echo ""
    echo "  SKIP: Frontend (directory not found)"
    ((SKIP++))
fi

# ---------------------------------------------------------------------------
# Docker Compose Validation
# ---------------------------------------------------------------------------

run_step_optional "Docker Compose config validation" docker compose config --quiet

# ---------------------------------------------------------------------------
# Python import check (quick sanity)
# ---------------------------------------------------------------------------

echo ""
echo "--- Import Sanity Check ---"
if python -c "
import app
import services.tasi_index
import api.routes.tasi_index
import config
import chart_engine.raid_chart_generator
print('All key modules importable')
" 2>&1; then
    echo "  PASS: Python imports"
    ((PASS++))
else
    echo "  FAIL: Python imports"
    ((FAIL++))
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

echo ""
echo "============================================="
TOTAL=$((PASS + FAIL))
echo "  Build Check: $PASS/$TOTAL passed, $FAIL failed"
if [ "$SKIP" -gt 0 ]; then
    echo "  Skipped: $SKIP"
fi
echo "============================================="

if [ "$FAIL" -gt 0 ]; then
    echo ""
    echo "  BUILD CHECK FAILED - do not deploy"
    exit 1
else
    echo ""
    echo "  All checks passed - ready for deployment"
    exit 0
fi
