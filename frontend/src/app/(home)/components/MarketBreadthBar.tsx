'use client';

import { cn } from '@/lib/utils';
import { useMarketBreadth } from '@/lib/hooks/use-api';
import { useLanguage } from '@/providers/LanguageProvider';

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

export function MarketBreadthBar() {
  const { data, loading } = useMarketBreadth();
  const { t } = useLanguage();

  if (loading || !data) {
    return (
      <div style={{
        height: 80,
        background: P.surface,
        border: `1px solid ${P.border}`,
        borderRadius: 4,
        animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      }} />
    );
  }

  const total = data.advancing + data.declining + data.unchanged;
  const advPct = total > 0 ? (data.advancing / total) * 100 : 0;
  const decPct = total > 0 ? (data.declining / total) * 100 : 0;
  const unchPct = total > 0 ? (data.unchanged / total) * 100 : 0;
  const isPositive = data.advance_decline_ratio != null && data.advance_decline_ratio >= 1;

  return (
    <div
      style={{
        background: P.surface,
        border: `1px solid ${P.border}`,
        borderRadius: 4,
        padding: '12px 16px',
        transition: 'border-color 0.2s ease',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = P.borderHover)}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = P.border)}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{
          fontFamily: F.mono,
          fontSize: 9,
          color: P.gold,
          letterSpacing: '0.2em',
          textTransform: 'uppercase' as const,
        }}>
          {t('نبض السوق', 'MARKET BREADTH')}
        </span>
        {data.advance_decline_ratio != null && (
          <span style={{
            fontFamily: F.mono,
            fontSize: 12,
            fontWeight: 700,
            color: isPositive ? P.green : P.red,
            letterSpacing: '0.04em',
          }}>
            A/D {data.advance_decline_ratio.toFixed(2)}
          </span>
        )}
      </div>

      {/* Progress bar — 4px tall, segmented */}
      <div style={{
        display: 'flex',
        height: 4,
        borderRadius: 2,
        overflow: 'hidden',
        background: P.surfaceElevated,
        marginBottom: 10,
        gap: 1,
      }}>
        <div style={{
          width: `${advPct}%`,
          background: `linear-gradient(to right, ${P.greenDeep}, ${P.green})`,
          borderRadius: '2px 0 0 2px',
          transition: 'width 0.4s ease',
        }} />
        <div style={{
          width: `${unchPct}%`,
          background: P.textMuted,
          transition: 'width 0.4s ease',
        }} />
        <div style={{
          width: `${decPct}%`,
          background: `linear-gradient(to right, ${P.red}, ${P.redDeep})`,
          borderRadius: '0 2px 2px 0',
          transition: 'width 0.4s ease',
        }} />
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {/* Advancing */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{
            width: 5, height: 5, borderRadius: '50%',
            background: P.green,
            display: 'inline-block',
            flexShrink: 0,
          }} />
          <span style={{ fontFamily: F.mono, fontSize: 11, color: P.green, fontWeight: 700 }}>
            {data.advancing}
          </span>
          <span style={{ fontFamily: F.mono, fontSize: 9, color: P.textMuted }}>
            {t('صاعد', 'ADV')}
          </span>
        </div>

        {/* Unchanged */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{
            width: 5, height: 5, borderRadius: '50%',
            background: P.textMuted,
            display: 'inline-block',
            flexShrink: 0,
          }} />
          <span style={{ fontFamily: F.mono, fontSize: 11, color: P.textSecondary, fontWeight: 700 }}>
            {data.unchanged}
          </span>
          <span style={{ fontFamily: F.mono, fontSize: 9, color: P.textMuted }}>
            {t('مستقر', 'UCH')}
          </span>
        </div>

        {/* Declining */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{
            width: 5, height: 5, borderRadius: '50%',
            background: P.red,
            display: 'inline-block',
            flexShrink: 0,
          }} />
          <span style={{ fontFamily: F.mono, fontSize: 11, color: P.red, fontWeight: 700 }}>
            {data.declining}
          </span>
          <span style={{ fontFamily: F.mono, fontSize: 9, color: P.textMuted }}>
            {t('هابط', 'DEC')}
          </span>
        </div>

        {/* 52W Highs/Lows */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontFamily: F.mono, fontSize: 9, color: P.textMuted }}>
            {t('أعلى 52', '52H')}{' '}
            <span style={{ color: P.green, fontWeight: 700 }}>{data.new_52w_highs}</span>
          </span>
          <span style={{ fontFamily: F.mono, fontSize: 9, color: P.textMuted }}>
            {t('أدنى 52', '52L')}{' '}
            <span style={{ color: P.red, fontWeight: 700 }}>{data.new_52w_lows}</span>
          </span>
        </div>
      </div>
    </div>
  );
}
