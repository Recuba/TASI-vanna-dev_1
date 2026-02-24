# UI/UX Redesign: Chat Fix + Calendar + Heatmap Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix three UX defects — empty AI chat responses, unprofessional calendar grid, and poor sector heatmap readability — to bring the Ra'd AI frontend to production quality.

**Architecture:** All changes are frontend-only (Next.js 14 / TypeScript / Tailwind CSS). The chat fix modifies SSE event normalization in `use-sse-chat.ts` and adds a fallback in `AssistantContent.tsx`. The calendar redesign restructures the single-file `calendar/page.tsx` to show company names, colored type dots, and a click-to-detail side panel. The heatmap replacement removes the Recharts `<Treemap>` in `SectorHeatmap.tsx` and replaces it with a pure CSS grid of colored div cells with hover tooltips.

**Tech Stack:** Next.js 14, TypeScript, Tailwind CSS, React 18, Recharts (partially removed from heatmap only)

---

## Task 1: Fix AI chat empty response rendering

**Problem:** When Vanna returns a `status_card` with `status='success'` (non-SQL answers), it maps to `type: 'progress'` which is NOT stored in `components`. The stream ends, `components` is empty, and an empty box renders.

**Files to modify:**
- `frontend/src/lib/use-sse-chat.ts`
- `frontend/src/components/chat/AssistantContent.tsx`

### Step 1.1: Fix `normalizeSSEEvent` in `use-sse-chat.ts`

At line 159-171, the `status_card` case currently maps non-error status cards to `progress` type. Change it so that `status_card` events with meaningful content and a non-progress status are rendered as visible `text` events.

**Replace lines 159-171** (the `case 'status_card':` block) with:

```typescript
      // Status cards (info, error, success states)
      case 'status_card': {
        const title = (richData.title as string) || '';
        const description = (richData.description as string) || '';
        const status = richData.status as string | undefined;
        const content = description || title || simpleText || '';

        // Error status cards -> render as visible text
        if (status === 'error') {
          return { type: 'text', data: { content: content || 'An error occurred' } };
        }
        // Success/info status cards with meaningful content -> render as visible text
        // so the user sees the AI's response instead of an empty bubble
        if ((status === 'success' || status === 'info') && content) {
          return { type: 'text', data: { content } };
        }
        // Other status cards without meaningful content -> transient progress
        return { type: 'progress', data: { message: content || 'Processing...' } };
      }
```

### Step 1.2: Add post-stream fallback in `AssistantContent.tsx`

**Replace the `AssistantContent` function (lines 25-40)** with:

```typescript
export function AssistantContent({ message, progressText }: AssistantContentProps) {
  const { components, isStreaming, isError } = message;

  // While streaming with no components yet, show loading dots
  if ((!components || components.length === 0) && isStreaming) {
    return <LoadingDots progressText={progressText} />;
  }

  // Post-stream fallback: if components is empty and not an error,
  // show a helpful fallback so the user never sees an empty bubble
  if ((!components || components.length === 0) && !isStreaming && !isError) {
    const lang = typeof window !== 'undefined' ? localStorage.getItem('rad-ai-lang') : null;
    const fallbackText = lang === 'en'
      ? "I wasn't able to answer that. Try asking about a specific stock, sector, or metric."
      : 'عذرًا، لم أستطع الإجابة على هذا السؤال. جرّب السؤال عن سهم محدد أو قطاع.';
    return (
      <div className="text-sm leading-relaxed text-[var(--text-muted)] italic">
        {fallbackText}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {components?.map((event, i) => (
        <EventBlock key={i} event={event} />
      ))}
      {isStreaming && <LoadingDots progressText={progressText} />}
    </div>
  );
}
```

### Step 1.3: Verify

```bash
cd frontend && npx vitest run
```
Expected: All 317 tests pass.

```bash
cd frontend && npx next build
```
Expected: Build succeeds, 0 TypeScript errors.

### Step 1.4: Commit

```bash
git add frontend/src/lib/use-sse-chat.ts frontend/src/components/chat/AssistantContent.tsx
git commit -m "fix(chat): render status_card success/info as visible text + empty fallback

status_card events with status 'success' or 'info' and meaningful content
are now mapped to 'text' type instead of 'progress', ensuring they appear
in the components array and render visibly. Added a post-stream fallback
in AssistantContent so users never see an empty chat bubble."
```

---

## Task 2: Calendar grid cell redesign

**Problem:** Grid cells show raw ticker codes (e.g. `9604`) instead of company names. Font is 9px and unreadable. No event type indicators. No click-to-detail panel.

**File to modify:**
- `frontend/src/app/calendar/page.tsx`

### Step 2.1: Add selected day state and company name helper

After line 103 (`const [filter, setFilter] = useState<EventFilter>('all');`), add:

```typescript
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
```

Before the `EventCard` component (above line 62), add:

```typescript
/** Extract company short name from event title (format: "Company Name — Type") */
function getCompanyShortName(event: CalendarEvent): string {
  if (event.title) {
    const parts = event.title.split(' — ');
    if (parts[0]) {
      const name = parts[0].trim();
      return name.length > 15 ? name.slice(0, 14) + '…' : name;
    }
  }
  return event.ticker.replace('.SR', '');
}
```

### Step 2.2: Redesign the grid cell rendering

**Replace** the `<div className="grid grid-cols-7 gap-1">` day cells block with:

```tsx
              <div className="grid grid-cols-7 gap-1">
                {days.map((day, idx) => {
                  const dayEvents = eventsByDate.get(day.date) || [];
                  const isToday = day.date === todayStr;
                  const isSelected = day.date === selectedDate;
                  return (
                    <button
                      key={idx}
                      onClick={() => setSelectedDate(isSelected ? null : day.date)}
                      className={cn(
                        'min-h-[100px] sm:min-h-[120px] rounded-lg p-1.5 text-xs border transition-colors text-start',
                        day.isCurrentMonth
                          ? 'bg-[var(--bg-input)] border-[#2A2A2A]/50 hover:border-gold/30'
                          : 'bg-transparent border-transparent opacity-40',
                        isToday && 'ring-1 ring-gold/50',
                        isSelected && 'ring-2 ring-gold border-gold/40',
                      )}
                    >
                      <div className={cn(
                        'text-[11px] font-medium mb-1',
                        isToday ? 'text-gold font-bold' : 'text-[var(--text-muted)]',
                      )}>
                        {day.day}
                      </div>
                      <div className="space-y-0.5">
                        {dayEvents.slice(0, 3).map((ev, i) => (
                          <div
                            key={i}
                            className={cn(
                              'flex items-center gap-1 text-[10px] sm:text-[11px] px-1 py-0.5 rounded truncate font-medium',
                              ev.type === 'dividend'
                                ? 'bg-accent-green/15 text-accent-green'
                                : 'bg-gold/15 text-gold',
                            )}
                            title={ev.title}
                          >
                            <span className={cn(
                              'w-1.5 h-1.5 rounded-full flex-shrink-0',
                              ev.type === 'dividend' ? 'bg-accent-green' : 'bg-gold',
                            )} />
                            <span className="truncate">{getCompanyShortName(ev)}</span>
                          </div>
                        ))}
                        {dayEvents.length > 3 && (
                          <span className="text-[10px] text-[var(--text-muted)] ps-1">
                            +{dayEvents.length - 3} {t('المزيد', 'more')}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Selected day detail panel */}
              {selectedDate && (eventsByDate.get(selectedDate) || []).length > 0 && (
                <div className="mt-3 bg-[var(--bg-input)] border border-[#2A2A2A] rounded-xl p-4 animate-slide-down">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold text-[var(--text-primary)]">
                      {new Date(selectedDate + 'T00:00:00').toLocaleDateString(
                        language === 'ar' ? 'ar-SA' : 'en-US',
                        { weekday: 'long', day: 'numeric', month: 'long' }
                      )}
                    </h3>
                    <button
                      onClick={() => setSelectedDate(null)}
                      className="text-xs text-[var(--text-muted)] hover:text-gold transition-colors"
                    >
                      {t('إغلاق', 'Close')} &times;
                    </button>
                  </div>
                  <div className="space-y-2">
                    {(eventsByDate.get(selectedDate) || []).map((event, idx) => (
                      <EventCard
                        key={`${event.ticker}-${event.date}-${idx}`}
                        event={event}
                        language={language}
                      />
                    ))}
                  </div>
                </div>
              )}
```

### Step 2.3: Improve the month navigation header

**Replace** the `<div className="bg-[var(--bg-card)] border border-[#2A2A2A] rounded-xl p-4">` opening block through the `</div>` that closes the month header section with:

```tsx
        <div className="bg-[var(--bg-card)] border border-[#2A2A2A] rounded-xl p-4">
          {/* Event summary strip */}
          {events.length > 0 && (
            <div className="flex items-center justify-center gap-4 mb-3 text-xs">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-accent-green" />
                <span className="text-[var(--text-muted)]">
                  {events.filter(e => e.type === 'dividend').length} {t('توزيعات', 'dividends')}
                </span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-gold" />
                <span className="text-[var(--text-muted)]">
                  {events.filter(e => e.type === 'earnings').length} {t('أرباح', 'earnings')}
                </span>
              </span>
            </div>
          )}

          <div className="flex items-center justify-between mb-4">
            <button
              onClick={prevMonth}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-[var(--text-secondary)] hover:text-gold hover:bg-[var(--bg-input)] transition-colors"
              aria-label={t('الشهر السابق', 'Previous month')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <div className="text-center">
              <h2 className="text-lg font-bold text-[var(--text-primary)]">
                {monthNames[month]} {year}
              </h2>
              <button onClick={goToday} className="text-[10px] text-gold hover:text-gold-light transition-colors">
                {t('اليوم', 'Today')}
              </button>
            </div>
            <button
              onClick={nextMonth}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-[var(--text-secondary)] hover:text-gold hover:bg-[var(--bg-input)] transition-colors"
              aria-label={t('الشهر التالي', 'Next month')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>
```

### Step 2.4: Verify

```bash
cd frontend && npx next build
```
Expected: 0 errors.

### Step 2.5: Commit

```bash
git add frontend/src/app/calendar/page.tsx
git commit -m "feat(calendar): show company names, type dots, click-to-detail panel

Calendar grid cells now show company short names instead of raw ticker
codes, with colored dot indicators (green=dividend, gold=earnings).
Increased cell heights and font sizes for readability. Clicking a day
opens a detail panel listing all events as EventCard components. Added
event summary strip and proper SVG arrow buttons for month navigation."
```

---

## Task 3: Calendar list view grouping by date

**File to modify:**
- `frontend/src/app/calendar/page.tsx`

### Step 3.1: Add `sortedDates` memo

After the existing `eventsByDate` memo (after line 123), add:

```typescript
  const sortedDates = useMemo(() => {
    return Array.from(eventsByDate.keys()).sort();
  }, [eventsByDate]);
```

### Step 3.2: Replace the list view rendering

**Replace** the list view block (the `<div className="space-y-2">` inside the `else` branch of the `viewMode === 'grid'` ternary) with:

```tsx
            /* List View — grouped by date */
            <div className="space-y-4">
              {events.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)] text-center py-8" dir={dir}>
                  {t('لا توجد أحداث في هذا الشهر', 'No events this month')}
                </p>
              ) : (
                sortedDates.map((date) => {
                  const dateEvents = eventsByDate.get(date) || [];
                  if (dateEvents.length === 0) return null;
                  const dateObj = new Date(date + 'T00:00:00');
                  const isToday = date === todayStr;
                  return (
                    <div key={date}>
                      <div className={cn(
                        'flex items-center gap-2 mb-2 pb-1 border-b border-[#2A2A2A]/50',
                        isToday && 'border-gold/30',
                      )}>
                        <span className={cn(
                          'text-xs font-bold',
                          isToday ? 'text-gold' : 'text-[var(--text-secondary)]',
                        )}>
                          {dateObj.toLocaleDateString(
                            language === 'ar' ? 'ar-SA' : 'en-US',
                            { weekday: 'short', day: 'numeric', month: 'short' }
                          )}
                        </span>
                        {isToday && (
                          <span className="text-[9px] bg-gold/15 text-gold px-1.5 py-0.5 rounded-full font-bold">
                            {t('اليوم', 'TODAY')}
                          </span>
                        )}
                        <span className="text-[10px] bg-[var(--bg-input)] text-[var(--text-muted)] px-1.5 py-0.5 rounded-full">
                          {dateEvents.length}
                        </span>
                      </div>
                      <div className="space-y-2">
                        {dateEvents.map((event, idx) => (
                          <EventCard
                            key={`${event.ticker}-${event.date}-${idx}`}
                            event={event}
                            language={language}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
```

### Step 3.3: Verify and commit

```bash
cd frontend && npx next build && npx vitest run
```
Expected: Build succeeds, all tests pass.

```bash
git add frontend/src/app/calendar/page.tsx
git commit -m "feat(calendar): group list view by date with separators and event counts"
```

---

## Task 4: Heatmap CSS grid replacement

**File to modify:**
- `frontend/src/app/(home)/components/SectorHeatmap.tsx`

### Step 4.1: Replace the entire file

**Replace ALL contents** of `SectorHeatmap.tsx` with:

```typescript
'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useMarketHeatmap } from '@/lib/hooks/use-api';
import { useLanguage } from '@/providers/LanguageProvider';
import { LoadingSpinner } from '@/components/common/loading-spinner';

// ---------------------------------------------------------------------------
// Color scale
// ---------------------------------------------------------------------------

function getHeatmapColor(changePct: number): string {
  if (changePct >= 3) return '#1B5E20';
  if (changePct >= 1.5) return '#2E7D32';
  if (changePct >= 0.5) return '#388E3C';
  if (changePct > 0) return '#4CAF50';
  if (changePct === 0) return '#616161';
  if (changePct > -0.5) return '#E53935';
  if (changePct > -1.5) return '#C62828';
  if (changePct > -3) return '#B71C1C';
  return '#880E4F';
}

// ---------------------------------------------------------------------------
// Cell component
// ---------------------------------------------------------------------------

interface HeatmapCellData {
  name: string;
  ticker: string;
  sector: string;
  change_pct: number;
  market_cap: number;
  tier: 'large' | 'mid' | 'small';
}

function HeatmapCell({ item }: { item: HeatmapCellData }) {
  const [hovered, setHovered] = useState(false);
  const shortTicker = item.ticker.replace('.SR', '');

  const sizeClasses = {
    large: 'w-[110px] h-[72px] sm:w-[120px] sm:h-[80px]',
    mid:   'w-[85px]  h-[54px] sm:w-[90px]  sm:h-[60px]',
    small: 'w-[65px]  h-[44px] sm:w-[70px]  sm:h-[50px]',
  };

  return (
    <div
      className={cn(
        'relative rounded-sm cursor-pointer transition-all duration-150 flex flex-col items-center justify-center overflow-visible',
        sizeClasses[item.tier],
        hovered && 'scale-105 ring-1 ring-white/30 z-10',
      )}
      style={{ backgroundColor: getHeatmapColor(item.change_pct) }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span className={cn(
        'font-bold text-white leading-tight truncate max-w-full px-1',
        item.tier === 'large' ? 'text-[11px] sm:text-xs' : item.tier === 'mid' ? 'text-[10px] sm:text-[11px]' : 'text-[9px] sm:text-[10px]',
      )}>
        {shortTicker}
      </span>
      <span className={cn(
        'text-white/80 leading-tight',
        item.tier === 'small' ? 'text-[8px]' : 'text-[9px] sm:text-[10px]',
      )}>
        {item.change_pct >= 0 ? '+' : ''}{item.change_pct.toFixed(1)}%
      </span>

      {/* Hover tooltip */}
      {hovered && (
        <div className="absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 bg-[var(--bg-card)] border border-[#2A2A2A] rounded-lg px-3 py-2 shadow-xl z-20 whitespace-nowrap pointer-events-none animate-fade-in">
          <p className="text-xs font-bold text-[var(--text-primary)]">{item.name}</p>
          <p className="text-[10px] text-[var(--text-muted)]">{item.sector}</p>
          <p className={cn('text-[10px] font-bold', item.change_pct >= 0 ? 'text-accent-green' : 'text-accent-red')}>
            {item.change_pct >= 0 ? '+' : ''}{item.change_pct.toFixed(2)}%
          </p>
          <p className="text-[10px] text-[var(--text-muted)]">
            {(item.market_cap / 1e9).toFixed(1)}B SAR
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Gradient legend
// ---------------------------------------------------------------------------

function GradientLegend() {
  return (
    <div className="flex items-center justify-center gap-2 mt-3">
      <span className="text-[10px] text-[var(--text-muted)]">-3%+</span>
      <div
        className="h-2.5 w-32 sm:w-48 rounded-full"
        style={{
          background: 'linear-gradient(to right, #880E4F, #B71C1C, #C62828, #E53935, #616161, #4CAF50, #388E3C, #2E7D32, #1B5E20)',
        }}
      />
      <span className="text-[10px] text-[var(--text-muted)]">+3%+</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SectorHeatmap() {
  const { data: heatmapData, loading, error, refetch } = useMarketHeatmap();
  const { t } = useLanguage();

  const cells = useMemo<HeatmapCellData[]>(() => {
    if (!heatmapData) return [];
    const sorted = heatmapData
      .filter((item) => item.market_cap && item.market_cap > 0 && item.change_pct != null)
      .sort((a, b) => b.market_cap - a.market_cap)
      .slice(0, 100);

    return sorted.map((item, idx) => ({
      name: item.name || item.ticker,
      ticker: item.ticker,
      sector: item.sector || '',
      change_pct: item.change_pct,
      market_cap: item.market_cap,
      tier: idx < 10 ? 'large' as const : idx < 30 ? 'mid' as const : 'small' as const,
    }));
  }, [heatmapData]);

  return (
    <section className="bg-[var(--bg-card)] border border-[var(--border-color)] dark:border-[#2A2A2A]/50 hover:border-gold/30 rounded-xl p-5 transition-colors">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-gold uppercase tracking-wider">
          {t('خريطة السوق', 'Market Heatmap')}
        </h3>
        <Link href="/market" className="text-xs text-[var(--text-muted)] hover:text-gold transition-colors">
          {t('عرض الكل', 'View All')}
        </Link>
      </div>

      {loading ? (
        <div className="h-[320px] flex items-center justify-center">
          <LoadingSpinner message={t('جاري التحميل...', 'Loading...')} />
        </div>
      ) : error ? (
        <div className="h-[320px] flex items-center justify-center">
          <button onClick={refetch} className="text-sm text-accent-red hover:text-gold transition-colors">
            {t('إعادة المحاولة', 'Retry')}
          </button>
        </div>
      ) : cells.length > 0 ? (
        <Link href="/market" className="block">
          <div className="flex flex-wrap gap-0.5 justify-center min-h-[280px]">
            {cells.map((cell) => (
              <HeatmapCell key={cell.ticker} item={cell} />
            ))}
          </div>
        </Link>
      ) : (
        <div className="h-[320px] flex items-center justify-center">
          <p className="text-sm text-[var(--text-muted)]">{t('لا توجد بيانات', 'No data available')}</p>
        </div>
      )}

      <GradientLegend />
    </section>
  );
}
```

**Key changes:**
1. Removed all Recharts imports (`Treemap`, `ResponsiveContainer`, `Tooltip`)
2. Three-tier sizing: top 10 by market cap = large, next 20 = mid, rest = small
3. Hover tooltip with company name, sector, % change, market cap
4. Gradient legend bar instead of individual swatches
5. Entire heatmap area links to `/market`

### Step 4.2: Verify

```bash
cd frontend && npx next build
```
Expected: 0 errors. No broken imports.

```bash
cd frontend && npm run lint:rtl
```
Expected: 0 RTL violations.

### Step 4.3: Commit

```bash
git add "frontend/src/app/(home)/components/SectorHeatmap.tsx"
git commit -m "feat(heatmap): replace Recharts Treemap with CSS grid heatmap

Remove Recharts SVG-based Treemap and replace with a pure CSS flexbox
grid of div cells sized by market cap tier (large/mid/small). Cells
show ticker and % change as readable HTML text, with hover tooltips
showing full company details. Gradient legend bar replaces individual
color swatches."
```

---

## Task 5: Build verification

### Step 5.1: Full build + tests

```bash
cd frontend && npx next build
```
Expected: 0 errors, all pages compile.

```bash
cd frontend && npx vitest run
```
Expected: 317 tests pass, 0 failures.

```bash
cd frontend && npm run lint:rtl
```
Expected: 0 RTL violations.

### Step 5.2: Summary of modified files

| File | Change |
|------|--------|
| `frontend/src/lib/use-sse-chat.ts` | Fix `status_card` to render success/info as text |
| `frontend/src/components/chat/AssistantContent.tsx` | Add empty-components fallback message |
| `frontend/src/app/calendar/page.tsx` | Grid cells + detail panel + list grouping + header |
| `frontend/src/app/(home)/components/SectorHeatmap.tsx` | Full CSS grid replacement (Recharts removed) |
