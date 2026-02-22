'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/providers/LanguageProvider';
import { useCalendarEvents } from '@/lib/hooks/use-api';
import { LoadingSpinner } from '@/components/common/loading-spinner';
import type { CalendarEvent } from '@/lib/api/calendar';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getMonthRange(year: number, month: number): { from: string; to: string } {
  const from = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const to = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { from, to };
}

function getMonthDays(year: number, month: number): { date: string; day: number; isCurrentMonth: boolean }[] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDow = firstDay.getDay(); // 0=Sun
  const days: { date: string; day: number; isCurrentMonth: boolean }[] = [];

  // Previous month padding
  for (let i = startDow - 1; i >= 0; i--) {
    const d = new Date(year, month, -i);
    days.push({ date: d.toISOString().slice(0, 10), day: d.getDate(), isCurrentMonth: false });
  }

  // Current month
  for (let d = 1; d <= lastDay.getDate(); d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    days.push({ date: dateStr, day: d, isCurrentMonth: true });
  }

  // Next month padding (fill to 42 cells = 6 rows)
  const remaining = 42 - days.length;
  for (let i = 1; i <= remaining; i++) {
    const d = new Date(year, month + 1, i);
    days.push({ date: d.toISOString().slice(0, 10), day: d.getDate(), isCurrentMonth: false });
  }

  return days;
}

const MONTH_NAMES_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTH_NAMES_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const DAY_NAMES_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_NAMES_AR = ['أحد', 'إثن', 'ثلا', 'أرب', 'خمي', 'جمع', 'سبت'];

type ViewMode = 'grid' | 'list';
type EventFilter = 'all' | 'dividend' | 'earnings';

// ---------------------------------------------------------------------------
// Helpers (continued)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Event Card
// ---------------------------------------------------------------------------

function EventCard({ event, language }: { event: CalendarEvent; language: string }) {
  const isDividend = event.type === 'dividend';
  return (
    <Link
      href={`/stock/${encodeURIComponent(event.ticker)}`}
      className={cn(
        'block rounded-lg p-2.5 border transition-colors hover:bg-[var(--bg-card-hover)]',
        isDividend ? 'border-accent-green/30 bg-accent-green/5' : 'border-gold/30 bg-gold/5',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-[var(--text-primary)] truncate">{event.title}</p>
          {event.description && (
            <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{event.description}</p>
          )}
        </div>
        <span className={cn(
          'text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase flex-shrink-0',
          isDividend ? 'bg-accent-green/20 text-accent-green' : 'bg-gold/20 text-gold',
        )}>
          {isDividend ? (language === 'ar' ? 'توزيعات' : 'DIV') : (language === 'ar' ? 'أرباح' : 'EARN')}
        </span>
      </div>
      <p className="text-[10px] text-[var(--text-muted)] mt-1">{event.date}</p>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CalendarPage() {
  const { t, language } = useLanguage();
  const dir = language === 'ar' ? 'rtl' : 'ltr';
  const today = new Date();

  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [filter, setFilter] = useState<EventFilter>('all');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const { from, to } = useMemo(() => getMonthRange(year, month), [year, month]);
  const { data, loading } = useCalendarEvents({
    from,
    to,
    type: filter === 'all' ? undefined : filter,
  });

  const events = useMemo(() => data?.events ?? [], [data]);

  // Group events by date for grid view
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      const list = map.get(ev.date) || [];
      list.push(ev);
      map.set(ev.date, list);
    }
    return map;
  }, [events]);

  const days = useMemo(() => getMonthDays(year, month), [year, month]);
  const monthNames = language === 'ar' ? MONTH_NAMES_AR : MONTH_NAMES_EN;
  const dayNames = language === 'ar' ? DAY_NAMES_AR : DAY_NAMES_EN;
  const todayStr = today.toISOString().slice(0, 10);

  const prevMonth = () => {
    if (month === 0) { setYear(year - 1); setMonth(11); }
    else setMonth(month - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setYear(year + 1); setMonth(0); }
    else setMonth(month + 1);
  };
  const goToday = () => { setYear(today.getFullYear()); setMonth(today.getMonth()); };

  return (
    <div className="flex-1 px-4 sm:px-6 py-4 overflow-y-auto">
      <div className="max-w-content-lg mx-auto space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-xl font-bold text-[var(--text-primary)]" dir={dir}>
              {t('التقويم المالي', 'Financial Calendar')}
            </h1>
            <p className="text-xs text-[var(--text-muted)]" dir={dir}>
              {t('مواعيد التوزيعات والأرباح', 'Dividend and earnings dates')}
              {events.length > 0 && ` — ${events.length} ${t('حدث', 'events')}`}
            </p>
          </div>

          {/* View Toggle */}
          <div className="flex items-center gap-2">
            <div className="flex bg-[var(--bg-input)] border border-[#2A2A2A] rounded-lg p-0.5">
              <button
                onClick={() => setViewMode('grid')}
                className={cn('px-2.5 py-1 rounded-md text-xs font-medium transition-colors', viewMode === 'grid' ? 'bg-gold/15 text-gold' : 'text-[var(--text-muted)]')}
              >
                {t('شبكة', 'Grid')}
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={cn('px-2.5 py-1 rounded-md text-xs font-medium transition-colors', viewMode === 'list' ? 'bg-gold/15 text-gold' : 'text-[var(--text-muted)]')}
              >
                {t('قائمة', 'List')}
              </button>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          {(['all', 'dividend', 'earnings'] as EventFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
                filter === f ? 'bg-gold/15 text-gold border-gold/30' : 'text-[var(--text-muted)] border-[#2A2A2A] hover:text-[var(--text-secondary)]'
              )}
            >
              {f === 'all' ? t('الكل', 'All') : f === 'dividend' ? t('توزيعات', 'Dividends') : t('أرباح', 'Earnings')}
            </button>
          ))}
        </div>

        {/* Month Navigation */}
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

          {loading ? (
            <div className="flex justify-center py-12">
              <LoadingSpinner message={t('جاري التحميل...', 'Loading...')} />
            </div>
          ) : viewMode === 'grid' ? (
            /* Grid View */
            <div>
              {/* Day headers */}
              <div className="grid grid-cols-7 gap-1 mb-1">
                {dayNames.map((name) => (
                  <div key={name} className="text-center text-[10px] font-medium text-[var(--text-muted)] py-1">
                    {name}
                  </div>
                ))}
              </div>

              {/* Day cells */}
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
                        'min-h-[100px] sm:min-h-[120px] rounded-lg p-1.5 text-xs border transition-colors text-start w-full',
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
                <div className="mt-3 bg-[var(--bg-input)] border border-[#2A2A2A] rounded-xl p-4">
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
            </div>
          ) : (
            /* List View */
            <div className="space-y-2">
              {events.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)] text-center py-8" dir={dir}>
                  {t('لا توجد أحداث في هذا الشهر', 'No events this month')}
                </p>
              ) : (
                events.map((event, idx) => (
                  <EventCard key={`${event.ticker}-${event.date}-${idx}`} event={event} language={language} />
                ))
              )}
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="flex items-center justify-center gap-4 text-xs text-[var(--text-muted)]">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-accent-green/30" />
            {t('توزيعات أرباح', 'Dividends')}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-gold/30" />
            {t('إعلان أرباح', 'Earnings')}
          </div>
        </div>

      </div>
    </div>
  );
}
