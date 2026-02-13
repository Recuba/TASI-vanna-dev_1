#!/bin/bash
# =============================================================================
# Ra'd AI Platform - Coverage Report Generator
# =============================================================================
# Generates test coverage reports for both backend (Python) and frontend (TS).
#
# Usage:
#   ./scripts/coverage_report.sh           # full report
#   ./scripts/coverage_report.sh --fast    # skip slow/integration tests
#   ./scripts/coverage_report.sh --html    # generate HTML report
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
FAST_ONLY=false
HTML_REPORT=false

# Parse args
for arg in "$@"; do
    case "$arg" in
        --fast) FAST_ONLY=true ;;
        --html) HTML_REPORT=true ;;
    esac
done

echo "============================================="
echo "  Ra'd AI Platform -- Coverage Report"
echo "============================================="
echo ""

# ---------------------------------------------------------------------------
# Backend (Python) coverage
# ---------------------------------------------------------------------------
echo "--- Backend (Python) ---"
cd "$PROJECT_ROOT"

PYTEST_ARGS=(
    --cov=api
    --cov=auth
    --cov=config
    --cov=services
    --cov=middleware
    --cov=chart_engine
    --cov-report=term-missing
)

if [ "$HTML_REPORT" = true ]; then
    PYTEST_ARGS+=(--cov-report=html:htmlcov)
fi

if [ "$FAST_ONLY" = true ]; then
    PYTEST_ARGS+=(-m "fast or (not slow and not integration and not pg_required)")
fi

python -m pytest "${PYTEST_ARGS[@]}" tests/ test_database.py test_app_assembly_v2.py 2>&1 || true

echo ""

# ---------------------------------------------------------------------------
# Frontend (TypeScript) coverage
# ---------------------------------------------------------------------------
if [ -d "$PROJECT_ROOT/frontend" ] && [ -f "$PROJECT_ROOT/frontend/package.json" ]; then
    echo "--- Frontend (TypeScript) ---"
    cd "$PROJECT_ROOT/frontend"

    if command -v npx &> /dev/null; then
        npx vitest run --coverage 2>&1 || echo "  (frontend coverage failed or not configured)"
    else
        echo "  SKIP: npx not found"
    fi
    echo ""
fi

echo "============================================="
echo "  Coverage report complete."
if [ "$HTML_REPORT" = true ]; then
    echo "  HTML report: $PROJECT_ROOT/htmlcov/index.html"
fi
echo "============================================="
