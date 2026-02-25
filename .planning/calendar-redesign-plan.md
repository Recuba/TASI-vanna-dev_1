# Calendar Page Luxury Redesign Plan

## Design Direction

**Aesthetic**: Refined luxury -- dark obsidian surfaces with warm gold accents, editorial typography, and restrained ornamentation. The calendar should feel like a high-end financial instrument: precise, authoritative, and beautiful. Think a Vacheron Constantin annual calendar complication rendered as a web interface.

**Memorable Detail**: The month heading uses Cormorant Garamond at display scale with a thin gold ornamental line beneath it, giving the calendar an engraved/printed quality. Day cells have a subtle inner glow on hover. The selected day panel uses a glassmorphic frosted surface with a single gold border edge.

---

## Color Palette

```
bg:              #07080C    (deep void)
surface:         #0D0F14    (card/panel base)
surfaceElevated: #12151C    (raised panels, hovered cells)
gold:            #C5B38A    (primary accent)
goldBright:      #E4D5B0    (hover states, active text)
text:            #E8E4DC    (primary body text)
textSecondary:   #8A8578    (labels, captions)
textMuted:       #5A574F    (disabled, padding day numbers)
green:           #6BCB8B    (dividend indicators)
red:             #E06C6C    (reserved -- not currently used in calendar)
border:          rgba(197, 179, 138, 0.12)  (subtle gold-tinted borders)
borderHover:     rgba(197, 179, 138, 0.25)  (hover state borders)
```

## Typography

| Role | Font | Weight | Size | Tracking |
|------|------|--------|------|----------|
| Page heading ("Financial Calendar") | Cormorant Garamond | 500 italic | 28px / text-3xl | tracking-wide |
| Month/Year label | Cormorant Garamond | 600 | 24px / text-2xl | tracking-wider |
| Day numbers (grid) | JetBrains Mono | 500 | 13px | normal |
| Day header (Sun..Sat) | JetBrains Mono | 400 | 11px uppercase | tracking-widest |
| Event pill company names | DM Sans | 500 | 11px | normal |
| Event card title | DM Sans | 600 | 13px | normal |
| Filter chips | DM Sans | 500 | 12px | tracking-wide uppercase |
| Stats strip numbers | JetBrains Mono | 600 | 13px | normal |
| Stats strip labels | DM Sans | 400 | 12px | normal |
| Selected day date heading | Cormorant Garamond | 500 | 18px | normal |
| "Today" link | DM Sans | 500 | 11px uppercase | tracking-wide |

**Google Fonts to add:**
```html
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=JetBrains+Mono:wght@400;500;600&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">
```

**Tailwind config additions:**
```js
fontFamily: {
  display: ['Cormorant Garamond', 'Georgia', 'serif'],
  mono: ['JetBrains Mono', 'monospace'],
  body: ['DM Sans', 'sans-serif'],
}
```

---

## Page Layout (Top to Bottom)

### 1. Page Header

```
[Financial Calendar]                                    [Grid | List]
Dividend and earnings dates -- 14 events                     ^
                                                         toggle btns
```

- "Financial Calendar" in Cormorant Garamond italic, 28px, color `#E8E4DC`
- Subtitle in DM Sans 12px, color `#8A8578`
- Event count inline in subtitle: "-- 14 events" in JetBrains Mono gold
- View toggle: pill-shaped container with `surface` bg, rounded-full, 1px border `border`
  - Active state: `surfaceElevated` bg + gold text + gold bottom border 2px
  - Inactive: `textMuted` color

### 2. Filter Chips + Stats Strip (combined row)

```
[All]  [Dividends]  [Earnings]          8 dividends  ·  6 earnings
```

- Filter chips: DM Sans 12px uppercase tracking-wide
  - Default: transparent bg, 1px `border` border, `textSecondary` text
  - Active: `rgba(197,179,138,0.10)` bg, 1px gold/25 border, `goldBright` text
  - Hover: `borderHover` border color
- Stats strip on the right side of the same row
  - Numbers in JetBrains Mono 600 weight
  - Dividend count: green `#6BCB8B`
  - Earnings count: gold `#C5B38A`
  - Dot separator `·` in `textMuted`
  - Labels in DM Sans 400

### 3. Month Navigation Bar

```
     <  ·  February 2026  ·  >          [Today]
```

- Full-width container, centered content
- Gold decorative line: a thin horizontal rule (`hr`) 60px wide, 1px, `rgba(197,179,138,0.3)`, centered ABOVE the month name, with 12px margin-bottom
- Month name: Cormorant Garamond 600, 24px, `#E8E4DC`, tracking-wider
- Year: same font but lighter weight (400), `textSecondary`, separated by a space
- Chevron buttons: 32x32px rounded-lg, transparent bg, `textSecondary` stroke
  - Hover: `surfaceElevated` bg, gold stroke
  - Small gold dot ornament between chevron and month text (decorative `·` in `textMuted`)
- "Today" pill: right-aligned, DM Sans 11px uppercase, gold text, no bg, hover underline
- Below month name: another thin gold decorative line (symmetric with the one above)

### 4. Calendar Container

Outer container:
- `surface` (#0D0F14) background
- 1px `border` border
- rounded-2xl (16px)
- padding: 20px (p-5)
- Subtle shadow: `0 4px 24px rgba(0,0,0,0.3)`

---

## Component Designs

### 4a. Day Header Row (Grid View)

```
SUN    MON    TUE    WED    THU    FRI    SAT
```

- JetBrains Mono 400, 11px, uppercase, tracking-widest
- Color: `textMuted` (#5A574F)
- Friday and Saturday headers: even dimmer, `rgba(90,87,79,0.6)` (weekend indicator)
- Bottom border: 1px `border`, margin-bottom 8px

### 4b. Day Cell (Grid View)

Layout per cell:
```
+---------------------------+
|  14                       |   <- day number top-left
|                           |
|  [== Aramco]              |   <- event pill
|  [== Al Rajhi Bank]       |   <- event pill
|  +2 more                  |   <- overflow
+---------------------------+
```

Specifications:
- Min-height: 96px (sm: 110px)
- Background: `surface` (#0D0F14) for current month days
- Border: 1px `border`
- Border-radius: 10px (rounded-[10px])
- Padding: 8px (p-2)
- Hover state: border transitions to `borderHover`, bg shifts to `surfaceElevated`
- Transition: 200ms ease for border-color and background-color

**Day number:**
- JetBrains Mono 500, 13px
- Current month: `textSecondary` (#8A8578)
- Today: gold (#C5B38A) with bold (600 weight)
- Padding month days: `textMuted` with opacity-30

**Non-current-month cells:**
- Background: transparent (no surface bg)
- Border: transparent
- Day number: `textMuted` opacity-30
- No event pills shown

**Today highlight:**
- Gold ring: `ring-1 ring-[#C5B38A]/40`
- Day number: gold bold
- Subtle inner glow: `shadow-[inset_0_0_12px_rgba(197,179,138,0.06)]`

**Selected cell:**
- Ring: `ring-2 ring-[#C5B38A]/60`
- Background: `surfaceElevated`
- Border: gold/30

**Weekend cells (Friday index=5, Saturday index=6):**
- Background: slightly darker, `rgba(7,8,12,0.5)` overlay effect
- Day number: same color but opacity-60

### 4c. Event Pill (inside Day Cell)

```
[==  Company Name]
```

- Height: 22px (py-0.5 px-1.5)
- Border-radius: 6px
- Max-width: 100% with truncation
- Left accent: 2.5px wide vertical bar (pseudo-element or border-left)
  - Dividend: `#6BCB8B` (green)
  - Earnings: `#C5B38A` (gold)
- Background:
  - Dividend: `rgba(107,203,139,0.08)`
  - Earnings: `rgba(197,179,138,0.08)`
- Company name: DM Sans 500, 11px, truncated
  - Dividend: `rgba(107,203,139,0.85)` text
  - Earnings: `rgba(197,179,138,0.85)` text
- Hover: background intensity increases to 0.14
- Spacing between pills: 3px (space-y-[3px])

**Overflow indicator:**
- "+N more" in JetBrains Mono 400, 10px, `textMuted`
- Show max 3 pills, overflow after

### 4d. Selected Day Detail Panel

Appears below the grid when a day with events is selected.

```
+--------------------------------------------------------------+
|                                                                |
|  Saturday, 15 February                              Close x   |
|  ________________________________________________________     |
|                                                                |
|  [EventCard 1]                                                 |
|  [EventCard 2]                                                 |
|  [EventCard 3]                                                 |
|                                                                |
+--------------------------------------------------------------+
```

- Background: `surfaceElevated` (#12151C)
- Border: 1px `rgba(197,179,138,0.15)` (gold-tinted)
- Border-radius: 14px
- Padding: 20px
- Margin-top: 12px
- Backdrop effect: `backdrop-blur-sm` (glassmorphic feel)
- Box shadow: `0 8px 32px rgba(0,0,0,0.4)`
- Entrance animation: slide-down + fade-in, 250ms ease-out

**Header:**
- Date: Cormorant Garamond 500, 18px, `#E8E4DC`
  - Formatted as weekday + day + month (localized)
- Close button: DM Sans 11px, `textMuted`, hover gold, `x` symbol
- Separator: thin gold line (1px, `rgba(197,179,138,0.15)`) below header, margin 12px

### 4e. EventCard (used in both Selected Panel and List View)

```
+--------------------------------------------------------------+
|  |  Saudi Aramco -- Ex-Dividend Date                    DIV  |
|  |  2026-02-15  ·  SAR 0.35 per share                       |
+--------------------------------------------------------------+
```

- Background: `surface` (#0D0F14)
- Border: 1px `border`
- Border-radius: 10px
- Left border: 3px solid
  - Dividend: `#6BCB8B`
  - Earnings: `#C5B38A`
- Padding: 12px 14px (p-3 ps-3.5)
- Hover: bg transitions to `surfaceElevated`, border-color to `borderHover`
- Cursor: pointer (links to stock detail page)
- Transition: 200ms ease

**Content layout (flex row, justify-between):**

Left column (flex-1, min-w-0):
- Title: DM Sans 600, 13px, `#E8E4DC`, truncated
- Description (if present): DM Sans 400, 11px, `textSecondary`, margin-top 2px
- Date: JetBrains Mono 400, 11px, `textMuted`, margin-top 4px

Right column (flex-shrink-0):
- Type badge: pill shape, 9px uppercase, bold
  - Dividend: `rgba(107,203,139,0.15)` bg, `#6BCB8B` text, reads "DIV" (en) / "توزيعات" (ar)
  - Earnings: `rgba(197,179,138,0.15)` bg, `#C5B38A` text, reads "EARN" (en) / "أرباح" (ar)

### 4f. List View

Structure: events grouped by date, with decorative date separators.

```
 ______ Sat, 15 Feb ___[3]_______________

 [EventCard]
 [EventCard]
 [EventCard]

 ______ Mon, 17 Feb ___[1]_______________

 [EventCard]
```

**Date Separator:**
- Full-width flex row with horizontal rule on both sides
- Date label centered: DM Sans 500, 12px
  - Normal: `textSecondary`
  - Today: gold text with "TODAY" badge alongside
- Event count: JetBrains Mono, 10px, inside a small pill (`surface` bg, `textMuted` text)
- Horizontal rules: 1px `border` color, flex-grow on each side
  - Today's separator: gold-tinted rule `rgba(197,179,138,0.2)`
- Margin-bottom: 12px before cards, margin-top: 20px between groups

**Today's group:**
- Date label in gold
- "TODAY" badge: tiny pill, `rgba(197,179,138,0.12)` bg, gold text, 9px, uppercase
- Separator line: gold-tinted

**Empty month message:**
- Cormorant Garamond italic, 16px, `textMuted`
- Centered, py-16
- Text: "No events this month" / "لا توجد أحداث في هذا الشهر"
- Optional: small decorative gold diamond ornament above text (Unicode `◆` at 8px)

### 4g. Legend (Bottom)

```
    [■] Dividends     [■] Earnings
```

- Centered, DM Sans 12px, `textMuted`
- Color swatches: 10x10px rounded-sm
  - Dividend: `rgba(107,203,139,0.30)` bg
  - Earnings: `rgba(197,179,138,0.30)` bg
- Spacing: gap-6 between items, gap-2 between swatch and label

---

## Animations & Transitions

| Element | Trigger | Animation |
|---------|---------|-----------|
| Day cell | hover | border-color + bg 200ms ease |
| Event pill | hover | bg-opacity 150ms ease |
| Selected panel | open | slideDown 250ms ease-out (translateY -8px to 0, opacity 0 to 1) |
| Selected panel | close | fadeOut 150ms ease-in |
| Month change | prev/next | fade 200ms (opacity transition on grid content) |
| Filter chip | active | border-color + bg + text 200ms ease |
| Chevron button | hover | bg + stroke 150ms ease |
| EventCard | hover | bg + border 200ms ease |

**Tailwind keyframes to add:**
```js
keyframes: {
  'calendar-panel-in': {
    '0%': { opacity: '0', transform: 'translateY(-8px)' },
    '100%': { opacity: '1', transform: 'translateY(0)' },
  },
}
animation: {
  'calendar-panel-in': 'calendar-panel-in 250ms ease-out',
}
```

---

## Preserved Logic (No Changes)

These elements are kept exactly as-is -- only visual styling changes:

1. `useCalendarEvents` hook -- data fetching stays identical
2. `year` / `month` state + `prevMonth()` / `nextMonth()` / `goToday()`
3. `viewMode: 'grid' | 'list'` state toggle
4. `filter: 'all' | 'dividend' | 'earnings'` state
5. `selectedDate` state + click-to-toggle behavior
6. `getMonthRange()` helper
7. `getMonthDays()` helper (42 cells, prev/next month padding)
8. `getCompanyShortName()` helper
9. `eventsByDate` Map grouping + `sortedDates` sorting
10. `LoadingSpinner` usage during loading
11. All `Link` hrefs to `/stock/{ticker}`
12. Arabic/English `t()` translations + `dir` attribute
13. MONTH_NAMES, DAY_NAMES constants

---

## Implementation Notes

### Font Loading Strategy
- Add the three Google Fonts in `frontend/src/app/layout.tsx` via `next/font/google` for optimal loading
- Alternatively, add `<link>` in the `<head>` with `display=swap`
- Fallback chain: Cormorant Garamond -> Georgia -> serif; JetBrains Mono -> monospace; DM Sans -> system-ui -> sans-serif

### CSS Custom Properties
Add to the calendar page (scoped or in globals):
```css
--cal-bg: #07080C;
--cal-surface: #0D0F14;
--cal-surface-elevated: #12151C;
--cal-gold: #C5B38A;
--cal-gold-bright: #E4D5B0;
--cal-text: #E8E4DC;
--cal-text-secondary: #8A8578;
--cal-text-muted: #5A574F;
--cal-green: #6BCB8B;
--cal-border: rgba(197, 179, 138, 0.12);
--cal-border-hover: rgba(197, 179, 138, 0.25);
```

### RTL Considerations
- All horizontal spacing uses logical properties (`ps-*`, `pe-*`, `ms-*`, `me-*`)
- Chevron arrows flip in RTL (use `rtl:rotate-180` or swap the SVG paths)
- Left border on EventCard becomes right border in RTL: use `border-s-3` (logical start border)
- Event pill left accent bar: use `border-s-[2.5px]` (logical)

### Accessibility
- Day cells remain `<button>` elements with descriptive `aria-label` (e.g., "February 14, 2 events")
- Navigation buttons keep `aria-label` for previous/next month
- Filter chips should use `role="radiogroup"` and `role="radio"` with `aria-checked`
- Selected panel should have `role="dialog"` or `role="region"` with `aria-label`
- Color alone does not distinguish event types -- text labels (DIV/EARN) are always present

### Mobile Responsiveness
- Grid cells: min-h-[80px] on mobile, [96px] on sm+, [110px] on md+
- Event pills: hide text on very small screens, show only the color dot
- Month heading: scale down to 20px on mobile
- Selected panel: full-width, reduced padding (p-3)
- List view: cards stack full-width with 8px gap
- Filter + stats row: wraps to 2 lines on mobile (filters above, stats below)

---

## File Changes Required

1. **`frontend/src/app/calendar/page.tsx`** -- Full visual restyling of all elements (structure preserved)
2. **`frontend/tailwind.config.ts`** -- Add font families (display, body, mono), keyframes, animation
3. **`frontend/src/app/layout.tsx`** -- Import Google Fonts (Cormorant Garamond, JetBrains Mono, DM Sans)
4. **`frontend/src/styles/design-system.ts`** -- No changes needed (calendar uses its own scoped palette)

---

## Visual Summary

The redesigned calendar transforms from a utilitarian grid into a refined financial instrument display:

- **Dark obsidian surfaces** (#07080C base) with warm gold-tinted borders create depth
- **Cormorant Garamond headings** give editorial authority -- this is a publication, not a web app
- **JetBrains Mono dates** add precision and financial-terminal character
- **DM Sans body text** balances readability against the display fonts
- **Decorative gold lines** above and below the month name act as engraved ornaments
- **Glassmorphic selected-day panel** with gold border floats above the grid
- **Color-coded event pills** (green dividends, gold earnings) with 2.5px left accent bars
- **Weekend dimming** subtly communicates Fri/Sat non-trading days
- **Today's gold ring** draws the eye without overwhelming

The overall feel: a luxury timepiece's annual calendar complication -- precise, warm, and unmistakably premium.
