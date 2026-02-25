# UX History Agent - Implementation Plan

## Overview
Build query history, saved queries, export functionality, and query suggestions for the Ra'd AI frontend. All 5 tasks across 3 phases.

## Phase 1: Foundation

### Task 1 - Query History Store
**Files to create:**
1. `frontend/src/types/queries.ts` - QueryRecord type definition
2. `frontend/src/lib/queries/query-store.ts` - IndexedDB-backed QueryStore class

**QueryRecord type:**
```typescript
interface QueryRecord {
  id: string;
  naturalLanguageQuery: string;
  generatedSql: string;
  results: { columns: string[]; rows: (string | number | null)[][] } | null;
  executedAt: number; // Unix timestamp ms
  executionTimeMs: number;
  rowCount: number;
  isFavorite: boolean;
  tags: string[];
  name?: string;  // For saved/named queries
  notes?: string; // User notes on favorites
}
```

**QueryStore class (IndexedDB via `idb` library):**
- DB name: `raid-query-history`, store: `queries`
- Methods: addQuery, getHistory(limit, offset), getQueryById, deleteQuery, clearHistory, searchHistory(text), getFavorites, toggleFavorite, updateQuery
- FIFO eviction at 500 records (delete oldest non-favorite on addQuery when over limit)
- Index on `executedAt` (sorting), `isFavorite` (filtering)

**Package change:** Add `idb@latest` to package.json dependencies

---

## Phase 2: Integration

### Task 2 - Query History UI
**Files to create:**
1. `frontend/src/components/queries/QueryHistory.tsx` - Main history panel/sidebar
2. `frontend/src/components/queries/QueryHistoryItem.tsx` - Individual entry component

**QueryHistory.tsx:**
- Scrollable list of past queries
- Filter controls: search text input, favorites-only toggle, date sort direction
- Sort options: by date (default), execution time, row count
- Uses QueryStore to load paginated history
- Click entry to expand/view details
- Re-run button dispatches query to chat

**QueryHistoryItem.tsx:**
- Collapsed: query text (truncated 80 chars), relative timestamp, execution time badge, row count, favorite star
- Expanded: full SQL in code block, result preview (first 3 rows)
- Actions: Re-run, Copy SQL, Delete, Toggle Favorite
- Relative timestamps using simple helper (no external library)
- Dark-gold themed with hover states

### Task 3 - Saved Queries / Favorites
**Files to create:**
1. `frontend/src/components/queries/SavedQueries.tsx` - Grid/list of favorites
2. `frontend/src/components/queries/SaveQueryModal.tsx` - Save modal

**SavedQueries.tsx:**
- Grid layout of favorited queries
- Tag filter chips, search bar
- Quick re-run button per card
- Share via copy-to-clipboard (formats query + SQL as text)

**SaveQueryModal.tsx:**
- Dark-gold modal overlay
- Fields: name (text), tags (comma-separated input), notes (textarea)
- Save/Cancel buttons
- Calls queryStore.updateQuery with name/tags/notes then toggleFavorite

---

## Phase 3: Final

### Task 4 - Export Functionality
**Files to create:**
1. `frontend/src/lib/export/exporters.ts` - CSV/Excel/PDF export functions
2. `frontend/src/components/queries/ExportButton.tsx` - Dropdown export button

**exporters.ts:**
- `exportToCsv(data, filename)`: Native Blob + URL.createObjectURL, proper CSV escaping with BOM for Arabic (matches existing DataTable.tsx pattern)
- `exportToExcel(data, filename)`: SheetJS (xlsx), header row, auto-column-width
- `exportToPdf(data, filename)`: jsPDF + jspdf-autotable, Ra'd AI title, timestamps, page numbers, alternating row colors (gold theme)

**ExportButton.tsx:**
- Dropdown button with CSV/Excel/PDF options
- Loading state during export
- Dark-gold themed, compact for toolbar use

**Package changes:** Add `xlsx@latest`, `jspdf@latest`, `jspdf-autotable@latest` to package.json

### Task 5 - Query Suggestions
**Files to create:**
1. `frontend/src/lib/queries/suggestions.ts` - Suggestion engine
2. `frontend/src/components/queries/QuerySuggestions.tsx` - Auto-suggest dropdown

**suggestions.ts:**
- `getSuggestions(input, recentQueries)`: returns ranked suggestion list
- Sources: recent queries from store, popular TASI queries (hardcoded list of ~15 AR/EN queries)
- Fuzzy matching: simple substring + word-boundary matching (no external library)
- Returns max 8 suggestions, recent queries prioritized

**QuerySuggestions.tsx:**
- Positioned below the query input (absolute/portal)
- Keyboard navigable: arrow up/down to select, Enter to use, Escape to dismiss
- Debounced input (300ms) using useRef timer
- Shows query source icon (clock for recent, star for popular)
- Dark-gold themed dropdown

---

## Dependencies & Coordination
- **rbac-auth**: Will import `useAuth` from `@/contexts/AuthContext` for export permission check IF the AuthContext exists. Since it's being built in parallel, I'll add a conditional check that gracefully degrades (allows export if no auth context available).
- **ux-visualize**: Export data format uses `{ columns: string[]; rows: (string|number|null)[][] }` matching existing SSETableData type.
- **frontend-tester**: Will provide test fixtures inline in test files.

## Testing Strategy
- Unit tests for QueryStore (IndexedDB mocked via fake-indexeddb or simple mock)
- Unit tests for suggestions.ts (fuzzy matching, ranking)
- Unit tests for exporters.ts (CSV escaping, data formatting)
- Component tests for QuerySuggestions (keyboard nav, debounce)

## File Summary (13 new files)
1. `frontend/src/types/queries.ts`
2. `frontend/src/lib/queries/query-store.ts`
3. `frontend/src/lib/queries/suggestions.ts`
4. `frontend/src/lib/export/exporters.ts`
5. `frontend/src/components/queries/QueryHistory.tsx`
6. `frontend/src/components/queries/QueryHistoryItem.tsx`
7. `frontend/src/components/queries/SavedQueries.tsx`
8. `frontend/src/components/queries/SaveQueryModal.tsx`
9. `frontend/src/components/queries/ExportButton.tsx`
10. `frontend/src/components/queries/QuerySuggestions.tsx`
11. `frontend/src/lib/queries/__tests__/query-store.test.ts`
12. `frontend/src/lib/queries/__tests__/suggestions.test.ts`
13. `frontend/src/lib/export/__tests__/exporters.test.ts`
