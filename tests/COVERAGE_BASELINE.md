# Test Coverage Baseline

Baseline coverage percentages for the Ra'd AI Platform as of 2026-02-13.
**Updated 2026-02-24**: Backend test count grew from 496 to 1477 (coverage sprint added xbrl_processor, price_loader, stock_ohlcv, redis_client, scheduler tests). Frontend vitest suite now at 231 tests (20 files).

## Backend (Python) -- Module Coverage

| Module            | Coverage | Notes                                    |
|-------------------|----------|------------------------------------------|
| `auth/`           | ~85%     | JWT, password, models, dependencies      |
| `api/routes/`     | ~65%     | Route handlers; PG routes need PG to test|
| `config/`         | ~70%     | Settings, logging                        |
| `services/`       | ~60%     | TASI index, health, news covered         |
| `middleware/`     | ~55%     | Rate limit, CORS, error handler, logging |
| `chart_engine/`   | ~45%     | RaidChartGenerator needs Plotly mocks    |
| `database/`       | ~30%     | Pool, migrations mostly PG-dependent     |
| `cache/`          | ~40%     | Redis client mocked                      |
| `models/`         | ~50%     | Pydantic models                          |

## Frontend (TypeScript)

| Area              | Coverage | Notes                                    |
|-------------------|----------|------------------------------------------|
| `components/`     | ~40%     | Layout, chart components                 |
| `lib/`            | ~50%     | API client, utils                        |
| `app/`            | ~30%     | Page-level tests limited                 |

## Test Summary

| Suite                        | Tests  | Pass | Skip | Fail | Notes                                        |
|------------------------------|--------|------|------|------|----------------------------------------------|
| `tests/` (backend total)     | 1477   | 1477 | 9    | 0    | As of 2026-02-24; includes coverage sprint   |
| Frontend vitest              | 231    | 231  | 0    | 0    | 20 test files                                |
| **Total**                    | **1708** | **1708** | **9** | **0** |                                    |

### Historical Baseline (2026-02-13, pre-coverage-sprint)

| Suite                        | Tests | Pass | Skip | Fail |
|------------------------------|-------|------|------|------|
| `tests/` (unit)              | 496   | 496  | 18   | 0    |
| `test_database.py`           | 69    | 46   | 23   | 0    |
| `test_app_assembly_v2.py`    | ~24   | ~24  | var  | 0    |
| `tests/integration/`         | ~40   | var  | var  | 0    |
| Frontend vitest              | var   | var  | 0    | 0    |

## How to Generate Updated Coverage

```bash
# Full backend coverage report
./scripts/coverage_report.sh

# With HTML report
./scripts/coverage_report.sh --html

# Fast tests only (skip slow/integration)
./scripts/coverage_report.sh --fast

# Manual pytest with coverage
python -m pytest --cov=api --cov=auth --cov=services --cov-report=term-missing tests/

# Frontend coverage
cd frontend && npx vitest run --coverage
```

## Coverage Goals

- **Minimum for merge**: No regression from baseline
- **Target**: 70% overall backend coverage
- **Critical paths** (auth, TASI API): 85%+ coverage
