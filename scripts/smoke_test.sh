#!/bin/bash
# =============================================================================
# Ra'd AI Platform - Smoke Test (Bash Wrapper)
# =============================================================================
# Runs the Python smoke test against a running Ra'd AI instance.
# Usage: ./scripts/smoke_test.sh [BASE_URL]
#
# Examples:
#   ./scripts/smoke_test.sh                           # localhost:8084
#   ./scripts/smoke_test.sh http://localhost:8084      # explicit local
#   ./scripts/smoke_test.sh https://raid-ai-app-production.up.railway.app
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_URL="${1:-http://localhost:8084}"

echo "Running Ra'd AI smoke tests against: $BASE_URL"
echo ""

# Use Python smoke test script
python "$SCRIPT_DIR/smoke_test.py" "$BASE_URL"
exit $?
