# Deployment Checklist

Pre-deploy, deploy, and post-deploy steps for the Ra'd AI TASI Platform.

## Pre-Deploy

### Tests (all must pass)

- [ ] Python unit/integration tests: `python -m unittest discover -s tests -p "test_*.py"`
- [ ] Database integrity tests: `python test_database.py`
- [ ] Vanna assembly tests: `python test_app_assembly_v2.py`
- [ ] Frontend build: `cd frontend && npm run build`
- [ ] Frontend tests: `cd frontend && npx vitest run`

### Configuration

- [ ] `.env` exists with production values (copy from `.env.example`)
- [ ] `ANTHROPIC_API_KEY` set to valid key
- [ ] `DB_BACKEND=postgres` for production
- [ ] `POSTGRES_*` env vars configured (host, port, db, user, password)
- [ ] `AUTH_JWT_SECRET` set to a stable, random secret (not the default)
- [ ] `MW_CORS_ORIGINS` includes production domain: `https://raid-ai-app-production.up.railway.app`
- [ ] `CACHE_ENABLED=true` and `REDIS_URL` configured (if Redis is available)
- [ ] `SERVER_DEBUG=false`

### Secrets (GitHub Actions)

- [ ] `RAILWAY_TOKEN` configured in repository secrets
- [ ] `RAILWAY_PROJECT_ID` configured in repository secrets
- [ ] `DEPLOY_URL` configured in repository variables (optional, defaults to Railway URL)

### Build Artifacts

- [ ] `saudi_stocks_yahoo_data.csv` present in repo root (needed for DB initialization)
- [ ] `database/schema.sql` up to date with any schema changes
- [ ] `requirements.txt` includes all Python dependencies
- [ ] `frontend/package-lock.json` exists (needed for `npm ci` in CI)

## Deploy

### Automatic (CI/CD)

1. Push to `master` branch
2. CI pipeline runs: lint, Python tests (SQLite + PG), frontend build + test
3. On CI success, deploy pipeline triggers: Railway CLI deploys `raid-ai-app` service
4. Post-deploy health check runs automatically (5 retries, 15s intervals)

### Manual (Railway CLI)

```bash
# Ensure Railway CLI is installed and authenticated
npm install -g @railway/cli

# Deploy from local
RAILWAY_TOKEN=<token> RAILWAY_PROJECT_ID=<project-id> railway up --service raid-ai-app
```

### Manual (Docker Compose, local/staging)

```bash
# Start PostgreSQL + app
docker compose up -d

# With pgAdmin
docker compose --profile tools up -d

# First run: entrypoint.sh auto-initializes PG schema + loads CSV data
```

## Post-Deploy

### Health Checks

- [ ] Backend health: `curl https://raid-ai-app-production.up.railway.app/api/v1/health`
- [ ] TASI data pipeline: `curl https://raid-ai-app-production.up.railway.app/api/v1/charts/tasi/health`
- [ ] Stock OHLCV pipeline: `curl https://raid-ai-app-production.up.railway.app/api/v1/charts/2222/health`
- [ ] Chat endpoint responds: `curl -X POST https://raid-ai-app-production.up.railway.app/api/vanna/v2/chat_sse`

### Smoke Test

```bash
# Run the automated smoke test script
bash scripts/smoke_test.sh https://raid-ai-app-production.up.railway.app
```

### Verify Functionality

- [ ] Homepage loads at `/`
- [ ] Chat interface responds to natural language queries
- [ ] Candlestick chart shows data on `/stock/2222` (source should be "real" or "cached", not "mock")
- [ ] TASI index chart renders on `/market`
- [ ] CORS headers present for frontend origin

## Rollback

### Quick Rollback (Railway)

1. Go to Railway dashboard: https://railway.com/project/b91140a9-417a-4edc-b625-8282366860bd
2. Navigate to the `raid-ai-app` service
3. Click on the previous successful deployment
4. Click "Redeploy" to roll back to that version

### Git Rollback

```bash
# Find the last known good commit
git log --oneline -10

# Revert to previous commit (creates a new commit)
git revert HEAD
git push origin master
# CI/CD will auto-deploy the reverted state
```

### Database Rollback

- The `entrypoint.sh` script only initializes the database if the `companies` table does not exist
- Schema changes require manual migration or a fresh init
- For data-only issues: re-run `python database/csv_to_postgres.py` to reload from CSV
- For schema issues: drop and recreate with `database/schema.sql`, then reload data

## Service Dependencies

| Service | Required | Notes |
|---------|----------|-------|
| PostgreSQL 16 | Yes (production) | `database/schema.sql` for schema, `csv_to_postgres.py` for data |
| Redis 7 | Optional | Set `CACHE_ENABLED=true`; app degrades gracefully without it |
| yfinance (Yahoo Finance API) | Optional | TASI index + stock OHLCV charts; falls back to mock data |
| Anthropic API | Yes | Claude Sonnet 4.5 for natural language SQL generation |

## Endpoints (DB-agnostic, always available)

| Endpoint | Description |
|----------|-------------|
| `GET /` | Homepage (legacy template UI) |
| `GET /api/v1/charts/tasi/index` | TASI index OHLCV data |
| `GET /api/v1/charts/tasi/health` | TASI data pipeline health |
| `GET /api/v1/charts/{ticker}/ohlcv` | Per-stock OHLCV data |
| `GET /api/v1/charts/{ticker}/health` | Per-stock data pipeline health |
| `POST /api/vanna/v2/chat_sse` | Vanna chat (SSE streaming) |

## Endpoints (PostgreSQL-only)

| Endpoint | Description |
|----------|-------------|
| `GET /api/v1/health` | Full platform health check |
| `GET /api/news` | News articles |
| `GET /api/reports` | Technical reports |
| `GET /api/announcements` | CMA/Tadawul announcements |
| `GET /api/entities` | Company listings |
| `POST /api/auth/login` | JWT authentication |
