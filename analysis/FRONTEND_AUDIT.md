# Frontend Code Quality Audit

**Date:** 2026-02-17
**Scope:** `frontend/src/` -- all TypeScript/TSX source files
**Auditor:** frontend-auditor agent

---

## Executive Summary

The Ra'd AI frontend is a substantial Next.js 14 application with ~110 `'use client'` modules, well-structured API hooks, and a solid design system. Overall code quality is **good**, with strong patterns in data fetching (AbortController, cleanup), SSE reconnection, RTL support, and design token usage. Key areas for improvement center on **oversized components**, **hardcoded colors bypassing the design system**, and **limited React.memo usage** for list items.

| Category | Rating | Notes |
|---|---|---|
| TypeScript Safety | A | `strict: true`, only 3 `any` usages (all justified with eslint-disable) |
| React Best Practices | B+ | Good cleanup patterns; some excessive useState in large pages |
| Accessibility | B | Core interactive elements have ARIA labels; gaps in SVG icons and scrollable regions |
| RTL Compliance | B+ | Mostly logical properties; ~12 physical direction class usages remain |
| Design System Consistency | B- | Design tokens well-defined but heavily bypassed in api-docs and some components |
| Component Decomposition | C+ | 7 files exceed 500 lines; MarketOverviewClient at 1085 lines |
| Dead Code | A- | No TODO/FIXME/HACK comments found; no dangerouslySetInnerHTML usage |
| State Management | B | Appropriate useMemo/useCallback (149 total); some pages overuse useState |
| SSR Compatibility | A | All window/document access properly guarded with typeof checks or inside useEffect |
| Performance | B | Missing React.memo on list renderers; 1 memo usage total (TradingViewWidget) |
| Error States | A- | Route-level error.tsx and loading.tsx present for all major routes |

---

## 1. TypeScript Safety

### Findings

**tsconfig.json:** `strict: true` is enabled -- excellent.

**`any` type usage (3 instances, all justified):**

| File | Line | Context | Justification |
|---|---|---|---|
| `lib/export/exporters.ts` | 117 | `(doc as any).autoTable(...)` | jspdf-autotable augments jsPDF without TS types; eslint-disable present |
| `lib/monitoring/swr-middleware.ts` | 16-17 | `(useSWRNext: any)` etc. | SWR Middleware type is complex; eslint-disable present |

**Verdict:** The `any` usage is minimal and annotated. No untyped component props, no missing return types on exported functions. This is excellent for a project of this size.

---

## 2. React Best Practices

### useEffect Cleanup Analysis

**Well-handled (with proper cleanup):**
- `LiveMarketWidgets.tsx:136` -- EventSource closed + timeout cleared in cleanup
- `news/page.tsx:137-208` -- EventSource closed + polling interval cleared
- `Header.tsx:30-47` -- AbortController aborted + interval cleared
- `AuthContext.tsx:125-159` -- AbortController aborted + interval cleared
- `use-api.ts:88-93` -- AbortController aborted in cleanup
- `use-market-data.ts:126-139` -- Interval cleared in cleanup
- `use-sse-chat.ts:287-299` -- EventSource closed

**Potential issues:**

1. **`news/page.tsx`** -- 14 separate `useEffect` calls in a single component (lines 48-279). While each has proper cleanup, this quantity suggests the component is doing too much and should be decomposed.

2. **`news/[id]/page.tsx`** -- 6 `useEffect` calls (lines 142-449), similarly overloaded.

3. **`CommandPalette.tsx`** -- 5 `useEffect` calls (lines 142-300). The module-level localStorage access (line 43-50) runs at import time, which is safe due to `typeof window` guard but is an unusual pattern.

### Missing Dependency Arrays

No instances of `useEffect` without dependency arrays were found (excluding intentional mount-only `[]` patterns). The eslint-disable on `use-api.ts:85` for the `deps` spread is acceptable.

### Timer Cleanup

All `setInterval`/`setTimeout` calls that store refs properly clear them in cleanup:
- `LiveMarketWidgets.tsx` -- timerRef cleared
- `Header.tsx` -- interval cleared
- `AuthContext.tsx` -- interval + controller cleared
- `use-market-data.ts` -- intervalRef cleared
- `use-sse-chat.ts` -- flushTimerRef cleared

**Minor issue:** `SQLBlock.tsx:21` and `QueryHistoryItem.tsx:46` use `setTimeout(() => setCopied(false), 2000)` without cleanup. If the component unmounts within 2 seconds of copying, this will cause a no-op setState on unmounted component (harmless in React 18+ but still a code smell).

---

## 3. Accessibility

### Good Practices Found
- `Header.tsx` -- `aria-label` on hamburger, language toggle, and theme toggle buttons (lines 71, 171, 184)
- `LiveMarketWidgets.tsx` -- `aria-hidden="true"` on decorative icons (line 217)
- `ScrollToTop.tsx` -- `aria-label` present
- `CommandPalette.tsx` -- `aria-label` on input
- `MarketOverviewClient.tsx` -- `aria-hidden` on decorative SVGs (line 80)
- Error/loading/empty state components have descriptive text

### Gaps

| Issue | Location | Impact |
|---|---|---|
| Scrollable quote ticker has no `role="region"` or `aria-label` | `LiveMarketWidgets.tsx:199` | Screen readers cannot identify the scrollable region |
| SVG icons throughout Header (search, sun/moon) lack `aria-hidden="true"` | `Header.tsx:155,187-200` | Redundant for buttons with aria-labels but best practice to mark decorative SVGs |
| News SSE status indicator dot lacks text alternative | `Header.tsx:207-214` | The dot is `aria-hidden` but the status text is `hidden sm:inline`, meaning mobile users get no status info |
| Chart components (TASIIndexChart, CandlestickChart, StockOHLCVChart) render canvas with no `aria-label` | Multiple chart files | Charts are inaccessible to screen readers |
| Form inputs in charts/page.tsx search lack `<label>` elements | `charts/page.tsx:333-340` | Search inputs have placeholder text only |

### Recommendation
- Add `role="region"` and `aria-label` to scrollable containers
- Add `role="img"` and `aria-label` to chart container divs
- Ensure mobile has visible status text or an accessible alternative

---

## 4. RTL Compliance

### Physical Direction Classes Found (~12 instances)

| File | Class | Context | Assessment |
|---|---|---|---|
| `charts/page.tsx:333` | `left-3` | Absolute-positioned search icon | Should use `start-3` for RTL |
| `charts/page.tsx:587` | `left-0 right-0` | Tab underline (full-width) | Acceptable -- spans full width |
| `charts/page.tsx:606` | `left-3` | Another search icon | Should use `start-3` |
| `reports/page.tsx:135` | Conditional `right-3`/`left-3` | Search icon with RTL check | Acceptable -- manual RTL handling |
| `market/page.tsx:209` | Conditional `right-3`/`left-3` | Search icon with RTL check | Acceptable -- manual RTL handling |
| `news/[id]/page.tsx:159` | `left-0 right-0` | Progress bar (full-width) | Acceptable |
| `news/[id]/page.tsx:268` | `right-0` | Tooltip absolute positioning | Potentially incorrect in LTR |
| `stock/[ticker]/StockDetailClient.tsx:50` | `left-1/2` | Centered toast | Acceptable -- centered transform |
| `stock/[ticker]/StockDetailClient.tsx:202,215` | `left-0` | Sticky first column in table | Acceptable -- CSS sticky requires physical positioning |
| `Toast.tsx:154` | `left-1/2` | Centered toast container | Acceptable -- centered transform |
| `chat/ChartBlock.tsx:79` | `left-2` | Absolute-positioned badge | Should use `start-2` |

**Summary:** Most violations are acceptable (centering with `left-1/2 -translate-x-1/2`, full-width bars, or manual RTL conditional). Two genuine issues: `charts/page.tsx` search icons (lines 333, 606) and `ChartBlock.tsx:79` should use logical `start-*`.

---

## 5. Design System Consistency

### Design System Tokens (`styles/design-system.ts`)

Well-structured with proper const assertions:
- Colors: gold, bg, text, accent (dark + light mode)
- Spacing, radii, typography, layout, transitions, gradients, breakpoints
- Tailwind-compatible token export

### Hardcoded Colors (Bypassing Design System)

**Severe -- `api-docs/page.tsx`:** Contains 60+ hardcoded hex values in inline CSS (`#0E0E0E`, `#1A1A1A`, `#D4A84B`, `#b0b0b0`, `#333`, etc.). This entire page styles a Swagger UI embed and does not use CSS variables or design tokens at all.

**Moderate -- scattered components:**
| File | Example | Should Be |
|---|---|---|
| `LiveMarketWidgets.tsx:152,185` | `border-[#D4A84B]/10` | `gold-border` or `border-gold/10` |
| `MessageBubble.tsx:37` | `text-[#0E0E0E]` | `text-dark-bg` |
| `chat/error.tsx:61` | `text-[#0E0E0E]` | `text-dark-bg` |
| `chat/loading.tsx:18` | `border-[#2A2A2A]` | `border-[var(--bg-input)]` |
| `Header.tsx:150-151` | `border-[#2A2A2A]`, `border-[#D4A84B]/30` | Use CSS variables |
| `charts/page.tsx:17,22` | `dark:bg-[#1A1A1A]` | `dark:bg-dark-card` |
| `auth/AccessDenied.tsx:58` | `bg-gold text-[#0E0E0E]` | `text-dark-bg` |
| `MarketOverviewClient.tsx:29-43` | Constants duplicate design system colors | Import from design-system.ts |

**Assessment:** MarketOverviewClient duplicates the entire color palette as local constants (`C.gold`, `C.green`, etc.) instead of importing from the design system. This creates maintenance burden.

---

## 6. Component Decomposition

### Oversized Components (>300 lines)

| File | Lines | useState Count | useEffect Count | Assessment |
|---|---|---|---|---|
| `MarketOverviewClient.tsx` | 1085 | 6 | 3 | **Critical** -- contains Sparkline, CorrelationGraph, and the entire market dashboard. Should extract sub-components |
| `charts/page.tsx` | 865 | 12 | 4 | **High** -- has StockChartPanel as internal component. Should extract search panel, tab content |
| `news/page.tsx` | 753 | 14 | 14 | **High** -- already decomposed FilterBar/ArticleCard etc. but page itself still too large. SSE logic + scroll restoration + virtual list + bookmark handling all in one component |
| `news/[id]/page.tsx` | 740 | ~12 | 6 | **High** -- article detail with sharing, related articles, reading progress, bookmark. Should extract ReadingProgressBar, ShareButtons, RelatedArticles |
| `TASIIndexChart.tsx` | 654 | ~4 | 4 | **Medium** -- chart setup complexity justifies size somewhat |
| `StockOHLCVChart.tsx` | 634 | ~4 | 4 | **Medium** -- similar to TASIIndexChart |
| `watchlist/page.tsx` | 588 | ~8 | 3 | **Medium** -- could extract WatchlistTable, AddStockDialog |
| `StockDetailClient.tsx` | 539 | ~6 | 1 | **Medium** -- could extract FinancialStatements section |
| `CandlestickChart.tsx` | 522 | ~3 | 4 | **Medium** -- chart complexity |
| `CommandPalette.tsx` | 473 | ~6 | 5 | **Medium** -- could extract SearchResults, RecentItems |

### Prop Drilling

No severe prop drilling detected. The codebase uses:
- `LanguageProvider` context for i18n
- `ThemeProvider` context for theme
- `RBACAuthProvider` for auth
- Direct prop passing for component-specific data

---

## 7. Dead Code

### Positive Findings
- **No TODO/FIXME/HACK comments** found in any source file
- **No `dangerouslySetInnerHTML`** usage anywhere
- **No commented-out code blocks** detected in sampled files
- Module-level localStorage migration code (e.g., `charts/page.tsx:62-68`, `CommandPalette.tsx:43-50`) is intentional backward-compatibility

### Potential Unused Exports
- `lib/performance/utils.ts` -- debounce utility; verify if used
- `lib/performance/cache-headers.ts` -- check if imported
- `lib/monitoring/web-vitals.ts` -- initWebVitals only shown in a comment example

---

## 8. State Management

### useState Counts per Component

| Component | useState Count | Assessment |
|---|---|---|
| `news/page.tsx` | 14 | **Excessive** -- many booleans (retrying, loadingMore, searchLoading, isSticky, savedLoading) could be consolidated into a state machine or reducer |
| `charts/page.tsx` | 12 | **High** -- tab state, search state, fullscreen, compare tickers |
| `news/[id]/page.tsx` | ~12 | **High** -- reading progress, copied state, show-loading, related articles |
| `watchlist/page.tsx` | ~8 | Acceptable |
| `MarketOverviewClient.tsx` | 6 | Acceptable |

### useMemo / useCallback Usage

149 total `useMemo`/`useCallback` calls across 41 files. Key observations:
- `LiveMarketWidgets.tsx` -- properly memoizes Intl.NumberFormat formatters
- `AuthContext.tsx` -- context value properly memoized with useMemo
- `use-api.ts` -- execute callback properly memoized
- `news/page.tsx` -- sourceCounts properly memoized

**Missing memoization:**
- `news/page.tsx` virtual list items rendered inline without memoized callbacks for bookmark toggling
- `charts/page.tsx` POPULAR_STOCKS array is defined outside component (good), but search results filtering could benefit from useMemo

---

## 9. SSR Compatibility

### window/document Access

All `window` and `document` accesses are properly guarded:

| Pattern | Count | Example |
|---|---|---|
| `typeof window !== 'undefined'` guard | 10+ | `api-client.ts:188`, `charts/page.tsx:62,71,81` |
| `typeof document === 'undefined'` guard | 3 | `cookies.ts:17,26,54` |
| Inside `useEffect` (client-only) | All | `ThemeProvider.tsx:31`, `LanguageProvider.tsx:33` |
| Module-level with guard | 3 | `use-sse-chat.ts:15`, `CommandPalette.tsx:43`, `charts/page.tsx:62` |

**No unguarded window/document access found.** This is excellent SSR hygiene.

### Dynamic Imports

Chart components use `next/dynamic` with `ssr: false`:
- `StockComparisonChart` (charts/page.tsx:15)
- `PreBuiltCharts` (charts/page.tsx:20)

---

## 10. Performance

### React.memo Usage

**Only 1 component uses `React.memo`:** `TradingViewWidget.tsx:118`

**Components that should be memoized:**
| Component | Reason |
|---|---|
| `ArticleCard.tsx` | Rendered in list via virtualizer; receives callbacks as props |
| `LiveMarketWidgets` quote items | Inline in `.map()` -- should extract and memo QuoteCard |
| `CommandPalette` search result items | Rendered in filtered list |
| `QueryHistoryItem.tsx` | Rendered in list |
| `FilterBar` chips | Mapped array of filter buttons |

### Inline Object/Function Creation in JSX

| File | Line | Issue |
|---|---|---|
| `charts/page.tsx:351` | `onBlur={() => setTimeout(...)}` | Inline function in event handler (minor -- onBlur is infrequent) |
| `charts/page.tsx:625` | `onBlur={() => setTimeout(...)}` | Same pattern |
| `news/page.tsx` inline virtualizer row renderer | Creates objects on each render | Should be extracted to a memoized component |

### key Props in Lists

113 `key={}` usages found across 49 files with 151 `.map()` calls. Most lists have proper keys (typically `key={item.id}` or `key={item.ticker}`). No index-as-key anti-pattern detected for dynamic lists -- `Array.from()` skeleton loaders correctly use index keys since they are static.

---

## 11. Error States

### Route-Level Error Boundaries

| Route | `error.tsx` | `loading.tsx` |
|---|---|---|
| Root (`app/`) | Yes | Yes |
| `/news` | Yes | Yes |
| `/market` | Yes | Yes |
| `/charts` | Yes | Yes |
| `/chat` | Yes | Yes |
| `/markets` | Yes | Yes |
| `/watchlist` | N/A | Yes |
| `/reports` | N/A | N/A |
| `/announcements` | N/A | N/A |
| `/stock/[ticker]` | N/A | N/A |

**Gaps:** `/reports`, `/announcements`, `/stock/[ticker]`, and `/watchlist` lack dedicated `error.tsx` files. They fall back to the root `error.tsx` which is functional but loses route context.

### Data-Fetching Error Handling

All hooks via `useAsync` in `use-api.ts` return `{ data, loading, error, refetch }`. Checked pages:
- `news/page.tsx` -- handles loading, error, and empty states
- `market/page.tsx` -- handles loading and data states
- `charts/page.tsx` -- chart components have `ChartError`, `ChartEmpty`, `ChartSkeleton` states
- `watchlist/page.tsx` -- handles loading and empty states
- `MarketOverviewClient.tsx` -- has loading states

**Minor gap:** `announcements/page.tsx` and `reports/page.tsx` should be verified for empty state handling.

---

## Priority Recommendations

### P0 (Should fix)
1. **Decompose `MarketOverviewClient.tsx`** (1085 lines) -- extract Sparkline, correlation graph, table sections into separate files
2. **Reduce `news/page.tsx` state complexity** (14 useState) -- consider `useReducer` for related state transitions (loading/error/retrying)
3. **Add error.tsx** to `/reports`, `/announcements`, `/stock/[ticker]`, and `/watchlist` routes

### P1 (Should improve)
4. **Add React.memo** to `ArticleCard`, `QueryHistoryItem`, and extract `QuoteCard` from LiveMarketWidgets
5. **Replace hardcoded hex colors** with CSS variables or Tailwind design tokens, especially in `api-docs/page.tsx` and `MarketOverviewClient.tsx`
6. **Fix remaining RTL violations** in `charts/page.tsx` (lines 333, 606) and `ChartBlock.tsx` (line 79): `left-3` -> `start-3`, `left-2` -> `start-2`
7. **Add accessibility attributes** to chart containers (`role="img"`, `aria-label`)

### P2 (Nice to have)
8. **Extract search panel and tab content** from `charts/page.tsx` (865 lines)
9. **Extract ReadingProgressBar and ShareButtons** from `news/[id]/page.tsx` (740 lines)
10. **Add timer cleanup** for `setCopied(false)` timeouts in `SQLBlock.tsx` and `QueryHistoryItem.tsx`
11. **Verify unused exports** in `lib/performance/` and `lib/monitoring/`

---

## Metrics Summary

| Metric | Value |
|---|---|
| Total `'use client'` modules | 110 |
| Total `useEffect` calls | ~90 |
| Total `useMemo`/`useCallback` | 149 |
| Total `React.memo` | 1 |
| `any` type usages | 3 (all with eslint-disable) |
| Physical direction class violations | ~3 genuine issues |
| Hardcoded hex colors (non-test) | ~70 (60 in api-docs alone) |
| Components >500 lines | 7 |
| Components >300 lines | 10 |
| Route error boundaries | 6/10 routes |
| dangerouslySetInnerHTML | 0 |
| TODO/FIXME comments | 0 |
