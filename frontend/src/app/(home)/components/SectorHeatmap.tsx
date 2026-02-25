'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMarketHeatmap } from '@/lib/hooks/use-api';
import { useLanguage } from '@/providers/LanguageProvider';
import { LoadingSpinner } from '@/components/common/loading-spinner';

const P = {
  bg: "#07080C",
  surface: "#0D0F14",
  surfaceElevated: "#12151C",
  border: "rgba(197, 179, 138, 0.08)",
  borderHover: "rgba(197, 179, 138, 0.2)",
  gold: "#C5B38A",
  goldBright: "#E4D5B0",
  goldSubtle: "rgba(197, 179, 138, 0.12)",
  text: "#E8E4DC",
  textSecondary: "#8A8578",
  textMuted: "#5A574F",
  green: "#6BCB8B",
  greenDeep: "#2D8B55",
  greenMuted: "rgba(107, 203, 139, 0.12)",
  red: "#E06C6C",
  redDeep: "#B84444",
} as const;

const F = {
  display: "'Cormorant Garamond', Georgia, serif",
  mono: "'JetBrains Mono', 'Courier New', monospace",
  ui: "'DM Sans', -apple-system, sans-serif",
} as const;

// ---------------------------------------------------------------------------
// Color scale
// ---------------------------------------------------------------------------

function getTileColors(changePct: number): { bg: string; text: string; border: string } {
  if (changePct >= 3) return {
    bg: `linear-gradient(145deg, #1A4D2E, #0F3B1F)`,
    text: "#A8E6BE",
    border: "rgba(107, 203, 139, 0.3)",
  };
  if (changePct >= 1.5) return {
    bg: `linear-gradient(145deg, #1E5C35, #123D22)`,
    text: "#90DBA8",
    border: "rgba(107, 203, 139, 0.22)",
  };
  if (changePct >= 0.5) return {
    bg: `linear-gradient(145deg, #1F5C37, #163F26)`,
    text: "#79CF97",
    border: "rgba(107, 203, 139, 0.18)",
  };
  if (changePct > 0) return {
    bg: `linear-gradient(145deg, #1C4A2D, #111E16)`,
    text: "#6BCB8B",
    border: "rgba(107, 203, 139, 0.12)",
  };
  if (changePct === 0) return {
    bg: `linear-gradient(145deg, #16181E, #0E1015)`,
    text: "#5A574F",
    border: "rgba(197, 179, 138, 0.06)",
  };
  if (changePct > -0.5) return {
    bg: `linear-gradient(145deg, #3A1A1A, #241010)`,
    text: "#E06C6C",
    border: "rgba(224, 108, 108, 0.12)",
  };
  if (changePct > -1.5) return {
    bg: `linear-gradient(145deg, #421C1C, #2B0E0E)`,
    text: "#E87A7A",
    border: "rgba(224, 108, 108, 0.18)",
  };
  if (changePct > -3) return {
    bg: `linear-gradient(145deg, #4A1E1E, #300C0C)`,
    text: "#EE8A8A",
    border: "rgba(224, 108, 108, 0.22)",
  };
  return {
    bg: `linear-gradient(145deg, #521E1E, #350A0A)`,
    text: "#F49A9A",
    border: "rgba(224, 108, 108, 0.3)",
  };
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
  const colors = getTileColors(item.change_pct);

  const sizeStyles = {
    large: { width: 110, height: 72, tickerSize: 11, changeSize: 10 },
    mid:   { width: 85,  height: 54, tickerSize: 10, changeSize: 9 },
    small: { width: 65,  height: 44, tickerSize: 9,  changeSize: 8 },
  }[item.tier];

  return (
    <div
      className="relative cursor-pointer flex flex-col items-center justify-center overflow-visible"
      style={{
        width: sizeStyles.width,
        height: sizeStyles.height,
        background: colors.bg,
        borderRadius: 2,
        border: `1px solid ${colors.border}`,
        transition: 'transform 0.12s ease, box-shadow 0.12s ease',
        transform: hovered ? 'scale(1.06)' : 'scale(1)',
        boxShadow: hovered ? `0 4px 20px rgba(0,0,0,0.5), 0 0 0 1px ${colors.border}` : 'none',
        zIndex: hovered ? 10 : 1,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span style={{
        fontFamily: F.mono,
        fontWeight: 600,
        fontSize: sizeStyles.tickerSize,
        color: colors.text,
        letterSpacing: '0.04em',
        maxWidth: '90%',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {shortTicker}
      </span>
      <span style={{
        fontFamily: F.mono,
        fontSize: sizeStyles.changeSize,
        color: colors.text,
        opacity: 0.8,
        marginTop: 2,
      }}>
        {item.change_pct >= 0 ? '+' : ''}{item.change_pct.toFixed(1)}%
      </span>

      {/* Hover tooltip */}
      {hovered && (
        <div style={{
          position: 'absolute',
          bottom: '100%',
          marginBottom: 6,
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(12, 14, 20, 0.97)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          border: `1px solid ${P.borderHover}`,
          borderRadius: 6,
          padding: '8px 12px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
          zIndex: 20,
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
        }}>
          <p style={{ fontFamily: F.ui, fontWeight: 600, fontSize: 14.5, color: P.goldBright, marginBottom: 2 }}>
            {item.name}
          </p>
          <p style={{ fontFamily: F.mono, fontSize: 12.5, color: P.textMuted, marginBottom: 4 }}>
            {item.sector}
          </p>
          <p style={{ fontFamily: F.mono, fontSize: 14.5, fontWeight: 700, color: colors.text }}>
            {item.change_pct >= 0 ? '+' : ''}{item.change_pct.toFixed(2)}%
          </p>
          <p style={{ fontFamily: F.mono, fontSize: 12.5, color: P.textSecondary, marginTop: 2 }}>
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
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 14 }}>
      <span style={{ fontFamily: F.mono, fontSize: 12.5, color: P.textMuted }}>-3%</span>
      <div style={{
        height: 3,
        width: 160,
        borderRadius: 2,
        background: 'linear-gradient(to right, #521E1E, #B84444, #E06C6C, #16181E, #6BCB8B, #2D8B55, #1A4D2E)',
      }} />
      <span style={{ fontFamily: F.mono, fontSize: 12.5, color: P.textMuted }}>+3%</span>
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
    <section style={{
      background: P.surface,
      border: `1px solid ${P.border}`,
      borderRadius: 4,
      padding: '18px 20px 14px',
      transition: 'border-color 0.2s ease',
    }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = P.borderHover)}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = P.border)}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <span style={{
          fontFamily: F.mono,
          fontSize: 12.5,
          color: P.gold,
          letterSpacing: '0.2em',
          textTransform: 'uppercase' as const,
        }}>
          {t('خريطة القطاعات', 'SECTOR HEATMAP')}
        </span>
        <Link href="/market" style={{
          fontFamily: F.mono,
          fontSize: 12.5,
          color: P.textMuted,
          letterSpacing: '0.1em',
          textDecoration: 'none',
          transition: 'color 0.15s ease',
        }}
          onMouseEnter={(e) => (e.currentTarget.style.color = P.gold)}
          onMouseLeave={(e) => (e.currentTarget.style.color = P.textMuted)}
        >
          {t('عرض الكل', 'VIEW ALL')}
        </Link>
      </div>

      {loading ? (
        <div style={{ height: 320, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <LoadingSpinner message={t('جاري التحميل...', 'Loading...')} />
        </div>
      ) : error ? (
        <div style={{ height: 320, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <button
            onClick={refetch}
            style={{ fontFamily: F.mono, fontSize: 14.5, color: P.red, background: 'none', border: 'none', cursor: 'pointer' }}
          >
            {t('إعادة المحاولة', 'RETRY')}
          </button>
        </div>
      ) : cells.length > 0 ? (
        <Link href="/market" style={{ display: 'block', textDecoration: 'none' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, justifyContent: 'center', minHeight: 280 }}>
            {cells.map((cell) => (
              <HeatmapCell key={cell.ticker} item={cell} />
            ))}
          </div>
        </Link>
      ) : (
        <div style={{ height: 320, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ fontFamily: F.mono, fontSize: 14.5, color: P.textMuted }}>
            {t('لا توجد بيانات', 'NO DATA')}
          </p>
        </div>
      )}

      <GradientLegend />
    </section>
  );
}
