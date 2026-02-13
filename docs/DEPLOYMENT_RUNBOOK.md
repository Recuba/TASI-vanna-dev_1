# Deployment Runbook

Step-by-step procedures for deploying, validating, monitoring, and rolling back the Ra'd AI TASI Platform.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [First Deployment (Railway)](#first-deployment-railway)
3. [Environment Configuration](#environment-configuration)
4. [PostgreSQL Setup on Railway](#postgresql-setup-on-railway)
5. [CI/CD Automatic Deployment](#cicd-automatic-deployment)
6. [Manual Deployment](#manual-deployment)
7. [Post-Deploy Validation](#post-deploy-validation)
8. [Monitoring Setup](#monitoring-setup)
9. [Rollback Procedure](#rollback-procedure)
10. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Accounts and Access

- GitHub repository access (push to `master`)
- Railway account with project access
- Railway CLI installed: `npm install -g @railway/cli`
- Anthropic or Gemini API key for LLM service

### Local Tools

```bash
# Verify Railway CLI
railway version

# Verify Docker (for local testing)
docker --version
docker compose version

# Verify Python environment
python --version   # 3.11+
pip install -r requirements.txt
```

### Repository Secrets (GitHub Actions)

Configure these in GitHub repository Settings > Secrets and Variables > Actions:

| Secret | Required | Description |
|--------|----------|-------------|
| `RAILWAY_TOKEN` | Yes | Railway API token for deployment |
| `RAILWAY_PROJECT_ID` | Yes | Railway project ID |

| Variable | Required | Description |
|----------|----------|-------------|
| `DEPLOY_URL` | No | Deployment URL (defaults to `https://raid-ai-app-production.up.railway.app`) |

---

## First Deployment (Railway)

### Option A: Railway Dashboard

1. Log in to [Railway](https://railway.com)
2. Create a new project or select the existing `raid-ai-tasi` project
3. Add a **PostgreSQL** service (see [PostgreSQL Setup](#postgresql-setup-on-railway))
4. Add a service from GitHub:
   - Connect the repository
   - Railway auto-detects `Dockerfile` and `railway.toml`
5. Configure environment variables (see [Environment Configuration](#environment-configuration))
6. Deploy triggers automatically on push to `master`

### Option B: Railway CLI

```bash
# Authenticate
railway login

# Link to project (interactive)
railway link

# Deploy
railway up --service raid-ai-app

# Check deployment status
railway status
```

### What Happens on First Deploy

1. Docker image builds from `Dockerfile` (multi-stage: builder + runtime)
2. `entrypoint.sh` runs:
   - Checks if `companies` table exists in PostgreSQL
   - If not: runs `database/schema.sql` to create tables, then `csv_to_postgres.py` to load data
3. Uvicorn starts on `$PORT` (Railway assigns this automatically)
4. Health check validates at `/health`

---

## Environment Configuration

### Required Variables (Production)

Set these in Railway service variables:

```bash
# Database
DB_BACKEND=postgres
POSTGRES_HOST=<railway-pg-host>       # e.g., postgres.railway.internal
POSTGRES_PORT=5432
POSTGRES_DB=raid_ai
POSTGRES_USER=raid
POSTGRES_PASSWORD=<strong-password>

# LLM (one of these)
GEMINI_API_KEY=<your-gemini-key>      # Preferred
# or
ANTHROPIC_API_KEY=<your-anthropic-key>

# Authentication
AUTH_JWT_SECRET=<stable-random-secret>
# Generate: python -c "import secrets; print(secrets.token_urlsafe(32))"

# Server
SERVER_DEBUG=false
ENVIRONMENT=production

# CORS (include your frontend domains)
MW_CORS_ORIGINS=http://localhost:3000,https://raid-ai-app-production.up.railway.app,https://frontend-two-nu-83.vercel.app
```

### Optional Variables

```bash
# Logging
LOG_LEVEL=INFO                        # DEBUG, INFO, WARNING, ERROR

# Connection pool
PG_POOL_MIN=2
PG_POOL_MAX=10

# Rate limiting
MW_RATE_LIMIT_PER_MINUTE=60

# Cache (if Redis available)
CACHE_ENABLED=false
REDIS_URL=redis://localhost:6379/0

# Error tracking
ERROR_TRACKER=log                     # "log" (default) or "sentry"
SENTRY_DSN=                           # Required if ERROR_TRACKER=sentry
```

### Variable Validation

Run the config validation script locally before deploying:

```bash
python scripts/validate_config.py
```

---

## PostgreSQL Setup on Railway

### Add PostgreSQL Plugin

1. In Railway project dashboard, click **+ New** > **Database** > **PostgreSQL**
2. Railway provisions a PostgreSQL 16 instance
3. Note the internal connection variables:
   - `POSTGRES_HOST` = `postgres.railway.internal` (internal networking)
   - `POSTGRES_PORT` = `5432`
   - `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` (auto-generated)

### Link to App Service

Railway automatically exposes database variables to linked services. Ensure:
- The app service references the PostgreSQL service
- `DB_BACKEND=postgres` is set in app service variables

### Schema Initialization

Schema is auto-initialized by `entrypoint.sh` on first boot. To manually reinitialize:

```bash
# Via Railway CLI (connects to PG)
railway run psql -f database/schema.sql

# Reload data
railway run python database/csv_to_postgres.py --csv-path saudi_stocks_yahoo_data.csv
```

### Verify Database

```bash
# Connect to Railway PG
railway run psql

# Check tables exist
\dt

# Verify data
SELECT COUNT(*) FROM companies;
-- Expected: ~500 rows
```

---

## CI/CD Automatic Deployment

The project uses a two-workflow CI/CD pipeline:

### Workflow 1: CI (`.github/workflows/ci.yml`)

Triggered on: push to `master`, pull requests

Steps:
1. Lint (ruff)
2. Python tests (SQLite + PostgreSQL)
3. Frontend build + Vitest

### Workflow 2: Deploy (`.github/workflows/deploy.yml`)

Triggered on: CI workflow completes successfully on `master`

Steps:
1. Installs Railway CLI
2. Deploys to Railway (`railway up --service raid-ai-app`)
3. Waits 30s for stabilization
4. Runs health check (5 retries, 15s intervals)

### Deploy Flow

```
Push to master -> CI runs -> CI passes -> Deploy triggers -> Railway builds -> Health check
```

If CI fails, deployment does **not** proceed.

---

## Manual Deployment

### When to Use

- Hotfix that needs immediate deployment
- CI is broken but change is verified locally
- Testing a specific commit on Railway

### Steps

```bash
# 1. Ensure you're on the correct commit
git log --oneline -3

# 2. Run tests locally first
python -m pytest tests/ -x -q
python test_database.py
python test_app_assembly_v2.py

# 3. Deploy via Railway CLI
export RAILWAY_TOKEN=<your-token>
export RAILWAY_PROJECT_ID=<your-project-id>
railway up --service raid-ai-app

# 4. Monitor deployment logs
railway logs --follow

# 5. Run post-deploy validation
bash scripts/smoke_test.sh https://raid-ai-app-production.up.railway.app
```

---

## Post-Deploy Validation

### Automated Smoke Test

```bash
bash scripts/smoke_test.sh https://raid-ai-app-production.up.railway.app
```

### Manual Health Checks

```bash
BASE_URL="https://raid-ai-app-production.up.railway.app"

# 1. Basic health
curl -s "$BASE_URL/health" | python -m json.tool

# 2. Full platform health (PG-only)
curl -s "$BASE_URL/api/v1/health" | python -m json.tool

# 3. TASI data pipeline
curl -s "$BASE_URL/api/v1/charts/tasi/health" | python -m json.tool

# 4. Stock OHLCV pipeline
curl -s "$BASE_URL/api/v1/charts/2222/health" | python -m json.tool

# 5. Chat endpoint (SSE)
curl -s -X POST "$BASE_URL/api/vanna/v2/chat_sse" \
  -H "Content-Type: application/json" \
  -d '{"message": "كم عدد الشركات المدرجة؟"}' \
  --max-time 30
```

### Verification Checklist

- [ ] `/health` returns 200
- [ ] Homepage loads at `/`
- [ ] Chat responds to a test query
- [ ] TASI chart data endpoint returns data
- [ ] CORS headers present for configured origins
- [ ] Logs show JSON format (not dev-mode pretty)
- [ ] No ERROR level entries in startup logs

---

## Monitoring Setup

### Railway Built-in

Railway provides:
- **Deploy logs**: Real-time log streaming (structured JSON logs auto-parsed)
- **Metrics**: CPU, memory, network per service
- **Health checks**: Configured in `railway.toml` at `/health`

### Log Monitoring

```bash
# Tail live logs
railway logs --follow

# Filter errors
railway logs --follow | grep '"level":"ERROR"'

# Check last hour
railway logs --since 1h
```

### Uptime Monitoring (Recommended)

Set up an external uptime monitor (Betterstack, UptimeRobot, or similar):
- Monitor URL: `https://raid-ai-app-production.up.railway.app/health`
- Check interval: 3 minutes
- Alert on: 3 consecutive failures
- Alert channels: Email, Slack, or webhook

### Error Tracking

The platform uses `config/error_tracking.py` with structured logging by default. To enable Sentry:

1. `pip install sentry-sdk[fastapi]` (add to `requirements.txt`)
2. Set `ERROR_TRACKER=sentry` and `SENTRY_DSN=<your-dsn>` in Railway variables
3. Uncomment `SentryErrorTracker` class in `config/error_tracking.py`

See [Metrics and Monitoring](./METRICS_AND_MONITORING.md) for detailed metric definitions and dashboard layout.

---

## Rollback Procedure

### Quick Rollback (Railway Dashboard)

1. Go to Railway dashboard: [raid-ai-tasi project](https://railway.com)
2. Navigate to `raid-ai-app` service > Deployments
3. Find the last successful deployment
4. Click **Redeploy** on that deployment

### Git Rollback (Triggers CI/CD)

```bash
# Option 1: Revert the bad commit (creates a new commit)
git revert HEAD
git push origin master
# CI runs -> deploys reverted state

# Option 2: Revert multiple commits
git revert HEAD~3..HEAD --no-commit
git commit -m "Revert: roll back last 3 commits due to <reason>"
git push origin master
```

### Database Rollback

The database is **not** automatically rolled back with application rollbacks.

- **Data-only issues**: Re-run `python database/csv_to_postgres.py` to reload from CSV
- **Schema issues**: Drop and recreate with `database/schema.sql`, then reload data
- **Partial migrations**: Restore from Railway's automatic PostgreSQL backups (if enabled)

```bash
# Re-initialize schema (destructive - drops all tables)
railway run psql -f database/schema.sql

# Reload data
railway run python database/csv_to_postgres.py --csv-path saudi_stocks_yahoo_data.csv
```

---

## Troubleshooting

### Build Failures

| Symptom | Cause | Fix |
|---------|-------|-----|
| `pip install` fails | Missing system dependency | Check `Dockerfile` `apt-get install` stage |
| `psycopg2` build error | Missing `libpq-dev` | Verify builder stage has `gcc libpq-dev` |
| Docker build timeout | Large dependencies | Check Railway build timeout settings |

### Startup Failures

| Symptom | Cause | Fix |
|---------|-------|-----|
| `NEED_INIT` loop | PG connection failed | Verify `POSTGRES_*` env vars, check PG is running |
| `ModuleNotFoundError` | Missing dependency | Run `pip install -r requirements.txt`, rebuild Docker |
| Port bind error | `$PORT` conflict | Railway sets `PORT` automatically; do not hardcode |
| `AUTH_JWT_SECRET` warning | Secret not configured | Set `AUTH_JWT_SECRET` in Railway variables |

### Runtime Errors

| Symptom | Cause | Fix |
|---------|-------|-----|
| 502 Bad Gateway | App crashed or slow startup | Check `railway logs`, increase health check timeout |
| 500 on chat | LLM API key invalid/missing | Verify `GEMINI_API_KEY` or `ANTHROPIC_API_KEY` |
| Empty chart data | yfinance blocked/down | Check circuit breaker state; yfinance is optional |
| CORS errors | Origin not in allowlist | Add domain to `MW_CORS_ORIGINS` |
| Rate limit (429) | Too many requests | Adjust `MW_RATE_LIMIT_PER_MINUTE` or check for abuse |

### Database Issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| `connection refused` | PG not running | Check Railway PG service status |
| `pool exhausted` | Too many concurrent queries | Increase `PG_POOL_MAX` |
| `relation does not exist` | Schema not initialized | Run `database/schema.sql` manually |
| Stale data | CSV not reloaded after update | Re-run `csv_to_postgres.py` |

### Useful Diagnostic Commands

```bash
# Check app environment
railway run env | sort

# Test database connectivity
railway run python -c "
import psycopg2, os
conn = psycopg2.connect(
    host=os.environ['POSTGRES_HOST'],
    port=os.environ['POSTGRES_PORT'],
    dbname=os.environ['POSTGRES_DB'],
    user=os.environ['POSTGRES_USER'],
    password=os.environ['POSTGRES_PASSWORD']
)
cur = conn.cursor()
cur.execute('SELECT COUNT(*) FROM companies')
print('Companies:', cur.fetchone()[0])
conn.close()
"

# Check Railway service status
railway status
```

---

## Related Documents

- [Deployment Checklist](./DEPLOYMENT_CHECKLIST.md) - Quick pre/post deploy checklist
- [Metrics and Monitoring](./METRICS_AND_MONITORING.md) - Metrics definitions and dashboards
- [Architecture](./ARCHITECTURE.md) - System architecture overview
