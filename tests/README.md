# Test Suite Documentation

## Test Taxonomy

Tests are organized into tiers using pytest markers defined in `pyproject.toml`.

### Markers

| Marker          | Description                                      | CI: PRs | CI: main |
|-----------------|--------------------------------------------------|---------|----------|
| `fast`          | Unit tests, no external deps, < 1s each          | Yes     | Yes      |
| `slow`          | Slower tests (network mocks, heavy computation)   | No      | Yes      |
| `integration`   | Multi-component integration tests                 | No      | Yes      |
| `pg_required`   | Requires running PostgreSQL instance              | No      | Yes*     |

*PG tests only run on main if `POSTGRES_HOST` is set in the CI environment.

### Running by Marker

```bash
# Fast tests only (PR gate)
python -m pytest -m "fast" tests/

# All non-PG tests
python -m pytest -m "not pg_required" tests/

# Integration tests only
python -m pytest -m "integration" tests/integration/

# Full suite including PG (requires POSTGRES_HOST)
python -m pytest tests/ test_database.py test_app_assembly_v2.py

# Everything except slow
python -m pytest -m "not slow" tests/
```

## Directory Structure

```
tests/
  conftest.py                    # Shared fixtures (test DB, mock Redis, JWT tokens)
  test_auth.py                   # Auth module unit tests (JWT, passwords, models)
  test_api_routes.py             # API route unit + PG integration tests
  test_tasi_endpoint.py          # TASI index endpoint tests
  test_tasi_index.py             # TASI index service unit tests
  test_schemas.py                # Pydantic schema validation
  test_services.py               # Service layer unit tests
  test_cache.py                  # Redis cache tests (mocked)
  test_chart_engine.py           # Chart generation tests
  test_middleware.py              # Middleware unit tests
  test_connection_pool.py        # Connection pool tests
  test_ingestion.py              # Data ingestion tests
  test_query_router.py           # Query routing tests
  test_ui_enhancements.py        # UI-related tests
  test_news_feed_api.py          # News feed API tests
  test_news_scraper.py           # News scraper tests
  test_news_store.py             # News store tests
  integration/
    __init__.py
    test_api_chain.py            # Backend API chain integration tests
    test_auth_flow.py            # Full auth lifecycle tests
    test_pg_path.py              # PostgreSQL path tests (pg_required)
  COVERAGE_BASELINE.md           # Coverage tracking document
  README.md                      # This file

test_database.py                 # Database integrity tests (root level)
test_app_assembly_v2.py          # Vanna agent assembly tests (root level)
```

## CI Configuration

### Pull Request Checks (fast gate)

```yaml
# Run on every PR - must pass to merge
python -m pytest -m "not slow and not integration and not pg_required" tests/
```

### Main Branch (full suite)

```yaml
# Run on merge to main - full validation
python -m pytest tests/ test_database.py test_app_assembly_v2.py
```

### PostgreSQL Tests

PG tests are skipped automatically when `POSTGRES_HOST` is not set. To run locally:

```bash
export POSTGRES_HOST=localhost
export POSTGRES_PORT=5432
export POSTGRES_DB=tasi_platform
export POSTGRES_USER=tasi_user
export POSTGRES_PASSWORD=your_password
python -m pytest -m "pg_required" tests/integration/test_pg_path.py
```

## Writing New Tests

1. Place unit tests in `tests/test_<module>.py`
2. Place integration tests in `tests/integration/test_<feature>.py`
3. Mark tests appropriately:
   - `@pytest.mark.fast` for quick unit tests
   - `@pytest.mark.integration` for multi-component tests
   - `@pytest.mark.slow` for tests > 5 seconds
   - `@pytest.mark.pg_required` for PostgreSQL-dependent tests
4. Use fixtures from `conftest.py` (test_db, mock_redis, auth_token, etc.)
5. Follow existing naming conventions: `test_<action>_<expected_result>`

## Coverage

See `COVERAGE_BASELINE.md` for current coverage percentages and goals.

Generate a coverage report:

```bash
./scripts/coverage_report.sh          # terminal report
./scripts/coverage_report.sh --html   # HTML report in htmlcov/
```
