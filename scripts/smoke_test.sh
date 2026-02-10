#!/bin/bash
# =============================================================================
# Ra'd AI Platform - Smoke Test
# =============================================================================
# Comprehensive smoke test for verifying a running Ra'd AI deployment.
# Usage: ./scripts/smoke_test.sh [BASE_URL]
#
# Examples:
#   ./scripts/smoke_test.sh                           # localhost:8084
#   ./scripts/smoke_test.sh http://localhost:8084      # explicit local
#   ./scripts/smoke_test.sh https://raid-ai-app-production.up.railway.app
# =============================================================================

set -euo pipefail

BASE_URL="${1:-http://localhost:8084}"
PASS=0
FAIL=0
SKIP=0
CURL_TIMEOUT=10

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

check_http() {
    local name="$1" url="$2" expected="$3"
    local response
    response=$(curl -sf -o /dev/null -w "%{http_code}" --connect-timeout "$CURL_TIMEOUT" --max-time "$CURL_TIMEOUT" "$url" 2>/dev/null) || response="000"
    if [ "$response" = "$expected" ]; then
        echo "  PASS: $name (HTTP $response)"
        ((PASS++))
    else
        echo "  FAIL: $name (expected HTTP $expected, got HTTP $response)"
        ((FAIL++))
    fi
}

check_json_field() {
    local name="$1" url="$2" field="$3"
    local response
    response=$(curl -sf --connect-timeout "$CURL_TIMEOUT" --max-time "$CURL_TIMEOUT" "$url" 2>/dev/null) || response=""
    if [ -z "$response" ]; then
        echo "  FAIL: $name (no response)"
        ((FAIL++))
        return
    fi
    local value
    value=$(echo "$response" | python -c "import sys,json; d=json.load(sys.stdin); print(d['$field'])" 2>/dev/null) || value=""
    if [ -n "$value" ]; then
        echo "  PASS: $name ($field=$value)"
        ((PASS++))
    else
        echo "  FAIL: $name (field '$field' missing or empty)"
        ((FAIL++))
    fi
}

check_json_status() {
    local name="$1" url="$2" field="$3" expected="$4"
    local response
    response=$(curl -sf --connect-timeout "$CURL_TIMEOUT" --max-time "$CURL_TIMEOUT" "$url" 2>/dev/null) || response=""
    if [ -z "$response" ]; then
        echo "  FAIL: $name (no response)"
        ((FAIL++))
        return
    fi
    local value
    value=$(echo "$response" | python -c "import sys,json; d=json.load(sys.stdin); print(d['$field'])" 2>/dev/null) || value=""
    if [ "$value" = "$expected" ]; then
        echo "  PASS: $name ($field=$value)"
        ((PASS++))
    else
        echo "  FAIL: $name (expected $field=$expected, got $field=$value)"
        ((FAIL++))
    fi
}

check_contains() {
    local name="$1" url="$2" expected_text="$3"
    local response
    response=$(curl -sf --connect-timeout "$CURL_TIMEOUT" --max-time "$CURL_TIMEOUT" "$url" 2>/dev/null) || response=""
    if echo "$response" | grep -qi "$expected_text" 2>/dev/null; then
        echo "  PASS: $name (contains '$expected_text')"
        ((PASS++))
    else
        echo "  FAIL: $name (missing '$expected_text')"
        ((FAIL++))
    fi
}

# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

echo "============================================="
echo "  Ra'd AI Platform - Smoke Test"
echo "============================================="
echo "Target: $BASE_URL"
echo "Time:   $(date -u '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || date)"
echo ""

# --- Legacy UI ---
echo "--- Legacy UI ---"
check_http "Homepage loads" "$BASE_URL/" 200
check_contains "Homepage has Ra'd branding" "$BASE_URL/" "Ra'd"

# --- TASI Index API ---
echo ""
echo "--- TASI Index API ---"
check_http "TASI health endpoint" "$BASE_URL/api/v1/charts/tasi/health" 200
check_json_status "TASI health status" "$BASE_URL/api/v1/charts/tasi/health" "status" "ok"
check_json_field "TASI health yfinance flag" "$BASE_URL/api/v1/charts/tasi/health" "yfinance_available"
check_http "TASI index default period" "$BASE_URL/api/v1/charts/tasi/index" 200
check_json_field "TASI index has source" "$BASE_URL/api/v1/charts/tasi/index" "source"
check_json_field "TASI index has count" "$BASE_URL/api/v1/charts/tasi/index" "count"
check_json_field "TASI index has symbol" "$BASE_URL/api/v1/charts/tasi/index" "symbol"
check_http "TASI index 3mo period" "$BASE_URL/api/v1/charts/tasi/index?period=3mo" 200
check_http "TASI invalid period rejected" "$BASE_URL/api/v1/charts/tasi/index?period=invalid" 400

# --- Vanna Chat ---
echo ""
echo "--- Vanna Chat API ---"
check_http "Vanna chat SSE (GET=405)" "$BASE_URL/api/vanna/v2/chat_sse" 405

# --- Health / Readiness ---
echo ""
echo "--- Health Endpoints ---"
check_http "Health check" "$BASE_URL/api/v1/health" 200

# --- Summary ---
echo ""
echo "============================================="
TOTAL=$((PASS + FAIL))
echo "  Results: $PASS/$TOTAL passed, $FAIL failed"
if [ "$SKIP" -gt 0 ]; then
    echo "  Skipped: $SKIP"
fi
echo "============================================="

if [ "$FAIL" -gt 0 ]; then
    exit 1
fi
exit 0
