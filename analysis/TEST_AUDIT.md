# Test Coverage & Quality Audit

**Date:** 2026-02-17
**Auditor:** test-auditor (automated)
**Scope:** All test files in `tests/`, `frontend/src/`, and `frontend/e2e/`

---

## 1. Test Inventory Summary

### Backend Tests (`tests/`)

| Test File | Framework | Test Count (approx) | Scope |
|---|---|---|---|
| `conftest.py` | pytest | N/A (fixtures) | Shared fixtures: SQLite test DB, PG connections, mock Redis, JWT tokens, mock pool |
| `test_api_routes.py` | unittest | ~30 | Pydantic models, router config, endpoint registration, PG integration |
| `test_services.py` | unittest | ~30 | Data class construction, service instantiation, method signatures, health service, PG CRUD |
| `test_auth.py` | pytest | ~30 | Password hashing, JWT creation/decode, auth models, auth dependencies |
| `test_cache.py` | pytest | ~25 | Redis client init/close, cache operations, `@cached` decorator, key generation |
| `test_schemas.py` | pytest | ~35 | Pydantic schema validation for all API request/response models |
| `test_news_scraper.py` | unittest | ~25 | Scraper instantiation, article structure, relevance filtering, deduplication, HTTP errors, paraphraser |
| `test_news_store.py` | unittest | ~20 | SQLite news store: table creation, CRUD, pagination, dedup, cleanup, search |
| `test_news_feed_api.py` | unittest | ~10 | News feed HTTP endpoints via TestClient with temp SQLite DB |
| `test_tasi_index.py` | unittest | ~20 | Mock data generator, yfinance fetch, cache hit/miss/stale, thread safety, structured logging |
| `test_tasi_endpoint.py` | unittest | ~15 | TASI HTTP endpoints, response validation, health endpoint |
| `test_middleware.py` | pytest | ~12 | CORS, rate limiting, request logging, error handler middleware |
| `test_rate_limiting.py` | pytest | ~12 | Tiered rate limiting: default, auth, chart tiers, prefix matching |
| `test_connection_pool.py` | pytest | ~12 | PG pool init, get_connection, rollback on error, close_pool |
| `test_chart_engine.py` | pytest | ~15+ | RaidChartGenerator: Plotly output, chart types, styling |
| `test_ingestion.py` | pytest | ~15+ | Ticker validation, price loader, XBRL processor |
| `test_ui_enhancements.py` | pytest | ~15+ | Chart engine, CSS, JS, WCAG, HTML integration |
| `test_query_router.py` | unittest | 2 | **PLACEHOLDER ONLY** - structural tests, no real logic |
| `integration/test_auth_flow.py` | pytest | ~15 | Full JWT lifecycle: guest login, protected endpoints, token refresh, invalid tokens |
| `integration/test_health.py` | pytest | ~12 | Health/live/ready endpoints, no-auth verification, response validation |
| `integration/test_api_chain.py` | pytest | ~5+ | API chain integration (PG-dependent) |
| `integration/test_pg_path.py` | pytest | ~5+ | PostgreSQL path integration (PG-dependent) |
| `integration/test_query_flow.py` | pytest | ~5+ | Query flow integration (PG-dependent) |
| `integration/test_rate_limiting.py` | pytest | ~5+ | Rate limiting integration |
| `security/test_sql_injection.py` | pytest | ~40 | SQL injection: tautologies, UNION, stacked queries, DDL/DML, time-based, comments, encoding, file access, schema probing |
| `security/test_auth_bypass.py` | pytest | ~15 | JWT bypass: expired, malformed, missing header, wrong secret, type mismatch, algorithm confusion, missing claims |
| `performance/test_load.py` | locust | N/A | Locust load test profiles (not pytest-collected) |
| `performance/test_concurrent_queries.py` | pytest | ~5+ | Concurrent query testing |

**Estimated backend test count: ~450-500+**

### Frontend Tests

| Test File | Framework | Test Count (approx) | Scope |
|---|---|---|---|
| `components/charts/__tests__/CandlestickChart.test.tsx` | vitest | 8 | Candlestick chart: loading, error, empty, data rendering |
| `components/charts/__tests__/ChartWrapper.test.tsx` | vitest | ~5 | Chart wrapper component |
| `components/charts/__tests__/DataSourceBadge.test.tsx` | vitest | ~5 | Data source badge states |
| `lib/__tests__/news-feed.test.ts` | vitest | 5 | getNewsFeed API client + useNewsFeed hook |
| `lib/__tests__/tradingview-utils.test.ts` | vitest | ~5 | TradingView utility functions |
| `lib/__tests__/auth-types.test.ts` | vitest | ~5 | Auth type definitions |
| `lib/__tests__/auth-guards.test.tsx` | vitest | ~5 | Auth guard components |
| `lib/__tests__/auth-config.test.ts` | vitest | ~5 | Auth configuration |
| `lib/__tests__/useMarketIndex.test.ts` | vitest | ~5 | Market index hook |
| `lib/__tests__/session-manager.test.ts` | vitest | ~5 | Session management |
| `test/integration/chart-data-flow.test.tsx` | vitest | ~5 | Chart data flow integration |
| `test/integration/chart-page-integration.test.tsx` | vitest | ~5 | Chart page integration |
| `test/integration/swr-cache.test.tsx` | vitest | ~5 | SWR cache behavior |

**Estimated frontend unit/integration test count: ~70-80**

### Frontend E2E Tests (Playwright)

| Test File | Framework | Scope |
|---|---|---|
| `e2e/tests/auth.spec.ts` | Playwright | Authentication flow |
| `e2e/tests/query-flow.spec.ts` | Playwright | Query flow |
| `e2e/tests/admin.spec.ts` | Playwright | Admin panel |
| `e2e/tests/news-portal.spec.ts` | Playwright | News portal |

**Estimated E2E test count: ~20-30**

---

## 2. Route Coverage Analysis

### API Routes vs Test Coverage

| Route File | Route Prefix | Has Dedicated Test? | Coverage Level |
|---|---|---|---|
| `auth.py` | `/api/auth` | YES (`test_auth.py`, `test_auth_flow.py`, `test_auth_bypass.py`) | **Excellent** |
| `health.py` | `/health` | YES (`test_api_routes.py`, `integration/test_health.py`) | **Excellent** |
| `news.py` | `/api/news` | YES (`test_api_routes.py` - models + PG integration) | Good (PG-gated) |
| `news_feed.py` | `/api/v1/news/feed` | YES (`test_news_feed_api.py`) | **Excellent** |
| `reports.py` | `/api/reports` | YES (`test_api_routes.py` - models only) | Moderate (PG-gated) |
| `announcements.py` | `/api/announcements` | YES (`test_api_routes.py` - models only) | Moderate (PG-gated) |
| `entities.py` | `/api/entities` | YES (`test_api_routes.py` - models + PG integration) | Good (PG-gated) |
| `watchlists.py` | `/api/watchlists` | YES (`test_api_routes.py` - models only) | Low (models only) |
| `charts.py` | `/api/charts` | YES (`test_api_routes.py` - models + PG integration) | Good (PG-gated) |
| `tasi_index.py` | `/api/v1/charts/tasi` | YES (`test_tasi_endpoint.py`) | **Excellent** |
| `stock_ohlcv.py` | `/api/v1/charts/{ticker}` | NO | **MISSING** |
| `stock_data.py` | `/api/v1/stock` | NO | **MISSING** |
| `market_analytics.py` | `/api/v1/market-analytics` | NO | **MISSING** |
| `charts_analytics.py` | `/api/v1/charts-analytics` | NO | **MISSING** |
| `sqlite_entities.py` | `/api/v1/entities` | NO | **MISSING** |
| `news_stream.py` | `/api/v1/news/stream` (SSE) | NO | **MISSING** |
| `widgets_stream.py` | `/api/v1/widgets/stream` (SSE) | NO | **MISSING** |
| `market_overview.py` | `/api/v1/market-overview` | NO | **MISSING** |

**8 out of 19 route modules (42%) have NO dedicated test coverage.**

---

## 3. Service Coverage Analysis

| Service File | Has Test? | Coverage Level |
|---|---|---|
| `news_service.py` | YES (`test_services.py`) | Good (data classes + PG CRUD) |
| `reports_service.py` | YES (`test_services.py`) | Moderate (data classes, PG-gated) |
| `announcement_service.py` | YES (`test_services.py`) | Moderate (data classes, PG-gated) |
| `auth_service.py` | YES (tested via `test_auth.py`) | Good |
| `user_service.py` | YES (`test_services.py`) | Good (data classes + PG CRUD) |
| `audit_service.py` | YES (`test_services.py`) | Good (data classes + PG CRUD) |
| `health_service.py` | YES (`test_services.py`) | **Excellent** |
| `news_store.py` | YES (`test_news_store.py`) | **Excellent** |
| `news_scraper.py` | YES (`test_news_scraper.py`) | **Excellent** |
| `news_paraphraser.py` | YES (`test_news_scraper.py`) | Good |
| `news_scheduler.py` | NO | **MISSING** |
| `tasi_index.py` | YES (`test_tasi_index.py`) | **Excellent** |
| `stock_ohlcv.py` | NO | **MISSING** |
| `yfinance_base.py` | NO | **MISSING** |
| `cache_utils.py` | NO (separate from `test_cache.py` which tests Redis `cache/`) | **MISSING** |
| `db_compat.py` | NO | **MISSING** |
| `widgets/quotes_hub.py` | NO | **MISSING** |
| `widgets/providers/crypto.py` | NO | **MISSING** |
| `widgets/providers/metals.py` | NO | **MISSING** |
| `widgets/providers/oil.py` | NO | **MISSING** |
| `widgets/providers/indices.py` | NO | **MISSING** |

**11 out of 21 service modules (52%) have NO test coverage.**

---

## 4. Frontend Component Coverage

### Tested Components
- `charts/CandlestickChart` - loading, error, empty, data rendering states
- `charts/ChartWrapper` - wrapper behavior
- `charts/DataSourceBadge` - badge state rendering
- `lib/api-client` (news feed functions)
- `lib/hooks/use-api` (news feed hook)
- `lib/auth/*` - types, guards, config, session manager
- `lib/tradingview-utils` - utility functions
- `lib/hooks/useMarketIndex` - market index hook

### Untested Components (high priority)
| Component | Priority | Reason |
|---|---|---|
| `widgets/LiveMarketWidgets.tsx` | **CRITICAL** | SSE connection, reconnection logic, data rendering |
| `common/ConnectionStatusBadge.tsx` | HIGH | Real-time connection state display |
| `common/CommandPalette.tsx` | HIGH | Keyboard navigation, search, actions |
| `chat/AIChatInterface.tsx` | HIGH | Core user interaction surface |
| `chat/MessageBubble.tsx` | HIGH | Message rendering with markdown |
| `chat/SQLBlock.tsx` | MEDIUM | SQL code display |
| `chat/DataTable.tsx` | MEDIUM | Tabular data rendering |
| `layout/Header.tsx` | MEDIUM | Navigation, auth state |
| `layout/Sidebar.tsx` | MEDIUM | Navigation menu |
| `layout/AppShell.tsx` | MEDIUM | Layout coordination |
| `charts/TASIIndexChart.tsx` | MEDIUM | lightweight-charts integration |
| `charts/StockOHLCVChart.tsx` | MEDIUM | Per-stock chart |
| `charts/StockComparisonChart.tsx` | MEDIUM | Multi-stock comparison |
| `charts/PreBuiltCharts.tsx` | MEDIUM | Preconfigured chart gallery |
| `visualization/AutoChart.tsx` | MEDIUM | Auto-chart from query results |
| `visualization/QueryResultView.tsx` | MEDIUM | Result display |
| `queries/QueryHistory.tsx` | LOW | History list |
| `queries/SavedQueries.tsx` | LOW | Saved query list |
| `auth/PermissionGuard.tsx` | LOW | Permission gate |
| `auth/RoleGuard.tsx` | LOW | Role gate |
| `monitoring/ErrorBoundary.tsx` | LOW | Error boundary wrapper |
| `monitoring/ErrorFallback.tsx` | LOW | Fallback UI |
| `performance/Skeletons.tsx` | LOW | Loading skeletons |
| `common/MobileBottomNav.tsx` | LOW | Mobile navigation |

**Only ~8 out of ~60+ frontend components (13%) have test coverage.**

---

## 5. Test Quality Assessment

### Strengths

1. **Auth tests are thorough**: Password hashing (edge cases: empty, unicode), JWT creation/decode, expired/invalid/wrong-secret tokens, missing claims, algorithm confusion, deactivated accounts. Both unit and integration layers.

2. **SQL injection tests are comprehensive**: 40+ tests covering classic injection, UNION-based, stacked queries, time-based, comment obfuscation, encoding tricks, file access, schema probing. OWASP Top 10 patterns well covered.

3. **News pipeline is well tested**: End-to-end coverage from scraper instantiation through deduplication, paraphrasing, SQLite storage, and API endpoints. Includes error handling for HTTP failures.

4. **TASI index has excellent coverage**: Mock data generation, yfinance integration (success/failure/import error), cache lifecycle (fresh/stale/expired), thread safety with concurrent fetches, structured logging verification.

5. **Test isolation is good**: Most tests use `tmp_path`, `tempfile`, or mocks. PostgreSQL tests use `SAVEPOINT/ROLLBACK` for isolation. No shared mutable state between test classes.

6. **Fixtures are well-structured**: `conftest.py` provides comprehensive shared fixtures (test_db, pg_conn, mock_redis, auth_settings, auth_token, mock_pool, mock_db_conn).

### Weaknesses

1. **Weak assertions in some test classes**:
   - `test_api_routes.py:108` - `TestClassicInjection.test_tautology_or_1_equals_1`: `assert result.is_valid is True or len(result.violations) >= 0` -- the `len(...) >= 0` is ALWAYS true, making this assertion meaningless. A tautology SQL injection passes validation.
   - `test_query_router.py` - All tests are placeholders (`self.assertTrue(True)`, `self.assertIn("sql_query", expected_intents)` on a hardcoded list). No real logic tested.
   - `test_services.py` `TestServiceMethodSignatures` - Only checks `hasattr`, not actual behavior. Methods could be stubs returning None and these tests would pass.

2. **Over-mocking in auth dependency tests**: `test_auth.py:TestAuthDependencies` mocks `get_db_connection` to return fake tuples. The mock cursor returns a specific 7-tuple whose structure must match the real DB schema. If the schema changes, mocks silently return wrong data. No contract verification.

3. **Missing edge case tests**:
   - No tests for concurrent writes to `NewsStore` (only concurrent reads for TASI).
   - No tests for `news_store.py` async wrappers (`aget_latest_news`, `acount_articles`).
   - No tests for pagination boundary conditions (page=0, negative offset, limit=0, limit>total).
   - No tests for Unicode/Arabic text in query parameters (URL encoding).
   - No tests for very large result sets or memory exhaustion scenarios.

4. **Missing error path tests**:
   - No tests for database connection timeout/loss mid-query.
   - No tests for Redis connection loss after initialization.
   - No tests for malformed JSON in cache values.
   - No tests for disk full scenarios (SQLite).
   - No tests for SSE client disconnect handling.

---

## 6. Mock Correctness Assessment

### Correct Mocks
- **Mock Redis** (`conftest.py`): Implements `get`, `setex`, `delete`, `ping`, `scan` with real dict-based store. Semantically accurate.
- **Mock PG pool** (`conftest.py`): `getconn/putconn/closeall` match psycopg2 ThreadedConnectionPool API.
- **Mock yfinance** (`test_tasi_index.py`): Returns properly shaped DataFrames with realistic TASI-range values.

### Questionable Mocks
- **`mock_db_user` fixture** (multiple files): Returns a hardcoded 7-tuple `(id, email, display_name, tier, count, is_active, created_at)`. If the users table schema adds a column, tests will silently receive wrong values without failing.
- **`auth.dependencies.get_db_connection` mock**: Patches at the wrong granularity -- tests mock the entire DB connection rather than the service layer, making tests tightly coupled to implementation.
- **`requests.Session.get` mock** (`test_news_scraper.py`): Correctly mocks timeout/connection/HTTP errors but does not test the actual BeautifulSoup HTML parsing logic with realistic HTML fixtures.

---

## 7. Integration Test Assessment

### Existing Integration Tests
| Flow | Test Location | Quality |
|---|---|---|
| Auth lifecycle (guest -> token -> /me -> refresh) | `integration/test_auth_flow.py` | **Excellent** |
| Health endpoints (/health, /live, /ready) | `integration/test_health.py` | **Excellent** |
| Auth bypass (security) | `security/test_auth_bypass.py` | **Excellent** |
| SQL injection prevention | `security/test_sql_injection.py` | **Excellent** |
| API routes with PG | `test_api_routes.py:TestAPIRoutesWithTestClient` | Good (PG-gated) |
| Services with PG | `test_services.py:*PG classes` | Good (PG-gated) |
| API chain | `integration/test_api_chain.py` | PG-dependent |
| Query flow | `integration/test_query_flow.py` | PG-dependent |
| News feed API | `test_news_feed_api.py` | Good (uses temp SQLite) |

### Missing Critical Integration Tests
1. **Vanna query pipeline**: No tests for natural language -> SQL generation -> execution -> response formatting. This is the core product feature.
2. **SSE streaming**: No integration tests for `news_stream.py` or `widgets_stream.py`. Client connect, data push, disconnect, reconnection are all untested.
3. **News scraper -> store pipeline**: No end-to-end test that scrapes (even mocked HTML), paraphrases, deduplicates, stores, and retrieves via API.
4. **App assembly**: `test_app_assembly_v2.py` (mentioned in CLAUDE.md) was not found in `tests/`. The Vanna Agent assembly with all 5 components is not integration-tested.
5. **Chart engine -> API**: No test verifying that chart generation output is properly served via chart API endpoints.
6. **Market overview yfinance -> API**: No test for the market overview endpoint with mocked yfinance data.

---

## 8. Test Isolation Assessment

### Good Isolation Patterns
- SQLite tests use `tempfile.NamedTemporaryFile` with `delete=False` + manual cleanup in `tearDown`.
- PG fixtures use `SAVEPOINT/ROLLBACK` pattern for zero side effects.
- Cache tests reset global `_redis_client = None` before/after each test.
- TASI tests clear module-level `_cache.clear()` in `setUp`.
- Auth tests use `@patch("auth.jwt_handler._get_auth_settings")` for deterministic JWT secrets.

### Isolation Concerns
1. **Module-scoped fixtures mixed with test-scoped patches**: `integration/test_auth_flow.py` uses `scope="module"` for `auth_app` and `client` but `scope="function"` for `mock_auth_settings`. The module-scoped TestClient shares a single FastAPI app across all tests in the module, which could cause state leakage if any test mutates app state.
2. **`sys.path.insert(0, ...)` in every test file**: Rather than using a proper `conftest.py` or package config, each file manually inserts the project root. This is fragile and could cause import ordering issues.
3. **`test_services.py` duplicates `_pg_available()` check**: Instead of reusing the conftest fixture, it re-implements PG availability. If the connection params change, both must be updated.

---

## 9. Flaky Test Indicators

| Risk | Location | Reason |
|---|---|---|
| **Time-dependent** | `test_tasi_index.py:TestCacheStatus.test_fresh_cache` | Asserts `cache_age_seconds <= 5`. On slow CI, cache population + assertion could exceed 5s. |
| **Time-dependent** | `test_tasi_index.py:TestThreadSafety` | Concurrent thread pool operations with timing assumptions. |
| **Random-dependent** | `test_news_scraper.py:TestParaphraser.test_apply_synonyms_with_known_word` | Uses `random.seed(0)` but the assertion accepts both original and replacement (`assertTrue("ارتفع" in result or "صعد" in result)`), which masks failures. |
| **Network-dependent** | `test_services.py:TestHealthService.test_check_database_sqlite` | Calls `check_database()` which touches the real `saudi_stocks.db`. If the file doesn't exist on CI, test may produce unexpected results (but still passes due to broad assertion `assertIn(result.status, [HEALTHY, UNHEALTHY])`). |
| **Ordering** | `integration/test_auth_flow.py` | Module-scoped client means test execution order within the module matters if any test modifies shared state. |
| **Platform-dependent** | `test_news_store.py` | Uses `tempfile.NamedTemporaryFile` which behaves differently on Windows vs Linux regarding file locking. |

---

## 10. Top 10 Most Critical Untested Code Paths

| Priority | Untested Code Path | Risk | Impact |
|---|---|---|---|
| 1 | **Vanna Agent query pipeline** (`app.py` agent assembly, SQL generation, tool execution) | No test that the core AI feature works | Users cannot verify NL-to-SQL works at all |
| 2 | **SSE endpoints** (`news_stream.py`, `widgets_stream.py`) | Connection lifecycle, data push, disconnect detection | Silent failures in real-time data delivery |
| 3 | **QuotesHub orchestrator** (`services/widgets/quotes_hub.py`) | Background task, provider polling, Redis pub/sub | Live market data may stop without detection |
| 4 | **Widget providers** (`crypto.py`, `metals.py`, `oil.py`, `indices.py`) | yfinance data fetching, error handling, data formatting | Price data could be wrong or stale |
| 5 | **Stock OHLCV service + route** (`services/stock_ohlcv.py`, `api/routes/stock_ohlcv.py`) | Individual stock chart data pipeline | Per-stock charts may break silently |
| 6 | **Market overview route** (`api/routes/market_overview.py`) | 10-instrument yfinance fetch with caching | World 360 page data unreliable |
| 7 | **News scheduler** (`services/news_scheduler.py`) | Daemon thread lifecycle, error recovery, per-source tracking | News may stop updating without logging |
| 8 | **yfinance base** (`services/yfinance_base.py`) | Shared cache + circuit breaker used by TASI, OHLCV, and market overview | Cache corruption or circuit breaker mis-state affects multiple services |
| 9 | **SQLite entities route** (`api/routes/sqlite_entities.py`) | Entity search on SQLite backend (default deployment) | Company search broken for all non-PG users |
| 10 | **`@cache_response` decorator** (`services/cache_utils.py`) | LRU + TTL caching used by market_overview and potentially others | Cache miss/expiry logic errors cause stale or missing data |

---

## 11. Test Infrastructure Assessment

### conftest.py Quality: **Good**

- Provides 8 well-documented fixtures covering all test dependency types.
- Uses `tmp_path` for SQLite, `scope="session"` for PG connections.
- Mock Redis implements real dict-backed operations.
- Auth fixtures generate deterministic JWTs.
- PG availability check is clean with connection timeout.

### Missing Infrastructure

1. **No pytest markers configured**: Tests use `@pytest.mark.integration` but there is no `pytest.ini` or `pyproject.toml` marker configuration. Running `pytest -m integration` would emit warnings.
2. **No coverage configuration**: No `.coveragerc`, `pyproject.toml [tool.coverage]`, or `tox.ini` coverage config. Cannot generate coverage reports.
3. **No test fixtures for SSE**: No helpers for testing Server-Sent Events (e.g., async SSE client, event parser).
4. **No factory fixtures**: Tests build test data manually in each test class. A `factory_boy` or simple factory pattern would reduce duplication.
5. **No snapshot testing**: Frontend chart output, API response shapes, and Plotly JSON are not snapshot-tested.
6. **Duplicate `_pg_available()` function**: Implemented in `conftest.py`, `test_api_routes.py`, and `test_services.py`. Should be centralized.

---

## 12. Recommendations

### Immediate (Critical Gaps)

1. **Add Vanna agent integration tests**: Test the full NL -> SQL -> data -> response pipeline with a temp SQLite DB and mocked LLM. This is the core product feature with zero test coverage.

2. **Add SSE endpoint tests**: Use `httpx` AsyncClient or `starlette.testclient` with async support to test `news_stream.py` and `widgets_stream.py`. Cover: initial connection, data delivery, client disconnect, reconnection.

3. **Add stock OHLCV tests**: Mirror the pattern from `test_tasi_index.py` and `test_tasi_endpoint.py` to cover `stock_ohlcv.py` service and route.

4. **Add QuotesHub tests**: Test provider polling, data aggregation, error handling when individual providers fail.

### Short-term (Important Gaps)

5. **Fix meaningless assertion**: `test_sql_injection.py:test_tautology_or_1_equals_1` should assert `result.is_valid is False` for tautology injection, or document why tautologies are accepted.

6. **Remove placeholder tests**: `test_query_router.py` contains only structural assertions on hardcoded lists. Either implement real tests or delete the file.

7. **Add `@cache_response` tests**: The unified LRU+TTL decorator in `services/cache_utils.py` is used across routes but has no tests. Test TTL expiry, max_size eviction, concurrent access.

8. **Add news scheduler tests**: Test daemon thread lifecycle, per-source error counting, scheduling interval behavior.

9. **Add SQLite entities route tests**: Test company search, sector filtering, pagination on the SQLite backend.

10. **Add market overview tests**: Test yfinance data fetching for 10 instruments with mocked responses.

### Long-term (Quality Improvements)

11. **Configure pytest markers**: Add `[tool.pytest.ini_options]` to `pyproject.toml` with `markers = ["integration", "security", "performance"]`.

12. **Add coverage reporting**: Configure `pytest-cov` and set a coverage threshold (target: 80%+).

13. **Centralize `_pg_available()`**: Remove duplicate implementations from test files; use the conftest fixture.

14. **Add contract tests for mocks**: Verify that mock DB return tuples match the actual schema by comparing against a schema fixture.

15. **Add frontend component tests**: Priority: `LiveMarketWidgets`, `AIChatInterface`, `ConnectionStatusBadge`, `CommandPalette`.

---

## 13. Overall Assessment

| Dimension | Score | Notes |
|---|---|---|
| **Backend route coverage** | 58% (11/19) | 8 routes completely untested |
| **Backend service coverage** | 48% (10/21) | Widgets, OHLCV, scheduler, yfinance_base missing |
| **Frontend component coverage** | 13% (~8/60+) | Most components have zero tests |
| **Test quality (assertions)** | B+ | Most tests have specific assertions; 2 weak spots |
| **Test isolation** | A- | Good use of temp DBs, mocks, savepoints |
| **Mock correctness** | B | Generally accurate; some schema-coupling risks |
| **Integration test coverage** | B- | Auth and health excellent; core features (Vanna, SSE) missing |
| **Security test coverage** | A | SQL injection + auth bypass comprehensive |
| **Infrastructure** | B- | Good fixtures; missing coverage config, markers |
| **Overall** | **B-** | Strong in auth/security, but core product features (Vanna pipeline, SSE, widgets) have major gaps |

The test suite is well-structured with good isolation practices and excellent security coverage. However, the most critical product features -- the Vanna AI query pipeline, SSE real-time data streams, and market widget providers -- have NO test coverage. This represents significant risk: the core user-facing functionality could break without any test detecting it.
