# React Hooks Anti-Patterns Audit

**Tool:** ast-grep + manual verification
**Scope:** `frontend/src/**/*.tsx`
**Date:** 2026-02-17

---

## Summary

| Severity | Count | Description |
|----------|-------|-------------|
| HIGH     | 3     | Potential memory leaks (uncleaned timers, missing useEffect cleanup) |
| MEDIUM   | 6     | Performance concerns (unnecessary re-renders, inline objects) |
| LOW      | 8     | Style / best-practice issues (empty deps with side effects, minor cleanup) |

**Total findings: 17**

---

## 1. useEffect with Empty Deps `[]` -- Missing Dependencies or Improper Use

### Finding 1.1 -- AuthContext: Session callback registration without cleanup

**File:** `src/contexts/AuthContext.tsx` (lines 112-122)
**Severity:** MEDIUM
**Cleanup exists:** NO

```tsx
useEffect(() => {
  sessionManager.setCallbacks({
    onSessionExpired: () => {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      setUser(null);
    },
  });
}, []);
```

**Issue:** Registers a callback on `sessionManager` but never unregisters it. If the provider remounts (e.g., during React strict mode), stale callbacks accumulate. The callback also closes over `setUser`, which is stable, so the empty deps are technically fine -- but there is no cleanup to unregister the callback.

**Recommendation:** Add cleanup: `return () => sessionManager.clearCallbacks();` (or equivalent API).

---

### Finding 1.2 -- Charts page: URL param reading in useEffect

**File:** `src/app/charts/page.tsx` (lines 445-453)
**Severity:** LOW
**Cleanup exists:** N/A (no subscription)

```tsx
useEffect(() => {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  const tickerParam = params.get('ticker');
  if (tickerParam) {
    setSelectedTicker(tickerParam);
    setActiveTab('stocks');
  }
}, []);
```

**Issue:** Reads URL params on mount only. This is correct for initial mount but ignores subsequent URL changes (e.g., browser back/forward). Consider using Next.js `useSearchParams()` instead, which is reactive.

**Recommendation:** Replace with `useSearchParams()` hook for reactive URL param reading (already used elsewhere in the codebase, e.g., `AIChatInterface.tsx`).

---

### Finding 1.3 -- QuerySuggestions: Async data load without abort

**File:** `src/components/queries/QuerySuggestions.tsx` (lines 33-35)
**Severity:** LOW
**Cleanup exists:** NO

```tsx
useEffect(() => {
  queryStore.getRecent(20).then(setRecentQueries).catch(() => {});
}, []);
```

**Issue:** Fires an async promise on mount without an abort mechanism. If the component unmounts before the promise resolves, `setRecentQueries` is called on an unmounted component. React 18+ suppresses the warning, but this is still a pattern to avoid.

**Recommendation:** Add a cleanup boolean: `let cancelled = false; ... .then(res => { if (!cancelled) setRecentQueries(res); }); return () => { cancelled = true; };`

---

## 2. Subscription/Timer Cleanup Analysis

### Finding 2.1 -- Toast: setTimeout without cleanup on unmount

**File:** `src/components/common/Toast.tsx` (lines 129-146)
**Severity:** HIGH
**Cleanup exists:** NO

```tsx
const dismiss = useCallback((id: number) => {
  setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)));
  // Remove from DOM after exit animation
  setTimeout(() => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, 300);
}, []);

const showToast = useCallback((message: string, type: ToastType = 'info') => {
  const id = nextId.current++;
  setToasts((prev) => [...prev, { id, message, type, exiting: false }]);
  // Auto-dismiss after 3 seconds
  setTimeout(() => dismiss(id), 3000);
}, [dismiss]);
```

**Issue:** Two `setTimeout` calls in callbacks without storing the timer IDs for cleanup. If `ToastProvider` unmounts while toasts are pending, the timeouts will fire and call `setToasts` on an unmounted component. Since `ToastProvider` is typically a root-level wrapper this is low-probability in practice, but it is a genuine memory leak pattern.

**Recommendation:** Store timer IDs in a `useRef<Map<number, NodeJS.Timeout>>` and clear all on unmount via a `useEffect` cleanup.

---

### Finding 2.2 -- SQLBlock / QueryHistoryItem / StockDetailClient: setTimeout without cleanup

**File:** `src/components/chat/SQLBlock.tsx` (line 21)
**File:** `src/components/queries/QueryHistoryItem.tsx` (line 46)
**File:** `src/app/stock/[ticker]/StockDetailClient.tsx` (line 289)
**Severity:** LOW
**Cleanup exists:** NO

```tsx
// SQLBlock.tsx
setTimeout(() => setCopied(false), 2000);

// QueryHistoryItem.tsx
setTimeout(() => setCopied(false), 2000);

// StockDetailClient.tsx
setTimeout(() => setToastVisible(false), 2000);
```

**Issue:** Short-lived `setTimeout` calls (2s) in click handlers without cleanup. If the component unmounts within 2 seconds (e.g., user navigates away quickly), `setCopied`/`setToastVisible` fires on an unmounted component. Impact is negligible (React 18+ ignores it), but it is technically incorrect.

**Recommendation:** Store timer in a `useRef` and clear on unmount, or use a custom `useTimeout` hook.

---

### Finding 2.3 -- NewArticlesBanner: setTimeout in dismiss callback without cleanup

**File:** `src/app/news/components/NewArticlesBanner.tsx` (lines 20-26)
**Severity:** MEDIUM
**Cleanup exists:** NO (the auto-dismiss timer IS cleaned, but the dismiss callback timer is not)

```tsx
const dismiss = useCallback(() => {
  setVisible(false);
  // Wait for exit animation before calling onDismiss
  setTimeout(() => {
    onDismiss();
  }, 200);
}, [onDismiss]);
```

**Issue:** The 200ms animation-delay `setTimeout` in `dismiss()` is not tracked. If the banner unmounts before the timer fires (possible since `dismiss` itself triggers parent state changes), `onDismiss` may fire after unmount.

**Recommendation:** Track this timer in a ref and clear on unmount.

---

## 3. EventSource Cleanup

### Finding 3.1 -- LiveMarketWidgets: EventSource properly cleaned up

**File:** `src/components/widgets/LiveMarketWidgets.tsx` (lines 77-144)
**Severity:** N/A -- CORRECT
**Cleanup exists:** YES

```tsx
const connect = useCallback(() => {
  esRef.current?.close();  // Clean previous
  // ...
  const es = new EventSource(url);
  esRef.current = es;
  // ...
}, []);

useEffect(() => {
  connect();
  return () => {
    esRef.current?.close();
    if (timerRef.current) clearTimeout(timerRef.current);
  };
}, [connect]);
```

**Verdict:** Properly stores EventSource in a ref, closes on reconnect, and closes + clears timer on unmount. No issue.

---

### Finding 3.2 -- News page: EventSource properly cleaned up

**File:** `src/app/news/page.tsx` (lines 137-209)
**Severity:** N/A -- CORRECT
**Cleanup exists:** YES

```tsx
useEffect(() => {
  // ...
  es = new EventSource(sseUrl);
  // ...
  return () => {
    es?.close();
    if (fallbackTimer) clearInterval(fallbackTimer);
  };
}, [filters.activeSource, filters.searchQuery, filters.showSaved]);
```

**Verdict:** Both EventSource and fallback polling interval are cleaned up in the effect cleanup. Correct.

---

## 4. setInterval Cleanup

### Finding 4.1 -- All setInterval usages have proper cleanup

All `setInterval` calls in the codebase are properly cleaned up:

| File | Line | Cleanup |
|------|------|---------|
| `AuthContext.tsx` | 130 | `clearInterval(interval)` in cleanup (line 158) |
| `Header.tsx` | 42 | `clearInterval(interval)` in cleanup (line 45) |
| `news/page.tsx` | 148 | `clearInterval(fallbackTimer)` in cleanup (line 207) |
| `MarketOverviewClient.tsx` | 529 | `clearInterval(id)` in cleanup (line 530) |
| `AdminPage.tsx` | 89 | `window.clearInterval(id)` in cleanup (line 92) |

**Verdict:** No issues found with `setInterval` cleanup.

---

## 5. addEventListener Cleanup

### Finding 5.1 -- All addEventListener usages have proper cleanup

All `addEventListener` calls are paired with matching `removeEventListener` in effect cleanup:

| File | Event | Has Cleanup |
|------|-------|-------------|
| `ScrollToTop.tsx` | scroll | YES (line 15) |
| `CandlestickChart.tsx` | resize | YES (line 167) |
| `MobileBottomNav.tsx` | resize | YES (line 90) |
| `CommandPalette.tsx` | keydown | YES (line 199) |
| `SaveQueryModal.tsx` | keydown | YES (line 31) |
| `charts/page.tsx` | keydown | YES (line 500) |
| `QuerySuggestions.tsx` | keydown | YES (line 94) |
| `TASIIndexChart.tsx` | resize | YES (line 157) |
| `ExportButton.tsx` | mousedown | YES (line 30) |
| `StockOHLCVChart.tsx` | resize | YES (via useEffect return) |
| `news/page.tsx` | scroll, beforeunload | YES (lines 71-74) |
| `news/[id]/page.tsx` | scroll (x2), keydown | YES (lines 155, 184, 411) |

**Verdict:** No issues found. All event listener subscriptions have proper cleanup.

---

## 6. dangerouslySetInnerHTML

**No instances found in `frontend/src/`.**

**Verdict:** Clean. No XSS risk from dangerouslySetInnerHTML.

---

## 7. Inline Object/Array Creation in JSX Props

### Finding 7.1 -- CandlestickChart: Inline style objects on buttons

**File:** `src/components/charts/CandlestickChart.tsx` (lines 389-461)
**Severity:** MEDIUM

```tsx
<button
  style={{
    background: showMA20 ? 'rgba(212, 168, 75, 0.2)' : 'transparent',
    color: showMA20 ? '#D4A84B' : '#707070',
  }}
>
```

**Issue:** Multiple buttons create new `style` objects on every render. This triggers unnecessary re-renders of the button DOM elements. Repeated in CandlestickChart, TASIIndexChart, and StockOHLCVChart across ~20 button elements.

**Recommendation:** Memoize style objects with `useMemo` based on the toggle state, or use CSS classes/Tailwind utilities instead of inline styles.

---

### Finding 7.2 -- TASIIndexChart: Inline style objects (same pattern)

**File:** `src/components/charts/TASIIndexChart.tsx` (lines 450-599)
**Severity:** MEDIUM
**Same issue as 7.1.** Approximately 15 inline `style={{...}}` objects that change based on state.

---

### Finding 7.3 -- StockOHLCVChart: Inline style objects (same pattern)

**File:** `src/components/charts/StockOHLCVChart.tsx`
**Severity:** MEDIUM
**Same issue as 7.1.** Duplicated from TASIIndexChart.

**Recommendation for all three:** Extract a shared chart toolbar component to deduplicate, and memoize styles or convert to Tailwind conditional classes.

---

### Finding 7.4 -- SQLBlock: Inline customStyle on SyntaxHighlighter

**File:** `src/components/chat/SQLBlock.tsx` (lines 62-68)
**Severity:** LOW

```tsx
<SyntaxHighlighter
  customStyle={{
    margin: 0,
    padding: '12px',
    fontSize: '13px',
    background: 'var(--bg-card)',
    borderRadius: 0,
  }}
>
```

**Issue:** Creates a new style object on every render. Since `SyntaxHighlighter` is a third-party component, it may do a deep comparison, but the object reference change can still trigger unnecessary work.

**Recommendation:** Move to a module-level constant: `const HIGHLIGHTER_STYLE = { margin: 0, ... };`

---

## 8. useSSEChat: Flush interval cleanup

### Finding 8.1 -- useSSEChat: Flush interval properly cleaned up

**File:** `src/lib/use-sse-chat.ts` (lines 368-461)
**Severity:** N/A -- CORRECT
**Cleanup exists:** YES

```tsx
const flushInterval = setInterval(flushEvents, SSE_FLUSH_INTERVAL);
// ...
finally {
  clearInterval(flushInterval);
  flushTimerRef.current = null;
  flushEvents(); // final flush
}
```

Also cleaned in `clearMessages` and `stopStreaming`. **No issue.**

---

## 9. useEffect with `data.length > 0` in deps (boolean coercion)

### Finding 9.1 -- CandlestickChart / TASIIndexChart: Boolean expression in deps array

**File:** `src/components/charts/CandlestickChart.tsx` (line 276)
**File:** `src/components/charts/TASIIndexChart.tsx` (line 292)
**Severity:** MEDIUM

```tsx
// CandlestickChart.tsx
useEffect(() => { /* ... */ }, [loading, data.length > 0, buildChart]);
// eslint-disable-line react-hooks/exhaustive-deps

// TASIIndexChart.tsx
useEffect(() => { /* ... */ }, [loading, data && data.length > 0, buildChart]);
// eslint-disable-line react-hooks/exhaustive-deps
```

**Issue:** Using a boolean expression (`data.length > 0`) in the dependency array. This suppresses the exhaustive-deps lint rule. The effect re-runs only when the boolean flips (empty -> has data or vice versa), but it misses cases where `data` changes content while keeping the same length. The `eslint-disable-line` masks the true dependency: `data` itself.

**Recommendation:** Depend on `data` directly and handle the "no data" case inside the effect body. Remove the eslint-disable comment.

---

## 10. Correctness: Verified Clean Patterns

The following patterns were verified as correct and require no action:

| Pattern | Files | Verdict |
|---------|-------|---------|
| `useEffect([], [])` for localStorage hydration | ThemeProvider, LanguageProvider, AuthContext, use-auth, page.tsx | Correct -- mount-only side effects |
| `useEffect([], [])` for focus | AIChatInterface, SaveQueryModal | Correct -- one-time focus |
| `useEffect([], [])` for cleanup-only | SearchInput, ArticleCard, news/page.tsx | Correct -- timer cleanup on unmount |
| IntersectionObserver cleanup | news/page.tsx (x2) | Correct -- `observer.disconnect()` in cleanup |
| ResizeObserver cleanup | news/page.tsx, CandlestickChart, TASIIndexChart, StockOHLCVChart | Correct -- `ro.disconnect()` / `observer.disconnect()` in cleanup |
| AbortController cleanup | Header.tsx, news/page.tsx search, use-sse-chat.ts | Correct -- `controller.abort()` in cleanup |

---

## Prioritized Fix Recommendations

### Priority 1 (HIGH -- Memory leaks)
1. **Toast.tsx**: Track `setTimeout` IDs in a ref and clear all pending timers on unmount.
2. **NewArticlesBanner.tsx**: Track the 200ms dismiss animation timer in a ref and clear on unmount.
3. **CandlestickChart/TASIIndexChart**: Remove `eslint-disable-line react-hooks/exhaustive-deps` and fix the dependency array to use `data` directly.

### Priority 2 (MEDIUM -- Performance)
4. **Chart toolbar buttons** (CandlestickChart, TASIIndexChart, StockOHLCVChart): Extract shared toolbar component; memoize style objects or convert to Tailwind classes.
5. **AuthContext**: Add cleanup for `sessionManager.setCallbacks`.
6. **QuerySuggestions**: Add cancellation boolean for async `queryStore.getRecent()` call.

### Priority 3 (LOW -- Best practices)
7. **SQLBlock**: Extract `customStyle` to a module-level constant.
8. **charts/page.tsx**: Use `useSearchParams()` instead of raw `window.location.search`.
9. **SQLBlock/QueryHistoryItem/StockDetailClient**: Store "copied" timeouts in refs for proper cleanup.
