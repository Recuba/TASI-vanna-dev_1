# Metrics and Monitoring

Observability guide for the Ra'd AI TASI Platform. Covers key metrics, alerting thresholds, recommended tooling for Railway, and dashboard layout.

## Key Metrics

### HTTP Request Metrics

| Metric | Description | Source |
|--------|-------------|--------|
| `http_requests_total` | Total request count by method, path, status | `middleware/request_logging.py` |
| `http_request_duration_ms` | Response time per request (p50, p95, p99) | `middleware/request_logging.py` |
| `http_errors_total` | 4xx and 5xx error count by status code | `middleware/error_handler.py` |

### Vanna Chat Metrics

| Metric | Description | Source |
|--------|-------------|--------|
| `chat_requests_total` | Total chat/SSE queries | `/api/vanna/v2/chat_sse` |
| `chat_response_time_ms` | End-to-end chat latency (includes LLM + SQL) | SSE handler in `app.py` |
| `chat_sql_generation_errors` | Failed SQL generation attempts | Vanna agent logs |
| `tool_iterations_per_query` | Number of tool calls per chat query (max 10) | Agent config |

### Database Metrics

| Metric | Description | Source |
|--------|-------------|--------|
| `db_query_duration_ms` | SQL query execution time | `RunSqlTool` |
| `db_connections_active` | Current active PG connections | `database/pool.py` |
| `db_connections_idle` | Current idle pool connections | `database/pool.py` |
| `db_pool_exhausted_total` | Pool exhaustion events (all connections in use) | Pool error logs |

### External Service Metrics

| Metric | Description | Source |
|--------|-------------|--------|
| `yfinance_requests_total` | Total yfinance API calls | `services/tasi_index.py`, `services/stock_ohlcv.py` |
| `yfinance_errors_total` | Failed yfinance calls | Service error logs |
| `yfinance_available` | Boolean: yfinance reachable (1=yes, 0=no) | Health check endpoints |
| `circuit_breaker_state` | Circuit breaker state (closed/open/half-open) | Data pipeline services |
| `circuit_breaker_trips_total` | Number of times circuit breaker opened | Service logs |

### Cache Metrics (when Redis enabled)

| Metric | Description | Source |
|--------|-------------|--------|
| `cache_hits_total` | Successful cache reads | Cache middleware |
| `cache_misses_total` | Cache misses requiring origin fetch | Cache middleware |
| `cache_hit_rate` | Derived: hits / (hits + misses) | Computed |
| `cache_evictions_total` | Keys evicted by TTL or memory pressure | Redis INFO stats |

### News Scraper Metrics

| Metric | Description | Source |
|--------|-------------|--------|
| `news_scrape_runs_total` | Total scheduler runs | `services/news_scheduler.py` |
| `news_articles_fetched` | Articles fetched per run by source | `services/news_scraper.py` |
| `news_scrape_errors` | Scraping failures by source | Scraper error logs |
| `news_scrape_duration_ms` | Time per scraping cycle | Scheduler logs |

### Authentication Metrics

| Metric | Description | Source |
|--------|-------------|--------|
| `auth_login_attempts_total` | Login attempts (success/failure) | `api/routes/auth.py` |
| `auth_token_refresh_total` | Token refresh events | Auth middleware |
| `auth_invalid_tokens_total` | Rejected invalid/expired JWTs | Auth middleware |

## Alert Thresholds

### Critical (page immediately)

| Condition | Threshold | Action |
|-----------|-----------|--------|
| Health check failure | 3 consecutive failures | Investigate DB/LLM connectivity |
| Error rate (5xx) | > 5% of requests over 5 min | Check logs, rollback if needed |
| Response time p99 | > 30s sustained for 5 min | Check LLM latency, DB pool |
| DB pool exhausted | Any occurrence | Scale pool or investigate leaks |

### Warning (investigate within 1 hour)

| Condition | Threshold | Action |
|-----------|-----------|--------|
| Error rate (4xx) | > 20% of requests over 15 min | Check for client bugs or abuse |
| yfinance unavailable | > 10 min continuous | Circuit breaker should handle; verify |
| Cache hit rate drop | Below 50% sustained | Check Redis connectivity, TTL config |
| Response time p95 | > 10s sustained for 10 min | Profile slow queries |
| News scraper failures | 3+ consecutive failures per source | Check source availability |

### Informational (review daily)

| Condition | Threshold | Action |
|-----------|-----------|--------|
| Chat query volume | Track trend | Capacity planning |
| Auth failures spike | > 10 in 5 min | Potential credential stuffing |
| Memory usage | > 80% of container limit | Plan vertical scaling |

## Recommended Tools for Railway

### Built-in Railway Observability

Railway provides:
- **Deploy logs**: Real-time stdout/stderr streaming (JSON logs are auto-parsed)
- **Metrics dashboard**: CPU, memory, network I/O per service
- **Health checks**: Configure in `railway.toml` or dashboard

### Structured Log Aggregation

The platform outputs structured JSON logs in production (via `config/logging_config.py`). These are automatically ingested by Railway's log viewer. For advanced querying:

- **Railway Log Explorer**: Filter by JSON fields (`level`, `logger`, `message`)
- **External**: Forward logs to Datadog, Grafana Cloud, or Betterstack via Railway log drains

### Setting Up Log Drains (Railway)

```bash
# Via Railway CLI
railway logs --filter "level=ERROR"

# Configure a log drain in Railway dashboard:
# Settings > Log Drains > Add Drain
# Supported: HTTP, Datadog, Logtail/Betterstack
```

### Application Performance Monitoring (APM)

For deeper observability beyond logs:

1. **Sentry** (recommended for error tracking)
   - See `config/error_tracking.py` for integration stub
   - Free tier: 5K errors/month, performance tracing

2. **Grafana Cloud** (recommended for metrics dashboards)
   - Free tier: 10K metrics series, 50GB logs
   - Use OpenTelemetry SDK to export metrics

3. **Betterstack** (recommended for uptime monitoring)
   - Free tier: 5 monitors, 3-min intervals
   - Simple HTTP health check to `/api/v1/health`

## Dashboard Layout

Suggested dashboard panels for a Grafana or similar monitoring tool:

```
+---------------------------------------------------+
|              Ra'd AI TASI Platform                 |
+---------------------------------------------------+
| Row 1: Overview                                    |
| +------------+ +------------+ +------------------+ |
| | Requests/s | | Error Rate | | Avg Response (ms)| |
| |   (gauge)  | |  (gauge)   | |    (gauge)       | |
| +------------+ +------------+ +------------------+ |
+---------------------------------------------------+
| Row 2: Response Times                              |
| +------------------------------------------------+ |
| | HTTP Response Time (p50, p95, p99 over time)   | |
| |                 (time series)                   | |
| +------------------------------------------------+ |
+---------------------------------------------------+
| Row 3: Error Breakdown                             |
| +-----------------------+ +----------------------+ |
| | Errors by Status Code | | Errors by Endpoint   | |
| |    (stacked bar)      | |    (table)           | |
| +-----------------------+ +----------------------+ |
+---------------------------------------------------+
| Row 4: External Dependencies                       |
| +------------+ +------------+ +-----------------+  |
| | yfinance   | | Circuit    | | DB Pool         |  |
| | Status     | | Breaker    | | Utilization     |  |
| | (indicator)| | (state map)| | (gauge)         |  |
| +------------+ +------------+ +-----------------+  |
+---------------------------------------------------+
| Row 5: Chat / LLM                                  |
| +-----------------------+ +----------------------+ |
| | Chat Queries/min      | | LLM Response Time    | |
| |   (time series)       | |   (histogram)        | |
| +-----------------------+ +----------------------+ |
+---------------------------------------------------+
| Row 6: Cache & News                                |
| +-----------------------+ +----------------------+ |
| | Cache Hit Rate        | | News Articles/hour   | |
| |   (gauge + trend)     | |   (bar chart)        | |
| +-----------------------+ +----------------------+ |
+---------------------------------------------------+
```

## Implementation Notes

### Current State

The platform uses Python `logging` with structured JSON output in production. Metrics are currently derived from log analysis rather than explicit instrumentation. The middleware stack (`middleware/request_logging.py`) logs every request with method, path, status, and duration.

### Future Instrumentation

To add explicit metrics collection (e.g., Prometheus counters/histograms):

1. Add `prometheus-fastapi-instrumentator` to `requirements.txt`
2. Initialize in `app.py` lifespan:
   ```python
   from prometheus_fastapi_instrumentator import Instrumentator
   Instrumentator().instrument(app).expose(app, endpoint="/metrics")
   ```
3. Configure Railway to scrape `/metrics` or export via push gateway

### Log-Based Metric Extraction

Until explicit instrumentation is added, derive metrics from structured logs:

```bash
# Count errors in last hour (Railway CLI)
railway logs --since 1h | jq 'select(.level == "ERROR")' | wc -l

# Average response time from request logs
railway logs --since 1h | jq 'select(.logger == "tasi.access") | .message' | grep -oP '\d+\.\d+ms' | ...
```

## Related Documents

- [Deployment Checklist](./DEPLOYMENT_CHECKLIST.md) - Pre/post deploy steps
- [Deployment Runbook](./DEPLOYMENT_RUNBOOK.md) - Full deployment procedures
- [Architecture](./ARCHITECTURE.md) - System architecture overview
