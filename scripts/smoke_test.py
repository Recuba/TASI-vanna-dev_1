"""
Ra'd AI Platform -- Smoke Test (Python)
========================================
Validates a running Ra'd AI instance end-to-end by hitting key endpoints.

Usage:
    python scripts/smoke_test.py [BASE_URL]

Examples:
    python scripts/smoke_test.py
    python scripts/smoke_test.py http://localhost:8084
    python scripts/smoke_test.py https://raid-ai-app-production.up.railway.app
"""

from __future__ import annotations

import json
import sys
import time
import urllib.request
import urllib.error

DEFAULT_BASE_URL = "http://localhost:8084"
TIMEOUT = 10  # seconds


# ---------------------------------------------------------------------------
# Colored output helpers
# ---------------------------------------------------------------------------

class Colors:
    GREEN = "\033[92m"
    RED = "\033[91m"
    YELLOW = "\033[93m"
    CYAN = "\033[96m"
    BOLD = "\033[1m"
    RESET = "\033[0m"


def _supports_color() -> bool:
    """Return True if stdout likely supports ANSI colors."""
    if sys.platform == "win32":
        try:
            import os
            return os.isatty(sys.stdout.fileno()) and os.environ.get("TERM") != "dumb"
        except Exception:
            return False
    return hasattr(sys.stdout, "isatty") and sys.stdout.isatty()


USE_COLOR = _supports_color()


def _c(color: str, text: str) -> str:
    if USE_COLOR:
        return f"{color}{text}{Colors.RESET}"
    return text


# ---------------------------------------------------------------------------
# Result tracking
# ---------------------------------------------------------------------------

_passed = 0
_failed = 0
_skipped = 0


def _pass(name: str, detail: str = "") -> None:
    global _passed
    _passed += 1
    suffix = f" ({detail})" if detail else ""
    print(f"  {_c(Colors.GREEN, 'PASS')}: {name}{suffix}")


def _fail(name: str, detail: str = "") -> None:
    global _failed
    _failed += 1
    suffix = f" ({detail})" if detail else ""
    print(f"  {_c(Colors.RED, 'FAIL')}: {name}{suffix}")


def _skip(name: str, reason: str = "") -> None:
    global _skipped
    _skipped += 1
    suffix = f" ({reason})" if reason else ""
    print(f"  {_c(Colors.YELLOW, 'SKIP')}: {name}{suffix}")


# ---------------------------------------------------------------------------
# HTTP helpers (stdlib only -- no requests dependency)
# ---------------------------------------------------------------------------

def _get(url: str, headers: dict | None = None) -> tuple[int, bytes]:
    """Perform a GET request, return (status_code, body_bytes)."""
    req = urllib.request.Request(url, headers=headers or {})
    try:
        resp = urllib.request.urlopen(req, timeout=TIMEOUT)
        return resp.status, resp.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()
    except Exception:
        return 0, b""


def _get_json(url: str, headers: dict | None = None) -> tuple[int, dict | None]:
    """GET request returning (status_code, parsed_json_or_None)."""
    status, body = _get(url, headers)
    if status == 0:
        return 0, None
    try:
        return status, json.loads(body)
    except (json.JSONDecodeError, ValueError):
        return status, None


# ---------------------------------------------------------------------------
# Test cases
# ---------------------------------------------------------------------------

def test_tasi_health(base: str) -> None:
    """(1) /api/v1/charts/tasi/health returns JSON with status field."""
    url = f"{base}/api/v1/charts/tasi/health"
    status, data = _get_json(url)
    if status == 0:
        _fail("TASI health endpoint", "no response")
        return
    if status != 200:
        _fail("TASI health endpoint", f"HTTP {status}")
        return
    if data is None:
        _fail("TASI health endpoint", "not valid JSON")
        return
    if "status" not in data:
        _fail("TASI health endpoint", "missing 'status' field")
        return
    _pass("TASI health endpoint", f"status={data['status']}")


def test_tasi_index(base: str) -> None:
    """(2) /api/v1/charts/tasi/index returns data with count > 0."""
    url = f"{base}/api/v1/charts/tasi/index"
    status, data = _get_json(url)
    if status == 0:
        _fail("TASI index data", "no response")
        return
    if status != 200:
        _fail("TASI index data", f"HTTP {status}")
        return
    if data is None:
        _fail("TASI index data", "not valid JSON")
        return
    count = data.get("count", 0)
    if count <= 0:
        _fail("TASI index data", f"count={count}, expected > 0")
        return
    _pass("TASI index data", f"count={count}, source={data.get('source', '?')}")


def test_auth_protected_no_token(base: str) -> None:
    """(3) Protected endpoint without token returns 401."""
    url = f"{base}/api/auth/me"
    status, _ = _get(url)
    if status == 0:
        _fail("Auth /me without token", "no response")
        return
    if status in (401, 403):
        _pass("Auth /me without token", f"HTTP {status}")
    else:
        _fail("Auth /me without token", f"expected 401/403, got HTTP {status}")


def test_frontend_root(base: str) -> None:
    """(4a) Frontend root / returns 200."""
    url = f"{base}/"
    status, body = _get(url)
    if status == 0:
        _fail("Frontend root /", "no response")
        return
    if status != 200:
        _fail("Frontend root /", f"HTTP {status}")
        return
    _pass("Frontend root /", f"HTTP {status}, {len(body)} bytes")


def test_health_endpoint(base: str) -> None:
    """(4b) /health returns 200 or 503 with JSON."""
    url = f"{base}/health"
    status, data = _get_json(url)
    if status == 0:
        _fail("Health endpoint /health", "no response")
        return
    if status not in (200, 503):
        _fail("Health endpoint /health", f"HTTP {status}")
        return
    if data is None:
        _fail("Health endpoint /health", "not valid JSON")
        return
    _pass("Health endpoint /health", f"status={data.get('status', '?')}")


def test_openapi_json(base: str) -> None:
    """(5) /openapi.json returns valid JSON schema."""
    url = f"{base}/openapi.json"
    status, data = _get_json(url)
    if status == 0:
        _fail("OpenAPI schema", "no response")
        return
    if status != 200:
        _fail("OpenAPI schema", f"HTTP {status}")
        return
    if data is None:
        _fail("OpenAPI schema", "not valid JSON")
        return
    if "openapi" not in data and "info" not in data:
        _fail("OpenAPI schema", "missing openapi/info fields")
        return
    paths_count = len(data.get("paths", {}))
    _pass("OpenAPI schema", f"{paths_count} paths defined")


def test_guest_login(base: str) -> None:
    """(6) Guest login returns a JWT token."""
    url = f"{base}/api/auth/guest"
    req = urllib.request.Request(
        url, data=b"", headers={"Content-Type": "application/json"}, method="POST"
    )
    try:
        resp = urllib.request.urlopen(req, timeout=TIMEOUT)
        status = resp.status
        body = resp.read()
    except urllib.error.HTTPError as e:
        status = e.code
        body = e.read()
    except Exception:
        _fail("Guest login", "no response")
        return

    if status != 200:
        _fail("Guest login", f"HTTP {status}")
        return
    try:
        data = json.loads(body)
    except (json.JSONDecodeError, ValueError):
        _fail("Guest login", "not valid JSON")
        return
    if "token" not in data:
        _fail("Guest login", "missing 'token' field")
        return
    _pass("Guest login", f"user_id={data.get('user_id', '?')}")


def test_tasi_invalid_period(base: str) -> None:
    """(7) Invalid period returns 400."""
    url = f"{base}/api/v1/charts/tasi/index?period=invalid"
    status, _ = _get(url)
    if status == 0:
        _fail("TASI invalid period", "no response")
        return
    if status == 400:
        _pass("TASI invalid period", "HTTP 400")
    else:
        _fail("TASI invalid period", f"expected 400, got HTTP {status}")


# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------

def main() -> int:
    base_url = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_BASE_URL
    base_url = base_url.rstrip("/")

    print(_c(Colors.BOLD, "============================================="))
    print(_c(Colors.BOLD, "  Ra'd AI Platform -- Smoke Test"))
    print(_c(Colors.BOLD, "============================================="))
    print(f"Target: {_c(Colors.CYAN, base_url)}")
    print(f"Time:   {time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}")
    print()

    # Connectivity check
    print(_c(Colors.BOLD, "--- Connectivity ---"))
    status, _ = _get(f"{base_url}/")
    if status == 0:
        _fail("Server reachable", f"cannot connect to {base_url}")
        print()
        print(_c(Colors.RED, "Server unreachable. Aborting remaining tests."))
        return 1
    _pass("Server reachable", f"HTTP {status}")
    print()

    # Run all tests
    print(_c(Colors.BOLD, "--- TASI Index API ---"))
    test_tasi_health(base_url)
    test_tasi_index(base_url)
    test_tasi_invalid_period(base_url)
    print()

    print(_c(Colors.BOLD, "--- Authentication ---"))
    test_guest_login(base_url)
    test_auth_protected_no_token(base_url)
    print()

    print(_c(Colors.BOLD, "--- Health & Frontend ---"))
    test_frontend_root(base_url)
    test_health_endpoint(base_url)
    test_openapi_json(base_url)
    print()

    # Summary
    total = _passed + _failed
    print(_c(Colors.BOLD, "============================================="))
    summary = f"  Results: {_passed}/{total} passed, {_failed} failed"
    if _failed > 0:
        print(_c(Colors.RED, summary))
    else:
        print(_c(Colors.GREEN, summary))
    if _skipped > 0:
        print(f"  Skipped: {_skipped}")
    print(_c(Colors.BOLD, "============================================="))

    return 1 if _failed > 0 else 0


if __name__ == "__main__":
    sys.exit(main())
