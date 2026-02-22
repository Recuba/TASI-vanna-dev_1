'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/providers/LanguageProvider';
import { useMarketHeatmap, useSectorPerformance, useMarketBreadth } from '@/lib/hooks/use-api';
import { LoadingSpinner } from '@/components/common/loading-spinner';
import type { HeatmapItem, SectorPerformance, MarketBreadth } from '@/lib/api/market';

/* ═══════════════════════════════════════════════════════════════
   DESIGN TOKENS — Private Wealth Terminal × Editorial
   ═══════════════════════════════════════════════════════════════ */

const P = {
  bg: '#07080C',
  surface: '#0D0F14',
  surfaceElevated: '#12151C',
  border: 'rgba(197, 179, 138, 0.08)',
  borderHover: 'rgba(197, 179, 138, 0.2)',
  gold: '#C5B38A',
  goldBright: '#E4D5B0',
  goldMuted: 'rgba(197, 179, 138, 0.6)',
  goldSubtle: 'rgba(197, 179, 138, 0.12)',
  text: '#E8E4DC',
  textSecondary: '#8A8578',
  textMuted: '#5A574F',
  green: '#6BCB8B',
  greenDeep: '#2D8B55',
  greenMuted: 'rgba(107, 203, 139, 0.12)',
  red: '#E06C6C',
  redDeep: '#B84444',
  redMuted: 'rgba(224, 108, 108, 0.12)',
} as const;

const F = {
  display: "'Cormorant Garamond', Georgia, serif",
  mono: "'JetBrains Mono', 'Courier New', monospace",
  ui: "'DM Sans', -apple-system, sans-serif",
  arabic: "'Noto Kufi Arabic', 'DM Sans', sans-serif",
} as const;

/* ═══════════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════════ */

type SizeMode = 'cap' | 'volume';
type MoverFilter = 'all' | 'gainers' | 'losers';

interface EnrichedItem extends HeatmapItem {
  volume?: number;
}

/* ═══════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════ */

function getTileColors(change: number): { bg: string; textColor: string; border: string } {
  if (change >= 3) return { bg: 'linear-gradient(145deg,#1A4D2E,#0F3B1F)', textColor: '#A8E6BE', border: 'rgba(107,203,139,0.3)' };
  if (change >= 1.5) return { bg: 'linear-gradient(145deg,#1E5C35,#123D22)', textColor: '#90DBA8', border: 'rgba(107,203,139,0.22)' };
  if (change >= 0.5) return { bg: 'linear-gradient(145deg,#1F5C37,#163F26)', textColor: '#79CF97', border: 'rgba(107,203,139,0.18)' };
  if (change > 0)   return { bg: 'linear-gradient(145deg,#1C4A2D,#111E16)', textColor: '#6BCB8B', border: 'rgba(107,203,139,0.12)' };
  if (change === 0) return { bg: 'linear-gradient(145deg,#16181E,#0E1015)', textColor: '#5A574F', border: 'rgba(197,179,138,0.06)' };
  if (change > -0.5) return { bg: 'linear-gradient(145deg,#3A1A1A,#241010)', textColor: '#E06C6C', border: 'rgba(224,108,108,0.12)' };
  if (change > -1.5) return { bg: 'linear-gradient(145deg,#421C1C,#2B0E0E)', textColor: '#E87A7A', border: 'rgba(224,108,108,0.18)' };
  if (change > -3)   return { bg: 'linear-gradient(145deg,#4A1E1E,#300C0C)', textColor: '#EE8A8A', border: 'rgba(224,108,108,0.22)' };
  return { bg: 'linear-gradient(145deg,#521E1E,#350A0A)', textColor: '#F49A9A', border: 'rgba(224,108,108,0.3)' };
}

function formatNum(val: number): string {
  if (Math.abs(val) >= 1e12) return `${(val / 1e12).toFixed(1)}T`;
  if (Math.abs(val) >= 1e9)  return `${(val / 1e9).toFixed(1)}B`;
  if (Math.abs(val) >= 1e6)  return `${(val / 1e6).toFixed(1)}M`;
  if (Math.abs(val) >= 1e3)  return `${(val / 1e3).toFixed(1)}K`;
  return val.toFixed(0);
}

function pctSign(v: number) { return v >= 0 ? `+${v.toFixed(2)}%` : `${v.toFixed(2)}%`; }

/* ═══════════════════════════════════════════════════════════════
   HEATMAP TILE
   ═══════════════════════════════════════════════════════════════ */

interface TileProps {
  item: EnrichedItem;
  size: number;
  sizeMode: SizeMode;
}

function HeatmapTile({ item, size, sizeMode }: TileProps) {
  const [hovered, setHovered] = useState(false);
  const colors = getTileColors(item.change_pct ?? 0);
  const shortTicker = item.ticker.replace(/\.SR$/i, '');
  const change = item.change_pct ?? 0;
  const isPos = change >= 0;

  // Tile font sizing based on px size
  const tickerFs = size >= 90 ? 12 : size >= 70 ? 11 : size >= 50 ? 10 : 9;
  const changeFs = size >= 90 ? 10 : size >= 70 ? 9 : 8;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        width: size,
        height: Math.round(size * 0.68),
        background: colors.bg,
        border: `1px solid ${hovered ? (isPos ? 'rgba(107,203,139,0.5)' : 'rgba(224,108,108,0.5)') : colors.border}`,
        borderRadius: 2,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        transition: 'transform 0.12s ease, box-shadow 0.12s ease',
        transform: hovered ? 'scale(1.07)' : 'scale(1)',
        boxShadow: hovered ? `0 6px 24px rgba(0,0,0,0.6), 0 0 0 1px ${colors.border}` : '0 1px 3px rgba(0,0,0,0.3)',
        zIndex: hovered ? 20 : 1,
        overflow: 'visible',
        flexShrink: 0,
      }}
    >
      <span style={{
        fontFamily: F.mono,
        fontSize: tickerFs,
        fontWeight: 600,
        color: colors.textColor,
        letterSpacing: '0.04em',
        maxWidth: '88%',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        lineHeight: 1,
      }}>
        {shortTicker}
      </span>
      <span style={{
        fontFamily: F.mono,
        fontSize: changeFs,
        fontWeight: 500,
        color: colors.textColor,
        opacity: 0.85,
        marginTop: 3,
        letterSpacing: '0.02em',
      }}>
        {change >= 0 ? '+' : ''}{change.toFixed(1)}%
      </span>

      {/* Hover tooltip */}
      {hovered && (
        <div
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 8px)',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(7, 8, 12, 0.97)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: `1px solid ${P.borderHover}`,
            borderRadius: 6,
            padding: '10px 14px',
            minWidth: 160,
            maxWidth: 220,
            boxShadow: '0 12px 40px rgba(0,0,0,0.7)',
            zIndex: 100,
            pointerEvents: 'none',
            animation: 'tooltipReveal 0.1s ease',
          }}
        >
          <p style={{ fontFamily: F.ui, fontWeight: 600, fontSize: 11, color: P.goldBright, marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {item.name || shortTicker}
          </p>
          <p style={{ fontFamily: F.mono, fontSize: 9, color: P.textMuted, marginBottom: 6, letterSpacing: '0.06em' }}>
            {item.sector || '—'}
          </p>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ fontFamily: F.mono, fontSize: 10, color: P.textSecondary }}>CHG</span>
            <span style={{ fontFamily: F.mono, fontSize: 11, fontWeight: 700, color: colors.textColor }}>
              {pctSign(change)}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 4 }}>
            <span style={{ fontFamily: F.mono, fontSize: 10, color: P.textSecondary }}>
              {sizeMode === 'cap' ? 'CAP' : 'VOL'}
            </span>
            <span style={{ fontFamily: F.mono, fontSize: 10, color: P.text }}>
              {sizeMode === 'cap'
                ? (item.market_cap ? formatNum(item.market_cap) + ' SAR' : '—')
                : (item.volume ? formatNum(item.volume) : '—')}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SECTOR TAB STRIP
   ═══════════════════════════════════════════════════════════════ */

interface SectorTabProps {
  sectors: SectorPerformance[];
  active: string;
  onChange: (s: string) => void;
  isRtl: boolean;
}

function SectorTabStrip({ sectors, active, onChange, isRtl }: SectorTabProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft += e.deltaY;
    }
  }, []);

  const topSectors = useMemo(() => {
    const SECTOR_AR: Record<string, string> = {
      'Energy': 'الطاقة',
      'Financials': 'المالية',
      'Materials': 'المواد',
      'Utilities': 'المرافق',
      'Industrials': 'الصناعة',
      'Consumer Discretionary': 'تقديرية',
      'Consumer Staples': 'أساسية',
      'Health Care': 'الصحة',
      'Real Estate': 'العقارات',
      'Technology': 'تقنية',
      'Telecommunication': 'اتصالات',
      'Banks': 'البنوك',
      'Insurance': 'التأمين',
      'Food & Beverages': 'الأغذية',
    };
    return sectors.map(s => ({
      ...s,
      nameAr: SECTOR_AR[s.sector] || s.sector,
    }));
  }, [sectors]);

  const tabs = [{ sector: 'ALL', nameAr: 'الكل', avg_change_pct: 0, total_volume: 0, total_market_cap: 0, company_count: 0, gainers: 0, losers: 0 }, ...topSectors];

  return (
    <div
      ref={scrollRef}
      onWheel={handleWheel}
      style={{
        display: 'flex',
        gap: 4,
        overflowX: 'auto',
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
        paddingBottom: 2,
      }}
    >
      {tabs.map((tab) => {
        const isActive = active === tab.sector;
        const pct = tab.avg_change_pct;
        const isPos = pct >= 0;
        const isAll = tab.sector === 'ALL';

        return (
          <button
            key={tab.sector}
            onClick={() => onChange(tab.sector)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              paddingInline: 10,
              paddingBlock: 5,
              borderRadius: 3,
              border: `1px solid ${isActive ? P.gold : P.border}`,
              background: isActive ? P.goldSubtle : 'transparent',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'all 0.15s ease',
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                e.currentTarget.style.borderColor = P.borderHover;
                e.currentTarget.style.background = 'rgba(197,179,138,0.05)';
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                e.currentTarget.style.borderColor = P.border;
                e.currentTarget.style.background = 'transparent';
              }
            }}
          >
            <span style={{
              fontFamily: isRtl ? F.arabic : F.mono,
              fontSize: 9,
              fontWeight: isActive ? 600 : 400,
              color: isActive ? P.goldBright : P.textSecondary,
              letterSpacing: isRtl ? 0 : '0.06em',
            }}>
              {isRtl ? tab.nameAr : tab.sector}
            </span>
            {!isAll && (
              <span style={{
                fontFamily: F.mono,
                fontSize: 8,
                fontWeight: 600,
                color: isPos ? P.green : P.red,
                background: isPos ? P.greenMuted : P.redMuted,
                paddingInline: 5,
                paddingBlock: 2,
                borderRadius: 2,
              }}>
                {pctSign(pct)}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SIZE MODE TOGGLE  (Market Cap / Volume)
   ═══════════════════════════════════════════════════════════════ */

function SizeModeToggle({ mode, onChange, isRtl }: { mode: SizeMode; onChange: (m: SizeMode) => void; isRtl: boolean }) {
  const opts: { v: SizeMode; en: string; ar: string }[] = [
    { v: 'cap', en: 'MARKET CAP', ar: 'القيمة السوقية' },
    { v: 'volume', en: 'VOLUME', ar: 'حجم التداول' },
  ];
  return (
    <div style={{
      display: 'inline-flex',
      border: `1px solid ${P.border}`,
      borderRadius: 3,
      overflow: 'hidden',
      background: P.surface,
    }}>
      {opts.map((opt, i) => (
        <button
          key={opt.v}
          onClick={() => onChange(opt.v)}
          style={{
            paddingInline: 12,
            paddingBlock: 5,
            fontFamily: isRtl ? F.arabic : F.mono,
            fontSize: 9,
            letterSpacing: isRtl ? 0 : '0.1em',
            fontWeight: mode === opt.v ? 600 : 400,
            color: mode === opt.v ? P.goldBright : P.textMuted,
            background: mode === opt.v ? P.goldSubtle : 'transparent',
            border: 'none',
            borderInlineEnd: i === 0 ? `1px solid ${P.border}` : 'none',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          {isRtl ? opt.ar : opt.en}
        </button>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MARKET BREADTH ROW
   ═══════════════════════════════════════════════════════════════ */

function BreadthRow({ breadth, isRtl }: { breadth: MarketBreadth; isRtl: boolean }) {
  const total = (breadth.advancing ?? 0) + (breadth.declining ?? 0) + (breadth.unchanged ?? 0);
  const advPct = total > 0 ? (breadth.advancing / total) * 100 : 33;
  const decPct = total > 0 ? (breadth.declining / total) * 100 : 33;
  const unchPct = 100 - advPct - decPct;
  const ratio = breadth.advance_decline_ratio;

  const stats = [
    { label: isRtl ? 'ارتفع' : 'ADVANCING', value: breadth.advancing, color: P.green },
    { label: isRtl ? 'انخفض' : 'DECLINING', value: breadth.declining, color: P.red },
    { label: isRtl ? 'مستقر' : 'UNCHANGED', value: breadth.unchanged, color: P.textMuted },
    { label: isRtl ? 'نسبة A/D' : 'A/D RATIO', value: ratio != null ? ratio.toFixed(2) : '—', color: ratio != null && ratio >= 1 ? P.green : P.red },
    { label: isRtl ? 'أعلى 52أ' : '52W HIGHS', value: breadth.new_52w_highs, color: P.green },
    { label: isRtl ? 'أدنى 52أ' : '52W LOWS',  value: breadth.new_52w_lows,  color: P.red },
  ];

  return (
    <div style={{
      background: P.surface,
      border: `1px solid ${P.border}`,
      borderRadius: 4,
      padding: '14px 20px',
      display: 'flex',
      flexDirection: 'column' as const,
      gap: 10,
    }}>
      {/* Progress bar */}
      <div style={{ display: 'flex', height: 3, borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${advPct}%`, background: P.green, transition: 'width 0.4s ease' }} />
        <div style={{ width: `${unchPct}%`, background: P.textMuted, opacity: 0.4, transition: 'width 0.4s ease' }} />
        <div style={{ width: `${decPct}%`, background: P.red, transition: 'width 0.4s ease' }} />
      </div>

      {/* Stat pills */}
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' as const, alignItems: 'center' }}>
        {stats.map((s) => (
          <div key={s.label} style={{ display: 'flex', flexDirection: 'column' as const, gap: 2 }}>
            <span style={{ fontFamily: F.mono, fontSize: 8, color: P.textMuted, letterSpacing: '0.1em' }}>
              {s.label}
            </span>
            <span style={{ fontFamily: F.mono, fontSize: 13, fontWeight: 700, color: s.color }}>
              {s.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   GRADIENT LEGEND
   ═══════════════════════════════════════════════════════════════ */

function GradientLegend({ isRtl }: { isRtl: boolean }) {
  const ticks = isRtl
    ? ['≤-3%', '-1.5%', '0', '+1.5%', '≥+3%']
    : ['≤-3%', '-1.5%', '0', '+1.5%', '≥+3%'];

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, paddingBlock: 4 }}>
      <span style={{ fontFamily: F.mono, fontSize: 9, color: P.red }}>
        {isRtl ? 'انخفاض' : 'DECLINE'}
      </span>
      <div style={{ position: 'relative' }}>
        <div style={{
          height: 4,
          width: 200,
          borderRadius: 2,
          background: 'linear-gradient(to right, #521E1E, #B84444, #E06C6C, #2A2A2A, #6BCB8B, #2D8B55, #1A4D2E)',
        }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, width: 200 }}>
          {ticks.map((t) => (
            <span key={t} style={{ fontFamily: F.mono, fontSize: 8, color: P.textMuted }}>{t}</span>
          ))}
        </div>
      </div>
      <span style={{ fontFamily: F.mono, fontSize: 9, color: P.green }}>
        {isRtl ? 'ارتفاع' : 'ADVANCE'}
      </span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   TOP MOVERS PANEL
   ═══════════════════════════════════════════════════════════════ */

interface MoverItemProps {
  item: EnrichedItem;
  rank: number;
  isRtl: boolean;
}

function MoverItem({ item, rank, isRtl }: MoverItemProps) {
  const [hovered, setHovered] = useState(false);
  const change = item.change_pct ?? 0;
  const isPos = change >= 0;
  const shortTicker = item.ticker.replace(/\.SR$/i, '');

  return (
    <Link
      href={`/stock/${item.ticker}`}
      style={{ textDecoration: 'none', display: 'block' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        paddingInline: 14,
        paddingBlock: 8,
        background: hovered ? P.surfaceElevated : 'transparent',
        transition: 'background 0.12s ease',
        cursor: 'pointer',
      }}>
        <span style={{ fontFamily: F.mono, fontSize: 9, color: P.textMuted, width: 14, textAlign: 'right', flexShrink: 0 }}>
          {rank}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontFamily: F.mono, fontSize: 11, fontWeight: 600, color: P.goldBright, letterSpacing: '0.04em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {shortTicker}
          </p>
          <p style={{ fontFamily: isRtl ? F.arabic : F.ui, fontSize: 9, color: P.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>
            {item.name || shortTicker}
          </p>
        </div>
        <span style={{
          fontFamily: F.mono,
          fontSize: 11,
          fontWeight: 700,
          color: isPos ? P.green : P.red,
          background: isPos ? P.greenMuted : P.redMuted,
          paddingInline: 7,
          paddingBlock: 3,
          borderRadius: 2,
          flexShrink: 0,
          letterSpacing: '0.02em',
        }}>
          {pctSign(change)}
        </span>
      </div>
    </Link>
  );
}

interface TopMoversPanelProps {
  items: EnrichedItem[];
  filter: MoverFilter;
  onFilterChange: (f: MoverFilter) => void;
  isRtl: boolean;
}

function TopMoversPanel({ items, filter, onFilterChange, isRtl }: TopMoversPanelProps) {
  const filterOpts: { v: MoverFilter; en: string; ar: string }[] = [
    { v: 'all', en: 'ALL', ar: 'الكل' },
    { v: 'gainers', en: 'GAINERS', ar: 'الرابحون' },
    { v: 'losers', en: 'LOSERS', ar: 'الخاسرون' },
  ];

  const filtered = useMemo(() => {
    const sorted = [...items].sort((a, b) => {
      if (filter === 'gainers') return (b.change_pct ?? 0) - (a.change_pct ?? 0);
      if (filter === 'losers')  return (a.change_pct ?? 0) - (b.change_pct ?? 0);
      // 'all': by absolute change desc
      return Math.abs(b.change_pct ?? 0) - Math.abs(a.change_pct ?? 0);
    });

    if (filter === 'gainers') return sorted.filter((i) => (i.change_pct ?? 0) > 0).slice(0, 15);
    if (filter === 'losers')  return sorted.filter((i) => (i.change_pct ?? 0) < 0).slice(0, 15);
    return sorted.slice(0, 15);
  }, [items, filter]);

  return (
    <div style={{
      background: P.surface,
      border: `1px solid ${P.border}`,
      borderRadius: 4,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingInline: 14,
        paddingBlock: 12,
        borderBottom: `1px solid ${P.border}`,
      }}>
        <span style={{ fontFamily: F.mono, fontSize: 9, color: P.gold, letterSpacing: '0.2em' }}>
          {isRtl ? 'أبرز الأسهم' : 'TOP MOVERS'}
        </span>
        <div style={{ display: 'flex', gap: 2 }}>
          {filterOpts.map((opt) => (
            <button
              key={opt.v}
              onClick={() => onFilterChange(opt.v)}
              style={{
                paddingInline: 8,
                paddingBlock: 3,
                fontFamily: isRtl ? F.arabic : F.mono,
                fontSize: 8,
                letterSpacing: isRtl ? 0 : '0.08em',
                fontWeight: filter === opt.v ? 600 : 400,
                color: filter === opt.v
                  ? (opt.v === 'gainers' ? P.green : opt.v === 'losers' ? P.red : P.goldBright)
                  : P.textMuted,
                background: filter === opt.v
                  ? (opt.v === 'gainers' ? P.greenMuted : opt.v === 'losers' ? P.redMuted : P.goldSubtle)
                  : 'transparent',
                border: `1px solid ${filter === opt.v ? (opt.v === 'gainers' ? 'rgba(107,203,139,0.3)' : opt.v === 'losers' ? 'rgba(224,108,108,0.3)' : P.border) : 'transparent'}`,
                borderRadius: 2,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {isRtl ? opt.ar : opt.en}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div style={{ maxHeight: 480, overflowY: 'auto', scrollbarWidth: 'thin' as const, scrollbarColor: `${P.border} transparent` }}>
        {filtered.length === 0 ? (
          <p style={{ fontFamily: F.mono, fontSize: 10, color: P.textMuted, textAlign: 'center', padding: 20 }}>
            {isRtl ? 'لا توجد بيانات' : 'NO DATA'}
          </p>
        ) : (
          filtered.map((item, i) => (
            <MoverItem key={item.ticker} item={item} rank={i + 1} isRtl={isRtl} />
          ))
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════════ */

export default function HeatmapPage() {
  const { t, isRTL: isRtl } = useLanguage();
  const { data: heatmapData, loading: hmLoading, error: hmError, refetch: hmRefetch } = useMarketHeatmap();
  const { data: sectorData } = useSectorPerformance();
  const { data: breadthData } = useMarketBreadth();

  const [activeSector, setActiveSector] = useState('ALL');
  const [sizeMode, setSizeMode] = useState<SizeMode>('cap');
  const [moverFilter, setMoverFilter] = useState<MoverFilter>('all');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    if (heatmapData) setLastUpdated(new Date());
  }, [heatmapData]);

  // Build enriched + filtered cells
  const allItems = useMemo<EnrichedItem[]>(() => {
    if (!heatmapData) return [];
    return heatmapData
      .filter((i) => i.market_cap && i.market_cap > 0 && i.change_pct != null)
      .sort((a, b) => b.market_cap - a.market_cap)
      .slice(0, 120);
  }, [heatmapData]);

  const filteredItems = useMemo(() => {
    if (activeSector === 'ALL') return allItems;
    return allItems.filter((i) => i.sector === activeSector);
  }, [allItems, activeSector]);

  // Tile sizes: rank -> px
  function tileSize(rank: number): number {
    if (rank < 5)  return 110;
    if (rank < 15) return 90;
    if (rank < 35) return 72;
    if (rank < 70) return 58;
    return 46;
  }

  // Market cap totals for summary
  const totalCap = useMemo(() => allItems.reduce((s, i) => s + (i.market_cap || 0), 0), [allItems]);
  const gainersCount = useMemo(() => allItems.filter((i) => (i.change_pct ?? 0) > 0).length, [allItems]);
  const losersCount = useMemo(() => allItems.filter((i) => (i.change_pct ?? 0) < 0).length, [allItems]);
  const avgChange = useMemo(() => {
    if (!allItems.length) return 0;
    return allItems.reduce((s, i) => s + (i.change_pct ?? 0), 0) / allItems.length;
  }, [allItems]);

  const sectors = useMemo(() => sectorData ?? [], [sectorData]);

  return (
    <>
      {/* Inject fonts */}
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&family=DM+Sans:wght@300;400;500;600;700&family=JetBrains+Mono:wght@300;400;500;600;700&family=Noto+Kufi+Arabic:wght@300;400;500;600;700&display=swap');

        @keyframes tooltipReveal {
          from { opacity: 0; transform: translateX(-50%) translateY(4px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${P.border}; border-radius: 2px; }
        ::-webkit-scrollbar-thumb:hover { background: ${P.borderHover}; }
      `}</style>

      <div
        style={{
          minHeight: '100vh',
          background: P.bg,
          position: 'relative',
          overflowX: 'hidden',
        }}
      >
        {/* Ambient radial gradient */}
        <div style={{
          position: 'fixed',
          inset: 0,
          background: `
            radial-gradient(ellipse 80% 60% at 10% 0%, rgba(197,179,138,0.04) 0%, transparent 60%),
            radial-gradient(ellipse 60% 50% at 90% 100%, rgba(107,203,139,0.03) 0%, transparent 60%)
          `,
          pointerEvents: 'none',
          zIndex: 0,
        }} />

        <div style={{
          position: 'relative',
          zIndex: 1,
          maxWidth: 1400,
          margin: '0 auto',
          padding: '24px 24px 48px',
          animation: 'fadeIn 0.35s ease',
        }}>

          {/* ── PAGE HEADER ─────────────────────────────────── */}
          <header style={{ marginBottom: 20, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap' as const, gap: 12 }}>
            <div>
              <p style={{ fontFamily: F.mono, fontSize: 9, color: P.gold, letterSpacing: '0.22em', marginBottom: 6 }}>
                {isRtl ? 'سوق الأسهم السعودية' : 'SAUDI STOCK EXCHANGE · TADAWUL'}
              </p>
              <h1 style={{
                fontFamily: F.display,
                fontSize: 'clamp(28px, 4vw, 44px)',
                fontWeight: 500,
                color: P.goldBright,
                letterSpacing: '-0.01em',
                lineHeight: 1,
                margin: 0,
              }}>
                {isRtl ? 'خريطة الحرارة' : 'Market Heatmap'}
              </h1>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'flex-end', gap: 6 }}>
              {lastUpdated && (
                <p style={{ fontFamily: F.mono, fontSize: 9, color: P.textMuted, letterSpacing: '0.08em' }}>
                  {isRtl ? 'آخر تحديث' : 'LAST UPDATED'}{' '}
                  {lastUpdated.toLocaleTimeString(isRtl ? 'ar-SA' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
                </p>
              )}
              <div style={{ display: 'flex', gap: 16 }}>
                <div style={{ textAlign: 'center' as const }}>
                  <p style={{ fontFamily: F.mono, fontSize: 9, color: P.textMuted, letterSpacing: '0.08em', marginBottom: 2 }}>
                    {isRtl ? 'ارتفع' : 'UP'}
                  </p>
                  <p style={{ fontFamily: F.mono, fontSize: 14, fontWeight: 700, color: P.green }}>{gainersCount}</p>
                </div>
                <div style={{ textAlign: 'center' as const }}>
                  <p style={{ fontFamily: F.mono, fontSize: 9, color: P.textMuted, letterSpacing: '0.08em', marginBottom: 2 }}>
                    {isRtl ? 'انخفض' : 'DOWN'}
                  </p>
                  <p style={{ fontFamily: F.mono, fontSize: 14, fontWeight: 700, color: P.red }}>{losersCount}</p>
                </div>
                <div style={{ textAlign: 'center' as const }}>
                  <p style={{ fontFamily: F.mono, fontSize: 9, color: P.textMuted, letterSpacing: '0.08em', marginBottom: 2 }}>
                    {isRtl ? 'متوسط' : 'AVG CHG'}
                  </p>
                  <p style={{ fontFamily: F.mono, fontSize: 14, fontWeight: 700, color: avgChange >= 0 ? P.green : P.red }}>
                    {pctSign(avgChange)}
                  </p>
                </div>
              </div>
            </div>
          </header>

          {/* ── MARKET BREADTH ──────────────────────────────── */}
          {breadthData && (
            <div style={{ marginBottom: 16, animation: 'slideUp 0.3s ease 0.05s both' }}>
              <BreadthRow breadth={breadthData} isRtl={isRtl} />
            </div>
          )}

          {/* ── MAIN LAYOUT: heatmap + movers ────────────────── */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) 280px',
            gap: 16,
            alignItems: 'start',
          }}
            className="lg:grid-cols-[1fr_280px] sm:grid-cols-1"
          >
            {/* LEFT: heatmap panel */}
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 12 }}>

              {/* Sector strip + size toggle row */}
              <div style={{
                background: P.surface,
                border: `1px solid ${P.border}`,
                borderRadius: 4,
                padding: '12px 16px',
                display: 'flex',
                flexDirection: 'column' as const,
                gap: 10,
                animation: 'slideUp 0.3s ease 0.1s both',
              }}>
                {sectors.length > 0 && (
                  <SectorTabStrip
                    sectors={sectors}
                    active={activeSector}
                    onChange={setActiveSector}
                    isRtl={isRtl}
                  />
                )}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' as const, gap: 8 }}>
                  <SizeModeToggle mode={sizeMode} onChange={setSizeMode} isRtl={isRtl} />
                  <span style={{ fontFamily: F.mono, fontSize: 9, color: P.textMuted }}>
                    {isRtl
                      ? `${filteredItems.length} سهم · إجمالي ${formatNum(totalCap)} ر.س`
                      : `${filteredItems.length} stocks · ${formatNum(totalCap)} SAR total`}
                  </span>
                </div>
              </div>

              {/* Treemap */}
              <div style={{
                background: P.surface,
                border: `1px solid ${P.border}`,
                borderRadius: 4,
                padding: '16px 14px 12px',
                minHeight: 360,
                animation: 'slideUp 0.3s ease 0.15s both',
              }}>
                {hmLoading ? (
                  <div style={{ height: 360, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <LoadingSpinner message={isRtl ? 'جاري التحميل...' : 'Loading...'} />
                  </div>
                ) : hmError ? (
                  <div style={{ height: 360, display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                    <p style={{ fontFamily: F.mono, fontSize: 11, color: P.red }}>
                      {isRtl ? 'خطأ في التحميل' : 'Failed to load data'}
                    </p>
                    <button
                      onClick={hmRefetch}
                      style={{
                        fontFamily: F.mono,
                        fontSize: 9,
                        letterSpacing: '0.1em',
                        color: P.gold,
                        background: P.goldSubtle,
                        border: `1px solid ${P.border}`,
                        borderRadius: 3,
                        padding: '6px 16px',
                        cursor: 'pointer',
                      }}
                    >
                      {isRtl ? 'إعادة المحاولة' : 'RETRY'}
                    </button>
                  </div>
                ) : filteredItems.length === 0 ? (
                  <div style={{ height: 360, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <p style={{ fontFamily: F.mono, fontSize: 11, color: P.textMuted }}>
                      {isRtl ? 'لا توجد بيانات' : 'NO DATA'}
                    </p>
                  </div>
                ) : (
                  <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 2,
                    justifyContent: 'flex-start',
                    alignContent: 'flex-start',
                  }}>
                    {filteredItems.map((item, idx) => (
                      <Link key={item.ticker} href={`/stock/${item.ticker}`} style={{ textDecoration: 'none' }}>
                        <HeatmapTile
                          item={item}
                          size={tileSize(idx)}
                          sizeMode={sizeMode}
                        />
                      </Link>
                    ))}
                  </div>
                )}

                {/* Gradient legend */}
                {!hmLoading && !hmError && filteredItems.length > 0 && (
                  <div style={{ marginTop: 16, borderTop: `1px solid ${P.border}`, paddingTop: 12 }}>
                    <GradientLegend isRtl={isRtl} />
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT: movers panel */}
            <div style={{ animation: 'slideUp 0.3s ease 0.2s both' }}>
              <TopMoversPanel
                items={allItems}
                filter={moverFilter}
                onFilterChange={setMoverFilter}
                isRtl={isRtl}
              />
            </div>
          </div>

          {/* ── SECTOR PERFORMANCE TABLE ─────────────────────── */}
          {sectors.length > 0 && (
            <section style={{
              marginTop: 20,
              background: P.surface,
              border: `1px solid ${P.border}`,
              borderRadius: 4,
              overflow: 'hidden',
              animation: 'slideUp 0.3s ease 0.25s both',
            }}>
              <div style={{
                paddingInline: 20,
                paddingBlock: 12,
                borderBottom: `1px solid ${P.border}`,
              }}>
                <span style={{ fontFamily: F.mono, fontSize: 9, color: P.gold, letterSpacing: '0.2em' }}>
                  {isRtl ? 'أداء القطاعات' : 'SECTOR PERFORMANCE'}
                </span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' as const }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${P.border}` }}>
                      {[
                        isRtl ? 'القطاع' : 'SECTOR',
                        isRtl ? 'التغير%' : 'AVG CHG%',
                        isRtl ? 'حجم التداول' : 'VOLUME',
                        isRtl ? 'القيمة السوقية' : 'MARKET CAP',
                        isRtl ? 'الشركات' : 'STOCKS',
                        isRtl ? 'نسبة أ/م' : 'ADV/DEC',
                      ].map((h) => (
                        <th key={h} style={{
                          fontFamily: F.mono,
                          fontSize: 8,
                          fontWeight: 500,
                          color: P.textMuted,
                          letterSpacing: '0.1em',
                          paddingInline: 14,
                          paddingBlock: 8,
                          textAlign: 'start' as const,
                          whiteSpace: 'nowrap' as const,
                        }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sectors.map((s, i) => {
                      const isPos = s.avg_change_pct >= 0;
                      return (
                        <tr
                          key={s.sector}
                          style={{
                            borderBottom: i < sectors.length - 1 ? `1px solid ${P.border}` : 'none',
                            transition: 'background 0.12s ease',
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = P.surfaceElevated; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                        >
                          <td style={{ paddingInline: 14, paddingBlock: 10, fontFamily: F.ui, fontSize: 12, fontWeight: 500, color: P.text, whiteSpace: 'nowrap' as const }}>
                            {s.sector}
                          </td>
                          <td style={{ paddingInline: 14, paddingBlock: 10 }}>
                            <span style={{
                              fontFamily: F.mono,
                              fontSize: 11,
                              fontWeight: 700,
                              color: isPos ? P.green : P.red,
                              background: isPos ? P.greenMuted : P.redMuted,
                              paddingInline: 7,
                              paddingBlock: 2,
                              borderRadius: 2,
                            }}>
                              {pctSign(s.avg_change_pct)}
                            </span>
                          </td>
                          <td style={{ paddingInline: 14, paddingBlock: 10, fontFamily: F.mono, fontSize: 10, color: P.textSecondary }}>
                            {formatNum(s.total_volume)}
                          </td>
                          <td style={{ paddingInline: 14, paddingBlock: 10, fontFamily: F.mono, fontSize: 10, color: P.textSecondary }}>
                            {formatNum(s.total_market_cap)} SAR
                          </td>
                          <td style={{ paddingInline: 14, paddingBlock: 10, fontFamily: F.mono, fontSize: 10, color: P.textMuted }}>
                            {s.company_count}
                          </td>
                          <td style={{ paddingInline: 14, paddingBlock: 10 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontFamily: F.mono, fontSize: 10, color: P.green }}>{s.gainers}</span>
                              <span style={{ fontFamily: F.mono, fontSize: 9, color: P.textMuted }}>/</span>
                              <span style={{ fontFamily: F.mono, fontSize: 10, color: P.red }}>{s.losers}</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* ── FOOTER NOTE ──────────────────────────────────── */}
          <p style={{
            marginTop: 24,
            textAlign: 'center' as const,
            fontFamily: F.mono,
            fontSize: 9,
            color: P.textMuted,
            letterSpacing: '0.08em',
          }}>
            {isRtl
              ? 'البيانات لأغراض معلوماتية فقط — ليست نصيحة استثمارية'
              : 'DATA FOR INFORMATIONAL PURPOSES ONLY — NOT INVESTMENT ADVICE'}
          </p>

        </div>
      </div>
    </>
  );
}
