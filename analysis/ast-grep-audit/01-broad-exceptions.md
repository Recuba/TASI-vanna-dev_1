# AST-Grep Audit: Bare and Broad Exception Catches

**Tool:** ast-grep 0.40.5
**Date:** 2026-02-17
**Scope:** All Python files in the repository (excluding `node_modules`, `venv`)

---

## Summary

| Pattern | Total Matches | Production | Test/Script |
|---------|--------------|------------|-------------|
| `except:` (bare) | 0 | 0 | 0 |
| `except Exception:` (no binding) | 69 | 50 | 19 |
| `except Exception as e:` (with binding) | 121 | 79 | 42 |
| `except Exception: pass` (silent swallow) | 10 | 7 | 3 |
| **Total** | **190** | **129** | **61** |

**No bare `except:` clauses were found.** This is good -- the codebase consistently uses `except Exception` at minimum, which avoids catching `SystemExit`, `KeyboardInterrupt`, and `GeneratorExit`.

---

## Severity Classification

- **HIGH** -- Silent error swallowing (`except Exception: pass`) in production code, or overly broad catches in security-critical paths
- **MEDIUM** -- Broad `except Exception` in production code that logs but may mask specific failure modes
- **LOW** -- Broad catches in test/script files, or in shutdown/cleanup paths where swallowing is defensible

---

## HIGH Severity Findings

### H-01: Silent swallow in chart engine date parsing

**File:** `chart_engine/raid_chart_generator.py:99`
**Pattern:** `except Exception: pass`

```python
try:
    df[col] = pd.to_datetime(df[col])
except Exception:
    pass
```

**Risk:** Silently ignores all date parsing errors. A column that *almost* looks like dates but has corruption will be silently left as strings, producing unexpected chart behavior with no diagnostic trail.

**Recommended fix:** Catch `(ValueError, TypeError)` and log at DEBUG level:
```python
except (ValueError, TypeError):
    logger.debug("Column %s could not be parsed as datetime, keeping as-is", col)
```

---

### H-02: Silent swallow in news store connection close

**File:** `services/news_store.py:91`
**Pattern:** `except Exception: pass`

```python
def close(self) -> None:
    conn = getattr(self._local, "conn", None)
    if conn is not None:
        try:
            conn.close()
        except Exception:
            pass
        self._local.conn = None
```

**Risk:** Connection close failures (e.g., from a corrupted SQLite file or disk I/O error) are silently swallowed. While close-time errors are often benign, in a production system they can indicate data corruption.

**Recommended fix:** Catch `sqlite3.Error` and log at WARNING:
```python
except sqlite3.Error:
    logger.warning("Failed to close news store connection", exc_info=True)
```

---

### H-03: Silent swallow in health service diagnostic query

**File:** `services/health_service.py:572`
**Pattern:** `except Exception: pass`

```python
except Exception:
    pass  # DB query failures are non-fatal here
```

**Risk:** The health service is the primary observability endpoint. Silently swallowing exceptions in health checks defeats the purpose of health monitoring. Even non-fatal errors should be logged.

**Recommended fix:** Log at DEBUG or WARNING level:
```python
except Exception:
    logger.debug("Non-fatal health check query failed", exc_info=True)
```

---

### H-04: Broad exception in authentication token validation

**File:** `app.py:149`
**Pattern:** `except Exception:`

```python
try:
    payload = jwt.decode(token, key=JWT_SECRET, ...)
    ...
except Exception:
    raise ValueError("Invalid or expired authentication token")
```

**Risk:** Every possible failure (including `ImportError`, `MemoryError`, key configuration issues, encoding bugs) is converted to "Invalid or expired authentication token". This masks real infrastructure problems and makes debugging JWT issues nearly impossible.

**Recommended fix:** Catch specific JWT exceptions:
```python
except (jwt.ExpiredSignatureError, jwt.InvalidTokenError, jwt.DecodeError) as exc:
    raise ValueError("Invalid or expired authentication token") from exc
```

---

### H-05: Broad exception in authentication middleware

**File:** `app.py:337`
**Pattern:** `except Exception:`

```python
try:
    from auth.jwt_handler import decode_token
    decode_token(token, expected_type="access")
except Exception:
    return JSONResponse(
        status_code=401,
        content={"detail": "Invalid or expired authentication token"},
    )
```

**Risk:** Same issue as H-04. An `ImportError` (missing auth module), `TypeError` (API change), or infrastructure failure all result in a 401 response instead of a 500, hiding real bugs.

**Recommended fix:**
```python
except (jwt.ExpiredSignatureError, jwt.InvalidTokenError, ValueError) as exc:
    return JSONResponse(status_code=401, content={"detail": str(exc)})
except ImportError:
    logger.error("auth.jwt_handler module not available")
    return JSONResponse(status_code=500, content={"detail": "Auth service unavailable"})
```

---

### H-06: Broad exception in auth service factory

**File:** `api/routes/auth.py:42`
**Pattern:** `except Exception: return None`

```python
def _get_auth_service() -> Optional[AuthService]:
    try:
        from api.dependencies import get_db_connection
        from services.auth_service import AuthService
        return AuthService(get_conn=get_db_connection)
    except Exception:
        return None
```

**Risk:** Every exception (import errors, configuration bugs, database issues) silently returns `None`, potentially disabling authentication entirely without any log entry.

**Recommended fix:**
```python
except ImportError:
    logger.info("Auth service not available (SQLite mode)")
    return None
except Exception:
    logger.error("Failed to initialize auth service", exc_info=True)
    return None
```

---

### H-07: Broad exception in SQL validator returns empty results

**File:** `backend/security/sql_validator.py:216` and `:266`
**Pattern:** `except Exception: return ["UNPARSEABLE"]` / `return []`

```python
# Line 216
try:
    parsed_statements = sqlparse.parse(sql)
except Exception:
    return ["UNPARSEABLE"]

# Line 266
try:
    parsed_statements = sqlparse.parse(sql)
except Exception:
    return []
```

**Risk:** In a SQL security validator, silently returning "UNPARSEABLE" or empty results on any exception could allow malicious SQL to bypass validation. If `sqlparse` fails for unexpected reasons (e.g., `MemoryError` on huge input), the validator should fail closed, not open.

**Recommended fix:** Log and fail closed:
```python
except Exception:
    logger.warning("SQL parse failed, treating as invalid", exc_info=True)
    return ["UNPARSEABLE"]  # Fail closed -- don't allow what we can't parse
```

---

## MEDIUM Severity Findings

### M-01: Broad exception in error handler middleware

**File:** `middleware/error_handler.py:112`
**Pattern:** `except Exception as exc:`

```python
try:
    return await call_next(request)
except Exception as exc:
    for exc_type, (status_code, code) in _EXCEPTION_MAP.items():
        if isinstance(exc, exc_type):
            ...
```

**Context:** This is the global error handler middleware. Catching `Exception` here is *intentional and correct* -- it's the last line of defense. However, the handler should ensure it never catches `BaseException` subclasses like `KeyboardInterrupt`.

**Assessment:** Acceptable pattern for a global error handler. No change needed.

---

### M-02: Broad exceptions in API route handlers (market_analytics, charts_analytics, sqlite_entities)

**Files:**
- `api/routes/market_analytics.py:117, 135, 159, 190`
- `api/routes/charts_analytics.py:47, 87, 111, 134`
- `api/routes/sqlite_entities.py:178, 206, 236`
- `api/routes/market_overview.py:192`

**Pattern:** `except Exception as exc: raise HTTPException(503)`

```python
try:
    rows = await afetchall(sql, (limit,))
except HTTPException:
    raise
except Exception as exc:
    logger.error("Error fetching movers: %s", exc)
    raise HTTPException(status_code=503, detail="Database temporarily unavailable")
```

**Assessment:** These handlers correctly re-raise `HTTPException` and convert other failures to 503. The pattern is reasonable for database-backed endpoints. However, catching `sqlite3.OperationalError` / `psycopg2.OperationalError` specifically would provide better diagnostics.

**Recommended fix:** Replace `except Exception` with specific DB exceptions:
```python
except (sqlite3.OperationalError, sqlite3.DatabaseError) as exc:
    logger.error("Database error fetching movers: %s", exc)
    raise HTTPException(status_code=503, detail="Database temporarily unavailable")
```

---

### M-03: Broad exceptions in Redis/cache layer

**Files:**
- `cache/redis_client.py:50, 67, 79, 94, 106, 117, 139`
- `cache/decorators.py:103`
- `services/cache_utils.py:137, 153, 175, 191`
- `backend/services/cache/query_cache.py:120, 134, 184, 201`

**Pattern:** `except Exception as exc: logger.debug/warning(...); return None/False`

```python
except Exception as exc:
    logger.debug("cache_get(%s) failed: %s", key, exc)
    return None
```

**Assessment:** Cache layers commonly use broad exception catches to ensure cache failures never break the main code path. This is a defensible pattern known as "cache-aside with silent degradation." However, catching `Exception` rather than `redis.RedisError` or `ConnectionError` means `TypeError`, `AttributeError`, and programming bugs will also be silently swallowed.

**Recommended fix:** Catch `(redis.RedisError, ConnectionError, OSError)` for Redis operations:
```python
except (redis.RedisError, ConnectionError, OSError) as exc:
    logger.debug("cache_get(%s) failed: %s", key, exc)
    return None
```

---

### M-04: Broad exceptions in startup/lifespan (app.py)

**Files:**
- `app.py:618, 637, 678, 696, 714, 735, 747, 756`

**Pattern:**
```python
except ImportError as exc:
    logger.warning("... not available: %s", exc)
except Exception as exc:
    logger.warning("Failed to ...: %s", exc)
```

**Assessment:** These are all in the FastAPI lifespan handler for non-critical subsystem initialization (news scheduler, quotes hub, yfinance check, Redis, connection pool). The two-tier catch pattern (`ImportError` then `Exception`) is a reasonable defensive pattern for optional subsystems. The broad `except Exception` ensures a broken optional subsystem doesn't prevent the app from starting.

**Recommended improvement:** Add `exc_info=True` to the logger calls to get full tracebacks:
```python
except Exception as exc:
    logger.warning("Failed to start news scheduler: %s", exc, exc_info=True)
```

---

### M-05: Broad exceptions in ingestion jobs

**Files:**
- `ingestion/scheduler.py:85, 163`
- `ingestion/price_loader.py:194, 291, 547`
- `ingestion/xbrl_processor.py:313, 355, 386, 647, 656`

**Pattern:** `except Exception as e: logger.error(...)`

**Assessment:** Background job schedulers commonly use broad catches to prevent one failed job from crashing the entire scheduler. This is acceptable if the errors are properly logged, which they are. Consider adding retry logic or dead-letter tracking for repeated failures.

---

### M-06: Broad exceptions in resilience layer

**Files:**
- `backend/services/resilience/circuit_breaker.py:187`
- `backend/services/resilience/degradation.py:136, 172`
- `backend/services/resilience/timeout_manager.py:195`

**Pattern:** `except Exception as exc: self._record_failure(exc); raise`

**Assessment:** The circuit breaker and degradation manager *must* catch `Exception` to record failures before re-raising. This is the correct and expected pattern for resilience infrastructure. No change needed.

---

### M-07: Broad exceptions in user/audit/news services with rollback

**Files:**
- `services/user_service.py:178, 230, 293, 337, 358, 404, 461`
- `services/audit_service.py:142`
- `services/news_service.py:133`
- `services/news_store.py:104, 152, 345`
- `services/reports_service.py:265, 289`
- `services/announcement_service.py:127`
- `services/auth_service.py:62`

**Pattern:**
```python
except Exception:
    conn.rollback()
    logger.error("Failed to ...", exc_info=True)
    raise
```

**Assessment:** These all follow the pattern of rollback-log-reraise. The broad catch ensures the transaction is rolled back before the exception propagates. This is a standard and correct pattern for database transaction management. However, `except Exception` without binding the exception variable means the `exc_info=True` in the logger call is doing the work of capturing the traceback.

**Minor improvement:** Bind the exception for clarity:
```python
except Exception as exc:
    conn.rollback()
    logger.error("Failed to ...: %s", exc, exc_info=True)
    raise
```

---

### M-08: Broad exceptions in news scraper

**Files:**
- `services/news_scraper.py:228, 389, 443, 611, 640, 1028`

**Assessment:** Web scraping code commonly uses broad exceptions because external HTML can fail in unpredictable ways. The pattern of catching `Exception` and logging is appropriate here. The date parsing fallback at line 611 (`except Exception: published_at = pub_date`) is acceptable for RSS date parsing where `email.utils.parsedate_to_datetime` may fail on malformed dates.

---

### M-09: Broad exceptions in middleware rate limiter

**Files:**
- `backend/middleware/rate_limiter.py:65, 113, 244`
- `backend/middleware/rate_limit_middleware.py:107`
- `backend/middleware/cost_controller.py:125, 183, 221, 286`

**Assessment:** Rate limiters using broad catches ensure that rate-limiting failures never block requests. This is the correct fail-open behavior for non-critical middleware. However, `cost_controller.py` should be reviewed -- cost control middleware failing silently could lead to budget overruns.

**Recommended fix for cost_controller.py:**
```python
except Exception as exc:
    logger.error("Cost controller check failed, allowing request: %s", exc, exc_info=True)
```

---

## LOW Severity Findings

### L-01: Silent swallow in connection pool cleanup

**File:** `database/pool.py:148, 155`
**Pattern:** `except Exception: pass`

```python
def close(self):
    try:
        conn.rollback()
    except Exception:
        pass  # Line 148
    try:
        pool.putconn(conn, key=key)
    except Exception:
        try:
            conn.close()
        except Exception:
            pass  # Line 155
```

**Assessment:** This is a cleanup method for returning connections to a pool. During cleanup, the priority is to avoid leaking connections. Silent swallowing during teardown is a common and generally accepted pattern. The nested try/except ensures best-effort cleanup.

**Minor improvement:** Log at DEBUG level instead of completely swallowing.

---

### L-02: Silent swallow in database manager rollback during error

**Files:** `database/manager.py:117, 140`
**Pattern:** `except Exception: pass`

```python
except Exception:
    try:
        conn.rollback()
    except Exception:
        pass  # Rollback failed, but we still re-raise the original
    raise
```

**Assessment:** Correct pattern -- if rollback itself fails during error handling, we still want to propagate the original exception. Swallowing the rollback error is acceptable.

---

### L-03: Silent swallow in lifecycle shutdown

**File:** `config/lifecycle.py:71`
**Pattern:** `except Exception: pass`

```python
for handler in logging.root.handlers:
    try:
        handler.flush()
    except Exception:
        pass
```

**Assessment:** Flushing log handlers during shutdown should never prevent shutdown from completing. This is correct.

---

### L-04: Silent swallow in SSE cleanup

**File:** `api/routes/widgets_stream.py:141`
**Pattern:** `except Exception: pass`

```python
finally:
    try:
        await asyncio.to_thread(pubsub.unsubscribe, _REDIS_CHANNEL)
        await asyncio.to_thread(pubsub.close)
    except Exception:
        pass
```

**Assessment:** Cleanup of Redis pubsub during SSE disconnect. Acceptable to swallow since the client has already disconnected.

---

### L-05: Broad exceptions in health service checks

**Files:** `services/health_service.py:129, 197, 271, 314, 404, 465, 609, 665`

**Assessment:** Health checks need to catch all exceptions to report health status rather than crashing. This is the standard pattern for health endpoints. These catches log the error and report the component as unhealthy.

---

### L-06: Broad exceptions in backend health routes

**Files:** `backend/routes/health.py:107, 131, 155`

**Assessment:** Same as L-05. Health routes must catch broadly to report status.

---

### L-07: All test file findings (42 matches in test_app_assembly.py, test_app_assembly_v2.py)

**Assessment:** Test files commonly use broad exception catches to verify that operations succeed. The pattern `except Exception as e: self.fail(f"... raised {e}")` is a standard unittest idiom. No changes needed.

---

### L-08: Script findings (smoke_test.py, validate_charts.py)

**Files:**
- `scripts/smoke_test.py:46, 102, 235`
- `scripts/validate_charts.py:121`

**Assessment:** Scripts use broad catches for resilience during smoke testing. Acceptable.

---

### L-09: Test infrastructure findings

**Files:**
- `tests/test_api_routes.py:39`
- `tests/test_services.py:41`
- `tests/conftest.py:199, 274`
- `tests/integration/test_pg_path.py:54, 259`
- `test_database.py:42`

**Assessment:** Test infrastructure commonly uses broad catches for setup/teardown. No changes needed.

---

## Findings by File (Production Code Only)

| File | `except Exception:` | `except Exception as e:` | Silent Pass | Total |
|------|---------------------|--------------------------|-------------|-------|
| `app.py` | 2 | 8 | 0 | 10 |
| `services/health_service.py` | 2 | 8 | 1 | 11 |
| `services/news_scraper.py` | 6 | 0 | 0 | 6 |
| `services/user_service.py` | 7 | 0 | 0 | 7 |
| `cache/redis_client.py` | 1 | 6 | 0 | 7 |
| `backend/services/cache/query_cache.py` | 4 | 0 | 0 | 4 |
| `services/cache_utils.py` | 4 | 0 | 0 | 4 |
| `database/pool.py` | 4 | 1 | 2 | 7 |
| `database/manager.py` | 4 | 1 | 2 | 7 |
| `api/routes/market_analytics.py` | 0 | 4 | 0 | 4 |
| `api/routes/charts_analytics.py` | 0 | 4 | 0 | 4 |
| `api/routes/sqlite_entities.py` | 0 | 3 | 0 | 3 |
| `backend/middleware/cost_controller.py` | 0 | 4 | 0 | 4 |
| `backend/middleware/rate_limiter.py` | 1 | 3 | 0 | 4 |
| `services/news_store.py` | 4 | 0 | 1 | 5 |
| `ingestion/xbrl_processor.py` | 0 | 5 | 0 | 5 |
| `ingestion/price_loader.py` | 0 | 3 | 0 | 3 |
| `ingestion/scheduler.py` | 0 | 2 | 0 | 2 |
| `middleware/error_handler.py` | 0 | 1 | 0 | 1 |
| Other production files | 11 | 26 | 1 | 38 |

---

## Recommendations Summary

### Priority 1 (Fix Now)
1. **H-04/H-05:** Narrow JWT/auth exception catches to specific JWT error types
2. **H-06:** Add logging to auth service factory fallback
3. **H-07:** Add logging to SQL validator exception paths (security-critical)

### Priority 2 (Fix Soon)
4. **H-01:** Narrow chart engine date parse catch to `(ValueError, TypeError)`
5. **H-02/H-03:** Add logging to silent-pass locations in news store and health service
6. **M-03:** Narrow Redis/cache catches to `(redis.RedisError, ConnectionError, OSError)`
7. **M-09:** Review cost_controller.py for appropriate error logging

### Priority 3 (Track for Tech Debt)
8. **M-02:** Consider narrowing API route handlers to specific DB exceptions
9. **M-04:** Add `exc_info=True` to startup lifespan warnings
10. **M-07:** Bind exception variable in rollback-log-reraise patterns
11. **L-01:** Add DEBUG logging to connection pool cleanup

---

## ast-grep Commands Used

```bash
SG=/c/Users/User/AppData/Roaming/npm/node_modules/@ast-grep/cli/sg.exe

# Bare except (0 matches)
$SG run --lang python --pattern 'try:
    pass
except:
    $$$BODY' --selector except_clause .

# except Exception: (69 matches)
$SG run --lang python --pattern 'try:
    pass
except Exception:
    $$$BODY' --selector except_clause .

# except Exception as e: (121 matches)
$SG run --lang python --pattern 'try:
    pass
except Exception as $E:
    $$$BODY' --selector except_clause .

# except Exception: pass (10 matches)
$SG run --lang python --pattern 'try:
    pass
except Exception:
    pass' --selector except_clause .
```

**Note:** ast-grep requires the `--selector except_clause` flag when matching `except` clauses because they are not standalone parse-tree nodes in Python; they exist only as children of `try_statement` nodes.
