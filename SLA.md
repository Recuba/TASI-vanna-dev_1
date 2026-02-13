# Service Level Agreement (SLA) - Ra'd AI TASI Platform

**Effective Date:** February 13, 2026
**Version:** 1.0

---

## 1. Service Overview

Ra'd AI is a TASI Saudi Stock Market intelligence platform providing:
- Natural language to SQL query interface (AI chat)
- Real-time market data and analytics
- News aggregation from Arabic financial sources
- Technical reports and announcement tracking
- Stock charting and visualization

---

## 2. Uptime Commitment

### 2.1 Target Availability

| Service Tier | Uptime Target | Max Monthly Downtime |
|-------------|---------------|---------------------|
| **API Backend** | 99.5% | ~3.6 hours |
| **Frontend (Next.js)** | 99.5% | ~3.6 hours |
| **Database (PostgreSQL)** | 99.5% | ~3.6 hours |

### 2.2 Uptime Calculation

Uptime is measured monthly and calculated as:

```
Uptime % = ((Total Minutes - Downtime Minutes) / Total Minutes) * 100
```

- **Total Minutes** = minutes in the calendar month
- **Downtime Minutes** = minutes where the `/health/ready` endpoint returns non-200
- Scheduled maintenance windows are excluded from downtime calculations

### 2.3 Exclusions

The following are excluded from uptime calculations:
- Scheduled maintenance (see Section 5)
- Force majeure events (natural disasters, government actions)
- Third-party service outages (Gemini API, TradingView, Railway infrastructure)
- Client-side issues (browser, network, DNS)

---

## 3. Response Time Targets

### 3.1 API Performance

| Endpoint Category | p50 Target | p95 Target | p99 Target |
|-------------------|-----------|-----------|-----------|
| **Health checks** (`/health/*`) | < 50ms | < 100ms | < 200ms |
| **Data queries** (`/api/entities`, `/api/news`, etc.) | < 200ms | < 500ms | < 1s |
| **AI chat** (`/api/vanna/*`) | < 2s (first token) | < 5s (first token) | < 10s |
| **Chart data** (`/api/v1/charts/*`) | < 300ms | < 700ms | < 1.5s |
| **Authentication** (`/api/auth/*`) | < 150ms | < 300ms | < 500ms |
| **Market analytics** (`/api/v1/market/*`) | < 200ms | < 500ms | < 1s |

### 3.2 Frontend Performance

| Metric | Target | Measurement |
|--------|--------|-------------|
| **First Contentful Paint (FCP)** | < 1.5s | Web Vitals |
| **Largest Contentful Paint (LCP)** | < 2.5s | Web Vitals |
| **Cumulative Layout Shift (CLS)** | < 0.1 | Web Vitals |
| **Interaction to Next Paint (INP)** | < 200ms | Web Vitals |
| **Time to Interactive (TTI)** | < 3s | Lighthouse |
| **Total Bundle Size (initial)** | < 150kB | Build output |

---

## 4. Incident Severity Levels

### 4.1 Severity Definitions

| Level | Name | Description | Examples |
|-------|------|-------------|----------|
| **P1** | Critical | Complete service outage affecting all users | Database down, backend crash, deployment failure |
| **P2** | Major | Significant degradation affecting core features | AI chat unavailable, auth broken, data stale > 1hr |
| **P3** | Minor | Non-critical feature degradation, workaround exists | Single chart type failing, one news source down, slow responses |
| **P4** | Low | Cosmetic issues, minor UI bugs, documentation | Layout glitch, typo, non-functional tooltip |

### 4.2 Response and Resolution Targets

| Severity | Acknowledgment | Status Update | Resolution Target |
|----------|---------------|---------------|-------------------|
| **P1** | 15 minutes | Every 30 minutes | 4 hours |
| **P2** | 1 hour | Every 2 hours | 8 hours |
| **P3** | 4 hours | Daily | 3 business days |
| **P4** | 1 business day | Weekly | Next release cycle |

### 4.3 Escalation Path

1. **Automated monitoring** detects issue (Sentry alerts, health check failures)
2. **On-call engineer** acknowledges and triages
3. **P1/P2:** Immediate escalation to platform lead
4. **P1:** Incident commander appointed, status page updated

---

## 5. Maintenance Windows

### 5.1 Scheduled Maintenance

| Type | Frequency | Window | Notification |
|------|-----------|--------|-------------|
| **Routine updates** | Weekly | Saturday 02:00-04:00 AST | 24 hours advance |
| **Database maintenance** | Monthly | Friday 23:00-Saturday 03:00 AST | 72 hours advance |
| **Major upgrades** | Quarterly | Coordinated with users | 1 week advance |

### 5.2 Emergency Maintenance

Emergency maintenance may be performed outside scheduled windows for:
- Critical security patches (CVE with active exploitation)
- Data integrity issues
- Infrastructure provider emergencies

Emergency maintenance notifications will be sent as soon as possible, ideally 1 hour in advance.

### 5.3 Deployment Strategy

- **Zero-downtime deployments** using Railway rolling updates
- **Database migrations** run during maintenance windows when schema changes are required
- **Rollback capability** within 15 minutes of deployment

---

## 6. Monitoring and Reporting

### 6.1 Monitoring Tools

| Tool | Purpose | Coverage |
|------|---------|----------|
| **Health endpoints** | Liveness (`/health/live`) and readiness (`/health/ready`) probes | Backend + Database |
| **Sentry** | Error tracking, performance monitoring, alerting | Frontend + Backend |
| **Web Vitals** | Core Web Vitals (LCP, FCP, CLS, INP) | Frontend |
| **Request logging** | JSON-structured request/response logs with anonymized IPs | Backend |
| **Rate limit monitoring** | Per-IP request tracking, 429 response logging | Backend middleware |

### 6.2 Health Check Endpoints

| Endpoint | Purpose | Expected Response |
|----------|---------|-------------------|
| `GET /health` | Full component health report | `200` with component status array |
| `GET /health/live` | Liveness probe (process running) | `200 {"status": "alive"}` |
| `GET /health/ready` | Readiness probe (DB reachable) | `200 {"status": "ready"}` or `503` |

### 6.3 Reporting

- **Monthly uptime report** generated from health check data
- **Incident post-mortems** published within 5 business days of P1/P2 incidents
- **Quarterly performance review** covering response times, error rates, uptime trends

---

## 7. Rate Limits

To ensure fair usage and platform stability:

| Endpoint Category | Rate Limit | Window |
|-------------------|-----------|--------|
| **Authentication** (`/api/auth/*`) | 10 requests | Per minute per IP |
| **Charts/OHLCV** (`/api/v1/charts/*`) | 30 requests | Per minute per IP |
| **All other endpoints** | 60 requests | Per minute per IP |
| **Health checks** (`/health/*`) | Unlimited | (Bypasses rate limiter) |

Exceeding the rate limit returns `429 Too Many Requests` with a `Retry-After` header.

---

## 8. Data Freshness

| Data Type | Freshness Target | Source |
|-----------|-----------------|--------|
| **Company fundamentals** | Daily (market close) | Yahoo Finance CSV pipeline |
| **TASI index data** | Cached with configurable TTL | Real-time API + cache |
| **Stock OHLCV** | Cached with configurable TTL | Real-time API + cache |
| **News feed** | Every 30 minutes | 5 Arabic news source scrapers |
| **Market movers** | Derived from latest price data | Database queries |

---

## 9. Disaster Recovery

| Metric | Target |
|--------|--------|
| **Recovery Time Objective (RTO)** | 4 hours |
| **Recovery Point Objective (RPO)** | 24 hours |
| **Backup Frequency** | Daily automated database backups |
| **Backup Retention** | 30 days |
| **Recovery Testing** | Quarterly restore drills |

---

## 10. Revision History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-02-13 | Initial SLA document |
