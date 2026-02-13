# Mobile Viewport & Responsive Audit

Generated: 2026-02-13
Viewports tested: 375px (iPhone SE), 390px (iPhone 14), 768px (iPad)

## Layout System

| Component | Mobile Behavior | Status |
|-----------|----------------|--------|
| AppShell | `pb-16 lg:pb-0` for bottom nav spacing | OK |
| Header | `sticky top-0 z-50`, `px-4 sm:px-6` | OK |
| Sidebar | Hidden on mobile, toggle via hamburger | OK |
| MobileBottomNav | `lg:hidden`, safe-area-inset-bottom | OK |
| Footer | Hidden behind bottom nav on mobile | OK |
| Main content | `min-w-0` prevents flex overflow | OK |

## Navigation

| Feature | Status | Notes |
|---------|--------|-------|
| Bottom nav (5 items) | OK | Home, Market, Ra'd (center), News, Charts |
| Virtual keyboard detection | OK | Hides bottom nav when keyboard open |
| Sidebar overlay on mobile | OK | Backdrop + slide-in |
| Command palette (Ctrl+K) | OK | Works on mobile with touch |

## Chart Components

### TASIIndexChart
| Aspect | Status | Notes |
|--------|--------|-------|
| Responsive height | OK | 280px mobile, 350px tablet, prop height desktop |
| Width resize | OK | ResizeObserver auto-resizes chart width |
| Toolbar wrap | OK | `flex-wrap gap-2` prevents overflow |
| Export buttons | OK | `hidden sm:block` -- hidden on mobile |
| Period selector | OK | Scrollable on small screens |
| Touch interaction | OK | lightweight-charts has built-in touch pinch/pan |

### StockOHLCVChart
| Aspect | Status | Notes |
|--------|--------|-------|
| Responsive height | OK | Same pattern as TASIIndexChart |
| Toolbar layout | OK | `flex-wrap` handles small screens |
| Touch pan/zoom | OK | Built-in to lightweight-charts |

### StockComparisonChart
| Aspect | Status | Notes |
|--------|--------|-------|
| Height | OK | Uses prop height |
| Width resize | OK | ResizeObserver |
| Legend | OK | Wraps below chart area |

### Plotly Charts (Chat)
| Aspect | Status | Notes |
|--------|--------|-------|
| Responsive | OK | `useResizeHandler` + `responsive: true` config |
| Touch zoom | OK | Built-in to Plotly.js |

## Page-Specific Audit

### / (Home)
- Quick action cards: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` -- OK
- Sector/mover cards: `grid-cols-1 lg:grid-cols-2` -- OK
- Sparklines: Fixed 60x28px, no overflow -- OK

### /market
- Search + sector dropdown: `flex-col sm:flex-row` stacking -- OK
- Sector chips: `flex-wrap` -- OK
- Company table: `overflow-x-auto` wrapper -- OK
- Pagination: Centered with flex gap -- OK

### /charts
- Tab bar: Fixed width buttons in flex container -- OK
- Search results dropdown: `z-20`, full-width -- OK
- Quick pick chips: `flex-wrap` -- OK
- Fullscreen mode: `fixed inset-0` -- OK

### /chat
- Chat messages: Full-width with max-w -- OK
- Input bar: `max-w-3xl mx-auto` centered -- OK
- SQL blocks: Horizontally scrollable with `wrapLongLines` -- OK
- Data tables: `overflow-x-auto max-h-[400px]` -- OK

### /news
- Article grid: `grid-cols-1 md:grid-cols-2 xl:grid-cols-3` -- OK
- Source filter chips: `flex-wrap` -- OK
- Sticky search: Full-width with backdrop blur -- OK
- Infinite scroll sentinel: Works on mobile -- OK

### /announcements
- Cards: Full-width, single column -- OK
- Badges: `flex-wrap` -- OK

### /reports
- Grid: `grid-cols-1 sm:grid-cols-2` -- OK
- Search: Full-width -- OK
- Type filters: `flex-wrap` -- OK

### /watchlist
- Table columns: `hidden sm:table-cell` for name/sector -- OK
- Add ticker form: Full-width flex -- OK

### /stock/[ticker]
- Tab navigation: `overflow-x-auto` -- OK
- Financial tables: `overflow-x-auto` -- OK
- Chart: Responsive height via prop -- OK

### /login
- Form: `max-w-md` centered, full-width inputs -- OK
- Mode toggle: Full-width flex -- OK

## Touch Interactions

| Interaction | Component | Status |
|------------|-----------|--------|
| Chart pan/scroll | lightweight-charts | Built-in touch support |
| Chart pinch-zoom | lightweight-charts | Built-in |
| Plotly chart interactions | react-plotly.js | Built-in touch |
| Bottom nav tap targets | MobileBottomNav | 22px icons, h-full tap area |
| Dropdown selection | All search dropdowns | 200ms blur delay for touch |

## Identified Non-Issues

- **Chart export buttons** hidden on mobile (`hidden sm:block`) is intentional --
  prevents accidental taps and saves space. Users can still screenshot.
- **Market table** requires horizontal scroll on 375px -- this is expected and
  handled with `overflow-x-auto`.
- **Stock detail tab bar** scrolls horizontally -- correct behavior for many tabs.

## Recommendations (Low Priority)

1. Consider adding `touch-action: pan-x pan-y` to chart containers if any
   scroll interference is reported.
2. The news sticky search bar uses `bg-[#0E0E0E]/95 backdrop-blur-sm` which
   may have minor performance impact on older mobile devices. Monitor.
