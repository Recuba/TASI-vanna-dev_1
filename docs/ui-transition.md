# Ra'd AI -- UI Transition Assessment

> Evaluates the Next.js frontend against the legacy `templates/index.html` and documents
> the path to full parity. Generated from source code on 2026-02-10.

---

## Table of Contents

1. [Overview](#overview)
2. [Legacy UI Capabilities](#legacy-ui-capabilities)
3. [Next.js Page Assessment](#nextjs-page-assessment)
4. [Feature Parity Matrix](#feature-parity-matrix)
5. [API Dependency Map](#api-dependency-map)
6. [Recommended Transition Strategy](#recommended-transition-strategy)
7. [Risk Areas](#risk-areas)

---

## Overview

The Ra'd AI platform currently has two frontends:

| Frontend | Path | Status | Serves at |
|---|---|---|---|
| **Legacy** | `templates/index.html` | Production | `GET /` on the FastAPI server |
| **Next.js** | `frontend/` | In progress | Separate dev server (port 3000) |

The legacy UI is a single-page chat interface served directly by the FastAPI backend. The Next.js app is a multi-page application with dedicated pages for market browsing, stock details, news, reports, and watchlists. The Next.js frontend communicates with the same backend via `/api/*` routes (proxied through Next.js rewrites or `NEXT_PUBLIC_API_URL`).

---

## Legacy UI Capabilities

The legacy `templates/index.html` provides:

1. **Native SSE Chat** -- Full AI chat interface with streaming responses via `POST /api/vanna/v2/chat_sse`. Renders markdown (via marked.js CDN), SQL blocks, data tables, and Plotly chart HTML.

2. **Suggestion Chips** -- 6 preset queries (top 10 by market cap, profitability heatmap, Aramco revenue trend, sector valuation, market cap vs P/E, dividend yields). Collapsed by default with "Show Suggestions" toggle. Keyboard-accessible with tabindex management.

3. **Plotly Chart Display** -- Charts generated server-side by `chart_engine/raid_chart_generator.py` and returned as HTML fragments in the SSE stream. Full dark theme with gold palette.

4. **Ra'd Branding** -- Dark background (#0E0E0E), gold accent (#D4A84B), Tajawal font, gold gradient logo, animated fade-in.

5. **Shadow DOM Overrides** -- CSS injection into `vanna-chat` shadow root for consistent branding. MutationObserver hides admin/setup diagnostic messages.

6. **Accessibility** -- ARIA roles (banner, main, contentinfo), skip-to-content link, focus-visible outlines, prefers-reduced-motion, prefers-contrast support, ARIA live region for screen reader announcements.

7. **Theme Toggle** -- Dark/light mode with localStorage persistence and prefers-color-scheme detection.

8. **Onboarding Overlay** -- 3-step first-visit tutorial.

9. **CDN Fallback** -- Progressive retry (3s/6s/10s) for external JS/CSS CDNs.

10. **Print Styles** -- Clean print output hiding interactive elements.

---

## Next.js Page Assessment

### / (Home Page)

**Status: Functional**

| Feature | Implemented | Data Source |
|---|---|---|
| Hero section with branding | Yes | Static |
| Market stats bar | Yes | Static + live sector count |
| Quick action cards (4) | Yes | Static links |
| Sector list with counts | Yes | `GET /api/entities/sectors` (live) |
| Top by Market Cap (5 stocks) | Yes | `GET /api/entities?limit=5` (live) |
| Mini sparklines per stock | Yes | `useOHLCVData` -> mock fallback |
| TradingView attribution | Yes | Static |
| AI Chat CTA | Yes | Static link |
| Loading/error states | Yes | Spinner + retry |

**Notes:** Functional with real data from PostgreSQL-backed APIs. Sparklines currently fall back to mock data since the OHLCV endpoint per ticker is not yet backed by a real data source.

---

### /market

**Status: Functional**

| Feature | Implemented | Data Source |
|---|---|---|
| TASI Index area chart | Yes | `GET /api/v1/charts/tasi/index` (live yfinance) |
| DataSourceBadge (LIVE/SAMPLE) | Yes | From API response |
| Search by ticker/name | Yes | `GET /api/entities?search=` (live) |
| Sector table with filter | Yes | `GET /api/entities/sectors` (live) |
| Company cards with sparklines | Yes | `GET /api/entities` (live) + mock sparklines |
| TradingView attribution | Yes | Static |
| AI Chat CTA | Yes | Static link |

**Notes:** The most complete page. Real TASI data from yfinance, sector/company data from PostgreSQL. Per-stock sparklines still fall back to mock OHLCV.

---

### /stock/[ticker]

**Status: Functional**

| Feature | Implemented | Data Source |
|---|---|---|
| Company header (name, sector, price) | Yes | `GET /api/entities/{ticker}` (live) |
| Price change calculation | Yes | Derived from current_price/previous_close |
| CandlestickChart (OHLCV) | Yes | `useOHLCVData(ticker)` -> mock fallback |
| ChartWrapper + DataSourceBadge | Yes | Shows SAMPLE badge (mock data) |
| Key Metrics grid (6 cards) | Yes | From entity detail API |
| Valuation metrics (4 cards) | Yes | From entity detail API |
| Profitability metrics (3 cards) | Yes | From entity detail API |
| Analyst consensus | Yes | Conditional on recommendation data |
| TradingView attribution | Yes | Static |
| Loading/error states | Yes | Full-page spinner + error |

**Notes:** Company data is live from PostgreSQL. The candlestick chart falls back to mock OHLCV data because there is no per-stock OHLCV backend endpoint yet -- only TASI index has a real data source. The `getOHLCVData(ticker)` API call targets `/api/v1/charts/{ticker}/ohlcv` which is not yet implemented.

---

### /chat

**Status: Functional**

| Feature | Implemented | Data Source |
|---|---|---|
| SSE streaming chat | Yes | `POST /api/vanna/v2/chat_sse` (live) |
| User/assistant message bubbles | Yes | Component-based |
| Markdown rendering | Yes | Via AssistantContent component |
| SQL block display | Yes | SQLBlock component |
| Data table display | Yes | DataTable component |
| Chart display | Yes | ChartBlock component |
| Suggestion chips (6) | Yes | Static, same queries as legacy |
| New chat / clear | Yes | clearMessages() |
| Stop streaming | Yes | stopStreaming() via AbortController |
| Auto-scroll to bottom | Yes | messagesEndRef |
| Textarea with Shift+Enter | Yes | Multi-line input |

**Notes:** Feature-complete SSE chat with parity to the legacy UI. The chat page is the largest page (~262KB). All Vanna SSE event types (text, sql, chart) are handled. The suggestion chips match the legacy UI exactly.

---

### /news

**Status: Functional**

| Feature | Implemented | Data Source |
|---|---|---|
| News article list | Yes | `GET /api/news?limit=50` (live) |
| Article title with link | Yes | source_url -> external link |
| Body preview (2-line clamp) | Yes | article.body |
| Metadata (source, date, sentiment, language) | Yes | All fields rendered |
| Ticker badge linking to stock page | Yes | `/stock/{ticker}` |
| Loading/error states | Yes | Spinner + retry |
| Pagination | No | Fixed limit=50, no page controls |
| Language filter | No | API supports it, UI does not expose |

**Notes:** Functional but limited. Displays articles from PostgreSQL. Missing pagination controls and language filter. The API supports both but the UI only fetches the first 50 articles.

---

### /reports

**Status: Functional**

| Feature | Implemented | Data Source |
|---|---|---|
| Report list (grid layout) | Yes | `GET /api/reports?limit=50` (live) |
| Type filter chips (all/technical/fundamental/sector/macro) | Yes | Client-side filter |
| Report type badge (colored) | Yes | Per-type colors |
| Recommendation badge | Yes | Gold pill |
| Title with link | Yes | source_url -> external link |
| Summary (3-line clamp) | Yes | report.summary |
| Target price vs current price | Yes | Conditional section |
| Ticker badge | Yes | `/stock/{ticker}` |
| Loading/error states | Yes | Spinner + retry |
| Pagination | No | Fixed limit=50 |

**Notes:** Well-implemented with type filtering. Missing pagination beyond the first 50 reports.

---

### /watchlist

**Status: Functional**

| Feature | Implemented | Data Source |
|---|---|---|
| Multiple watchlists (tabs) | Yes | API or localStorage fallback |
| Create new list | Yes | Form with name input |
| Delete list | Yes | Delete button (protects "default") |
| Add ticker to list | Yes | Text input + Enter/button |
| Remove ticker | Yes | X button per row |
| Live quotes per ticker | Yes | `GET /api/entities/{ticker}` per stock |
| Price and change % | Yes | Computed from current/previous close |
| Link to stock detail | Yes | Ticker links to `/stock/{ticker}` |
| Responsive table | Yes | Hidden columns on mobile |
| Default watchlists | Yes | 2 defaults with common tickers |
| API/localStorage fallback | Yes | Tries API first, falls back to localStorage |

**Notes:** The most sophisticated page in terms of state management. Gracefully degrades when the API is unavailable (SQLite mode). Default watchlists seed with TASI blue-chip tickers.

---

## Feature Parity Matrix

| Feature | Legacy | Next.js | Gap |
|---|---|---|---|
| AI Chat (SSE streaming) | Yes | Yes | None -- full parity |
| Suggestion chips | Yes | Yes | None |
| Plotly chart rendering | Yes (HTML fragments) | Yes (ChartBlock) | None |
| SQL result display | Yes | Yes (SQLBlock + DataTable) | None |
| Markdown rendering | Yes (marked.js CDN) | Yes (component-based) | None |
| Market overview | No | Yes | Next.js adds new capability |
| Stock detail page | No | Yes | Next.js adds new capability |
| News feed | No | Yes | Next.js adds new capability |
| Reports browser | No | Yes | Next.js adds new capability |
| Watchlists | No | Yes | Next.js adds new capability |
| TradingView charts | No | Yes | Next.js adds new capability |
| Theme toggle (dark/light) | Yes | Partial | Next.js has ThemeProvider but not all pages verified |
| Onboarding overlay | Yes | No | **Gap** -- legacy has 3-step tutorial |
| Shadow DOM branding | Yes | N/A | Not needed (no vanna-chat web component) |
| Print styles | Yes | No | **Gap** -- no print media rules in Next.js |
| Skip-to-content (a11y) | Yes | Unknown | **Potential gap** -- needs verification |
| ARIA roles | Yes (banner/main/contentinfo) | Partial | Layout components may need audit |
| CDN fallback | Yes | N/A | Next.js bundles dependencies locally |
| Keyboard shortcuts (Ctrl+K) | Yes | No | **Gap** |
| prefers-reduced-motion | Yes | Unknown | **Potential gap** |
| prefers-contrast | Yes | Unknown | **Potential gap** |

---

## API Dependency Map

Which APIs each Next.js page requires:

| Page | Required APIs | Works on SQLite? |
|---|---|---|
| `/` (home) | `/api/entities/sectors`, `/api/entities?limit=5` | No (PG-only APIs) |
| `/market` | `/api/v1/charts/tasi/index`, `/api/entities/sectors`, `/api/entities` | Partial (TASI index works) |
| `/stock/[ticker]` | `/api/entities/{ticker}`, `/api/v1/charts/{ticker}/ohlcv` | No (entity API is PG-only) |
| `/chat` | `/api/vanna/v2/chat_sse` | Yes (Vanna works on both) |
| `/news` | `/api/news` | No (PG-only) |
| `/reports` | `/api/reports` | No (PG-only) |
| `/watchlist` | `/api/watchlists`, `/api/entities/{ticker}` | Degraded (localStorage fallback, no quotes) |

**Note:** Only `/chat` and the TASI index chart work without PostgreSQL. All other pages require the PostgreSQL backend with populated data.

---

## Recommended Transition Strategy

### Phase 1: Fill Critical Gaps (before switching)

1. **Per-stock OHLCV endpoint** -- Implement `GET /api/v1/charts/{ticker}/ohlcv` backed by yfinance (similar to TASI index service). This unblocks real candlestick data on `/stock/[ticker]`.

2. **Pagination UI** -- Add page controls to `/news` and `/reports` pages. The APIs already support pagination.

3. **Onboarding overlay** -- Port the 3-step tutorial from the legacy UI or implement a simpler first-visit welcome.

4. **Accessibility audit** -- Verify skip-to-content, ARIA landmarks, focus management, and motion preferences in the Next.js layout.

### Phase 2: Soft Launch (parallel running)

5. **Proxy configuration** -- Configure Next.js rewrites to proxy `/api/*` requests to the FastAPI backend. This is partially set up.

6. **A/B routing** -- Serve the legacy UI at `/` and the Next.js app at `/app` or a subdomain. Let users opt in.

7. **Print styles** -- Add `@media print` rules to the Next.js global CSS.

8. **Keyboard shortcuts** -- Add Ctrl+K (or Cmd+K) to focus the chat input.

### Phase 3: Full Cutover

9. **Replace `/` route** -- Point the root route to the Next.js build output instead of `templates/index.html`.

10. **Retire legacy files** -- Remove `templates/index.html`, `templates/raid-enhancements.css`, `templates/raid-features.js` once all users have migrated.

11. **SQLite fallback** -- Consider adding SQLite-compatible entity/news/report queries so the Next.js UI works in local development without PostgreSQL.

---

## Risk Areas

### 1. Per-stock OHLCV data gap

The `/stock/[ticker]` page shows a candlestick chart that always displays mock data. The frontend calls `GET /api/v1/charts/{ticker}/ohlcv` but this endpoint does not exist. Until it is implemented, every stock detail page will show "SAMPLE" badge data. This is the **highest-priority gap**.

### 2. PostgreSQL dependency

All Next.js pages except `/chat` require PostgreSQL-backed APIs. In SQLite mode (local development), the home page, market page, stock detail, news, reports, and watchlist pages will fail to load data. The legacy UI works fine on SQLite because it only needs the Vanna chat endpoint.

### 3. Chat page bundle size

The `/chat` page is 262KB (the largest page). This includes the SSE streaming logic, markdown rendering, SQL/chart/table display components. Monitor this for performance on mobile connections.

### 4. Mock data user confusion

When OHLCV data falls back to mock, the "SAMPLE" badge may not be prominent enough. Users could mistake generated data for real market data. Consider making the mock state more visually distinct (e.g., watermark overlay, desaturated colors).

### 5. Authentication flow

The Next.js frontend stores JWT tokens in `localStorage` (via `api-client.ts` `authHeaders()`) and user IDs for watchlist scoping. The auth flow (register/login/refresh) is not yet wired to a UI login page in the Next.js app. Watchlist writes and content creation require authentication but there is no login UI.

### 6. Real-time data staleness

The TASI index chart has a 5-minute backend cache + 6-minute frontend refresh. During market hours, data can be up to 11 minutes stale. For a platform marketing "live" data, this lag should be documented or the refresh intervals reduced.

### 7. No announcements page

The API has full announcements CRUD (`/api/announcements`) but there is no dedicated `/announcements` page in the Next.js app. Announcements are not surfaced anywhere in the frontend.
