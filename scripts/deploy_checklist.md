# Ra'd AI TASI Platform - Deployment Checklist

## Target: Railway (raid-ai-tasi project)

---

## Pre-Deploy Checklist

### Environment Variables (Railway Dashboard)
- [ ] `DB_BACKEND=postgres`
- [ ] `POSTGRES_HOST` set (use `postgres.railway.internal` for Railway PG)
- [ ] `POSTGRES_PORT` set (default: 5432)
- [ ] `POSTGRES_DB` set
- [ ] `POSTGRES_USER` set
- [ ] `POSTGRES_PASSWORD` set (strong password)
- [ ] `ANTHROPIC_API_KEY` or `GEMINI_API_KEY` set
- [ ] `AUTH_JWT_SECRET` set to a stable value (generate: `python -c "import secrets; print(secrets.token_urlsafe(32))"`)
- [ ] `ENVIRONMENT=production`
- [ ] `MW_CORS_ORIGINS` includes production frontend URL

### Code Checks
- [ ] All CI checks pass on master branch
- [ ] `ruff check .` and `ruff format --check .` pass locally
- [ ] `python -m pytest tests/ -v` passes (SQLite tests)
- [ ] No secrets committed (check `.env` is in `.gitignore`)
- [ ] `railway.toml` health check path matches actual route (`/health`)

### Database
- [ ] PostgreSQL schema is up to date (`database/schema.sql`)
- [ ] Migration script tested if schema changed
- [ ] Backup of production database taken before deploy

---

## Deploy Steps

1. Push to `master` branch (triggers CI via GitHub Actions)
2. Wait for CI workflow to complete successfully
3. Deploy workflow triggers automatically on CI success
4. Monitor Railway deployment logs for errors
5. Verify health check passes: `curl https://<DEPLOY_URL>/health`
6. Verify readiness: `curl https://<DEPLOY_URL>/health/ready`
7. Test chat endpoint: `curl https://<DEPLOY_URL>/api/vanna/v2/chat_sse`

---

## Post-Deploy Verification

- [ ] `/health` returns `{"status": "healthy", ...}` with HTTP 200
- [ ] `/health/ready` returns `{"status": "ready"}` with HTTP 200
- [ ] Frontend loads correctly at deployment URL
- [ ] Chat SSE endpoint responds
- [ ] News feed API returns data: `/api/v1/news/feed`
- [ ] TASI index API returns data: `/api/v1/charts/tasi/index`

---

## Rollback Procedure

If the deployment is unhealthy:

1. **Immediate**: In Railway Dashboard, click "Rollback" on the failed deployment
   - Railway keeps previous deployments; rolling back restores the last working image

2. **Manual rollback via CLI**:
   ```bash
   # List recent deployments
   railway logs --last 50

   # Redeploy previous commit
   git revert HEAD
   git push origin master
   ```

3. **Database rollback** (if schema migration was applied):
   - Restore from the pre-deploy backup
   - Or manually revert schema changes using `psql`

4. **Verify rollback**:
   ```bash
   curl -s https://<DEPLOY_URL>/health | python -m json.tool
   ```

---

## Monitoring

- Railway Dashboard: deployment logs, metrics, resource usage
- Health endpoint: `/health` (full report), `/health/live` (liveness), `/health/ready` (readiness)
- Application logs: structured JSON in production (via `config/logging_config.py`)
