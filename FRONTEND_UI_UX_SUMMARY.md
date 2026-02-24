# Ra'd AI - Frontend & UI/UX Summary

**Project**: Ra'd AI - Saudi Stock Market Intelligence Platform
**Date**: 2026-02-08
**Version**: 1.0
**Status**: Production-ready (Legacy UI active, Next.js UI in development)

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Legacy Frontend (Active)](#2-legacy-frontend-active)
3. [Next.js Frontend (In Development)](#3-nextjs-frontend-in-development)
4. [Design System](#4-design-system)
5. [Chart Engine](#5-chart-engine)
6. [Data Visualization](#6-data-visualization)
7. [Responsive Design](#7-responsive-design)
8. [User Experience Flow](#8-user-experience-flow)
9. [Accessibility](#9-accessibility)
10. [Performance Considerations](#10-performance-considerations)
11. [Testing Coverage](#11-testing-coverage)
12. [Known Limitations & Future Work](#12-known-limitations--future-work)

---

## 1. Architecture Overview

The platform has two frontend implementations:

| Layer | Technology | Status | Served From |
|-------|-----------|--------|-------------|
| **Legacy UI** | Single HTML file + Vanna web component | **Active** | `templates/index.html` via FastAPI |
| **Next.js UI** | Next.js 14, TypeScript, Tailwind CSS | In development | `frontend/` (port 3000) |
| **Chart Engine** | Custom `RaidChartGenerator` (Plotly) | **Active** | `chart_engine/raid_chart_generator.py` |
| **Backend** | Vanna 2.0 + FastAPI (port 8084) | **Active** | `app.py` |

### Request Flow

```
User Browser (localhost:8084)
    |
    +--> GET / --> FastAPI serves templates/index.html
    |
    +--> <vanna-chat> Web Component (loaded from CDN)
    |       |
    |       +--> SSE: /api/vanna/v2/chat_sse
    |       +--> WS:  /api/vanna/v2/chat_websocket
    |       +--> Poll: /api/vanna/v2/chat_poll
    |
    +--> Vanna Agent (Claude Sonnet 4.5)
            |
            +--> RunSqlTool --> SQLite/PostgreSQL
            |
            +--> VisualizeDataTool --> RaidChartGenerator --> Plotly JSON
```

---

## 2. Legacy Frontend (Active)

**File**: `templates/index.html` (999 lines)
**Served at**: `http://localhost:8084/`

### Page Structure

```
+--------------------------------------------------+
|  HEADER (sticky, blurred backdrop)               |
|  [RA] Ra'd AI | Saudi Financial Intelligence  [*]|
+--------------------------------------------------+
|                                                  |
|     Saudi Stock Market AI Analyst                |
|     Ask questions in plain English...            |
|                                                  |
|  [~500 Companies] [10 Tables] [TASI] [Claude]   |
|                                                  |
|  TRY ASKING                                      |
|  [Bar: Top 10] [Heatmap: Profitability]          |
|  [Line: Aramco] [Scatter: Cap vs PE] ...         |
|                                                  |
|  +----------------------------------------------+|
|  |                                              ||
|  |          <vanna-chat> Web Component          ||
|  |                                              ||
|  |  SSE streaming, tool execution panel,        ||
|  |  Plotly chart rendering, markdown output     ||
|  |                                              ||
|  +----------------------------------------------+|
|                                                  |
+--------------------------------------------------+
|  Ra'd AI | Saudi Stock Market Intelligence       |
+--------------------------------------------------+
```

### Key HTML Elements

| Element | Class | Purpose |
|---------|-------|---------|
| `<header>` | `.app-header` | Sticky header with glassmorphism blur, brand mark, online status indicator |
| `<section>` | `.hero-section` | Title with gold gradient text, subtitle, stats bar |
| `<div>` | `.stats-bar` | 4 info pills: ~500 Companies, 10 Tables, TASI Data, Powered by Claude |
| `<section>` | `.suggestions-section` | 8 clickable suggestion chips with staggered entrance animation |
| `<div>` | `.chat-container` | Wraps the `<vanna-chat>` web component (full height) |
| `<footer>` | `.app-footer` | Minimal brand footer |

### Vanna Chat Web Component

```html
<vanna-chat
    api-base=""
    sse-endpoint="/api/vanna/v2/chat_sse"
    ws-endpoint="/api/vanna/v2/chat_websocket"
    poll-endpoint="/api/vanna/v2/chat_poll"
    theme="dark"
    placeholder="Ask about Saudi stocks...">
</vanna-chat>
```

- Loaded as ES module from CDN: `https://img.vanna.ai/vanna-components.js`
- Renders inside Shadow DOM (styles are encapsulated)
- Supports SSE streaming, WebSocket, and long-polling fallback
- Renders Plotly charts, SQL blocks, data tables, and markdown responses
- 5-second fallback displays error message if CDN fails

### Suggestion Chips (8 total)

Each chip has a `data-query` attribute with a pre-built natural language query:

| Chip Label | Query | Expected Chart Type |
|------------|-------|-------------------|
| Bar chart: Top 10 by market cap | "Chart the top 10 companies by market cap" | Bar |
| Heatmap: Profitability metrics | "Show a heatmap of ROE, ROA, and profit margin for the top 15 companies by market cap" | Value Heatmap |
| Line chart: Aramco revenue trend | "Plot the annual revenue trend for Saudi Aramco (2222.SR) over all available periods" | Line/Time Series |
| Chart: Sector valuation comparison | "Compare average P/E ratio, P/B ratio, and dividend yield across all sectors in a chart" | Value Heatmap |
| Scatter: Market cap vs P/E | "Show a scatter plot of market cap vs trailing P/E for all companies that have both values" | Scatter |
| Histogram: Dividend yield distribution | "Visualize the distribution of dividend yields across all companies that pay dividends" | Histogram |
| Chart: Sectors by company count | "Which 5 sectors have the most companies and what is their average market cap? Show as a chart" | Bar |
| Heatmap: Bank balance sheets | "Show a heatmap of total debt, total assets, and stockholders equity for the 10 largest Financial Services companies" | Value Heatmap |

### JavaScript Functionality

1. **`findChatInput()`**: Traverses the `<vanna-chat>` Shadow DOM to locate the input field using 8 different selectors
2. **`findSendButton()`**: Locates the submit button inside Shadow DOM with 5 selectors + last-button fallback
3. **`askQuestion(query)`**: Injects text via native property setter (bypasses framework interception), dispatches `input`/`change` events, triggers form submit or Enter key simulation, collapses the suggestion section with CSS transitions
4. **Staggered entrance animation**: Chips fade in from below with 30ms delays using `requestAnimationFrame` double-buffering
5. **CDN fallback**: After 5 seconds, checks if `vanna-chat` custom element is registered; shows error if not

---

## 3. Next.js Frontend (In Development)

**Directory**: `frontend/`
**Framework**: Next.js 14.2.35 (App Router)
**Language**: TypeScript
**Styling**: Tailwind CSS 3.4.1

### Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `next` | 14.2.35 | React framework |
| `react` / `react-dom` | ^18 | UI library |
| `tailwindcss` | ^3.4.1 | Utility-first CSS |
| `lightweight-charts` | ^4.2.3 | TradingView chart library |
| `plotly.js-dist-min` | ^3.3.1 | Plotly chart rendering |
| `react-plotly.js` | ^2.6.0 | React wrapper for Plotly |
| `react-markdown` | ^10.1.0 | Markdown rendering |
| `react-syntax-highlighter` | ^16.1.0 | SQL/code syntax highlighting |
| `clsx` + `tailwind-merge` | latest | Class name utilities |

### File Structure (32 TypeScript/TSX files)

```
frontend/src/
  app/
    layout.tsx              # Root layout (RTL, Arabic fonts, dark mode)
    page.tsx                # Home/dashboard page
    globals.css             # Global Tailwind styles
    favicon.ico
    fonts/                  # GeistVF, GeistMonoVF (woff)
    chat/page.tsx           # AI chat page
    market/page.tsx         # Market overview page
    news/page.tsx           # News aggregation page
    reports/page.tsx        # Technical reports page
    watchlist/page.tsx      # User watchlist page
    stock/[ticker]/
      page.tsx              # Stock detail (server component)
      StockDetailClient.tsx # Client-side stock detail
  components/
    layout/
      Header.tsx            # App header with navigation
      Footer.tsx            # App footer
      Sidebar.tsx           # Collapsible sidebar navigation
    chat/
      AIChatInterface.tsx   # Main chat UI component
      MessageBubble.tsx     # Chat message rendering
      AssistantContent.tsx  # AI response content parser
      SQLBlock.tsx          # SQL query display block
      DataTable.tsx         # Tabular data display
      ChartBlock.tsx        # Plotly chart renderer
      LoadingDots.tsx       # Typing indicator animation
    charts/
      TASIChart.tsx         # TradingView lightweight chart
    common/
      loading-spinner.tsx   # Reusable loading spinner
      error-display.tsx     # Reusable error display
  lib/
    utils.ts                # Utility functions (cn, formatters)
    types.ts                # TypeScript type definitions
    api-client.ts           # API client for backend communication
    use-sse-chat.ts         # SSE streaming hook for chat
    hooks/
      use-api.ts            # Generic API fetching hook
      use-auth.tsx          # Authentication context + hook
  providers/
    ThemeProvider.tsx        # Dark/light theme toggle
  styles/
    design-system.ts        # Design tokens (colors, spacing, typography)
  types/
    plotly.d.ts             # Plotly TypeScript declarations
```

### Root Layout

- **Direction**: RTL (`dir="rtl"`) with Arabic as primary language
- **Fonts**: IBM Plex Sans Arabic (400/500/700) + Inter (400/500/700)
- **Theme**: Dark mode by default (`className="dark"`)
- **Providers**: `ThemeProvider` > `AuthProvider` > Page content
- **Layout**: Header + Sidebar + Main content + Footer

---

## 4. Design System

### Color Palette

| Token | Hex | Usage |
|-------|-----|-------|
| `--gold-primary` | `#D4A84B` | Primary accent, titles, interactive elements |
| `--gold-light` | `#E8C872` | Hover states, gradient endpoints |
| `--gold-dark` | `#B8860B` | Pressed states, gradient dark end |
| `--bg-dark` | `#0E0E0E` | Page background |
| `--bg-card` | `#1A1A1A` | Card/container backgrounds |
| `--bg-card-hover` | `#252525` | Card hover state |
| `--bg-input` | `#2A2A2A` | Input field backgrounds |
| `--text-primary` | `#FFFFFF` | Headings, primary text |
| `--text-secondary` | `#B0B0B0` | Body text, descriptions |
| `--text-muted` | `#707070` | Captions, labels |
| `--accent-green` | `#4CAF50` | Online status, positive values |
| `--accent-red` | `#FF6B6B` | Errors, negative values |
| `--accent-blue` | `#4A9FFF` | Links, informational |
| `--accent-warning` | `#FFA726` | Warnings |

### Gold Gradient

```css
background: linear-gradient(135deg, #D4A84B 0%, #E8C872 50%, #B8860B 100%);
```

Used on: hero title text, brand mark background, chart title color.

### Typography

| Context | Font | Size | Weight |
|---------|------|------|--------|
| Legacy UI | Tajawal | 12-32px | 400, 500, 700 |
| Next.js (Arabic) | IBM Plex Sans Arabic | 12-32px | 400, 500, 700 |
| Next.js (English) | Inter | 12-32px | 400, 500, 700 |
| Monospace/Code | IBM Plex Mono / Fira Code | varies | 400 |
| Charts | Tajawal (injected via Plotly layout) | 11-16px | -- |

### Spacing Scale

```
xs=4px  sm=8px  md=16px  lg=24px  xl=32px  2xl=48px
```

### Border Radii

```
sm=8px  md=12px  lg=16px  pill=9999px
```

### Shadows & Effects

- **Gold glow**: `box-shadow: 0 4px 20px rgba(212, 168, 75, 0.3)` (chip hover)
- **Brand mark shadow**: `box-shadow: 0 2px 12px rgba(212, 168, 75, 0.25)`
- **Glassmorphism header**: `backdrop-filter: blur(20px)` on `rgba(14, 14, 14, 0.85)`

---

## 5. Chart Engine

### RaidChartGenerator (`chart_engine/raid_chart_generator.py`)

Custom subclass of Vanna's `PlotlyChartGenerator` that fixes 5 critical issues in the upstream library.

### Heuristic Decision Tree

```
DataFrame input
    |
    +-- Step 1: Detect YYYY-MM-DD string columns --> convert to datetime64
    |
    +-- Step 2: Classify columns into numeric / categorical / datetime
    |
    +-- Step 3: Column count >= 8?
    |       YES --> TABLE (dark-themed, alternating rows)
    |
    +-- Step 4: Has datetime + numeric?
    |       YES --> TIME SERIES LINE CHART (scatter with mode=lines)
    |
    +-- Step 5: 1 categorical + 3+ numeric?
    |       YES --> VALUE HEATMAP (z-score colors, actual values as text)
    |
    +-- Step 6: 1 numeric, 0 categorical?
    |       YES --> HISTOGRAM
    |
    +-- Step 7: 1 categorical + 1 numeric?
    |       YES --> BAR CHART
    |
    +-- Step 8: 2 numeric, 0 categorical?
    |       YES --> SCATTER PLOT
    |
    +-- Step 9: 1 categorical + 2 numeric?
    |       YES --> BAR CHART (uses first numeric)
    |
    +-- Step 10: 3+ numeric, 0 categorical?
    |       YES --> CORRELATION HEATMAP (computes df.corr())
    |
    +-- Step 11: 2+ categorical?
    |       YES --> GROUPED BAR CHART (uses actual values, not counts)
    |
    +-- Step 12: >= 2 columns?
    |       YES --> GENERIC CHART (fallback)
    |
    +-- ELSE --> ValueError
```

### Fixes Over Upstream PlotlyChartGenerator

| Issue | Upstream Behavior | RaidChartGenerator Fix |
|-------|------------------|----------------------|
| Table cutoff | 4+ columns = table | 8+ columns = table |
| Heatmap type | `df.corr()` (correlation only) | New `_create_value_heatmap()` with z-score normalized colors and actual value annotations |
| Grouped bar | `groupby().size()` = counting occurrences | Uses actual numeric values via `groupby().sum()` |
| String dates | Not detected (only `datetime64`) | Regex `^\d{4}-\d{2}-\d{2}` detection + `pd.to_datetime()` conversion |
| Theme | Navy text, white/cream backgrounds | Dark gold theme matching Ra'd AI design |

### Chart Color Palette

```python
RAID_COLORWAY = ["#D4A84B", "#4CAF50", "#4A9FFF", "#FF6B6B", "#E8C872", "#FFA726", "#AB47BC"]
```

### Heatmap Gold Color Scale

```python
GOLD_COLORSCALE = [
    [0, "#1a1a1a"],       # Dark (low values)
    [0.25, "#3d2e10"],    # Dark bronze
    [0.5, "#B8860B"],     # Dark gold
    [0.75, "#D4A84B"],    # Gold primary
    [1.0, "#E8C872"],     # Light gold (high values)
]
```

### Dark Theme Layout (applied to ALL chart types)

```python
paper_bgcolor = "rgba(0,0,0,0)"       # Transparent paper
plot_bgcolor  = "rgba(26,26,26,0.9)"  # Semi-transparent dark
font_color    = "#E0E0E0"             # Light gray text
title_color   = "#D4A84B"             # Gold titles
grid_color    = "rgba(212,168,75,0.08)" # Subtle gold grid
tick_color    = "#B0B0B0"             # Gray tick labels
legend_bg     = "rgba(26,26,26,0.8)"  # Dark legend
```

### Number Formatting

| Range | Format | Example |
|-------|--------|---------|
| >= 1T | `{v/1e12:.1f}T` | 7,000,000,000,000 --> "7.0T" |
| >= 1B | `{v/1e9:.1f}B` | 1,500,000,000 --> "1.5B" |
| >= 1M | `{v/1e6:.1f}M` | 2,500,000 --> "2.5M" |
| >= 1K | `{v/1e3:.1f}K` | 3,500 --> "3.5K" |
| < 1 | `{v:.4f}` | 0.2171 --> "0.2171" |
| else | `{v:.2f}` | 42.5 --> "42.50" |
| NaN | `""` | -- |

---

## 6. Data Visualization

### Supported Chart Types

#### 1. Bar Chart
- **Trigger**: 1 text + 1 numeric column
- **Engine**: `plotly.express.bar` with aggregation
- **Color**: First color from RAID_COLORWAY (`#D4A84B` gold)
- **Use case**: Top N companies by market cap, sector counts, ranked metrics

#### 2. Value Heatmap
- **Trigger**: 1 text + 3-6 numeric columns
- **Engine**: `plotly.graph_objects.Heatmap`
- **Color normalization**: Per-column z-score (cross-metric comparability)
- **Text overlay**: Actual formatted values on each cell
- **Use case**: Multi-metric comparison (ROE/ROA/margin for top 15 companies)

#### 3. Scatter Plot
- **Trigger**: 2 numeric columns, no text
- **Engine**: `plotly.express.scatter`
- **Use case**: Market cap vs P/E, correlation exploration

#### 4. Histogram
- **Trigger**: 1 numeric column, no text
- **Engine**: `plotly.express.histogram`
- **Use case**: Dividend yield distribution, P/E ratio distribution

#### 5. Time Series Line Chart
- **Trigger**: 1 datetime/date-string + 1-5 numeric columns
- **Engine**: `plotly.graph_objects.Scatter` with `mode="lines"`
- **Date handling**: Auto-detects YYYY-MM-DD strings from SQLite
- **Use case**: Revenue trends, stock price history, financial statement progression

#### 6. Correlation Heatmap
- **Trigger**: 3+ numeric columns, no text
- **Engine**: `plotly.express.imshow` on `df.corr()`
- **Use case**: Metric correlation analysis

#### 7. Table
- **Trigger**: 8+ columns (fallback)
- **Engine**: `plotly.graph_objects.Table`
- **Theme**: Dark rows (`#141414`/`#1a1a1a` alternating), gold headers, gold border lines
- **Use case**: Very wide query results

### CSS Chart Overrides (Legacy UI)

The legacy frontend includes 100+ lines of CSS overrides for Plotly charts rendered in the main document:

| Plotly Element | CSS Override |
|---------------|-------------|
| Chart title | `fill: #D4A84B` (gold) |
| Axis titles | `fill: #E0E0E0` (light) |
| Tick labels | `fill: #B0B0B0` (gray) |
| Grid lines | `stroke: rgba(212,168,75,0.08)` (subtle gold) |
| Zero lines | `stroke: rgba(212,168,75,0.15)` |
| Legend background | `fill: rgba(26,26,26,0.9)` |
| Legend text | `fill: #B0B0B0` |
| Modebar buttons | `fill: #707070`, hover: `#D4A84B` |
| Hover tooltip bg | `fill: rgba(26,26,26,0.95)` |
| Hover tooltip border | `stroke: rgba(212,168,75,0.4)` |
| Table cells | `fill: #E0E0E0` |
| Table headers | `fill: #D4A84B` |
| Colorbar text | `fill: #B0B0B0` |
| Annotation text | `fill: #E0E0E0` |
| SVG background | `transparent` |

---

## 7. Responsive Design

### Breakpoints

| Breakpoint | Width | Behavior |
|-----------|-------|----------|
| **Desktop XL** | >= 1600px | Max content width: 1200px |
| **Desktop** | >= 1200px | Max content width: 1080px, larger chips (13px, 10px 18px padding), min-height 600px chat |
| **Tablet** | <= 768px | Compact hero (20px title), smaller chips (11px), reduced padding, chat height calc(100vh - 160px) |
| **Mobile** | <= 480px | Header subtitle hidden, status label hidden, 56px header, stats stacked vertically |
| **Small phone** | <= 360px | Chips stack vertically, chip text wraps, center-aligned |

### Responsive Behaviors

**Header**:
- Desktop: Full brand name + subtitle + "Online" label
- Mobile: Brand mark + title only, status dot visible but no label

**Stats Bar**:
- Desktop: Horizontal flex row with gaps
- Mobile (<=480px): Vertical stack, centered

**Suggestion Chips**:
- Desktop: Horizontal flex-wrap, centered, 13px font
- Tablet: 11px font, tighter padding
- Small phone: Full-width vertical stack

**Chat Container**:
- Desktop: `height: calc(100vh - 180px)`, min 500px, max 800px
- Tablet: `calc(100vh - 160px)`, min 450px
- Mobile: `calc(100vh - 240px)`, min 400px

---

## 8. User Experience Flow

### First Visit Flow

```
1. Page loads --> fadeInUp animations trigger sequentially:
   - Hero section (0ms delay)
   - Stats bar (100ms delay)
   - Suggestion chips (200ms delay, then 30ms stagger per chip)
   - Chat container (300ms delay)

2. User sees 8 suggestion chips as conversation starters

3. User clicks a chip OR types in the chat input:
   - If chip: query injected into Shadow DOM input,
     suggestions collapse with opacity/height transition
   - If typed: user types directly in vanna-chat input

4. Message sent via SSE to /api/vanna/v2/chat_sse

5. Vanna Agent (Claude Sonnet 4.5) processes:
   - Generates SQL from natural language
   - Executes SQL via RunSqlTool (saves result to CSV)
   - If visual requested: calls VisualizeDataTool with CSV filename
   - RaidChartGenerator selects chart type automatically
   - Returns Plotly JSON + text explanation

6. vanna-chat renders:
   - Tool execution status panel (right sidebar)
   - SQL query block
   - Chart (Plotly interactive)
   - Text explanation (markdown)

7. User can ask follow-up questions in the same chat session
   (DemoAgentMemory stores up to 10,000 conversation items)
```

### Interactive Elements

| Element | Interaction | Feedback |
|---------|------------|----------|
| Suggestion chips | Click | Gold glow, -2px lift, query injection, section collapse |
| Stat pills | Hover | Gold border highlight, text brightens |
| Plotly charts | Hover | Dark tooltip with gold border, data values |
| Plotly modebar | Hover | Gold icon highlight |
| Scrollbar | Scroll | Gold-themed thumb (Webkit + Firefox) |
| Header | Scroll | Sticky with glassmorphism blur |
| Status dot | Auto | Green pulse animation (2s cycle) |

### Animations

| Animation | Duration | Easing | Usage |
|-----------|----------|--------|-------|
| `fadeInUp` | 0.6s | ease-out | Section entrance, staggered |
| `goldPulse` | 2s | ease-in-out | Online status indicator |
| `dotBounce` | 1.4s | ease-in-out | Loading dots (3 dots, staggered) |
| `subtleFloat` | continuous | ease | Decorative hover (unused reserve) |
| `chartShimmer` | 1.5s | ease-in-out | Chart loading placeholder |
| Chip entrance | 0.3s | ease | Per-chip stagger (30ms intervals) |
| Suggestion collapse | 0.3-0.4s | ease | Opacity + max-height + margin |

---

## 9. Accessibility

### Current Implementation

- `aria-hidden="true"` on decorative elements (brand mark, stat icons, chip icons, status dot)
- `aria-label="Example questions"` on suggestions section
- Semantic HTML: `<header>`, `<main>`, `<footer>`, `<section>`, `<nav>`
- `lang="en" dir="ltr"` on HTML element (legacy)
- `lang="ar" dir="rtl"` on HTML element (Next.js)
- Focusable `<button>` elements for suggestion chips (keyboard accessible)
- `:focus` styles inherited from browser defaults
- Tajawal font supports both Arabic and Latin scripts

### Areas for Improvement

- No skip-to-content link
- No ARIA live region for chat responses
- No explicit focus management after chip click
- Plotly charts have limited screen reader support
- No reduced-motion preference (`prefers-reduced-motion`) handling
- No high-contrast mode support
- vanna-chat Shadow DOM isolates accessibility tree

---

## 10. Performance Considerations

### Legacy UI

- **Zero build step**: Single HTML file, no bundling needed
- **External dependency**: `vanna-components.js` loaded from CDN (single HTTP request)
- **Font loading**: Google Fonts with `preconnect` + `display=swap` (non-blocking)
- **CSS**: All inline in `<style>` (no additional HTTP requests)
- **JavaScript**: ~150 lines vanilla JS (no framework overhead)
- **Chart rendering**: Plotly.js loaded by vanna-chat component (~3MB library, cached by browser)

### Next.js UI

- **Code splitting**: Automatic per-route splitting via Next.js App Router
- **Font optimization**: `next/font/google` (self-hosted, no layout shift)
- **Image optimization**: Next.js `<Image>` component (where applicable)
- **TradingView charts**: `lightweight-charts` (67KB gzipped, much lighter than full TradingView)
- **Plotly**: `plotly.js-dist-min` (minified, ~1MB) + `react-plotly.js` wrapper

### Chart Generation

- RaidChartGenerator processes DataFrames server-side in Python
- JSON serialization via `plotly.io.to_json()` (efficient)
- Z-score normalization uses numpy vectorized operations (fast even for 500+ rows)
- Number formatting is O(n) per cell

---

## 11. Testing Coverage

### Chart Engine Tests (`tests/test_chart_engine.py`)

**37 tests, 100% pass rate**

| Test Class | Count | What It Tests |
|-----------|-------|--------------|
| `TestBarChart` | 3 | 1 text + 1 numeric detection, dark theme, real DB data |
| `TestValueHeatmap` | 5 | 1 text + 3 numeric, text annotations, 5 numeric cols, real profitability data, gold colorscale |
| `TestScatterPlot` | 2 | 2 numeric detection, real market data |
| `TestHistogram` | 2 | 1 numeric detection, real dividend data |
| `TestTimeSeries` | 3 | String date detection, datetime64, real Aramco data |
| `TestCorrelationHeatmap` | 1 | 3 numeric no-text produces correlation |
| `TestTable` | 3 | 8-column table, 7-column NOT table, dark theme |
| `TestEdgeCases` | 4 | Empty DataFrame, single row, NaN values, large dataset (100 rows) |
| `TestDarkTheme` | 3 | Transparent bg, gold title, light text color |
| `TestNumberFormatting` | 7 | Billions, millions, thousands, trillions, decimals, NaN, regular |
| `TestRegressions` | 3 | 4-col NOT table (was table), grouped bar NOT count (was count), string dates converted (were not) |
| `TestVisualizeDataToolIntegration` | 1 | Custom generator injected into VisualizeDataTool |

### Suggestion Chip Validation (`scripts/validate_charts.py`)

**8/8 validations pass** against real SQLite database:

| Chip | SQL Shape | Detected Chart Type |
|------|-----------|-------------------|
| Bar: Top 10 | (10, 2) | bar |
| Heatmap: Profitability | (15, 4) | heatmap |
| Line: Aramco revenue | (4, 2) | scatter (line mode) |
| Sector valuation | (10, 4) | heatmap |
| Scatter: Cap vs PE | (266, 2) | scatter |
| Histogram: Dividends | (210, 1) | histogram |
| Bar: Sector count | (12, 2) | bar |
| Heatmap: Bank sheets | (10, 4) | heatmap |

### Full Test Suite Results

| Suite | Passed | Skipped | Failed |
|-------|--------|---------|--------|
| `tests/` (pytest) | 300 | 18 | 0 |
| `test_database.py` | 40 | 20 | 0 |
| `test_app_assembly_v2.py` | 33 | 0 | 0 |
| **Total** | **373** | **38** | **0** |

---

## 12. Known Limitations & Future Work

### Current Limitations

1. **Shadow DOM styling barrier**: The `<vanna-chat>` web component uses Shadow DOM, so our CSS overrides only affect charts rendered outside it. Charts inside the component inherit the component's own styles.

2. **CDN dependency**: The `vanna-components.js` web component requires internet access. No offline fallback exists beyond the error message.

3. **No authentication UI**: The legacy frontend has no login/register interface. JWT auth routes exist in the backend but are only exposed via API for PostgreSQL mode.

4. **Next.js not wired to backend**: The Next.js frontend has all components built but is not yet serving as the primary UI. It runs separately on port 3000.

5. **RTL/Arabic**: The Next.js layout is configured for RTL Arabic, but the legacy UI is LTR English. The system prompt and AI responses are English-only.

6. **Chart interactivity**: Plotly charts are interactive (zoom, pan, hover) but there's no chart-to-query linking (clicking a bar doesn't filter data).

7. **Mobile chart readability**: Complex heatmaps with many rows may be hard to read on small screens. No mobile-specific chart simplification.

### Planned Improvements

- [ ] Wire Next.js frontend as primary UI (replace legacy HTML)
- [ ] Add light/dark theme toggle (Next.js ThemeProvider is ready)
- [ ] Add login/register UI components
- [ ] Add watchlist management UI
- [ ] Add real-time price updates (WebSocket)
- [ ] Add chart export (PNG/SVG download)
- [ ] Add `prefers-reduced-motion` support
- [ ] Add `prefers-color-scheme` auto-detection
- [ ] Add skip-to-content accessibility link
- [ ] Add ARIA live regions for streaming chat responses
- [ ] Mobile-optimized chart rendering (simplified views for small screens)
- [ ] Offline service worker for cached responses

---

*Generated from codebase analysis on 2026-02-08. All test counts reflect current passing state.*
