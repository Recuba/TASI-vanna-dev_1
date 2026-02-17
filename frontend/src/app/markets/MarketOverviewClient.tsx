'use client';

import { useState, useEffect, useMemo, useRef, useId } from 'react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/providers/LanguageProvider';
import { useFormatters } from '@/lib/hooks/useFormatters';
import { Breadcrumb } from '@/components/common/Breadcrumb';
import type {
  MarketGraphModel,
  Instrument,
  EdgeLabel,
  PortfolioStats,
} from '@/lib/market-graph';
import { toPosMap, CANVAS_W, CANVAS_H, CX, CY, HUB_RADIUS } from '@/lib/market-graph';

// ---------------------------------------------------------------------------
// Format helpers
// ---------------------------------------------------------------------------

const fmt = (v: number | null | undefined, locale = 'en-US') =>
  v != null
    ? v.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '—';
const pctFmt = (v: number | null | undefined) =>
  v != null ? (v * 100).toFixed(1) + '%' : '—';

// ---------------------------------------------------------------------------
// Color tokens (matching design system)
// ---------------------------------------------------------------------------

const C = {
  gold: '#D4A84B',
  goldDim: 'rgba(212,168,75,0.15)',
  green: '#4CAF50',
  greenDim: 'rgba(76,175,80,0.12)',
  red: '#FF6B6B',
  redDim: 'rgba(255,107,107,0.12)',
  cyan: '#22D3EE',
  border: '#2A2A2A',
  surface: '#1A1A1A',
  surfaceHover: '#252525',
  bg: '#0E0E0E',
  textPrimary: 'var(--text-primary)',
  textSecondary: 'var(--text-secondary)',
  textMuted: 'var(--text-muted)',
} as const;

// ---------------------------------------------------------------------------
// Sparkline SVG
// ---------------------------------------------------------------------------

function Sparkline({
  data,
  positive,
  width = 64,
  height = 24,
}: {
  data: number[] | undefined;
  positive: boolean;
  width?: number;
  height?: number;
}) {
  const gid = useId();
  const safeData = data && data.length >= 2 ? data : [0, 0];
  const color = positive ? C.green : C.red;
  const min = Math.min(...safeData);
  const max = Math.max(...safeData);
  const range = max - min || 1;
  const pts = safeData.map((v, i) => [
    (i / (safeData.length - 1)) * width,
    height - ((v - min) / range) * height * 0.85 - height * 0.075,
  ]);
  const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`).join(' ');
  const areaD = `${pathD} L${width},${height} L0,${height} Z`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="block"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#${gid})`} />
      <path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={pts[pts.length - 1][0]}
        cy={pts[pts.length - 1][1]}
        r="2"
        fill={color}
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Central Hub
// ---------------------------------------------------------------------------

function CentralHub({
  stats,
  count,
  cx,
  cy,
  t,
}: {
  stats: PortfolioStats;
  count: number;
  cx: number;
  cy: number;
  t: (ar: string, en: string) => string;
}) {
  const color = stats.avgReturn > 0 ? C.green : stats.avgReturn < 0 ? C.red : C.gold;
  const sentiment =
    stats.breadth > 0.3
      ? t('\u0635\u0627\u0639\u062F', 'Bullish')
      : stats.breadth < -0.3
        ? t('\u0647\u0627\u0628\u0637', 'Bearish')
        : t('\u0645\u062A\u0648\u0627\u0632\u0646', 'Neutral');

  return (
    <div
      className="absolute z-10 flex flex-col items-center justify-center rounded-full"
      style={{
        left: cx,
        top: cy,
        transform: 'translate(-50%, -50%)',
        width: HUB_RADIUS * 2,
        height: HUB_RADIUS * 2,
        background: `radial-gradient(circle, ${C.surface} 0%, ${C.bg} 100%)`,
        border: `1px solid ${C.border}`,
        boxShadow: `0 0 60px ${color}18, 0 0 100px ${color}06`,
      }}
      aria-label={`Market sentiment: ${sentiment}, average return ${stats.avgReturn > 0 ? '+' : ''}${stats.avgReturn.toFixed(2)}%`}
    >
      <div
        className="absolute inset-[-2px] rounded-full animate-[pulseRing_3s_ease-in-out_infinite] pointer-events-none"
        style={{ border: `2px solid ${color}30` }}
      />
      <span aria-live="polite" className="font-arabic text-2xl font-bold leading-none" style={{ color: C.textPrimary }}>
        {sentiment}
      </span>
      <span
        className="font-mono text-lg font-bold mt-2 leading-none"
        style={{ color }}
      >
        {stats.avgReturn > 0 ? '+' : ''}
        {stats.avgReturn.toFixed(2)}%
      </span>
      <div className="flex gap-3 mt-3">
        <div className="text-center">
          <div className="font-mono text-sm font-bold" style={{ color: C.textPrimary }}>
            {stats.advancing}/{count}
          </div>
          <div className="font-mono text-[10px]" style={{ color: C.textMuted }}>
            A/D
          </div>
        </div>
        <div className="w-px h-6" style={{ background: C.border }} />
        <div className="text-center">
          <div
            className="font-mono text-sm font-bold"
            style={{ color: stats.diversification > 0.5 ? C.green : C.gold }}
          >
            {pctFmt(stats.diversification)}
          </div>
          <div className="font-mono text-[10px]" style={{ color: C.textMuted }}>
            Div.R
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Instrument Node Card
// ---------------------------------------------------------------------------

function InstrumentNode({
  inst,
  x,
  y,
  isHovered,
  isDimmed,
  isFlashing,
  isRTL,
  language,
  onHover,
  onLeave,
}: {
  inst: Instrument;
  x: number;
  y: number;
  isHovered: boolean;
  isDimmed: boolean;
  isFlashing?: boolean;
  isRTL: boolean;
  language: 'ar' | 'en';
  onHover: () => void;
  onLeave: () => void;
}) {
  const change = inst.change ?? 0;
  const beta = inst.beta ?? 0;
  const sharpe = inst.sharpe ?? 0;
  const vol = inst.vol ?? 0;
  const positive = change >= 0;
  const accent = positive ? C.green : C.red;
  const bgTint = positive ? C.greenDim : C.redDim;
  const betaColor = Math.abs(beta) > 1.5 ? C.red : Math.abs(beta) > 0.8 ? C.gold : C.green;
  const sharpeColor = sharpe > 1 ? C.green : sharpe > 0 ? C.gold : C.red;

  const displayName = language === 'ar' ? inst.nameAr : inst.nameEn;

  return (
    <div
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      className="cursor-default select-none"
      aria-label={`${displayName} (${inst.key}): ${fmt(inst.value)}, ${positive ? '+' : ''}${change.toFixed(2)}%`}
      style={{
        position: 'absolute',
        left: x,
        top: y,
        transform: 'translate(-50%, -50%)',
        width: isHovered ? 210 : 190,
        padding: '12px 14px',
        borderRadius: 14,
        background: isHovered
          ? `linear-gradient(135deg, ${C.surfaceHover} 0%, ${C.surface} 100%)`
          : C.surface,
        border: `1px solid ${isHovered ? accent + '50' : C.border}`,
        boxShadow: isHovered
          ? `0 0 28px ${accent}15, 0 6px 28px rgba(0,0,0,0.4)`
          : `0 2px 10px rgba(0,0,0,0.3)`,
        animation: isFlashing ? 'priceFlash 1.2s ease-out' : 'none',
        opacity: isDimmed ? 0.3 : 1,
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        zIndex: isHovered ? 20 : 5,
        direction: isRTL ? 'rtl' : 'ltr',
      }}
    >
      {/* Header row */}
      <div className="flex justify-between items-center mb-2">
        <div className="flex items-center gap-2">
          <div
            className="w-2.5 h-2.5 rounded-full"
            style={{ background: accent, boxShadow: `0 0 8px ${accent}66` }}
          />
          <span className={cn(language === 'ar' ? 'font-arabic' : 'font-mono', 'text-sm font-bold')} style={{ color: C.textPrimary }}>
            {language === 'ar' ? inst.nameAr : inst.nameEn}
          </span>
        </div>
        <span
          className="font-mono text-xs rounded-md px-2 py-0.5 font-medium"
          style={{ color: C.textSecondary, background: bgTint }}
        >
          {inst.key}
        </span>
      </div>

      {/* Price row */}
      <div className="flex justify-between items-baseline mb-2">
        <span
          className="font-mono text-lg font-bold tracking-tight"
          style={{ color: C.textPrimary }}
        >
          {fmt(inst.value)}
        </span>
        <span className="font-mono text-sm font-semibold" style={{ color: accent }}>
          {positive ? '\u25B2' : '\u25BC'} {positive ? '+' : ''}
          {change.toFixed(2)}%
        </span>
      </div>

      {/* Sparkline */}
      <div className="flex justify-center my-2">
        <Sparkline
          data={inst.sparkline}
          positive={positive}
          width={isHovered ? 180 : 160}
          height={26}
        />
      </div>

      {/* Stats row */}
      <div
        className="flex justify-between items-center mt-2 pt-2"
        style={{ borderTop: `1px solid ${C.border}` }}
      >
        <StatBadge label="σ" value={pctFmt(vol)} />
        <StatBadge label="β" value={beta.toFixed(2)} color={betaColor} />
        <StatBadge label="SR" value={sharpe.toFixed(2)} color={sharpeColor} />
      </div>

      {/* Opposite language name */}
      <div
        className={cn(language === 'ar' ? 'font-mono' : 'font-arabic', 'text-[10px] text-center mt-1.5')}
        style={{ color: C.textMuted, direction: language === 'ar' ? 'ltr' : 'rtl' }}
      >
        {language === 'ar' ? inst.nameEn : inst.nameAr}
      </div>
    </div>
  );
}

function StatBadge({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="font-mono text-[10px] uppercase font-medium" style={{ color: C.textMuted }}>
        {label}
      </span>
      <span className="font-mono text-xs font-bold" style={{ color: color ?? C.textSecondary }}>
        {value}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edge Tooltip (on hover)
// ---------------------------------------------------------------------------

function EdgeTooltip({
  edge,
  x,
  y,
  t,
  isRTL,
}: {
  edge: EdgeLabel;
  x: number;
  y: number;
  t: (ar: string, en: string) => string;
  isRTL: boolean;
}) {
  const color = edge.rho > 0 ? C.gold : C.cyan;
  const dirLabel =
    edge.rho > 0
      ? t(
          '\u064A\u062A\u062D\u0631\u0643\u0627\u0646 \u0641\u064A \u0646\u0641\u0633 \u0627\u0644\u0627\u062A\u062C\u0627\u0647',
          'Move together',
        )
      : t(
          '\u064A\u062A\u062D\u0631\u0643\u0627\u0646 \u0628\u0634\u0643\u0644 \u0639\u0643\u0633\u064A',
          'Move inversely',
        );

  return (
    <div
      className="pointer-events-none"
      style={{
        position: 'absolute',
        left: x,
        top: y,
        transform: 'translate(-50%, -130%)',
        background: C.surface,
        border: `1px solid ${color}55`,
        borderRadius: 10,
        padding: '10px 14px',
        zIndex: 30,
        boxShadow: `0 8px 32px rgba(0,0,0,0.6), 0 0 20px ${color}10`,
        minWidth: 175,
        direction: isRTL ? 'rtl' : 'ltr',
      }}
    >
      <div className="flex justify-between items-center mb-1.5">
        <span className="font-mono text-xs font-semibold" style={{ color: C.textPrimary }}>
          {edge.from} \u2194 {edge.to}
        </span>
        <span
          className="font-mono text-[9px] rounded px-1.5 py-px"
          style={{ color, background: `${color}18` }}
        >
          {edge.rho > 0 ? '+' : '\u2212'}
          {edge.pct}%
        </span>
      </div>
      <div className="font-arabic text-xs leading-relaxed mb-1.5" style={{ color: C.textSecondary }}>
        <span style={{ color }}>
          {t('\u0627\u0631\u062A\u0628\u0627\u0637', 'Corr.')} {edge.pct}%
        </span>{' '}
        \u2014 {dirLabel}
      </div>
      <div className="flex gap-3.5">
        <div>
          <div className="font-mono text-[8px]" style={{ color: C.textMuted }}>
            {t('الارتباط (ρ)', 'Correlation (ρ)')}
          </div>
          <div className="font-mono text-[13px] font-semibold" style={{ color }}>
            {edge.rho > 0 ? '+' : ''}
            {edge.rho.toFixed(3)}
          </div>
        </div>
        <div>
          <div className="font-mono text-[8px]" style={{ color: C.textMuted }}>
            {t('\u0627\u0644\u062A\u0641\u0633\u064A\u0631 (R\u00B2)', 'Explained (R\u00B2)')}
          </div>
          <div className="font-mono text-[13px] font-semibold" style={{ color: C.textSecondary }}>
            {(edge.r2 * 100).toFixed(1)}%
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mobile Card (simplified view for small screens)
// ---------------------------------------------------------------------------

function MobileCard({
  inst,
  language,
}: {
  inst: Instrument;
  language: 'ar' | 'en';
}) {
  const change = inst.change ?? 0;
  const vol = inst.vol ?? 0;
  const beta = inst.beta ?? 0;
  const sharpe = inst.sharpe ?? 0;
  const positive = change >= 0;
  const accent = positive ? C.green : C.red;
  const bgTint = positive ? C.greenDim : C.redDim;

  return (
    <div
      className="rounded-xl p-3.5 transition-colors"
      style={{
        background: C.surface,
        border: `1px solid ${C.border}`,
      }}
    >
      <div className="flex justify-between items-center mb-2">
        <div className="flex items-center gap-1.5">
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: accent, boxShadow: `0 0 4px ${accent}66` }}
          />
          <span className={cn(language === 'ar' ? 'font-arabic' : 'font-mono', 'text-sm font-semibold')} style={{ color: C.textPrimary }}>
            {language === 'ar' ? inst.nameAr : inst.nameEn}
          </span>
        </div>
        <span
          className="font-mono text-[9px] rounded px-1.5 py-px"
          style={{ color: C.textSecondary, background: bgTint }}
        >
          {inst.key}
        </span>
      </div>

      <div className="flex justify-between items-baseline mb-2">
        <span className="font-mono text-base font-semibold" style={{ color: C.textPrimary }}>
          {fmt(inst.value)}
        </span>
        <span className="font-mono text-xs font-medium" style={{ color: accent }}>
          {positive ? '\u25B2' : '\u25BC'} {positive ? '+' : ''}
          {change.toFixed(2)}%
        </span>
      </div>

      <div className="flex justify-center mb-2">
        <Sparkline data={inst.sparkline} positive={positive} width={140} height={28} />
      </div>

      <div
        className="flex justify-between items-center pt-2"
        style={{ borderTop: `1px solid ${C.border}` }}
      >
        <StatBadge label="σ" value={pctFmt(vol)} />
        <StatBadge label="β" value={beta.toFixed(2)} />
        <StatBadge label="SR" value={sharpe.toFixed(2)} />
        <span className={cn(language === 'ar' ? 'font-mono' : 'font-arabic', 'text-[8px]')} style={{ color: C.textMuted, direction: language === 'ar' ? 'ltr' : 'rtl' }}>
          {language === 'ar' ? inst.nameEn : inst.nameAr}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main client component
// ---------------------------------------------------------------------------

export default function MarketOverviewClient({
  initialModel,
  isLive,
  lastUpdated,
  onRefresh,
}: {
  initialModel: MarketGraphModel;
  isLive?: boolean;
  lastUpdated?: Date | null;
  onRefresh?: () => void;
}) {
  const { language, t, isRTL } = useLanguage();
  const { formatTime, formatDate } = useFormatters();
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<EdgeLabel | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [time, setTime] = useState(new Date());
  const [flashKeys, setFlashKeys] = useState<Set<string>>(new Set());
  const prevValuesRef = useRef<Record<string, number>>({});

  useEffect(() => {
    setLoaded(true);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 60000);
    return () => clearInterval(id);
  }, []);

  const { instruments, edges, stats, layout, labels } = initialModel;

  // Detect price changes and trigger flash animation
  useEffect(() => {
    const changed = new Set<string>();
    for (const inst of instruments) {
      const prev = prevValuesRef.current[inst.key];
      if (prev !== undefined && prev !== inst.value) {
        changed.add(inst.key);
      }
      prevValuesRef.current[inst.key] = inst.value;
    }
    if (changed.size > 0) {
      setFlashKeys(changed);
      const timer = setTimeout(() => setFlashKeys(new Set()), 1200);
      return () => clearTimeout(timer);
    }
  }, [instruments]);

  // Compute connection status: 'live' | 'stale' | 'offline'
  const connectionStatus = useMemo(() => {
    if (!isLive) return 'offline' as const;
    if (lastUpdated) {
      const ageMs = Date.now() - lastUpdated.getTime();
      if (ageMs > 120_000) return 'stale' as const; // >2 minutes
    }
    return 'live' as const;
  }, [isLive, lastUpdated, time]); // time dependency triggers re-eval each minute

  const statusColor = connectionStatus === 'live' ? C.green : connectionStatus === 'stale' ? '#F59E0B' : C.red;
  const statusLabel = connectionStatus === 'live' ? 'LIVE' : connectionStatus === 'stale' ? 'STALE' : 'OFFLINE';

  const posMap = useMemo(() => toPosMap(layout), [layout]);

  const isNodeInEdge = (key: string) =>
    hoveredEdge !== null && (hoveredEdge.from === key || hoveredEdge.to === key);
  const dimNode = (key: string) =>
    (hoveredKey !== null && hoveredKey !== key && !isNodeInEdge(key)) ||
    (hoveredEdge !== null && !isNodeInEdge(key));

  // Category legend items
  const legendItems = [
    {
      labelAr: '\u0639\u0645\u0644\u0627\u062A \u0631\u0642\u0645\u064A\u0629',
      labelEn: 'Crypto',
      color: '#A78BFA',
    },
    {
      labelAr: '\u0633\u0644\u0639',
      labelEn: 'Commodity',
      color: C.gold,
    },
    {
      labelAr: '\u0637\u0627\u0642\u0629',
      labelEn: 'Energy',
      color: '#F59E0B',
    },
    {
      labelAr: '\u0645\u0624\u0634\u0631\u0627\u062A \u0623\u0645\u0631\u064A\u0643\u064A\u0629',
      labelEn: 'US Index',
      color: '#60A5FA',
    },
    {
      labelAr: '\u0633\u0639\u0648\u062F\u064A',
      labelEn: 'Saudi',
      color: '#10B981',
    },
  ];

  return (
    <div className="flex-1 flex flex-col overflow-y-auto">
      {/* CSS keyframes */}
      <style>{`
        @keyframes pulseRing { 0%,100%{transform:scale(1);opacity:0.6} 50%{transform:scale(1.08);opacity:0.2} }
        @keyframes orbitDash { to{stroke-dashoffset:-20} }
        @keyframes labelPop { from{opacity:0;transform:translate(-50%,-50%) scale(0.5)} to{opacity:1;transform:translate(-50%,-50%) scale(1)} }
        @keyframes priceFlash { 0%{box-shadow:0 0 0 0 rgba(212,168,75,0.5)} 50%{box-shadow:0 0 16px 4px rgba(212,168,75,0.25)} 100%{box-shadow:0 0 0 0 rgba(212,168,75,0)} }
        @keyframes statusPulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
      `}</style>

      <div className="py-4">
        <div className="max-w-content-lg mx-auto px-4 sm:px-6">
          {/* Breadcrumb */}
          <div className="mb-3">
            <Breadcrumb items={[{ label: t('\u0627\u0644\u0639\u0627\u0644\u0645 360', 'World 360') }]} />
          </div>

          {/* ═══ HEADER ═══ */}
          <div
            className={cn(
              'flex flex-col sm:flex-row justify-between items-start gap-4 mb-4',
              loaded ? 'animate-fade-in-up' : 'opacity-0',
            )}
          >
            <div>
              <h1 className="text-2xl sm:text-[30px] font-bold leading-tight" style={{ color: C.textPrimary }}>
                {t(
                  '\u0646\u0638\u0631\u0629 360\u00B0',
                  'Market Overview 360\u00B0',
                )}
              </h1>
              <p className="font-mono text-xs mt-1" style={{ color: C.textSecondary, direction: 'ltr', textAlign: 'start' }}>
                <span style={{ color: C.gold }}>
                  {t(
                    '\u0627\u0644\u0623\u0633\u0648\u0627\u0642 \u0627\u0644\u0639\u0627\u0644\u0645\u064A\u0629',
                    'World Markets',
                  )}
                </span>
                <span className="mx-2" style={{ color: C.textMuted }}>
                  {'\u00B7'}
                </span>
                {t('World Markets', '\u0627\u0644\u0623\u0633\u0648\u0627\u0642 \u0627\u0644\u0639\u0627\u0644\u0645\u064A\u0629')}
              </p>
              <p className="font-arabic text-xs mt-2 max-w-lg leading-relaxed" style={{ color: C.textMuted }}>
                {t(
                  '\u0627\u0644\u062E\u0637\u0648\u0637 \u062A\u064F\u0638\u0647\u0631 \u0646\u0633\u0628\u0629 \u0627\u0644\u0627\u0631\u062A\u0628\u0627\u0637 \u0628\u064A\u0646 \u0627\u0644\u0623\u0635\u0648\u0644 \u2014 \u0643\u0644\u0645\u0627 \u0632\u0627\u062F\u062A \u0627\u0644\u0646\u0633\u0628\u0629\u060C \u0632\u0627\u062F \u062A\u062D\u0631\u0643\u0647\u0645\u0627 \u0645\u0639\u0627\u064B. \u0645\u0631\u0651\u0631 \u0639\u0644\u0649 \u0623\u064A \u062E\u0637 \u0644\u062A\u0641\u0627\u0635\u064A\u0644 \u0623\u0643\u062B\u0631.',
                  'Lines show correlation % between assets \u2014 the higher the percentage, the more they move together. Hover on any line for details.',
                )}
              </p>
            </div>

            <div className="flex flex-col items-end gap-1 flex-shrink-0" style={{ direction: 'ltr' }}>
              <div className="font-mono text-[10px] flex items-center gap-1.5" style={{ color: C.textMuted }}>
                {/* Connection status badge: LIVE (green) / STALE (yellow) / OFFLINE (red) */}
                <span
                  className="font-mono text-[9px] font-bold px-1.5 py-px rounded"
                  style={{
                    color: statusColor,
                    background: `${statusColor}18`,
                    border: `1px solid ${statusColor}40`,
                  }}
                >
                  {statusLabel}
                </span>
                <div
                  className="w-[5px] h-[5px] rounded-full"
                  style={{
                    background: statusColor,
                    boxShadow: connectionStatus === 'live' ? `0 0 5px ${statusColor}88` : 'none',
                    animation: connectionStatus === 'live' ? 'statusPulse 2s ease-in-out infinite' : 'none',
                  }}
                />
                {formatTime(lastUpdated ?? time)}
                <span>{'\u00B7'}</span>
                {formatDate(lastUpdated ?? time)}
                {/* Refresh button */}
                {onRefresh && (
                  <button
                    onClick={onRefresh}
                    className="ms-1 p-0.5 rounded hover:opacity-80 transition-opacity"
                    style={{ color: C.textMuted }}
                    title={t('\u062A\u062D\u062F\u064A\u062B', 'Refresh')}
                    aria-label={t('\u062A\u062D\u062F\u064A\u062B \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A', 'Refresh data')}
                  >
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 1v5h5" />
                      <path d="M3.51 10a6 6 0 1 0 .74-6.47L1 6" />
                    </svg>
                  </button>
                )}
              </div>
              <div className="flex gap-3 font-mono text-[9px]" style={{ color: C.textMuted }}>
                <span>Avg Corr = {Math.round(stats.avgAbsCorr * 100)}%</span>
                <span>{'σ̄'} = {pctFmt(stats.avgVol)}</span>
                <span>{edges.length} links</span>
              </div>
            </div>
          </div>

        </div>{/* close max-w-content-lg */}

        {/* ═══ DESKTOP CONSTELLATION ═══ */}
        <div className="hidden lg:block mt-2">
          <div
            className="relative mx-auto"
            style={{ width: CANVAS_W, height: CANVAS_H }}
          >
              {/* SVG layer: orbit rings, correlation lines, radial lines */}
              <svg
                width={CANVAS_W}
                height={CANVAS_H}
                className="absolute inset-0 pointer-events-none z-[1]"
                role="img"
                aria-label={t(
                  '\u0631\u0633\u0645 \u0628\u064A\u0627\u0646\u064A \u0644\u0627\u0631\u062A\u0628\u0627\u0637\u0627\u062A \u0627\u0644\u0623\u0633\u0648\u0627\u0642 \u0627\u0644\u0639\u0627\u0644\u0645\u064A\u0629',
                  'Cross-asset correlation constellation showing global market relationships',
                )}
              >
                {/* Orbit rings */}
                {[0.5, 0.72, 0.92].map((r, i) => (
                  <circle
                    key={i}
                    cx={CX}
                    cy={CY}
                    r={Math.min(CX, CY) * 0.78 * r}
                    fill="none"
                    stroke={C.border}
                    strokeWidth="0.4"
                    strokeDasharray="3 8"
                    opacity={0.22}
                    style={{ animation: `orbitDash ${22 + i * 6}s linear infinite` }}
                  />
                ))}

                {/* Correlation edge lines */}
                {labels.map((edge, i) => {
                  const pa = posMap[edge.from];
                  const pb = posMap[edge.to];
                  if (!pa || !pb) return null;
                  const isHL =
                    hoveredEdge === edge ||
                    hoveredKey === edge.from ||
                    hoveredKey === edge.to;
                  const isDim = (hoveredKey !== null || hoveredEdge !== null) && !isHL;
                  const lc = edge.rho > 0 ? C.gold : C.cyan;
                  const thick = 0.5 + Math.abs(edge.rho) * 2.2;
                  return (
                    <g key={i}>
                      {/* Invisible wide hit area */}
                      <line
                        x1={pa.x}
                        y1={pa.y}
                        x2={pb.x}
                        y2={pb.y}
                        stroke="transparent"
                        strokeWidth={16}
                        style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                        role="button"
                        tabIndex={0}
                        aria-label={`${edge.from} \u2194 ${edge.to}: ${edge.rho > 0 ? '+' : '\u2212'}${edge.pct}% correlation`}
                        onMouseEnter={() => setHoveredEdge(edge)}
                        onMouseLeave={() => setHoveredEdge(null)}
                        onFocus={() => setHoveredEdge(edge)}
                        onBlur={() => setHoveredEdge(null)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setHoveredEdge(hoveredEdge === edge ? null : edge);
                          }
                        }}
                      />
                      {/* Visible line */}
                      <line
                        x1={pa.x}
                        y1={pa.y}
                        x2={pb.x}
                        y2={pb.y}
                        stroke={lc}
                        strokeWidth={isHL ? thick * 1.4 : thick}
                        strokeDasharray={
                          isHL
                            ? 'none'
                            : `${2 + Math.abs(edge.rho) * 5} ${5 + (1 - Math.abs(edge.rho)) * 5}`
                        }
                        opacity={isDim ? 0.04 : isHL ? 0.7 : 0.2}
                        strokeLinecap="round"
                        style={{ transition: 'all 0.3s ease', pointerEvents: 'none' }}
                      />
                    </g>
                  );
                })}

                {/* Radial lines from center to each node */}
                {layout.map((p) => {
                  const inst = instruments.find((i) => i.key === p.key);
                  if (!inst) return null;
                  const isConn = hoveredKey === p.key || isNodeInEdge(p.key);
                  const color = (inst.change ?? 0) >= 0 ? C.green : C.red;
                  return (
                    <line
                      key={p.key}
                      x1={CX}
                      y1={CY}
                      x2={p.x}
                      y2={p.y}
                      stroke={isConn ? color : C.textMuted}
                      strokeWidth={isConn ? 0.7 : 0.2}
                      strokeDasharray="2 7"
                      opacity={dimNode(p.key) ? 0.02 : isConn ? 0.25 : 0.05}
                      style={{ transition: 'all 0.3s ease' }}
                    />
                  );
                })}
              </svg>

              {/* Correlation % badges (HTML for crisp rendering) */}
              {labels.map((edge, i) => {
                const lc = edge.rho > 0 ? C.gold : C.cyan;
                const isHL =
                  hoveredEdge === edge ||
                  hoveredKey === edge.from ||
                  hoveredKey === edge.to;
                const isDim = (hoveredKey !== null || hoveredEdge !== null) && !isHL;
                const sign = edge.rho > 0 ? '+' : '\u2212';
                const arrow = edge.rho > 0 ? '\u2197' : '\u2198';
                return (
                  <div
                    key={`lbl-${i}`}
                    className="pointer-events-none"
                    style={{
                      position: 'absolute',
                      left: edge.lx,
                      top: edge.ly,
                      transform: 'translate(-50%, -50%)',
                      zIndex: isHL ? 25 : 3,
                      animation: loaded
                        ? `labelPop 0.4s ease-out ${0.35 + i * 0.04}s both`
                        : 'none',
                      opacity: isDim ? 0.1 : isHL ? 1 : 0.88,
                      transition: 'opacity 0.3s ease',
                    }}
                  >
                    <div
                      className="font-mono font-bold whitespace-nowrap flex items-center gap-1.5"
                      style={{
                        fontSize: isHL ? 15 : 13,
                        color: lc,
                        background: isHL ? `${C.surface}F5` : `${C.bg}E8`,
                        border: `1px solid ${isHL ? lc + '66' : lc + '28'}`,
                        borderRadius: 8,
                        padding: isHL ? '5px 12px' : '4px 10px',
                        boxShadow: isHL ? `0 0 14px ${lc}25` : `0 1px 4px rgba(0,0,0,0.4)`,
                        transition: 'all 0.3s ease',
                      }}
                    >
                      <span style={{ fontSize: isHL ? 13 : 11, opacity: 0.7 }}>{arrow}</span>
                      <span>
                        {sign}
                        {edge.pct}%
                      </span>
                    </div>
                  </div>
                );
              })}

              {/* Central hub */}
              <CentralHub stats={stats} count={instruments.length} cx={CX} cy={CY} t={t} />

              {/* Instrument nodes */}
              {instruments.map((inst, idx) => {
                const pos = layout[idx];
                return (
                  <InstrumentNode
                    key={inst.key}
                    inst={inst}
                    x={pos.x}
                    y={pos.y}
                    isHovered={hoveredKey === inst.key || isNodeInEdge(inst.key)}
                    isDimmed={dimNode(inst.key)}
                    isFlashing={flashKeys.has(inst.key)}
                    isRTL={isRTL}
                    language={language}
                    onHover={() => setHoveredKey(inst.key)}
                    onLeave={() => setHoveredKey(null)}
                  />
                );
              })}

              {/* Edge tooltip */}
              {hoveredEdge &&
                posMap[hoveredEdge.from] &&
                posMap[hoveredEdge.to] && (
                  <EdgeTooltip
                    edge={hoveredEdge}
                    x={(posMap[hoveredEdge.from].x + posMap[hoveredEdge.to].x) / 2}
                    y={(posMap[hoveredEdge.from].y + posMap[hoveredEdge.to].y) / 2}
                    t={t}
                    isRTL={isRTL}
                  />
                )}
          </div>
        </div>

        <div className="max-w-content-lg mx-auto px-4 sm:px-6">
          {/* ═══ MOBILE CARDS ═══ */}
          <div className="lg:hidden">
            {/* Summary card */}
            <div
              className="rounded-xl p-4 mb-4"
              style={{ background: C.surface, border: `1px solid ${C.border}` }}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="font-arabic text-sm font-semibold" style={{ color: C.textPrimary }}>
                  {t(
                    '\u0645\u0644\u062E\u0635 \u0627\u0644\u0633\u0648\u0642',
                    'Market Summary',
                  )}
                </span>
                <span
                  className="font-mono text-sm font-semibold"
                  style={{ color: stats.avgReturn > 0 ? C.green : stats.avgReturn < 0 ? C.red : C.gold }}
                >
                  {stats.avgReturn > 0 ? '+' : ''}
                  {stats.avgReturn.toFixed(2)}%
                </span>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <div className="font-mono text-xs font-semibold" style={{ color: C.textPrimary }}>
                    {stats.advancing}/{instruments.length}
                  </div>
                  <div className="font-mono text-[9px]" style={{ color: C.textMuted }}>
                    {t(
                      '\u0635\u0627\u0639\u062F/\u0647\u0627\u0628\u0637',
                      'Adv/Dec',
                    )}
                  </div>
                </div>
                <div>
                  <div
                    className="font-mono text-xs font-semibold"
                    style={{ color: stats.diversification > 0.5 ? C.green : C.gold }}
                  >
                    {pctFmt(stats.diversification)}
                  </div>
                  <div className="font-mono text-[9px]" style={{ color: C.textMuted }}>
                    {t(
                      '\u0627\u0644\u062A\u0646\u0648\u0639',
                      'Diversification',
                    )}
                  </div>
                </div>
                <div>
                  <div className="font-mono text-xs font-semibold" style={{ color: C.textSecondary }}>
                    {Math.round(stats.avgAbsCorr * 100)}%
                  </div>
                  <div className="font-mono text-[9px]" style={{ color: C.textMuted }}>
                    {t(
                      '\u0645\u062A\u0648\u0633\u0637 \u0627\u0644\u0627\u0631\u062A\u0628\u0627\u0637',
                      'Avg Corr',
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Instrument cards grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {instruments.map((inst) => (
                <MobileCard key={inst.key} inst={inst} language={language} />
              ))}
            </div>

            {/* Top correlations */}
            {edges.length > 0 && (
              <div
                className="rounded-xl p-4 mt-4"
                style={{ background: C.surface, border: `1px solid ${C.border}` }}
              >
                <h3 className="font-arabic text-sm font-semibold mb-3" style={{ color: C.textPrimary }}>
                  {t(
                    '\u0623\u0642\u0648\u0649 \u0627\u0644\u0627\u0631\u062A\u0628\u0627\u0637\u0627\u062A',
                    'Strongest Correlations',
                  )}
                </h3>
                <div className="space-y-2">
                  {edges.slice(0, 5).map((edge, i) => {
                    const color = edge.rho > 0 ? C.gold : C.cyan;
                    return (
                      <div
                        key={i}
                        className="flex items-center justify-between py-1.5"
                        style={{ borderBottom: i < 4 ? `1px solid ${C.border}` : 'none' }}
                      >
                        <span className="font-mono text-xs" style={{ color: C.textPrimary }}>
                          {edge.from} \u2194 {edge.to}
                        </span>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-16 h-1 rounded-full overflow-hidden"
                            style={{ background: `${color}20` }}
                          >
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${edge.pct}%`,
                                background: color,
                              }}
                            />
                          </div>
                          <span className="font-mono text-[11px] font-semibold w-12 text-end" style={{ color }}>
                            {edge.rho > 0 ? '+' : '\u2212'}
                            {edge.pct}%
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* ═══ LEGEND ═══ */}
          <div className="flex gap-4 py-3 justify-center flex-wrap items-center">
            {legendItems.map((c) => (
              <div key={c.labelEn} className="flex items-center gap-1.5">
                <div
                  className="w-[7px] h-[7px] rounded-sm opacity-70"
                  style={{ background: c.color }}
                />
                <span className={cn(language === 'ar' ? 'font-arabic' : 'font-mono', 'text-[11px]')} style={{ color: C.textSecondary }}>
                  {t(c.labelAr, c.labelEn)}
                </span>
                <span className={cn(language === 'ar' ? 'font-mono' : 'font-arabic', 'text-[9px]')} style={{ color: C.textMuted }}>
                  {t(c.labelEn, c.labelAr)}
                </span>
              </div>
            ))}
            <div className="w-px h-3.5" style={{ background: C.border }} />
            <div className="flex items-center gap-1.5">
              <div className="w-3.5 h-0.5 rounded-sm" style={{ background: C.gold }} />
              <span className="font-mono text-[9px]" style={{ color: C.textMuted }}>
                {t(
                  'ارتباط إيجابي',
                  'Positive corr.',
                )}
              </span>
              <span className="font-mono text-[8px] opacity-50" style={{ color: C.textMuted }}>
                {'+ρ'}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3.5 h-0.5 rounded-sm" style={{ background: C.cyan }} />
              <span className="font-mono text-[9px]" style={{ color: C.textMuted }}>
                {t(
                  'ارتباط عكسي',
                  'Inverse corr.',
                )}
              </span>
              <span className="font-mono text-[8px] opacity-50" style={{ color: C.textMuted }}>
                {'−ρ'}
              </span>
            </div>
          </div>

          {/* ═══ EXPLAINER ═══ */}
          <div className="text-center pb-4 max-w-3xl mx-auto">
            <p className="font-arabic text-xs leading-relaxed mb-2" style={{ color: C.textMuted }}>
              {t(
                'النسب على الخطوط تُظهر مدى ارتباط حركة الأصول ببعضها — ↗ 90% تعني أنهما يتحركان معاً بنسبة 90%، بينما ↘ 70% تعني أنهما يتحركان بشكل عكسي بنسبة 70%.',
                'The percentages on lines show how much assets move together — ↗ 90% means they move together 90% of the time, while ↘ 70% means they move inversely 70% of the time.',
              )}
            </p>
            <div className="flex gap-3.5 justify-center flex-wrap font-mono text-[8px] opacity-50" style={{ color: C.textMuted }}>
              <span>{'σ'} = {t('التقلب السنوي', 'Ann. Volatility')}</span>
              <span>{'β'} = {t('بيتا مقابل SPX', 'Beta vs SPX')}</span>
              <span>SR = {t('نسبة شارب', 'Sharpe Ratio')}</span>
              <span>{'ρ'} = {t('ارتباط بيرسون', 'Pearson Corr.')}</span>
              <span>R{'²'} = {t('معامل التحديد', 'Determination')}</span>
              <span>Div.R = 1{'−'}|{'ρ̄'}|</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
