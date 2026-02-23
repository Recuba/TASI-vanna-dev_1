# TypeScript Type Safety Audit

**Scan date:** 2026-02-17
**Tool:** ast-grep + ripgrep
**Scope:** `frontend/src/` (`.ts` and `.tsx` files)

---

## Summary

| Category | Count |
|---|---|
| Explicit `any` type annotations | 5 |
| `as any` type assertions | 1 |
| `as unknown as` double assertions | 4 |
| `@ts-ignore` / `@ts-nocheck` comments | 0 |
| `eslint-disable @typescript-eslint/no-explicit-any` | 2 |
| Non-null assertions (`!`) | 11 |
| **Total findings** | **23** |

**Overall assessment:** The codebase is in good shape. Most `unknown` usage is correct and intentional. The `any` usage is limited to two files (5 annotations + 1 assertion), both with reasonable justifications. Non-null assertions are concentrated in test files with one exception in production code.

---

## 1. Explicit `any` Type Annotations

### File: `src/lib/monitoring/swr-middleware.ts`

**Lines 15-17** | Severity: **MEDIUM**

```typescript
/* eslint-disable @typescript-eslint/no-explicit-any */
export const metricsMiddleware: Middleware = (useSWRNext: any) => {
  return (key: any, fetcher: any, config: any) => {
```

**Context:** SWR middleware wrapping function. The SWR `Middleware` type from the `swr` package itself has complex generic signatures that are difficult to type correctly at the middleware boundary.

**Impact:** Internal utility module, not exposed in any public API or component props.

**Recommendation:** Use the proper SWR generic types. The SWR library exports `SWRHook` and related types that can be used here:

```typescript
import type { Middleware, SWRHook, SWRConfiguration, Fetcher, Key } from 'swr';

export const metricsMiddleware: Middleware = (useSWRNext: SWRHook) => {
  return <Data = unknown, Error = unknown>(
    key: Key,
    fetcher: Fetcher<Data> | null,
    config: SWRConfiguration<Data, Error>
  ) => {
```

Alternatively, if SWR's exported types are insufficient, narrow to `unknown` rather than `any`:

```typescript
export const metricsMiddleware: Middleware = (useSWRNext: unknown) => {
  return (key: unknown, fetcher: unknown, config: unknown) => {
```

The `eslint-disable` comment on line 15 confirms this was a conscious decision, but it should still be revisited.

---

## 2. `as any` Type Assertions

### File: `src/lib/export/exporters.ts`

**Lines 116-117** | Severity: **MEDIUM**

```typescript
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(doc as any).autoTable({
```

**Context:** The `jspdf-autotable` plugin adds `autoTable` as a method on `jsPDF` instances, but the base `jsPDF` type definition does not include it. This is a known typing gap with the `jspdf-autotable` library.

**Impact:** Internal export utility. The `autoTable` call is well-understood and stable.

**Recommendation:** Import the augmented type from `jspdf-autotable`:

```typescript
import 'jspdf-autotable';
// or:
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

// Then call directly:
autoTable(doc, {
  head: [data.columns],
  body: bodyRows,
  // ...
});
```

The `jspdf-autotable` package ships its own type augmentation for `jsPDF`. Importing it should resolve the typing issue without needing `as any`.

---

## 3. `as unknown as` Double Type Assertions

These use the `unknown` intermediate step (safer than direct `as any`), but still bypass the type system.

### File: `src/components/chat/ChartBlock.tsx`

**Line 52** | Severity: **MEDIUM**

```typescript
const Plotly = (window as unknown as Record<string, unknown>).Plotly as {
  downloadImage: (el: HTMLElement, opts: Record<string, unknown>) => Promise<void>;
} | undefined;
```

**Context:** Accessing the global `Plotly` object injected by `react-plotly.js` at runtime. The `window` object doesn't have a `Plotly` property in its type definition.

**Recommendation:** Declare a global type augmentation:

```typescript
// In a .d.ts file or at the top of the module:
declare global {
  interface Window {
    Plotly?: {
      downloadImage: (el: HTMLElement, opts: Record<string, unknown>) => Promise<void>;
    };
  }
}

// Then use:
const Plotly = window.Plotly;
```

### File: `src/test/setup.ts`

**Line 9** | Severity: **LOW** (test infrastructure)

```typescript
globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;
```

**Context:** Mock setup for jsdom which lacks `ResizeObserver`. This is standard test boilerplate.

**Recommendation:** Acceptable in test setup. Alternatively, make the mock implement the full `ResizeObserver` interface:

```typescript
class ResizeObserverMock implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverMock;
```

### File: `src/lib/export/__tests__/exporters.test.ts`

**Line 39** | Severity: **LOW** (test code)

```typescript
} as unknown as HTMLAnchorElement;
```

**Context:** Creating a partial mock of `HTMLAnchorElement` for testing the download helper. This is a standard test pattern for mocking DOM elements.

**Recommendation:** Acceptable in test code. No change needed.

### File: `src/components/charts/__tests__/CandlestickChart.test.tsx`

**Line 50** | Severity: **LOW** (test code)

```typescript
Component = m.default ?? (mod as unknown as React.ComponentType<Record<string, unknown>>);
```

**Context:** Mocking `next/dynamic` for test purposes. The dynamic import resolution requires coercing the module shape.

**Recommendation:** Acceptable in test code. No change needed.

---

## 4. `@ts-ignore` / `@ts-nocheck` / `@ts-expect-error` Comments

**No findings.** The codebase does not use any TypeScript suppression comments. This is excellent.

---

## 5. ESLint Disable Comments for `@typescript-eslint/no-explicit-any`

| File | Line | Scope |
|---|---|---|
| `src/lib/monitoring/swr-middleware.ts` | 15 | File-level (`/* eslint-disable */`) |
| `src/lib/export/exporters.ts` | 116 | Line-level (`// eslint-disable-next-line`) |

**Note:** Both are documented in sections 1 and 2 above. The file-level disable in `swr-middleware.ts` is broader and should be narrowed to line-level disables if the types cannot be properly fixed.

---

## 6. Non-Null Assertions (`!`)

### Production Code

#### File: `src/app/news/[id]/page.tsx`

**Line 646** | Severity: **HIGH**

```typescript
href={article.source_url!}
```

**Line 669** | Severity: **HIGH**

```typescript
href={article.source_url!}
```

**Context:** The `source_url` field is typed as `string | null` in the API client types. Both usages are guarded by `isValidUrl(article.source_url)` checks on lines 644 and 666 respectively, which should return `false` for `null`. However, TypeScript's control flow analysis does not narrow through custom guard functions unless they are typed as type predicates.

**Recommendation:** Make `isValidUrl` a type predicate so TypeScript narrows automatically:

```typescript
function isValidUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}
```

With this change, inside the `{isValidUrl(article.source_url) && (...)}` block, TypeScript will know `article.source_url` is `string`, eliminating the need for `!`.

### Test Code

#### File: `src/test/integration/chart-data-flow.test.tsx`

**Lines 62, 102, 135, 159, 196** | Severity: **LOW**

```typescript
expect(result.current.data!.length).toBeGreaterThan(0);
// ...
const first = result.current.data![0];
```

**Context:** All 5 usages follow an `expect(result.current.data).not.toBeNull()` assertion on the preceding line. The non-null assertion is safe at runtime because the test would already have failed if `data` were null.

**Recommendation:** Acceptable in test code where a null check assertion precedes the usage. Alternatively, use a local variable with an explicit guard:

```typescript
const data = result.current.data;
expect(data).not.toBeNull();
if (!data) throw new Error('unreachable'); // satisfies TypeScript
expect(data.length).toBeGreaterThan(0);
```

#### File: `src/lib/__tests__/session-manager.test.ts`

**Line 55** | Severity: **LOW**

```typescript
expect(refreshed!.expiresAt).toBeGreaterThan(originalExpiry);
```

**Context:** Preceded by `expect(refreshed).not.toBeNull()` on line 54. Same pattern as chart tests.

**Recommendation:** Acceptable in test code.

#### File: `src/lib/__tests__/news-feed.test.ts`

**Lines 141-142** | Severity: **LOW**

```typescript
expect(result.current.data!.items).toHaveLength(2);
expect(result.current.data!.total).toBe(2);
```

**Context:** Preceded by `expect(result.current.data).not.toBeNull()` on line 140. Same pattern.

**Recommendation:** Acceptable in test code.

---

## Findings by File

| File | `any` | `as any` | `as unknown as` | `!` assertions | Total |
|---|---|---|---|---|---|
| `src/lib/monitoring/swr-middleware.ts` | 4 | 0 | 0 | 0 | 4 |
| `src/lib/export/exporters.ts` | 0 | 1 | 0 | 0 | 1 |
| `src/app/news/[id]/page.tsx` | 0 | 0 | 0 | 2 | 2 |
| `src/components/chat/ChartBlock.tsx` | 0 | 0 | 1 | 0 | 1 |
| `src/test/setup.ts` | 0 | 0 | 1 | 0 | 1 |
| `src/test/integration/chart-data-flow.test.tsx` | 0 | 0 | 0 | 7 | 7 |
| `src/lib/__tests__/session-manager.test.ts` | 0 | 0 | 0 | 1 | 1 |
| `src/lib/__tests__/news-feed.test.ts` | 0 | 0 | 0 | 2 | 2 |
| `src/lib/export/__tests__/exporters.test.ts` | 0 | 0 | 1 | 0 | 1 |
| `src/components/charts/__tests__/CandlestickChart.test.tsx` | 0 | 0 | 1 | 0 | 1 |
| **Total** | **4** | **1** | **4** | **12** | **21** |

---

## Severity Summary

| Severity | Count | Details |
|---|---|---|
| **HIGH** | 2 | Non-null assertions on `source_url` in production page component |
| **MEDIUM** | 3 | `any` annotations in SWR middleware (4 occurrences, 1 file) + `as any` in PDF exporter + `as unknown as` in ChartBlock |
| **LOW** | 16 | All test-code non-null assertions and test-code double assertions |

---

## Positive Observations

1. **No `@ts-ignore` or `@ts-nocheck` comments** anywhere in the codebase.
2. **No `Record<string, any>` usage** -- the codebase consistently uses `Record<string, unknown>` instead, which is the correct pattern.
3. **No `Function` type usage** -- all function types use proper signatures.
4. **`unknown` is used correctly** throughout (`use-sse-chat.ts`, `validators.ts`, `api-client.ts`, etc.) for type narrowing with proper guard functions.
5. **Only 5 explicit `any` annotations** across the entire frontend, all in 2 internal utility files.
6. **ESLint `@typescript-eslint/no-explicit-any` rule is active** and enforced, with only 2 files opting out (both with documented reasons).

---

## Recommended Actions

### Priority 1 (should fix)
- [ ] **`src/app/news/[id]/page.tsx`**: Convert `isValidUrl` to a type predicate to eliminate both `!` assertions on `source_url`.

### Priority 2 (nice to fix)
- [ ] **`src/lib/export/exporters.ts`**: Import `jspdf-autotable` type augmentation to eliminate `as any`.
- [ ] **`src/lib/monitoring/swr-middleware.ts`**: Replace `any` with proper SWR types or `unknown`.
- [ ] **`src/components/chat/ChartBlock.tsx`**: Add global `Window` type augmentation for `Plotly`.

### Priority 3 (acceptable as-is)
- All test-code non-null assertions (guarded by preceding `.not.toBeNull()` expectations).
- Test-code `as unknown as` double assertions for mocking DOM elements and dynamic imports.
