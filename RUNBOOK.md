# RUNBOOK.md

> Operational runbook for the Ra'd AI TASI Platform.
> Last updated: 2026-02-13

---

## Table of Contents

1. [Incident Response Playbooks](#incident-response-playbooks)
   - [Database Outage](#database-outage)
   - [Rate Limiting / DDoS](#rate-limiting--ddos)
   - [Circuit Breaker Tripped](#circuit-breaker-tripped)
   - [High Error Rate](#high-error-rate)
   - [Security Breach](#security-breach)
2. [Common Operations Tasks](#common-operations-tasks)
3. [Monitoring Checklist](#monitoring-checklist)

---

## Incident Response Playbooks

### Database Outage

**Symptoms:**
- `/health/ready` returns 503 `{"status": "not_ready", "reason": "..."}`
- `/health` shows database component as `unhealthy`
- Application logs: connection errors, timeout errors from `psycopg2`
- Circuit breaker for `database` transitions to OPEN state

**Diagnosis:**

1. Check health endpoint:
   ```bash
   curl -s http://localhost:8084/health | python -m json.tool
   ```
   Look at the `database` component status and message.

2. Check PostgreSQL connectivity:
   ```bash
   # Docker
   docker compose exec postgres pg_isready -U raid -d raid_ai

   # Railway
   railway run psql -c "SELECT 1"
   ```

3. Check connection pool status:
   ```bash
   # Check active connections in PostgreSQL
   psql -c "SELECT count(*), state FROM pg_stat_activity WHERE datname='raid_ai' GROUP BY state;"
   ```

4. Check for long-running queries:
   ```bash
   psql -c "SELECT pid, now() - pg_stat_activity.query_start AS duration, query
            FROM pg_stat_activity
            WHERE state != 'idle' AND query_start IS NOT NULL
            ORDER BY duration DESC LIMIT 10;"
   ```

**Resolution:**

| Cause | Action |
|---|---|
| PostgreSQL process down | `docker compose restart postgres` or Railway redeploy |
| Max connections reached | Increase `PG_POOL_MAX` or kill idle connections: `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = 'idle' AND query_start < NOW() - INTERVAL '10 minutes';` |
| Stuck query blocking pool | Cancel it: `SELECT pg_cancel_backend(<pid>);` or terminate: `SELECT pg_terminate_backend(<pid>);` |
| Disk full | Check `df -h` on the database host; clean WAL segments or extend storage |
| SQLite file locked (dev) | Restart the app; check for stale `.db-journal` files |

**Recovery verification:**
```bash
curl -s http://localhost:8084/health/ready
# Expected: {"status": "ready"}
```

---

### Rate Limiting / DDoS

**Symptoms:**
- Spike in 429 responses in logs
- Legitimate users receiving `RATE_LIMITED` errors
- High request volume from single IPs
- Security events with `event_type = "rate_limit_exceeded"`

**Diagnosis:**

1. Check rate limit logs:
   ```bash
   # JSON logs - filter for rate limit events
   grep '"RATE_LIMITED"' /var/log/raid-ai/app.log | tail -20

   # Or search structured logs
   grep '"rate_limit_exceeded"' /var/log/raid-ai/app.log | tail -20
   ```

2. Identify top offending IPs (if using Redis):
   ```bash
   # List all rate limit keys in Redis db=1
   redis-cli -n 1 KEYS "rl:*" | head -20

   # Check a specific key's entry count
   redis-cli -n 1 ZCARD "rl:_default:10.0.0.1"
   ```

3. Check current rate limit configuration:
   ```bash
   # Environment variables
   echo "RATELIMIT_ENABLED=$RATELIMIT_ENABLED"
   echo "RATELIMIT_DEFAULT_LIMIT=$RATELIMIT_DEFAULT_LIMIT"
   echo "MW_RATE_LIMIT_PER_MINUTE=$MW_RATE_LIMIT_PER_MINUTE"
   ```

**Resolution:**

| Scenario | Action |
|---|---|
| Legitimate traffic spike | Temporarily increase limits: `RATELIMIT_DEFAULT_LIMIT=120` and restart |
| Single IP abuse | Block at the load balancer/CDN level (Railway, Cloudflare, etc.) |
| DDoS attack | Enable upstream WAF/DDoS protection; rate limiter provides application-layer defense only |
| Redis failure | Rate limiter auto-falls back to in-memory; may cause per-instance (not global) limiting |
| False positives | Check if `/health` endpoints are excluded from rate limiting; adjust `skip_paths` |

**Temporary limit override (requires restart):**
```bash
# Double the default limit temporarily
export RATELIMIT_DEFAULT_LIMIT=120
export MW_RATE_LIMIT_PER_MINUTE=120
# Restart the application
```

---

### Circuit Breaker Tripped

**Symptoms:**
- Logs: `Circuit breaker '<name>' state transition: closed -> open`
- Health endpoint shows degraded status for dependent services
- Client errors with `CircuitBreakerOpen` exceptions (503 responses)
- Affected services: `database`, `llm`, `yfinance` (TASI index)

**Diagnosis:**

1. Check circuit breaker states via health endpoint:
   ```bash
   curl -s http://localhost:8084/health | python -m json.tool
   ```
   Look for components with `status: "degraded"` and messages containing `circuit_breaker=open`.

2. Check circuit breaker logs:
   ```bash
   grep "Circuit breaker" /var/log/raid-ai/app.log | tail -20
   ```

3. Understand the circuit breaker parameters:
   - `failure_threshold`: Consecutive failures before opening (default: 5)
   - `recovery_timeout`: Seconds in OPEN state before trying HALF_OPEN (default: 30s)
   - `success_threshold`: Consecutive successes in HALF_OPEN to close (default: 2)

**Resolution:**

| State | Meaning | Action |
|---|---|---|
| OPEN | Service is down; all calls rejected | Wait for `recovery_timeout` (30s); fix the underlying service |
| HALF_OPEN | Testing recovery; limited probe calls | Monitor -- if probes succeed, circuit closes automatically |
| CLOSED | Normal operation | No action needed |

**Manual reset (if needed):**
The circuit breaker can be manually reset via the application. This should only be done after confirming the underlying service is restored.

**Common causes:**
- **LLM circuit open:** API key invalid/expired, Anthropic/Gemini service outage, network issues
- **Database circuit open:** PostgreSQL down, connection pool exhausted, slow queries
- **yfinance circuit open:** Yahoo Finance API rate limiting or outage (non-critical; TASI chart uses cached data)

---

### High Error Rate

**Symptoms:**
- Spike in 500 responses
- Logs: `Unhandled exception on ... [request_id=...]`
- Health endpoint still shows `healthy` (errors may not affect components)

**Diagnosis:**

1. Check error logs with correlation IDs:
   ```bash
   # Find recent 500 errors
   grep '"INTERNAL_ERROR"' /var/log/raid-ai/app.log | tail -20

   # Trace a specific request
   grep '<request_id>' /var/log/raid-ai/app.log
   ```

2. Check query audit log for failed queries:
   ```sql
   SELECT request_id, natural_language_query, error_message, created_at
   FROM query_audit_log
   WHERE was_successful = false
   ORDER BY created_at DESC
   LIMIT 20;
   ```

3. Check timeout manager stats:
   - `slow_query_count`: Queries exceeding 5s threshold
   - `timeout_count`: Queries that exceeded the 30s deadline
   - `total_queries`: Total queries processed

**Resolution:**

| Cause | Action |
|---|---|
| LLM generating invalid SQL | Check SQL validator logs; update system prompt with better schema docs |
| Database timeout | Check for slow queries (see Database Outage); tune `SECURITY_MAX_QUERY_LENGTH` |
| Unhandled exception in route | Check logs for stack trace; add error handling to the affected route |
| Dependency import error | Check `requirements.txt`; reinstall dependencies |
| Configuration error | Run `python scripts/validate_config.py`; check `.env` file |

**Quick triage:**
```bash
# Count errors in the last hour (JSON logs)
grep '"level":"ERROR"' /var/log/raid-ai/app.log | \
  awk -F'"timestamp":"' '{print $2}' | \
  awk -F'"' '{print $1}' | \
  sort | tail -20

# Check if errors correlate with a specific endpoint
grep '"INTERNAL_ERROR"' /var/log/raid-ai/app.log | \
  grep -o '"path":"[^"]*"' | sort | uniq -c | sort -rn
```

---

### Security Breach

**Symptoms:**
- Security events with severity `HIGH` or `CRITICAL`
- Unusual query patterns (schema probing, injection attempts)
- Unauthorized access attempts
- Unusual IP addresses or geographic origins in audit logs

**Immediate Actions (within 15 minutes):**

1. **Assess scope:**
   ```sql
   -- Recent high-severity security events
   SELECT event_type, severity, ip_address, details, timestamp
   FROM security_events
   WHERE severity IN ('high', 'critical')
   ORDER BY timestamp DESC
   LIMIT 50;
   ```

2. **Check for data exfiltration attempts:**
   ```sql
   -- Queries accessing sensitive tables or using unusual patterns
   SELECT request_id, natural_language_query, generated_sql, ip_address
   FROM query_audit_log
   WHERE created_at > NOW() - INTERVAL '1 hour'
     AND (generated_sql ILIKE '%users%' OR generated_sql ILIKE '%UNION%')
   ORDER BY created_at DESC;
   ```

3. **Block the attacker (if IP is identified):**
   - Block at load balancer/CDN level immediately.
   - Rate limiter provides temporary protection but is not a firewall.

4. **Rotate credentials if compromised:**
   ```bash
   # Generate new JWT secret
   python -c "import secrets; print(secrets.token_urlsafe(32))"
   # Update AUTH_JWT_SECRET and restart -- this invalidates ALL existing sessions

   # Rotate API keys if LLM keys are exposed
   # Update GEMINI_API_KEY / ANTHROPIC_API_KEY and restart

   # Change database password if exposed
   # Update POSTGRES_PASSWORD, run ALTER USER in PostgreSQL, restart
   ```

**Post-Incident (within 24 hours):**

5. **Collect forensic data:**
   ```sql
   -- All activity from the attacker's IP
   SELECT * FROM query_audit_log WHERE ip_address = '<attacker_ip>' ORDER BY created_at;
   SELECT * FROM security_events WHERE ip_address = '<attacker_ip>' ORDER BY timestamp;
   ```

6. **Review and harden:**
   - Check if the SQL validator caught the attack (`validation_result` field).
   - Review allowlist configuration (`config/allowed_tables.json`).
   - Consider enabling `SECURITY_ENABLE_STRICT_MODE=true`.
   - Update blocked SQL patterns if new attack vectors were discovered.

7. **Document the incident:** Record timeline, impact, root cause, and remediation in an incident report.

---

## Common Operations Tasks

### Restart the Application

```bash
# Docker
docker compose restart app

# Railway
railway up  # Triggers redeployment

# Local development
# Kill the running process and restart
python app.py
```

### Check Application Health

```bash
# Full health report
curl -s http://localhost:8084/health | python -m json.tool

# Liveness (is the process running?)
curl -s http://localhost:8084/health/live

# Readiness (is the database reachable?)
curl -s http://localhost:8084/health/ready
```

### View Recent Audit Logs

```sql
-- Last 20 queries
SELECT id, request_id, natural_language_query, was_successful,
       execution_time_ms, created_at
FROM query_audit_log
ORDER BY created_at DESC
LIMIT 20;

-- Failed queries in the last hour
SELECT request_id, natural_language_query, error_message, created_at
FROM query_audit_log
WHERE was_successful = false
  AND created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;
```

### View Security Events

```sql
-- Recent security events
SELECT event_type, severity, ip_address, details, timestamp
FROM security_events
ORDER BY timestamp DESC
LIMIT 20;

-- Count by event type in last 24 hours
SELECT event_type, severity, COUNT(*) as count
FROM security_events
WHERE timestamp > NOW() - INTERVAL '24 hours'
GROUP BY event_type, severity
ORDER BY count DESC;
```

### Manage Redis Cache

```bash
# Check Redis connectivity
redis-cli PING

# View cache stats
redis-cli INFO stats

# Flush query cache (db=0)
redis-cli -n 0 FLUSHDB

# View rate limit keys (db=1)
redis-cli -n 1 KEYS "rl:*"

# View cost tracking keys (db=1)
redis-cli -n 1 KEYS "cost:*"

# Clear a specific user's rate limit
redis-cli -n 1 DEL "rl:_default:<ip_address>"
```

### Rotate JWT Secret

```bash
# 1. Generate new secret
NEW_SECRET=$(python -c "import secrets; print(secrets.token_urlsafe(32))")

# 2. Update environment variable
export AUTH_JWT_SECRET="$NEW_SECRET"
# Also update .env file and deployment secrets (Railway, etc.)

# 3. Restart application (all existing sessions will be invalidated)
docker compose restart app
```

### Database Maintenance

```bash
# Run VACUUM on SQLite (development)
sqlite3 saudi_stocks.db "VACUUM;"

# Check PostgreSQL table sizes
psql -c "SELECT relname, pg_size_pretty(pg_total_relation_size(relid))
         FROM pg_catalog.pg_statio_user_tables
         ORDER BY pg_total_relation_size(relid) DESC
         LIMIT 10;"

# Check index usage
psql -c "SELECT indexrelname, idx_scan, idx_tup_read, idx_tup_fetch
         FROM pg_stat_user_indexes
         ORDER BY idx_scan DESC
         LIMIT 10;"

# Audit log retention (delete entries older than 90 days)
psql -c "DELETE FROM query_audit_log WHERE created_at < NOW() - INTERVAL '90 days';"
psql -c "DELETE FROM security_events WHERE timestamp < NOW() - INTERVAL '180 days';"
```

### Validate Configuration

```bash
# Check all environment variables
python scripts/validate_config.py

# Verify .env file is not committed
git status .env  # Should not appear in tracked files
```

---

## Monitoring Checklist

### Health Probes (configure in load balancer / orchestrator)

| Probe | Endpoint | Interval | Timeout | Failure Threshold |
|---|---|---|---|---|
| Liveness | `GET /health/live` | 10s | 5s | 3 |
| Readiness | `GET /health/ready` | 15s | 10s | 2 |
| Full health | `GET /health` | 60s | 30s | 1 (alerting only) |

### Key Metrics to Monitor

| Metric | Source | Alert Threshold |
|---|---|---|
| HTTP 5xx rate | Application logs | > 5% of requests in 5min window |
| HTTP 429 rate | Application logs | > 20% of requests (potential DDoS) |
| Response latency (p95) | Application logs | > 5s for API endpoints |
| Database latency | `/health` component | > 100ms |
| Circuit breaker state | `/health` component | Any breaker in OPEN state |
| Slow query count | Timeout manager stats | > 10 in 5min window |
| Query timeout count | Timeout manager stats | > 3 in 5min window |
| Redis availability | `/health` redis component | Status = `degraded` |
| Disk usage | Infrastructure monitoring | > 85% |
| Memory usage | Infrastructure monitoring | > 90% |
| Connection pool usage | PostgreSQL `pg_stat_activity` | Active > 80% of `PG_POOL_MAX` |

### Log Queries for Alerting

```bash
# 5xx errors in the last 5 minutes
grep '"level":"ERROR"' /var/log/raid-ai/app.log | \
  awk -F'"timestamp":"' '{print $2}' | awk -F'"' '{print $1}' | \
  tail -n +$(date -d '5 minutes ago' +%s) | wc -l

# Security events with HIGH/CRITICAL severity
grep '"severity":"high\|critical"' /var/log/raid-ai/app.log | tail -5

# Circuit breaker state changes
grep "Circuit breaker.*state transition" /var/log/raid-ai/app.log | tail -10
```

### Periodic Reviews

| Task | Frequency | Description |
|---|---|---|
| Audit log review | Weekly | Check for unusual query patterns, failed queries, suspicious IPs |
| Security event review | Daily | Review HIGH/CRITICAL events; investigate new attack patterns |
| Rate limit tuning | Monthly | Adjust endpoint limits based on traffic patterns |
| Dependency updates | Monthly | Check for security patches in Python and npm packages |
| JWT secret rotation | Quarterly | Rotate `AUTH_JWT_SECRET` (invalidates all sessions) |
| Database cleanup | Monthly | Run retention queries on `query_audit_log` and `security_events` |
| Allowlist review | Monthly | Update `config/allowed_tables.json` if schema changes |
| Redis memory check | Weekly | Monitor Redis memory usage; adjust `maxmemory` if needed |
