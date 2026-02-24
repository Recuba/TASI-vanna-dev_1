# Screener Page Luxury Redesign Plan

## Design Philosophy

The screener is a **professional financial terminal** -- the tool serious investors reach for when hunting alpha. The aesthetic is **refined luxury meets Bloomberg terminal**: dark, information-dense, yet breathtakingly polished. Every pixel communicates precision and authority. The design language says "this is where money is managed."

The signature moment: when a user hovers a preset card, a subtle gold luminescence blooms outward, and when they click, the results table animates in with staggered row reveals -- conveying that the system is working *for* them.

---

## Color Palette (Luxury Tokens)

```
bg:              "#07080C"     -- near-black void, ultra-deep
surface:         "#0D0F14"     -- elevated card backgrounds
surfaceElevated: "#12151C"     -- hover states, sticky headers
gold:            "#C5B38A"     -- primary accent, borders, icons
goldBright:      "#E4D5B0"     -- hover text, active states
text:            "#E8E4DC"     -- warm ivory primary text
textSecondary:   "#8A8578"     -- labels, descriptions
textMuted:       "#5A574F"     -- placeholders, disabled states
green:           "#6BCB8B"     -- positive change
red:             "#E06C6C"     -- negative change
border:          "#1A1D25"     -- subtle dividers
borderGold:      "rgba(197, 179, 138, 0.15)"  -- gold-tinted borders
```

## Typography

| Role | Font | Weight | Size |
|------|------|--------|------|
| Page title | Cormorant Garamond | 600 (semibold) | 28px |
| Preset card title | Cormorant Garamond | 500 (medium) | 16px |
| Section headings | DM Sans | 500 (medium) | 14px |
| Body / filter labels | DM Sans | 400 (regular) | 13px |
| Table data / numbers | JetBrains Mono | 400 (regular) | 13px |
| Ticker code | JetBrains Mono | 500 (medium) | 12px |
| Badge / count | JetBrains Mono | 600 (semibold) | 11px |
| Muted hints | DM Sans | 400 (regular) | 11px |

**Arabic override**: When `language === 'ar'`, headings use IBM Plex Sans Arabic at the same weight. Body text uses Tajawal. Numbers remain JetBrains Mono for universal readability.

---

## Page Layout (Top to Bottom)

### 1. Page Background
- Full page `bg-[#07080C]`
- Subtle radial gradient in top-left corner: `radial-gradient(ellipse at 10% 0%, rgba(197,179,138,0.03) 0%, transparent 50%)` -- a whisper of gold warmth
- CSS class: `min-h-screen` on the outermost wrapper

### 2. Header Bar
```
[Left]                                      [Right]
"Stock Screener"  (Cormorant, 28px, #E8E4DC)   [Filters (N)] [Export CSV]
"Filter and sort TASI stocks -- 247 results"
(DM Sans, 13px, #8A8578)
```
- Title in Cormorant Garamond semibold, `#E8E4DC`
- Result count in JetBrains Mono, `#C5B38A` gold -- making the number feel like a live data readout
- Subtitle in DM Sans, `#8A8578`
- Right side: Filters toggle chip + CSV export button
- Filters chip: when active, `bg-[rgba(197,179,138,0.08)]`, `border-[rgba(197,179,138,0.25)]`, `text-[#C5B38A]`. When inactive, `border-[#1A1D25]`, `text-[#5A574F]`
- CSV button: ghost style, `border-[#1A1D25]`, gold on hover
- Spacing: `py-6` between header and presets

### 3. Preset Cards Row
Four cards in a horizontal flex row with `gap-3`. On mobile (`< md`), 2x2 grid.

**Each preset card:**
- Width: `flex-1`, min-width ~160px
- Background: `#0D0F14`
- Border: `1px solid #1A1D25`
- Border-radius: `12px`
- Padding: `16px`
- **Icon area** (top-left): A small decorative icon per preset:
  - Value: diamond/gem icon (precision)
  - Growth: trending-up arrow icon
  - Dividend: banknote/coins icon
  - Low Debt: shield icon
  - Icon color: `#5A574F` default, `#C5B38A` on card hover
  - Icon size: 18px
- **Title**: Cormorant Garamond medium, 16px, `#E8E4DC`
- **Description**: DM Sans, 11px, `#5A574F`, one line (e.g., "P/E < 15, P/B < 1.5")
- **Hover state**:
  - Border transitions to `rgba(197,179,138,0.25)`
  - Very subtle `box-shadow: 0 0 20px rgba(197,179,138,0.05)` (the gold bloom)
  - Icon color shifts to gold
  - `transition: all 0.3s ease`
- **Active/selected state**: gold left border accent (4px solid `#C5B38A` on the `border-inline-start` for RTL compat)

**Clear All button**: Appears inline after preset cards when filters are active. Text-only, `#E06C6C` with hover underline.

### 4. Collapsible Filter Panel

Toggled by the Filters chip. Uses CSS `max-height` transition with `overflow: hidden` for smooth collapse/expand (300ms ease).

**Container:**
- Background: `#0D0F14`
- Border: `1px solid #1A1D25`
- **Top accent**: 2px solid gold `#C5B38A` border-top -- the signature "gold stripe" marking interactive surfaces
- Border-radius: `12px`
- Padding: `20px`

**Grid layout**: `grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4`

**Dropdown selects (Sector, Recommendation):**
- Background: `#07080C` (deepest level)
- Border: `1px solid #1A1D25`
- Border-radius: `8px`
- Text: DM Sans, 13px, `#E8E4DC`
- Focus: `border-color: rgba(197,179,138,0.4)`, subtle `box-shadow: 0 0 0 2px rgba(197,179,138,0.08)`
- Label above: DM Sans, 11px, `#5A574F`, uppercase tracking-wider

**RangeInput component redesign:**
- Label: DM Sans, 11px, `#5A574F`, uppercase `tracking-wide`
- Two inputs side by side in a flex row with `gap-2`
- Input background: `#07080C`
- Input border: `1px solid #1A1D25`
- Input border-radius: `8px`
- Placeholder text: `#5A574F` (italic)
- Focus: gold border glow as above
- Between the two inputs: a small em-dash separator `--` in `#5A574F` vertically centered (optional, only if space allows at `lg`)
- Number font: JetBrains Mono, 13px (numbers should always be monospaced)

**Single-value filters (Max D/E, Min Current Ratio):**
- Same styling as range inputs but single input
- Label includes the constraint direction in muted text: e.g., "D/E Ratio (max)"

### 5. Results Table (Desktop, `md:` and up)

**Container:**
- Background: `#0D0F14`
- Border: `1px solid #1A1D25`
- Border-radius: `12px`
- Overflow: `hidden` (clips border-radius on table edges)

**Table Header (`<thead>`):**
- Background: `#0A0C10` -- slightly darker than surface
- Position: `sticky top-0` with `z-10`
- Row height: `44px`
- Cells:
  - Text: DM Sans, 11px, `#5A574F`, uppercase, `tracking-wider`, `font-medium`
  - Padding: `py-3 px-4`
  - Cursor: pointer on sortable columns
  - Hover: text color transitions to `#8A8578`
  - **Sort indicator**: When active, column text becomes `#C5B38A`. Arrow indicator uses a small gold triangle (`#C5B38A`), `ms-1`
  - Bottom border: `1px solid rgba(197,179,138,0.12)` -- gold-tinted separator under the header

**Table Rows (`<tbody>`):**
- Row height: ~`48px`
- Even rows: `bg-transparent` (inherits `#0D0F14`)
- Odd rows: `bg-[#0A0C10]` -- very subtle alternating tint
- Hover: `bg-[#12151C]` with `transition: background 0.15s ease`
- Border between rows: `1px solid #0F1117` -- barely visible hairline
- **Company cell** (first column, wider ~200px):
  - Company name: DM Sans, 14px, `#E8E4DC`, `font-medium`
  - On hover: color transitions to `#E4D5B0` (goldBright)
  - Subticker line: JetBrains Mono, 11px, `#5A574F` for ticker code + DM Sans sector in `#5A574F` separated by a `middot`
- **Numeric cells**:
  - Font: JetBrains Mono, 13px
  - Color: `#8A8578` for neutral values
  - Alignment: `text-end`
  - Padding: `py-3 px-4`
- **Price cell**: `#E8E4DC` (brighter, it's the most important number)
- **Change % cell**:
  - Positive: `#6BCB8B`
  - Negative: `#E06C6C`
  - Zero: `#5A574F`
  - Format: `+2.45%` / `-1.32%`
- **Market cap cell**: Use formatNumber, `#8A8578`
- **Null/missing values**: Display `--` in `#5A574F` (double em-dash, not single hyphen)

### 6. Mobile Cards (below `md`)

Each stock as a luxury card:

**Card container:**
- Background: `#0D0F14`
- Border: `1px solid #1A1D25`
- Border-radius: `12px`
- Padding: `16px`
- Hover: border transitions to `rgba(197,179,138,0.15)`
- `transition: all 0.2s ease`

**Card layout:**
```
[Company Name]                [Price]  [+2.45%]
[Ticker . Sector]
--------------------------------------------
P/E    |  P/B    |  ROE     |  Cap
12.4   |  1.82   |  14.2%   |  45.2B
```

- Top row: Company name (DM Sans medium, 14px, `#E8E4DC`) left, price (JetBrains Mono, 14px, `#E8E4DC`) + change badge right
- Change badge: rounded pill `px-2 py-0.5`, background `rgba(107,203,139,0.1)` for green / `rgba(224,108,108,0.1)` for red, text `#6BCB8B` / `#E06C6C`
- Subtitle: JetBrains Mono 11px `#5A574F` for ticker, dot separator, sector in DM Sans
- Divider: `1px solid #1A1D25`, `my-3`
- Metric grid: `grid-cols-4`, each cell:
  - Label: DM Sans, 10px, `#5A574F`, uppercase
  - Value: JetBrains Mono, 12px, `#8A8578`

### 7. Pagination

Centered below results, `py-4`.

**Design:**
```
[<  Previous]     Page 1 / 5     [Next  >]
```

- Buttons: `#0D0F14` bg, `border 1px solid #1A1D25`, border-radius `8px`
  - Text: DM Sans, 12px, `#8A8578`
  - Hover: border `rgba(197,179,138,0.25)`, text `#C5B38A`
  - Disabled: `opacity-0.25`, `cursor-not-allowed`
- Page indicator: JetBrains Mono, 12px, `#5A574F`
  - Current page number in `#C5B38A`

### 8. Empty / Loading / Error States

**Loading:**
- Custom skeleton shimmer in gold tint
- 8 placeholder rows with `animate-pulse`
- Shimmer gradient: `linear-gradient(90deg, #0D0F14 25%, #12151C 50%, #0D0F14 75%)`
- Background-size: `200% 100%`, animation: `shimmer 1.5s ease infinite`

**Empty state:**
- Centered vertically in results area
- Icon: a stylized magnifying glass in `#5A574F`, 40px
- Text: "No matching stocks found" in DM Sans, 14px, `#8A8578`
- Subtext: "Try adjusting your filters or selecting a different preset" in 12px, `#5A574F`

**Error state:**
- Same centered layout
- Icon: alert triangle in `#E06C6C`, 40px
- Title: "Failed to load results" in DM Sans, 14px, `#E8E4DC`
- Description: 12px, `#5A574F`
- Retry button: gold outline, `border-[rgba(197,179,138,0.3)]`, text `#C5B38A`, hover fills `rgba(197,179,138,0.08)`

---

## Interactions & Animations

### Page Load
- Header fades in (`opacity 0 -> 1`, 300ms)
- Preset cards stagger in from below (`translateY(8px) -> 0`, `opacity 0 -> 1`, 80ms delay between each, 400ms duration)
- Filter panel slides down if open (`max-height 0 -> auto` with 300ms ease)
- Table rows stagger in (`opacity 0 -> 1`, 30ms delay between rows, first 10 rows only -- remaining appear instantly)

### Filter Toggle
- Panel expand/collapse via `max-height` + `opacity` transition (300ms ease)
- Filter chip rotates a small chevron icon (`rotate(0) -> rotate(180deg)`)

### Sort Column Click
- Brief gold flash on the column header (100ms)
- Table body does a quick `opacity 0.6 -> 1` fade (200ms) to show data refresh

### Preset Card Click
- Card border flashes gold and settles to active state
- All filter inputs animate their new values (native browser behavior is fine)

### Row Hover
- Background color shift (150ms ease)
- Company name text color warms to goldBright

---

## Preserved Logic (Do NOT Change)

These hooks and state management patterns MUST remain identical:

1. **`useScreener(filters)`** hook -- fetches data from `POST /api/v1/screener/search`
2. **`useSectors()`** hook -- fetches sector list
3. **`ScreenerFilters` state** -- the `useState<ScreenerFilters>` with all filter keys
4. **`PRESETS` array** -- same 4 presets with same filter values
5. **`SORT_COLUMNS` array** -- same column definitions
6. **`RangeInput` component** -- same props interface, redesigned visually
7. **`exportCSV()` function** -- same CSV generation logic
8. **`formatNumber()` and `formatPct()`** -- same formatting helpers
9. **`toggleSort()`, `applyPreset()`, `resetFilters()`, `updateFilter()`** -- same callbacks
10. **Pagination logic** -- same `currentPage`, `totalPages`, offset-based navigation
11. **`useLanguage()` + `t()` pattern** -- same i18n approach, same Arabic strings
12. **`dir` attribute** -- same RTL/LTR switching
13. **Link routing** -- same `/stock/${ticker}` navigation

---

## Component File Structure

The redesigned screener remains a **single file** (`page.tsx`) since the current structure works well and there are no complex sub-components that warrant extraction. The `RangeInput` stays as an internal component.

If the implementation agent feels the file exceeds ~600 lines, they may extract to:
```
screener/
  page.tsx           -- main page (state, layout, table)
  components/
    PresetCard.tsx   -- optional extraction
    FilterPanel.tsx  -- optional extraction
```

But this is at the implementer's discretion. The plan focuses on the visual redesign, not structural refactoring.

---

## Tailwind Custom Classes Needed

These should be added via the shared luxury design system (Task #1):

```css
/* Gold shimmer keyframe for skeleton loading */
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

/* Filter panel collapse animation */
.filter-panel-enter { max-height: 0; opacity: 0; overflow: hidden; }
.filter-panel-active { max-height: 600px; opacity: 1; transition: max-height 300ms ease, opacity 200ms ease; }
```

Font imports (in layout.tsx or globals.css):
```css
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&family=DM+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap');
```

---

## RTL Considerations

- All `ms-*` / `me-*` / `ps-*` / `pe-*` logical properties (no `ml-*` / `mr-*`)
- `text-start` / `text-end` instead of `text-left` / `text-right`
- Sort arrow placement uses `ms-1` (margin-inline-start)
- Preset card active indicator uses `border-inline-start` not `border-left`
- Filter grid is naturally RTL-safe (CSS grid reverses in RTL)
- Pagination Previous/Next flip via `dir` attribute

---

## Accessibility

- All interactive elements have visible focus rings (`focus-visible:ring-2 ring-[rgba(197,179,138,0.4)]`)
- Sort columns use `role="columnheader"` with `aria-sort="ascending"|"descending"|"none"`
- Filter panel uses `aria-expanded` on the toggle button
- Preset cards are `<button>` elements (not `<div>`)
- Color contrast: `#E8E4DC` on `#07080C` = 14.8:1 (AAA), `#8A8578` on `#07080C` = 5.2:1 (AA), `#C5B38A` on `#07080C` = 7.8:1 (AAA)
- Reduced motion: wrap stagger animations in `@media (prefers-reduced-motion: no-preference)`

---

## Summary

The redesigned screener transforms from a functional-but-generic filter page into a **luxury financial terminal**. Key differentiators:

1. **Gold accent language** -- consistent gold stripe on panels, gold sort indicators, gold hover blooms on preset cards
2. **Triple font system** -- Cormorant Garamond for authority (headings), DM Sans for clarity (body), JetBrains Mono for precision (all numbers)
3. **Information density** -- tighter row spacing, monospaced alignment making columns scannable
4. **Subtle depth** -- alternating row tints, multi-level surface elevation, barely-visible hairline borders
5. **Animated polish** -- staggered row reveals, smooth filter panel collapse, gold flash on sort
