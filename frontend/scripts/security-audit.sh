#!/usr/bin/env bash
#
# security-audit.sh - Run security audits on the Ra'd AI frontend.
#
# Usage: bash scripts/security-audit.sh
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$(dirname "$SCRIPT_DIR")"

cd "$FRONTEND_DIR"

echo "========================================"
echo " Ra'd AI Frontend Security Audit"
echo "========================================"
echo ""

EXIT_CODE=0

# --------------------------------------------------------------------------
# 1. npm audit
# --------------------------------------------------------------------------
echo "[1/3] Running npm audit..."
echo "----------------------------------------"
if npm audit --audit-level=high 2>/dev/null; then
  echo "npm audit: PASSED"
else
  echo "npm audit: WARNINGS FOUND (see above)"
  EXIT_CODE=1
fi
echo ""

# --------------------------------------------------------------------------
# 2. ESLint security plugin
# --------------------------------------------------------------------------
echo "[2/3] Running ESLint with security plugin..."
echo "----------------------------------------"
if npx eslint src/ --no-error-on-unmatched-pattern --plugin security --rule '{"security/detect-object-injection": "warn", "security/detect-non-literal-regexp": "warn", "security/detect-unsafe-regex": "error", "security/detect-eval-with-expression": "error"}' 2>/dev/null; then
  echo "ESLint security: PASSED"
else
  echo "ESLint security: ISSUES FOUND (see above)"
  # Don't fail on ESLint security warnings - they need manual review
fi
echo ""

# --------------------------------------------------------------------------
# 3. Check for common security issues
# --------------------------------------------------------------------------
echo "[3/3] Checking for common security patterns..."
echo "----------------------------------------"

# Check for hardcoded secrets/tokens (basic pattern matching)
SECRETS_FOUND=0
for pattern in "sk-" "api_key.*=.*['\"]" "password.*=.*['\"]" "secret.*=.*['\"]"; do
  if grep -rn "$pattern" src/ --include="*.ts" --include="*.tsx" --exclude-dir=node_modules --exclude-dir=__tests__ 2>/dev/null | grep -v "type\|interface\|placeholder\|example\|test\|mock" | head -5; then
    SECRETS_FOUND=1
  fi
done

if [ "$SECRETS_FOUND" -eq 0 ]; then
  echo "No hardcoded secrets found: PASSED"
else
  echo "WARNING: Potential hardcoded secrets detected (review above)"
  EXIT_CODE=1
fi

# Check for dangerouslySetInnerHTML usage
DANGEROUS_HTML=$(grep -rn "dangerouslySetInnerHTML" src/ --include="*.tsx" --include="*.ts" 2>/dev/null || true)
if [ -z "$DANGEROUS_HTML" ]; then
  echo "No dangerouslySetInnerHTML usage: PASSED"
else
  echo "WARNING: dangerouslySetInnerHTML found:"
  echo "$DANGEROUS_HTML"
fi

echo ""
echo "========================================"
echo " Audit Complete (exit code: $EXIT_CODE)"
echo "========================================"

exit $EXIT_CODE
