# Bundle Analysis Report

Generated: 2026-02-13
Next.js: 14.2.35 | Node: 20.x | Build: production

## Summary

| Metric | Value |
|--------|-------|
| Shared JS (all pages) | 87.7 kB |
| Largest page (first-load) | /stock/[ticker] at 125 kB |
| Smallest page (first-load) | /_not-found at 87.8 kB |
| All pages under 150 kB | Yes |

## Per-Page First-Load JS

| Route | Page JS | First Load JS | Status |
|-------|---------|---------------|--------|
| / | 6.34 kB | 124 kB | OK |
| /_not-found | 138 B | 87.8 kB | OK |
| /announcements | 3.64 kB | 99.4 kB | OK |
| /charts | 5.58 kB | 118 kB | OK |
| /chat | 8.87 kB | 105 kB | OK |
| /login | 3.53 kB | 108 kB | OK |
| /market | 6.08 kB | 123 kB | OK |
| /news | 7.83 kB | 112 kB | OK |
| /news/[id] | 7.23 kB | 112 kB | OK |
| /reports | 4.2 kB | 109 kB | OK |
| /stock/[ticker] | 7.3 kB | 125 kB | OK |
| /watchlist | 8.52 kB | 113 kB | OK |

## Shared Chunks

| Chunk | Size |
|-------|------|
| chunks/117-*.js (React, Next.js runtime) | 31.7 kB |
| chunks/fd9d1056-*.js (framework) | 53.6 kB |
| Other shared chunks | 2.33 kB |

## Largest Dependencies

| Package | Loaded On | Strategy |
|---------|-----------|----------|
| plotly.js-dist-min (~240 kB) | /chat (on demand) | dynamic import, ssr: false |
| react-syntax-highlighter (~80 kB) | /chat (on demand) | dynamic import via SQLBlock |
| react-markdown (~30 kB) | /chat (on demand) | dynamic import |
| lightweight-charts v4.2.3 (~45 kB) | /charts, /market | dynamic import, ssr: false |
| react-plotly.js | /chat (on demand) | dynamic import, ssr: false |
| swr | All pages (shared) | Shared chunk |

## lightweight-charts Chunking

- Version: 4.2.3 (pinned, do NOT upgrade)
- Import strategy: `dynamic(() => import(...), { ssr: false })`
- Used in: TASIIndexChart, StockOHLCVChart, StockComparisonChart
- Separate chunk, loaded only on /charts and /stock/[ticker] pages
- ResizeObserver for responsive width

## Optimization Applied

### Chat page: 362 kB -> 105 kB (71% reduction)

The /chat page previously bundled plotly.js, react-syntax-highlighter, and
react-markdown in its first-load JS. These were converted to dynamic imports
in `AssistantContent.tsx`:

- `SQLBlock` (react-syntax-highlighter): now lazy-loaded
- `ChartBlock` (react-plotly.js): now lazy-loaded with ssr: false
- `ReactMarkdown`: now lazy-loaded

These components load on demand when the AI assistant returns SQL, charts,
or markdown content, keeping the initial chat page load fast.

## How to Run Bundle Analysis

```bash
cd frontend
ANALYZE=true npm run build
```

This opens an interactive treemap in the browser showing exact chunk composition.
Requires `@next/bundle-analyzer` (configured in `next.config.mjs`).
