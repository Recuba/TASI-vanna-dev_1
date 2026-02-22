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
// Design Tokens
// ---------------------------------------------------------------------------

const P = {
  bg: "#07080C",
  surface: "#0D0F14",
  surfaceElevated: "#12151C",
  border: "rgba(197, 179, 138, 0.08)",
  borderHover: "rgba(197, 179, 138, 0.2)",
  gold: "#C5B38A",
  goldBright: "#E4D5B0",
  goldMuted: "rgba(197, 179, 138, 0.6)",
  goldSubtle: "rgba(197, 179, 138, 0.12)",
  text: "#E8E4DC",
  textSecondary: "#8A8578",
  textMuted: "#5A574F",
  green: "#6BCB8B",
  greenDeep: "#2D8B55",
  greenMuted: "rgba(107, 203, 139, 0.12)",
  red: "#E06C6C",
  redDeep: "#B84444",
  redMuted: "rgba(224, 108, 108, 0.12)",
} as const;

const F = {
  display: "'Cormorant Garamond', Georgia, serif",
  mono: "'JetBrains Mono', 'Courier New', monospace",
  ui: "'DM Sans', -apple-system, sans-serif",
  arabic: "'Noto Kufi Arabic', 'DM Sans', sans-serif",
} as const;

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
      style={{
        display: "block",
        padding: "12px 16px",
        background: P.surfaceElevated,
        border: `1px solid ${P.border}`,
        borderLeft: `3px solid ${isDividend ? P.green : P.gold}`,
        borderRadius: 3,
        textDecoration: "none",
        transition: "border-color 0.2s ease, background 0.2s ease",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(18,21,28,0.95)"; (e.currentTarget as HTMLElement).style.borderColor = isDividend ? P.green : P.gold; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = P.surfaceElevated; (e.currentTarget as HTMLElement).style.borderColor = P.border; }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: F.display, fontSize: 14, fontWeight: 600, color: P.text, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {event.title}
          </div>
          {event.description && (
            <div style={{ fontFamily: F.mono, fontSize: 9, color: P.textMuted, letterSpacing: "0.05em" }}>
              {event.description}
            </div>
          )}
        </div>
        <span style={{
          fontFamily: F.mono,
          fontSize: 9,
          fontWeight: 600,
          padding: "3px 8px",
          borderRadius: 2,
          background: isDividend ? P.greenMuted : P.goldSubtle,
          color: isDividend ? P.green : P.gold,
          letterSpacing: "0.1em",
          flexShrink: 0,
          marginLeft: 12,
        }}>
          {isDividend ? (language === 'ar' ? 'توزيعات' : 'DIV') : (language === 'ar' ? 'أرباح' : 'EARN')}
        </span>
      </div>
      <div style={{ fontFamily: F.mono, fontSize: 9, color: P.textMuted, marginTop: 6, letterSpacing: "0.05em" }}>
        {event.date} · {event.ticker.replace('.SR', '')}
      </div>
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
  const { data, loading, error, refetch } = useCalendarEvents({
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

  const sortedDates = useMemo(() => {
    return Array.from(eventsByDate.keys()).sort();
  }, [eventsByDate]);

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

  const dividendCount = events.filter(e => e.type === 'dividend').length;
  const earningsCount = events.filter(e => e.type === 'earnings').length;

  return (
    <div dir={dir} style={{ minHeight: "100vh", background: P.bg, color: P.text, fontFamily: F.ui }}>

      {/* Fonts + Animations */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&family=JetBrains+Mono:wght@300;400;500;600;700&family=DM+Sans:wght@300;400;500;600&family=Noto+Kufi+Arabic:wght@300;400;500;600;700&display=swap');

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes breathe {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }

        .cal-page * { box-sizing: border-box; }
        .cal-page ::-webkit-scrollbar { width: 4px; }
        .cal-page ::-webkit-scrollbar-thumb { background: rgba(197, 179, 138, 0.15); border-radius: 2px; }

        .day-cell-btn {
          transition: background 0.15s ease !important;
        }
        .day-cell-btn:hover {
          background: #12151C !important;
        }

        .nav-btn:hover {
          border-color: rgba(197, 179, 138, 0.2) !important;
          color: #C5B38A !important;
        }
        .filter-btn:hover {
          border-color: rgba(197, 179, 138, 0.15) !important;
          color: #8A8578 !important;
        }
        .view-btn:hover {
          color: #C5B38A !important;
        }
        .today-btn:hover {
          color: #E4D5B0 !important;
        }
      `}</style>

      <div className="cal-page" style={{ animation: "fadeIn 0.4s ease" }}>

        {/* Ambient background gradient */}
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0, pointerEvents: "none", zIndex: 0,
          background: "radial-gradient(ellipse 60% 40% at 30% 20%, rgba(197, 179, 138, 0.025) 0%, transparent 70%), radial-gradient(ellipse 50% 50% at 70% 80%, rgba(107, 203, 139, 0.015) 0%, transparent 70%)",
        }} />

        <div style={{ position: "relative", zIndex: 1 }}>

          {/* Page Header */}
          <div style={{ padding: "28px 40px 24px", borderBottom: `1px solid ${P.border}` }}>

            {/* Title Row */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
              <div>
                <div style={{ fontFamily: F.mono, fontSize: 9, color: P.gold, letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: 6 }}>
                  TASI · TADAWUL
                </div>
                <h1 style={{ fontFamily: F.display, fontSize: 32, fontWeight: 600, color: P.text, margin: 0, lineHeight: 1.1 }}>
                  {t('التقويم المالي', 'Financial Calendar')}
                </h1>
                <p style={{ fontFamily: F.mono, fontSize: 10, color: P.textMuted, marginTop: 6, letterSpacing: "0.05em" }}>
                  {events.length > 0
                    ? `${events.length} ${t('حدث', 'events')} — ${monthNames[month]} ${year}`
                    : `${monthNames[month]} ${year}`}
                </p>
              </div>

              {/* View Mode Toggle */}
              <div style={{ display: "flex", background: P.surface, border: `1px solid ${P.border}`, borderRadius: 3, padding: 2 }}>
                {(['grid', 'list'] as ViewMode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setViewMode(m)}
                    className="view-btn"
                    style={{
                      padding: "6px 18px",
                      borderRadius: 2,
                      fontFamily: F.mono,
                      fontSize: 10,
                      letterSpacing: "0.1em",
                      background: viewMode === m ? P.goldSubtle : "transparent",
                      color: viewMode === m ? P.gold : P.textMuted,
                      border: viewMode === m ? `1px solid ${P.borderHover}` : "1px solid transparent",
                      cursor: "pointer",
                      transition: "all 0.2s ease",
                    }}
                  >
                    {m === 'grid' ? t('شبكة', 'GRID') : t('قائمة', 'LIST')}
                  </button>
                ))}
              </div>
            </div>

            {/* Event Type Filter Chips */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {(['all', 'dividend', 'earnings'] as EventFilter[]).map((f) => {
                const isActive = filter === f;
                const labels: Record<EventFilter, string> = {
                  all: t('الكل', 'All Events'),
                  dividend: t('توزيعات', 'Dividends'),
                  earnings: t('أرباح', 'Earnings'),
                };
                return (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className="filter-btn"
                    style={{
                      padding: "6px 16px",
                      borderRadius: 3,
                      background: isActive ? P.goldSubtle : "transparent",
                      color: isActive ? P.gold : P.textMuted,
                      border: isActive ? `1px solid ${P.borderHover}` : `1px solid ${P.border}`,
                      fontFamily: F.mono,
                      fontSize: 10,
                      letterSpacing: "0.1em",
                      cursor: "pointer",
                      transition: "all 0.2s ease",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    {labels[f]}
                    {f === 'dividend' && dividendCount > 0 && (
                      <span style={{ fontSize: 9, color: P.green, fontWeight: 600 }}>
                        {dividendCount}
                      </span>
                    )}
                    {f === 'earnings' && earningsCount > 0 && (
                      <span style={{ fontSize: 9, color: P.gold, fontWeight: 600 }}>
                        {earningsCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Calendar Container */}
          <div style={{ padding: "24px 40px" }}>

            {/* Month Navigation */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
              <button
                onClick={prevMonth}
                aria-label={t('الشهر السابق', 'Previous month')}
                className="nav-btn"
                style={{
                  width: 36, height: 36, borderRadius: 3,
                  background: P.surface,
                  border: `1px solid ${P.border}`,
                  color: P.textSecondary,
                  cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all 0.2s ease",
                  fontFamily: F.display,
                  fontSize: 18,
                  lineHeight: 1,
                }}
              >
                ‹
              </button>

              <div style={{ textAlign: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 4 }}>
                  <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, transparent, ${P.border})` }} />
                  <div style={{ fontFamily: F.mono, fontSize: 9, color: P.goldMuted, letterSpacing: "0.2em" }}>
                    {year}
                  </div>
                  <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${P.border}, transparent)` }} />
                </div>
                <h2 style={{ fontFamily: F.display, fontSize: 30, fontWeight: 600, color: P.text, letterSpacing: "0.04em", margin: 0 }}>
                  {monthNames[month]}
                </h2>
                <button
                  onClick={goToday}
                  className="today-btn"
                  style={{
                    fontFamily: F.mono,
                    fontSize: 9,
                    color: P.gold,
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    letterSpacing: "0.12em",
                    marginTop: 4,
                    transition: "color 0.2s ease",
                  }}
                >
                  {t('اليوم', 'TODAY')}
                </button>
              </div>

              <button
                onClick={nextMonth}
                aria-label={t('الشهر التالي', 'Next month')}
                className="nav-btn"
                style={{
                  width: 36, height: 36, borderRadius: 3,
                  background: P.surface,
                  border: `1px solid ${P.border}`,
                  color: P.textSecondary,
                  cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all 0.2s ease",
                  fontFamily: F.display,
                  fontSize: 18,
                  lineHeight: 1,
                }}
              >
                ›
              </button>
            </div>

            {/* Content Area */}
            {loading ? (
              <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: "60px 0", flexDirection: "column", gap: 12 }}>
                <div style={{
                  fontFamily: F.mono,
                  fontSize: 9,
                  color: P.textMuted,
                  letterSpacing: "0.15em",
                  animation: "breathe 1.5s ease-in-out infinite",
                }}>
                  {t('جاري التحميل...', 'LOADING CALENDAR DATA')}
                </div>
              </div>
            ) : error ? (
              <div style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', padding: '60px 0', gap: 14 }}>
                <p style={{ fontFamily: F.display, fontSize: 22, fontWeight: 500, color: P.red, margin: 0 }}>
                  {t('تعذّر تحميل التقويم', 'Failed to load calendar')}
                </p>
                <p style={{ fontFamily: F.mono, fontSize: 10, color: P.textMuted, letterSpacing: '0.06em', margin: 0 }}>
                  {t('حدث خطأ أثناء جلب البيانات', 'An error occurred while fetching data')}
                </p>
                <button
                  onClick={refetch}
                  style={{
                    fontFamily: F.mono,
                    fontSize: 9,
                    letterSpacing: '0.12em',
                    color: P.gold,
                    background: P.goldSubtle,
                    border: `1px solid ${P.border}`,
                    borderRadius: 3,
                    padding: '7px 20px',
                    cursor: 'pointer',
                    marginTop: 4,
                  }}
                >
                  {t('إعادة المحاولة', 'RETRY')}
                </button>
              </div>
            ) : viewMode === 'grid' ? (
              /* Grid View */
              <div style={{ animation: "fadeIn 0.3s ease" }}>
                {/* Day headers */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1, marginBottom: 1 }}>
                  {dayNames.map((name) => (
                    <div key={name} style={{
                      textAlign: "center",
                      padding: "8px 4px",
                      fontFamily: F.mono,
                      fontSize: 9,
                      color: P.textMuted,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                    }}>
                      {name}
                    </div>
                  ))}
                </div>

                {/* Day cells */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1, background: P.border, border: `1px solid ${P.border}`, borderRadius: 4, overflow: "hidden" }}>
                  {days.map((day, idx) => {
                    const dayEvents = eventsByDate.get(day.date) || [];
                    const isToday = day.date === todayStr;
                    const isSelected = day.date === selectedDate;
                    const dow = new Date(day.date + 'T00:00:00').getDay();
                    const isFriSat = dow === 5 || dow === 6;

                    return (
                      <button
                        key={idx}
                        onClick={() => setSelectedDate(isSelected ? null : day.date)}
                        className="day-cell-btn"
                        style={{
                          minHeight: 90,
                          padding: "8px 10px",
                          background: !day.isCurrentMonth
                            ? "rgba(7,8,12,0.6)"
                            : isFriSat
                            ? "rgba(13,15,20,0.7)"
                            : P.surface,
                          border: "none",
                          outline: isSelected
                            ? `2px solid ${P.gold}`
                            : isToday
                            ? `1px solid ${P.goldMuted}`
                            : "none",
                          outlineOffset: isSelected ? -2 : -1,
                          cursor: day.isCurrentMonth ? "pointer" : "default",
                          textAlign: "left",
                          opacity: !day.isCurrentMonth ? 0.3 : 1,
                        }}
                      >
                        {/* Day number */}
                        <div style={{
                          fontFamily: F.mono,
                          fontSize: 11,
                          fontWeight: isToday ? 700 : 400,
                          color: isToday ? P.gold : P.textMuted,
                          marginBottom: 5,
                          letterSpacing: "0.02em",
                        }}>
                          {day.day}
                        </div>

                        {/* Event pills */}
                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          {dayEvents.slice(0, 3).map((ev, i) => (
                            <div
                              key={i}
                              style={{
                                fontSize: 9,
                                padding: "2px 5px",
                                borderRadius: 2,
                                background: ev.type === 'dividend' ? P.greenMuted : P.goldSubtle,
                                color: ev.type === 'dividend' ? P.green : P.gold,
                                fontFamily: F.mono,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                display: "flex",
                                alignItems: "center",
                                gap: 3,
                              }}
                              title={ev.title}
                            >
                              <span style={{
                                width: 4,
                                height: 4,
                                borderRadius: "50%",
                                flexShrink: 0,
                                background: ev.type === 'dividend' ? P.green : P.gold,
                              }} />
                              {getCompanyShortName(ev)}
                            </div>
                          ))}
                          {dayEvents.length > 3 && (
                            <div style={{ fontFamily: F.mono, fontSize: 8, color: P.textMuted, paddingLeft: 4 }}>
                              +{dayEvents.length - 3} {t('المزيد', 'more')}
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Selected day detail panel */}
                {selectedDate && (eventsByDate.get(selectedDate) || []).length > 0 && (
                  <div style={{
                    marginTop: 16,
                    background: P.surface,
                    border: `1px solid ${P.borderHover}`,
                    borderTop: `2px solid ${P.gold}`,
                    borderRadius: 4,
                    padding: "20px 24px",
                    animation: "slideUp 0.2s ease",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                      <div style={{ fontFamily: F.display, fontSize: 18, fontWeight: 600, color: P.text }}>
                        {new Date(selectedDate + 'T00:00:00').toLocaleDateString(
                          language === 'ar' ? 'ar-SA' : 'en-US',
                          { weekday: 'long', day: 'numeric', month: 'long' }
                        )}
                      </div>
                      <button
                        onClick={() => setSelectedDate(null)}
                        style={{
                          fontFamily: F.mono,
                          fontSize: 10,
                          color: P.textMuted,
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          letterSpacing: "0.08em",
                          transition: "color 0.2s ease",
                        }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = P.gold; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = P.textMuted; }}
                      >
                        {t('إغلاق', 'CLOSE')} ×
                      </button>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
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
              <div style={{ animation: "fadeIn 0.3s ease" }}>
                {events.length === 0 ? (
                  <div style={{
                    textAlign: "center",
                    padding: "60px 0",
                    fontFamily: F.mono,
                    fontSize: 11,
                    color: P.textMuted,
                    letterSpacing: "0.1em",
                  }}>
                    {t('لا توجد أحداث في هذا الشهر', 'NO EVENTS THIS MONTH')}
                  </div>
                ) : (
                  sortedDates.map((date) => {
                    const dateEvents = eventsByDate.get(date) || [];
                    if (dateEvents.length === 0) return null;
                    const isToday = date === todayStr;
                    return (
                      <div key={date} style={{ marginBottom: 28 }}>
                        {/* Date separator */}
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                          <div style={{
                            fontFamily: F.mono,
                            fontSize: 10,
                            fontWeight: isToday ? 700 : 400,
                            color: isToday ? P.gold : P.textSecondary,
                            letterSpacing: "0.1em",
                            whiteSpace: "nowrap",
                            textTransform: "uppercase",
                          }}>
                            {new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase()}
                          </div>
                          {isToday && (
                            <span style={{
                              fontFamily: F.mono,
                              fontSize: 8,
                              background: P.goldSubtle,
                              color: P.gold,
                              padding: "2px 6px",
                              borderRadius: 2,
                              letterSpacing: "0.1em",
                            }}>
                              {t('اليوم', 'TODAY')}
                            </span>
                          )}
                          <span style={{
                            fontFamily: F.mono,
                            fontSize: 9,
                            background: P.surface,
                            color: P.textMuted,
                            padding: "1px 6px",
                            borderRadius: 2,
                          }}>
                            {dateEvents.length}
                          </span>
                          <div style={{ flex: 1, height: 1, background: P.border }} />
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
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
            )}
          </div>

          {/* Legend */}
          <div style={{
            padding: "16px 40px",
            borderTop: `1px solid ${P.border}`,
            display: "flex",
            justifyContent: "center",
            gap: 28,
          }}>
            {[
              { color: P.green, bg: P.greenMuted, label: t('توزيعات أرباح', 'Dividends') },
              { color: P.gold, bg: P.goldSubtle, label: t('إعلان أرباح', 'Earnings') },
            ].map(({ color, bg, label }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{
                  width: 10,
                  height: 10,
                  borderRadius: 2,
                  background: bg,
                  border: `1px solid ${color}`,
                  opacity: 0.8,
                }} />
                <span style={{ fontFamily: F.mono, fontSize: 9, color: P.textMuted, letterSpacing: "0.08em" }}>
                  {label}
                </span>
              </div>
            ))}
          </div>

        </div>
      </div>
    </div>
  );
}
