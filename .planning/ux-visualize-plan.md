# UX-Visualize Implementation Plan

## Overview
Create data visualization components, admin dashboard, and responsive design for Ra'd AI frontend.

## Dependencies on Other Teammates
Since RoleGuard, ExportButton, Skeletons, and metricsCollector don't exist yet (being built by rbac-auth, ux-history, frontend-perf, monitoring-obs), I will:
- Create local stub/fallback imports where needed
- Use conditional imports or inline fallbacks so the code compiles regardless of teammate progress
- Components will work standalone and integrate seamlessly once dependencies land

## Phase 1: Foundational

### Task 1 - AutoChart Component + Chart Types
**New files:**
- `frontend/src/components/visualization/AutoChart.tsx` - Smart chart selector
- `frontend/src/components/visualization/chart-types/LineChart.tsx` - recharts Line
- `frontend/src/components/visualization/chart-types/BarChart.tsx` - recharts Bar
- `frontend/src/components/visualization/chart-types/PieChart.tsx` - recharts Pie
- `frontend/src/components/visualization/chart-types/ScatterChart.tsx` - recharts Scatter
- `frontend/src/components/visualization/chart-types/KPICard.tsx` - Single metric display
- `frontend/src/components/visualization/chart-types/index.ts` - Re-exports

**Data analysis logic** in AutoChart:
1. Check if data has a date/time column -> Line chart
2. Check if one column is categorical, another numeric -> Bar chart
3. Check if data has proportional values (percentages, shares) -> Pie chart
4. Check if two numeric columns -> Scatter chart
5. Single row with single numeric value -> KPI card
6. Default: Bar chart

**Theme:** All charts use dark-gold: gold (#D4AF37) primary, dark (#1a1a2e) bg, secondary colors from design-system.ts accent colors.

**Package:** Add `recharts@latest` to package.json dependencies.

## Phase 2: Integration

### Task 2 - Enhanced DataTable
**New files:**
- `frontend/src/components/visualization/DataTable.tsx` - Sortable, filterable, paginated
- `frontend/src/components/visualization/DataTableHeader.tsx` - Sortable header with arrows

**Features:**
- Sort by clicking column headers (asc/desc/none cycle)
- Filter input per column (text search)
- Pagination: configurable page size (10/25/50/100)
- Virtual scrolling with @tanstack/react-virtual for 1000+ rows
- Sticky header, dark-gold theme
- Export button slot (will import ExportButton when available, inline CSV fallback for now)
- Column resizing via drag handles

**Package:** Add `@tanstack/react-virtual@latest` to package.json.

### Task 3 - Query Result View
**New files:**
- `frontend/src/components/visualization/QueryResultView.tsx` - Combined chart+table
- `frontend/src/components/visualization/ResultToolbar.tsx` - View toggle + actions

**Features:**
- Three view modes: Chart Only, Table Only, Split View (default)
- Query metadata panel: execution time, row count, SQL query (collapsible code block)
- Loading state: shimmer skeletons matching existing ChartSkeleton pattern
- Error state with retry button
- ResultToolbar: view mode toggle buttons, export dropdown, fullscreen toggle

## Phase 3: Final

### Task 4 - Admin Dashboard
**New files:**
- `frontend/src/app/admin/page.tsx` - Admin dashboard page
- `frontend/src/app/admin/layout.tsx` - Admin layout with sidebar nav

**Sections (card grid):**
1. System Health - fetches GET /health and /health/ready, shows status indicators
2. Usage Stats - placeholder for metricsCollector integration (will show mock data until monitoring-obs teammate delivers)
3. Recent Queries - list of recent queries with timestamps
4. Rate Limit Status - current rate limit counters

**Auth:** Wrap with RoleGuard (stub if not available from rbac-auth teammate). Will create a lightweight fallback that checks localStorage for user role.

**Auto-refresh:** 30-second interval using existing useAsync pattern from use-api.ts.

### Task 5 - Responsive Design
**New files:**
- `frontend/src/components/visualization/ResponsiveWrapper.tsx` - Responsive container
- `frontend/src/lib/hooks/useBreakpoint.ts` - Breakpoint detection hook
- `frontend/src/components/visualization/MobileQueryInput.tsx` - Touch-friendly input

**Breakpoints** (matching tailwind config):
- mobile: < 640px
- tablet: 640px - 1024px
- desktop: > 1024px

**ResponsiveWrapper:** Renders children differently based on breakpoint - stacks on mobile, two-col on tablet, full on desktop. Collapses sidebar on mobile/tablet.

**MobileQueryInput:** Larger touch targets (min 44px), sticky bottom positioning, voice-input-ready placeholder.

**useBreakpoint hook:** Uses window.matchMedia with SSR safety (returns 'desktop' during SSR).

## Implementation Order
1. Add recharts and @tanstack/react-virtual to package.json
2. Create useBreakpoint hook (used by multiple components)
3. Create chart-types/ subdirectory components
4. Create AutoChart
5. Create DataTableHeader + DataTable
6. Create ResultToolbar + QueryResultView
7. Create admin layout + page
8. Create ResponsiveWrapper + MobileQueryInput
9. Run vitest to verify

## Testing Strategy
- Components will be tested via vitest if time permits
- All files will compile with `next build`
- No modifications to existing components/tests
