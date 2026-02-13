# Privacy Policy - Ra'd AI TASI Platform

**Effective Date:** February 13, 2026
**Last Updated:** February 13, 2026

---

## 1. Introduction

Ra'd AI ("the Platform") is a Saudi stock market intelligence platform that provides natural language querying of TASI-listed company data. This privacy policy describes how we collect, use, store, and protect user data.

---

## 2. Data Collection

### 2.1 Data We Collect

| Category | Data Points | Collection Method |
|----------|------------|-------------------|
| **Account Data** | Email address, display name, hashed password | User registration (`/api/auth/register`) |
| **Authentication Tokens** | JWT access/refresh tokens, guest tokens | Generated at login/registration |
| **Query Data** | Natural language questions, generated SQL queries, query results | Chat interface (`/api/vanna/`) |
| **Usage Metrics** | Page views, feature usage counts, query frequency | Server-side logging |
| **Technical Data** | IP address (anonymized), user agent, request timestamps | Request logging middleware |
| **Watchlist Data** | Saved stock ticker lists, watchlist names | Watchlist API (`/api/watchlists`) |

### 2.2 Data We Do NOT Collect

- Financial account credentials or brokerage information
- Personal financial portfolio data
- Payment or credit card information
- Geolocation data (Permissions-Policy blocks geolocation)
- Microphone or camera data (blocked by Permissions-Policy)

---

## 3. Data Storage

### 3.1 Storage Locations

| Data Type | Storage | Encryption |
|-----------|---------|------------|
| User accounts | PostgreSQL database | Passwords: bcrypt hash; Data: encrypted at rest (database-level) |
| Query audit logs | PostgreSQL `query_audit_log` table | Encrypted at rest |
| Session tokens | Client-side `localStorage` | JWT signed with HS256 (server-side secret) |
| News/market data | SQLite (dev) / PostgreSQL (prod) | Public financial data, no PII |
| Application logs | Server filesystem | IP addresses anonymized in production |

### 3.2 Infrastructure

- **Production:** Railway.app cloud platform (region-specific hosting)
- **Database:** PostgreSQL 16 with connection pooling
- **No data is stored in third-party analytics or advertising platforms**

---

## 4. Data Retention

| Data Type | Retention Period | Deletion Method |
|-----------|-----------------|-----------------|
| User accounts | Until user requests deletion | Hard delete from database |
| Query history | 90 days | Automated cleanup job |
| Guest session data | 24 hours (token expiry) | Automatic token invalidation |
| Access logs | 30 days | Log rotation |
| News/market data | Indefinite (public data) | N/A |

---

## 5. Data Usage

We use collected data for:

1. **Service Delivery:** Processing natural language queries, generating SQL, returning results
2. **Authentication:** Verifying user identity and managing sessions
3. **Platform Improvement:** Analyzing query patterns to improve AI responses (aggregated, not individual)
4. **Security:** Rate limiting, abuse detection, audit logging
5. **Personalization:** Watchlists, query suggestions based on history

We do **NOT** use data for:
- Advertising or ad targeting
- Selling to third parties
- Automated financial advice or trading decisions
- Training AI models on individual user data

---

## 6. Third-Party Services

| Service | Purpose | Data Shared | Privacy Policy |
|---------|---------|-------------|----------------|
| **Google Gemini** (via API) | LLM for natural language to SQL | Query text (no PII) | [Google AI Privacy](https://ai.google.dev/gemini-api/terms) |
| **Sentry** | Error tracking and monitoring | Error stack traces, anonymized IPs | [Sentry Privacy](https://sentry.io/privacy/) |
| **TradingView** | Embedded stock charts (iframe) | None (client-side widget) | [TradingView Privacy](https://www.tradingview.com/privacy-policy/) |
| **Railway.app** | Cloud hosting infrastructure | Application data (encrypted) | [Railway Privacy](https://railway.app/legal/privacy) |

**Note:** When using the AI chat feature, your natural language query is sent to Google Gemini for SQL generation. The query text does not contain your personal information unless you explicitly type it. No user authentication data or personal identifiers are sent to the LLM.

---

## 7. Data Flow Diagram

```
User Browser                    Next.js Frontend                  FastAPI Backend
    |                               |                                  |
    |-- Login/Register ------------>|-- Proxy /api/auth/* ------------>|
    |                               |                                  |-- Hash password
    |                               |                                  |-- Store in PostgreSQL
    |<-- JWT tokens ----------------|<-- JWT tokens -------------------|
    |                               |                                  |
    |-- NL Query ------------------>|-- Proxy /api/vanna/* ----------->|
    |                               |                                  |-- Log query (audit)
    |                               |                                  |-- Send to Gemini LLM
    |                               |                                  |      (query text only)
    |                               |                                  |<-- Generated SQL
    |                               |                                  |-- Execute SQL
    |<-- Results (SSE) -------------|<-- Results (SSE) ----------------|
    |                               |                                  |
    |-- View market data ---------->|-- Proxy /api/v1/* -------------->|
    |<-- Public financial data -----|<-- Public financial data --------|
    |                               |                                  |
    |-- TradingView widget -------->| (client-side iframe, no proxy)   |
    |   (loads from tradingview.com)|                                  |
```

---

## 8. User Rights

### 8.1 Your Rights

You have the right to:

- **Access:** Request a copy of all personal data we hold about you
- **Rectification:** Update or correct your account information
- **Deletion:** Request complete deletion of your account and associated data
- **Data Portability:** Export your data (watchlists, query history) in a standard format
- **Restriction:** Request limitation of data processing
- **Objection:** Object to specific data processing activities

### 8.2 Exercising Your Rights

To exercise any of these rights, contact the platform administrator. Guest users can clear their data by clearing browser localStorage.

### 8.3 Response Timeline

We aim to respond to all data rights requests within 30 days.

---

## 9. Security Measures

- **Transport:** HTTPS enforced with HSTS (max-age=31536000, includeSubDomains, preload)
- **Authentication:** JWT tokens with configurable expiry (30 min access, 7 day refresh)
- **Password Storage:** bcrypt hashing (never stored in plaintext)
- **Input Validation:** Ticker regex validation, Pydantic model validation on all endpoints
- **Rate Limiting:** Tiered per-IP rate limiting (10/30/60 requests per minute by endpoint)
- **Headers:** Content-Security-Policy, X-Content-Type-Options, X-Frame-Options, Referrer-Policy
- **IP Anonymization:** Production logs anonymize IP addresses
- **Host Validation:** Next.js middleware rejects requests with disallowed Host headers

---

## 10. Regulatory Compliance

### 10.1 Saudi Arabia Personal Data Protection Law (PDPL)

The Platform is designed with Saudi PDPL requirements in mind:

- **Lawful Basis:** Data processing is based on user consent (registration) and legitimate interest (service delivery)
- **Data Minimization:** We collect only data necessary for platform operation
- **Storage Limitation:** Data retention periods are defined and enforced
- **Cross-Border Transfer:** Application data is hosted on Railway.app infrastructure. Users should be aware that data may be processed outside Saudi Arabia. We ensure adequate protection measures are in place.
- **Data Protection Officer:** Contact the platform administrator for PDPL-related inquiries

### 10.2 GDPR Considerations

For users subject to GDPR:

- **Legal Basis:** Consent (Article 6(1)(a)) for registration; legitimate interest (Article 6(1)(f)) for security logging
- **Data Subject Rights:** All rights under Articles 15-22 are supported (see Section 8)
- **Data Breach Notification:** We will notify affected users within 72 hours of discovering a breach
- **International Transfer:** Standard Contractual Clauses apply where data leaves the EEA

---

## 11. Cookies and Local Storage

| Item | Type | Purpose | Duration |
|------|------|---------|----------|
| `rad-ai-token` | localStorage | JWT access token for API auth | 30 minutes (token expiry) |
| `theme` | localStorage | Light/dark mode preference | Persistent |

The Platform does **not** use tracking cookies, advertising cookies, or third-party analytics cookies.

---

## 12. Children's Privacy

The Platform is not intended for users under the age of 18. We do not knowingly collect personal data from minors.

---

## 13. Changes to This Policy

We may update this privacy policy to reflect changes in our practices or legal requirements. Material changes will be communicated through the platform interface. Continued use after changes constitutes acceptance.

---

## 14. Contact

For privacy-related questions or data rights requests, contact the platform administrator through the appropriate channels.
