# Ra'd AI Luxury Design System

**Aesthetic Direction:** Private Wealth Terminal x Editorial
**Version:** 1.0
**Date:** 2026-02-22

---

## 1. Color Tokens

The canonical palette. All pages MUST use these exact values. No ad-hoc hex codes.

```js
const palette = {
  // Backgrounds
  bg: "#07080C",                              // deepest background (page-level)
  surface: "#0D0F14",                         // card / panel backgrounds
  surfaceElevated: "#12151C",                 // elevated cards, modals, popovers
  surfaceGlass: "rgba(13, 15, 20, 0.85)",     // glass panels (with backdrop-filter)

  // Borders
  border: "rgba(197, 179, 138, 0.08)",        // default card border
  borderHover: "rgba(197, 179, 138, 0.2)",    // hover / focus border
  borderActive: "rgba(197, 179, 138, 0.35)",  // active / selected border

  // Gold hierarchy (primary accent)
  gold: "#C5B38A",                            // primary gold (labels, accents, icons)
  goldBright: "#E4D5B0",                      // gold highlights, active states
  goldMuted: "rgba(197, 179, 138, 0.6)",      // secondary gold text
  goldSubtle: "rgba(197, 179, 138, 0.12)",    // gold tint backgrounds, pills
  goldDim: "rgba(197, 179, 138, 0.06)",       // faintest gold wash (hover rows)

  // Text hierarchy
  text: "#E8E4DC",                            // primary text (headings, values)
  textSecondary: "#8A8578",                   // secondary text (labels, meta)
  textMuted: "#5A574F",                       // muted text (disabled, placeholders)

  // Semantic: positive
  green: "#6BCB8B",                           // positive values, advancing
  greenDeep: "#2D8B55",                       // deeper green for gradient stops
  greenMuted: "rgba(107, 203, 139, 0.12)",    // green tint bg (pills, badges)

  // Semantic: negative
  red: "#E06C6C",                             // negative values, declining
  redDeep: "#B84444",                         // deeper red for gradient stops
  redMuted: "rgba(224, 108, 108, 0.12)",      // red tint bg (pills, badges)

  // Semantic: neutral / unchanged
  neutral: "#5A574F",                         // flat / unchanged values
};
```

### Derived Scales (programmatic)

```js
// Shadow palette (use these, do not invent shadows)
const shadows = {
  sm: "0 1px 2px rgba(0,0,0,0.3)",
  md: "0 4px 12px rgba(0,0,0,0.4)",
  lg: "0 12px 32px rgba(0,0,0,0.5)",
  xl: "0 24px 48px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)",
  glow: (color: string, intensity = 0.4) =>
    `0 0 20px rgba(${color}, ${intensity}), 0 0 40px rgba(${color}, ${intensity * 0.5})`,
};
```

### Heatmap Cell Gradient Scale (change% -> background)

```js
function cellGradient(change: number): string {
  if (change > 4)   return "linear-gradient(145deg, #0D5C38, #1A8A52)";
  if (change > 2)   return "linear-gradient(145deg, #0A4A2C, #156B40)";
  if (change > 0.5) return "linear-gradient(145deg, #062A1A, #0D4A30)";
  if (change >= -0.5) return "linear-gradient(145deg, #0C1220, #141E30)"; // neutral
  if (change >= -2) return "linear-gradient(145deg, #2A0808, #4A1010)";
  if (change >= -4) return "linear-gradient(145deg, #4A0D0D, #6B1515)";
  return "linear-gradient(145deg, #5C0D0D, #8B1A1A)";
}
```

---

## 2. Typography Scale

### Font Families

```
Google Fonts URL:
https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&family=DM+Sans:wght@300;400;500;600;700&family=JetBrains+Mono:wght@300;400;500;600;700&family=Noto+Kufi+Arabic:wght@300;400;500;600;700&display=swap
```

| Role | Family | Usage | CSS Value |
|------|--------|-------|-----------|
| Display / Headings | Cormorant Garamond | Page titles, section headers, editorial callouts | `'Cormorant Garamond', Georgia, serif` |
| Monospace / Data | JetBrains Mono | Prices, tickers, percentages, timestamps, table data | `'JetBrains Mono', 'Courier New', monospace` |
| Body / UI | DM Sans | Body text, buttons, navigation, labels | `'DM Sans', -apple-system, sans-serif` |
| Arabic | Noto Kufi Arabic | All Arabic text (RTL direction) | `'Noto Kufi Arabic', 'DM Sans', sans-serif` |

```js
const FONT = {
  display: "'Cormorant Garamond', Georgia, serif",
  mono: "'JetBrains Mono', 'Courier New', monospace",
  ui: "'DM Sans', -apple-system, sans-serif",
  arabic: "'Noto Kufi Arabic', 'DM Sans', sans-serif",
} as const;
```

### Type Scale

| Token | Size | Weight | Line Height | Letter Spacing | Font | Usage |
|-------|------|--------|-------------|----------------|------|-------|
| `display-xl` | 32px | 600 | 1.1 | -0.02em | display | Hero page titles |
| `display-lg` | 24px | 600 | 1.15 | -0.01em | display | Section headers |
| `display-md` | 20px | 600 | 1.2 | 0 | display | Sub-section headers |
| `heading-lg` | 18px | 600 | 1.3 | 0 | ui | Card titles |
| `heading-md` | 16px | 600 | 1.3 | 0 | ui | Subsection titles |
| `heading-sm` | 14px | 600 | 1.3 | 0 | ui | Small headers |
| `body-lg` | 14px | 400 | 1.5 | 0 | ui | Primary body text |
| `body-md` | 13px | 400 | 1.5 | 0 | ui | Secondary body text |
| `body-sm` | 12px | 400 | 1.4 | 0 | ui | Tertiary body text |
| `label-lg` | 11px | 500 | 1 | 0.08em | mono | Section labels |
| `label-md` | 10px | 500 | 1 | 0.12em | mono | Meta labels, uppercase |
| `label-sm` | 9px | 500 | 1 | 0.15em | mono | Micro labels, timestamps |
| `data-xl` | 28px | 600 | 1 | -0.02em | mono | Hero data values |
| `data-lg` | 22px | 600 | 1 | -0.01em | mono | Large data values (TASI) |
| `data-md` | 16px | 600 | 1 | 0 | mono | Medium data values |
| `data-sm` | 13px | 500 | 1 | 0 | mono | Table cell values |
| `data-xs` | 11px | 500 | 1 | 0 | mono | Small data / change% |

### Uppercase Convention

All `label-*` tokens are used with `text-transform: uppercase`. Labels in the system always appear as UPPERCASE MONO to reinforce the terminal aesthetic.

---

## 3. Spacing System

8px base grid. All spacing should be multiples of 4px, preferring multiples of 8px.

```js
const spacing = {
  "0":    "0px",
  "0.5":  "2px",
  "1":    "4px",
  "1.5":  "6px",
  "2":    "8px",      // base unit
  "3":    "12px",
  "4":    "16px",
  "5":    "20px",
  "6":    "24px",
  "8":    "32px",
  "10":   "40px",
  "12":   "48px",
  "16":   "64px",
  "20":   "80px",
};
```

### Component-Level Spacing Rules

| Context | Padding | Gap |
|---------|---------|-----|
| Page outer padding | 24px horizontal, 20px vertical | - |
| Card / Panel padding | 16px - 20px | - |
| Grid gap (cards) | - | 12px - 16px |
| Grid gap (stats) | - | 12px |
| Inline items | - | 6px - 8px |
| Section vertical | - | 16px - 20px |
| Sidebar item padding | 8px 20px | 8px |
| Filter chip padding | 6px 12px | 4px |
| Button padding | 4px 14px (sm), 8px 16px (md), 10px 20px (lg) | - |

---

## 4. Border Styles

### Border Tokens

```css
/* Default card border */
border: 1px solid rgba(197, 179, 138, 0.08);

/* Hover / focus border */
border: 1px solid rgba(197, 179, 138, 0.2);

/* Active / selected border */
border: 1px solid rgba(197, 179, 138, 0.35);

/* Divider line (horizontal) */
border-bottom: 1px solid rgba(197, 179, 138, 0.08);

/* Accent top strip (2px, on stat cards) */
border-top: 2px solid <accent-color>;  /* gold, green, red, etc. */
```

### Border Radius

```js
const radii = {
  none: "0px",
  sm: "3px",       // treemap cells, mini bars
  md: "6px",       // pills, small buttons, change badges
  lg: "8px",       // toggle segments, buttons
  xl: "12px",      // tooltip, detail panels
  "2xl": "14px",   // cards, glass panels
  full: "9999px",  // circular elements, filter chips (rounded-full)
};
```

Default for cards/panels: `border-radius: 14px`.
Default for buttons: `border-radius: 8px`.
Default for pills/badges: `border-radius: 6px`.

---

## 5. Animation Keyframes

All animations share the same easing library:

```js
const easing = {
  smooth: "cubic-bezier(0.4, 0, 0.2, 1)",  // default for transitions
  snap: "cubic-bezier(0.2, 0, 0, 1)",       // snappy entrance
  bounce: "cubic-bezier(0.34, 1.56, 0.64, 1)", // playful overshoot
};
```

### Required Keyframes

```css
/* 1. tooltipReveal - tooltip entrance (mouse hover) */
@keyframes tooltipReveal {
  from {
    opacity: 0;
    transform: translateY(6px) scale(0.98);
    filter: blur(2px);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
    filter: blur(0px);
  }
}
/* Duration: 180ms, easing: ease-out */

/* 2. fadeIn - generic content reveal */
@keyframes fadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}
/* Duration: 400ms, easing: ease */

/* 3. slideUp - content entrance from below */
@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
/* Duration: 500ms, easing: cubic-bezier(0.4, 0, 0.2, 1) */

/* 4. slideDown - header/strip entrance */
@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
/* Duration: 500ms, easing: ease-out */

/* 5. breathe - live indicator pulse */
@keyframes breathe {
  0%, 100% {
    opacity: 1;
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(107, 203, 139, 0.4);
  }
  50% {
    opacity: 0.6;
    transform: scale(0.85);
    box-shadow: 0 0 0 4px rgba(107, 203, 139, 0);
  }
}
/* Duration: 2s, easing: ease-in-out, iteration: infinite */

/* 6. scanline - CRT-like horizontal sweep overlay */
@keyframes scanline {
  0% {
    transform: translateY(-100%);
  }
  100% {
    transform: translateY(100vh);
  }
}
/* Duration: 8s, easing: linear, iteration: infinite, opacity: 0.015 */

/* 7. shimmer - skeleton loading / gold shimmer */
@keyframes shimmer {
  from { background-position: -200% 0; }
  to   { background-position: 200% 0; }
}
/* Duration: 2s, easing: linear, iteration: infinite */
/* Background: linear-gradient(90deg, transparent, rgba(197,179,138,0.08), transparent) */
/* Background-size: 200% 100% */
```

### Staggered Entrance Pattern

For lists (movers, sector items), apply `slideUp` with incrementing `animation-delay`:

```css
.stagger-item {
  animation: slideUp 0.5s cubic-bezier(0.4, 0, 0.2, 1) both;
}
/* Item N: animation-delay: N * 50ms */
/* Cap at 400ms max delay (8 items) */
```

### Hover Transitions

All interactive elements use consistent transition timing:

```css
transition: all 0.2s ease;
/* For color-only changes: */
transition: color 0.15s ease, background 0.15s ease;
```

---

## 6. Glass Panel / Surface Pattern

The signature surface treatment. Used for cards, sidebars, stat panels.

```js
// GlassPanel base style
const glassPanel = {
  background: "rgba(13, 15, 20, 0.85)",
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
  border: "1px solid rgba(197, 179, 138, 0.08)",
  borderRadius: 14,
};

// GlassPanel elevated (modals, tooltips)
const glassPanelElevated = {
  ...glassPanel,
  background: "rgba(7, 8, 12, 0.97)",
  backdropFilter: "blur(24px)",
  WebkitBackdropFilter: "blur(24px)",
  border: "1px solid rgba(197, 179, 138, 0.2)",
  boxShadow: "0 24px 48px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)",
};

// Surface card (non-glass, for grids)
const surfaceCard = {
  background: "#0D0F14",
  border: "1px solid rgba(197, 179, 138, 0.08)",
  borderRadius: 14,
};
```

### Inset Highlights

Cards get a subtle 1px inset highlight at the top:

```css
box-shadow: inset 0 1px 0 rgba(255,255,255,0.04);
```

### Accent Strip

Stat cards feature a colored strip at the top:

```css
/* Pseudo-element or absolute div at top of card */
position: absolute;
top: 0; left: 0; right: 0;
height: 2px;
background: <accent-color>;
opacity: 0.6;
```

---

## 7. Gold Button / Chip Pattern

### Primary Gold Button (CTA)

```js
const goldButton = {
  background: "linear-gradient(135deg, #C5B38A, #E4D5B0)",
  color: "#07080C",
  fontFamily: FONT.mono,
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.08em",
  padding: "8px 16px",
  borderRadius: 8,
  border: "none",
  cursor: "pointer",
  transition: "all 0.2s ease",
  // Hover:
  // filter: brightness(1.1)
  // box-shadow: 0 0 20px rgba(197,179,138,0.3)
};
```

### Gold Outline Button (Secondary)

```js
const goldOutlineButton = {
  background: "transparent",
  color: "#C5B38A",
  fontFamily: FONT.mono,
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: "0.1em",
  padding: "6px 12px",
  borderRadius: 6,
  border: "1px solid rgba(197, 179, 138, 0.35)",
  cursor: "pointer",
  transition: "all 0.2s ease",
  // Hover:
  // background: rgba(197, 179, 138, 0.12)
  // border-color: rgba(197, 179, 138, 0.5)
};
```

### Gold Chip / Pill (active filter)

```js
const goldChip = {
  background: "rgba(197, 179, 138, 0.12)",
  color: "#C5B38A",
  fontFamily: FONT.ui,
  fontSize: 11,
  fontWeight: 600,
  padding: "6px 12px",
  borderRadius: 8,
  borderBottom: "2px solid #C5B38A",
  cursor: "pointer",
};
```

### Inactive Chip

```js
const inactiveChip = {
  background: "transparent",
  color: "#8A8578",
  fontFamily: FONT.ui,
  fontSize: 11,
  fontWeight: 400,
  padding: "6px 12px",
  borderRadius: 8,
  borderBottom: "2px solid transparent",
  cursor: "pointer",
  // Hover:
  // color: "#E8E4DC"
  // background: "rgba(197, 179, 138, 0.04)"
};
```

### Sliding Toggle (e.g., Cap / Volume)

Container:
```js
{
  display: "flex",
  background: "rgba(13, 15, 20, 0.8)",
  borderRadius: 8,
  border: "1px solid rgba(197, 179, 138, 0.08)",
  padding: 2,
  height: 32,
  position: "relative",
}
```

Sliding indicator (absolute-positioned):
```js
{
  position: "absolute",
  top: 2,
  width: "calc(50% - 2px)",
  height: "calc(100% - 4px)",
  background: "rgba(197, 179, 138, 0.12)",
  borderRadius: 6,
  border: "1px solid rgba(197, 179, 138, 0.35)",
  transition: "left 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
}
```

---

## 8. Gradient Backgrounds (Ambient Radial)

### Page Background (fixed, behind everything)

```css
/* Layer 1: Base color */
background: #07080C;

/* Layer 2: Ambient radial gradients (fixed position) */
position: fixed;
inset: 0;
pointer-events: none;
z-index: 0;
background:
  radial-gradient(ellipse 800px 600px at 10% 10%, rgba(197, 179, 138, 0.06), transparent 70%),
  radial-gradient(ellipse 600px 400px at 90% 80%, rgba(107, 203, 139, 0.03), transparent 60%),
  radial-gradient(ellipse 500px 500px at 50% 50%, rgba(13, 15, 20, 0.5), transparent);
```

### Grain Texture Overlay

```html
<div style="position: fixed; inset: 0; pointer-events: none; z-index: 1; opacity: 0.03;">
  <svg width="100%" height="100%">
    <filter id="grain">
      <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="4" stitchTiles="stitch" />
      <feColorMatrix type="saturate" values="0" />
    </filter>
    <rect width="100%" height="100%" filter="url(#grain)" />
  </svg>
</div>
```

### Scanline Overlay (treemap, heatmap only)

```css
position: absolute;
inset: 0;
background: repeating-linear-gradient(
  0deg,
  transparent,
  transparent 2px,
  rgba(7, 8, 12, 0.08) 2px,
  rgba(7, 8, 12, 0.08) 4px
);
pointer-events: none;
z-index: 5;
```

### Card Background Glow

Individual cards can have a subtle accent glow in the corner:

```css
/* Positioned absolute within the card */
position: absolute;
top: -20px; right: -20px;
width: 80px; height: 80px;
border-radius: 50%;
background: <accentColor at 10% opacity>;
filter: blur(30px);
pointer-events: none;
```

---

## 9. Scrollbar Styles

```css
/* Thin gold scrollbar - apply globally */
*::-webkit-scrollbar {
  width: 4px;
  height: 4px;
}
*::-webkit-scrollbar-track {
  background: transparent;
}
*::-webkit-scrollbar-thumb {
  background: rgba(197, 179, 138, 0.2);
  border-radius: 2px;
}
*::-webkit-scrollbar-thumb:hover {
  background: rgba(197, 179, 138, 0.4);
}

/* Firefox */
* {
  scrollbar-width: thin;
  scrollbar-color: rgba(197, 179, 138, 0.2) transparent;
}

/* Hide scrollbar for horizontal scroll containers (sector tabs) */
.no-scrollbar {
  scrollbar-width: none;
}
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
```

---

## 10. Component Patterns

### 10.1 Stat Card

A top-level KPI card displaying a single metric.

```
+--------------------------------------------------+
| [2px accent strip at top]                        |
|                                                  |
|  TOTAL MARKET CAP          (label-sm, accent)    |
|  SAR 10.2T                 (heading-lg, text)    |
|  47 stocks tracked         (data-xs, secondary)  |
|                                                  |
|                        [corner glow, accent/10%] |
+--------------------------------------------------+
```

Structure:
- GlassPanel container, padding 16px 20px
- Absolute 2px accent strip at top (0.6 opacity)
- label-sm for category (gold/green/red/purple, uppercase, mono, 0.15em tracking)
- heading-lg for value (ui font, 18px, weight 600)
- data-xs for subtitle (mono, 10px, textSecondary)
- Corner glow: absolute 80x80px circle, accent color at 10%, blur(30px)

### 10.2 Mover Row

A single row in the "Top Movers" sidebar list.

```
| 1  Al Rajhi Bank    95.20  [+1.20%]  [===  ] |
|    1180                                       |
```

Structure:
- Flex row, padding 8px 20px
- Rank: mono 10px, textMuted, 16px width, right-aligned
- Name block (flex: 1):
  - Name: ui 11px, weight 500, text, truncate
  - Ticker: mono 9px, textSecondary
- Price: mono 10px, textSecondary, flex-shrink 0
- Change pill: mono 10px, weight 600, semantic color, 2px 6px padding, rounded 4px
  - Positive: green text, greenMuted bg
  - Negative: red text, redMuted bg
- Mini bar: 32x4px, background rgba(255,255,255,0.06), inner fill = semantic color
  - Width = min(|change| / 6 * 100, 100)%

Hover: `background: rgba(197, 179, 138, 0.05)`

### 10.3 Sector Tab

A filter tab in the horizontal sector filter bar.

```
[ All ] [ Banking +0.42% ] [ Energy -0.85% ] [ ... ]
```

Structure:
- Horizontal scrolling container, gap 4px
- Each tab is a button:
  - Active: gold text, goldSubtle background, gold 2px bottom border, weight 600
  - Inactive: textSecondary, transparent bg, transparent bottom border, weight 400
  - Contains: optional 4x4px color dot (green/red/neutral based on avg change)
  - Contains: sector name (ui 11px)
  - Contains: change% (mono 9px, semantic color, 0.8 opacity)
- Transition: `all 0.2s ease`
- `border-radius: 8px 8px 0 0` for top-rounded tab shape

### 10.4 Range Input

A dual min/max input for numerical filters (screener).

```
  P/E Ratio
  [ Min      ] [ Max      ]
```

Structure:
- Label: label-md style (mono 10px, 0.12em tracking, textMuted, uppercase)
- Two inputs side by side (flex, gap 8px)
- Each input:
  - Background: surfaceElevated (#12151C)
  - Border: 1px solid rgba(197, 179, 138, 0.08)
  - Border-radius: 8px (lg)
  - Padding: 6px 8px
  - Font: mono 12px, text color
  - Placeholder: textMuted color
  - Focus: border-color rgba(197, 179, 138, 0.35), outline none
  - Transition: border-color 0.2s ease

### 10.5 Event Card (Calendar)

```
+--------------------------------------------------+
|  Company Name - Div Ex-Date    [DIV]             |
|  Additional description...                        |
|  2026-02-15                                       |
+--------------------------------------------------+
```

Structure:
- Link wrapper, rounded-lg, padding 10px, border transition
- Dividend: border greenMuted, bg rgba(107,203,139,0.05)
- Earnings: border goldSubtle, bg rgba(197,179,138,0.05)
- Title: body-sm, weight 500, text, truncate
- Description: label-md, textMuted
- Badge pill: label-sm, weight 700, uppercase, rounded-full
  - Dividend: greenMuted bg, green text
  - Earnings: goldSubtle bg, gold text
- Date: label-md, textMuted

### 10.6 Data Table (Screener)

```
+-------------------------------------------------------------------+
| Company     Price    Change   Mkt Cap  P/E   P/B   ROE   Yield  |
|-------------------------------------------------------------------|
| Al Rajhi    95.20   +1.20%   320B     12.3  2.1   18.5% 2.8%   |
| SNB         42.50   -0.80%   280B     10.8  1.5   15.2% 3.1%   |
+-------------------------------------------------------------------+
```

Structure:
- Container: surface bg, border, rounded 14px, overflow hidden
- Header row: surfaceElevated bg, border-bottom
  - Column headers: label-md (mono, 10px, textMuted, uppercase)
  - Sortable: cursor pointer, hover gold, active shows gold arrow
- Data rows: padding 8px 12px, border-bottom at 0.3 opacity
  - Hover: surfaceElevated bg
  - Company cell: body-sm weight 500, text color; ticker in label-sm, textMuted
  - Price cell: data-sm, mono, text color
  - Change cell: data-xs, mono, weight 600, semantic green/red
  - Other cells: data-xs, mono, textSecondary

### 10.7 Glass Header

```
+------------------------------------------------------------------+
| [RA] Ra'd AI                 TASI 11,847.32  -0.34%  ~~~~       |
|      MARKET INTELLIGENCE                          14:32:05 TADAWUL|
+------------------------------------------------------------------+
```

Structure:
- Sticky, top 0, z-index 50, height 60px
- Background: rgba(7, 8, 12, 0.92)
- Backdrop-filter: blur(20px)
- Border-bottom: 1px solid border
- Flex, space-between, padding 0 24px
- Logo: 36x36px rounded 8px, gold gradient bg, display font 16px
- TASI section: mono font, data-lg for value, change pill
- Sparkline: 120x28 SVG, stroke 1.5px, fill gradient below line
- Clock: mono 12px, green dot with breathe animation
- Badge: mono 9px, gold text, goldSubtle bg, borderActive border

### 10.8 Market Breadth (Arc Chart)

Structure:
- GlassPanel wrapper
- Section label: label-sm, gold, uppercase, 0.15em tracking
- Semi-circle SVG arcs (200x100 viewBox):
  - Background arc: rgba(255,255,255,0.05) stroke, 12px width
  - Advancing arc (left): green stroke with drop-shadow glow
  - Declining arc (right): red stroke with drop-shadow glow
  - Center: "A/D RATIO" label (label-sm, textSecondary) + ratio value (data-lg, text)
  - Edge labels: count (data-sm, semantic) + direction (label-sm, textSecondary)
- Segmented bar below: flex, gap 2px, height 6px
  - Green segment (advancing), neutral segment (flat), red segment (declining)
- Footer text: flex space-between, label-sm

### 10.9 Treemap Cell

```
+-------------+
|    1180      |   (ticker, mono 9px, 0.5 opacity)
|  Al Rajhi    |   (name, ui, dynamic size, weight 600)
|   +1.20%     |   (change, mono, dynamic size, semantic)
|  SAR 95.20   |   (price, mono 9px, 0.6 opacity)
+-------------+
```

Structure:
- Absolute positioned within treemap container
- Background: cellGradient(change) - semantic gradient
- Border-radius: 3px (sm)
- Flex column, center-aligned, padding 4px
- Content visibility adapts to cell dimensions:
  - Ticker visible if w > 55 && h > 28
  - Name visible if w > 70 && h > 45
  - Change visible if w > 45 && h > 40
  - Price visible if w > 80 && h > 70
- Font sizes scale with cell width:
  - Name: max(9, min(14, w/8))
  - Change: max(10, min(16, w/6))
- Hover effects:
  - brightness(1.25), scale(1.02)
  - Gold outline: 1px solid rgba(197,179,138,0.5)
  - Glow shadow: semantic color
  - Non-hovered cells: brightness(0.7), opacity 0.45

### 10.10 Color Legend Bar

```
  -4%+  [=============================================] +4%+
         red gradient -----> neutral -----> green gradient
```

Structure:
- Flex row, align center, gap 12px
- Left label: label-sm, red color
- Right label: label-sm, green color
- Center bar: flex 1, height 6px, rounded 3px
  - `linear-gradient(90deg, #8B1A1A, #6B1515, #4A1010, #2A0808, #141E30, #0D4A30, #156B40, #1A8A52)`

---

## 11. Tailwind Integration Notes

For pages using Tailwind CSS (screener, calendar, etc.), the following CSS custom properties should be defined at `:root` to bridge with the luxury palette:

```css
:root {
  --bg-page: #07080C;
  --bg-card: #0D0F14;
  --bg-card-hover: #12151C;
  --bg-input: #12151C;
  --text-primary: #E8E4DC;
  --text-secondary: #8A8578;
  --text-muted: #5A574F;
  --border: rgba(197, 179, 138, 0.08);
  --border-hover: rgba(197, 179, 138, 0.2);
  --gold: #C5B38A;
  --gold-bright: #E4D5B0;
}
```

Tailwind class equivalents:
- `bg-gold/15` -> use `goldSubtle` (rgba 0.12)
- `text-gold` -> `#C5B38A`
- `text-accent-green` -> `#6BCB8B`
- `text-accent-red` -> `#E06C6C`
- `border-gold/30` -> `rgba(197, 179, 138, 0.3)`
- `border-[#2A2A2A]` -> update to `rgba(197, 179, 138, 0.08)` for gold-tinted borders

---

## 12. Migration Notes (Existing -> Luxury)

### Heatmap Page (already luxury)
The existing `heatmap/page.tsx` already implements this design system with minor token differences:
- Update `T.bg` from `#050912` to `#07080C`
- Update `T.gold` from `#C9A84C` to `#C5B38A`
- Update `T.goldBright` from `#E8C46A` to `#E4D5B0`
- Update green from `#2ECC80` to `#6BCB8B`
- Update red from `#E84040` to `#E06C6C`
- Add `FONT.arabic` for Arabic text support

### Screener Page (needs luxury conversion)
Currently uses Tailwind utility classes with CSS variables from the old design system:
- Replace `bg-[var(--bg-card)]` with `surface` colors
- Replace `border-[#2A2A2A]` with gold-tinted borders
- Add font family specifications (currently inherits generic)
- Add glass panel treatment to filter panel
- Add ambient gradient background
- Add staggered row entrance animations

### Calendar Page (needs luxury conversion)
Similar to screener - Tailwind-based with old tokens:
- Same CSS variable updates as screener
- Grid cells need the glass/surface treatment
- Event pills already use gold/green which map well
- Add month navigation with the luxury button pattern
- Add grain texture and ambient gradients

---

## 13. Accessibility Notes

- All interactive elements must have `cursor: pointer`
- Focus states: `outline: 2px solid rgba(197,179,138,0.5); outline-offset: 2px;`
- Color contrast: text (#E8E4DC) on bg (#07080C) = 13.5:1 ratio (AAA)
- Gold (#C5B38A) on bg (#07080C) = 8.2:1 ratio (AAA)
- Green (#6BCB8B) on bg (#07080C) = 9.1:1 ratio (AAA)
- Red (#E06C6C) on bg (#07080C) = 5.3:1 ratio (AA)
- Never rely on color alone for semantic meaning; pair with text labels or icons
- Tooltips: `pointer-events: none` (accessed by hover, not focusable)
- Animations: respect `prefers-reduced-motion` via `@media (prefers-reduced-motion: reduce)`

---

## Summary

This design system establishes the "Private Wealth Terminal x Editorial" aesthetic across all Ra'd AI pages. The key principles are:

1. **Dark, deep backgrounds** with subtle gold-tinted borders
2. **Three-font system**: Cormorant Garamond (editorial), JetBrains Mono (data), DM Sans (UI)
3. **Glass morphism** with backdrop-filter blur on all panels
4. **Ambient atmosphere** via radial gradients, grain texture, and scanline overlays
5. **Gold as the primary accent** in a warm, muted tone (#C5B38A) not bright yellow
6. **Semantic colors** (green/red) are softer and more muted than typical terminals
7. **Motion is purposeful**: entrance animations for content, hover transitions for interaction, breathing for live indicators
8. **Information density** appropriate for financial professionals, with clear hierarchy through type scale and color opacity
