'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMarketMovers } from '@/lib/hooks/use-api';
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

type TabType = 'gainers' | 'losers';

function MoverRow({ stock, isGainer }: { stock: { ticker: string; current_price?: number; change_pct: number; sector?: string; name?: string }; isGainer: boolean }) {
  const [hovered, setHovered] = useState(false);
  const shortTicker = stock.ticker.replace('.SR', '');
  const magnitude = Math.min(Math.abs(stock.change_pct) / 10, 1);
  const barColor = isGainer ? P.green : P.red;
  const badgeBg = isGainer ? P.greenMuted : `rgba(224, 108, 108, 0.12)`;
  const changeColor = isGainer ? P.green : P.red;

  return (
    <Link
      href={`/stock/${encodeURIComponent(stock.ticker)}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '7px 12px',
        borderRadius: 3,
        background: hovered ? P.surfaceElevated : 'transparent',
        transition: 'background 0.15s ease',
        textDecoration: 'none',
        position: 'relative',
        overflow: 'hidden',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Left bar indicator */}
      <div style={{
        position: 'absolute',
        left: 0,
        top: '20%',
        bottom: '20%',
        width: 3,
        borderRadius: 2,
        background: barColor,
        opacity: 0.3 + magnitude * 0.5,
        transition: 'opacity 0.15s ease',
      }} />

      {/* Company info */}
      <div style={{ flex: 1, minWidth: 0, paddingLeft: 8 }}>
        <p style={{
          fontFamily: F.ui,
          fontSize: 15.5,
          fontWeight: 500,
          color: hovered ? P.goldBright : P.text,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          transition: 'color 0.15s ease',
          marginBottom: 1,
        }}>
          {stock.name || shortTicker}
        </p>
        <p style={{
          fontFamily: F.mono,
          fontSize: 12.5,
          color: P.textMuted,
          letterSpacing: '0.06em',
        }}>
          {shortTicker}{stock.sector ? ` · ${stock.sector}` : ''}
        </p>
      </div>

      {/* Price + badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{
          fontFamily: F.mono,
          fontSize: 15.5,
          color: P.textSecondary,
          letterSpacing: '0.02em',
        }}>
          {stock.current_price?.toFixed(2) ?? '—'}
        </span>
        <span style={{
          fontFamily: F.mono,
          fontSize: 14.5,
          fontWeight: 700,
          color: changeColor,
          background: badgeBg,
          padding: '2px 7px',
          borderRadius: 2,
          letterSpacing: '0.04em',
          minWidth: 58,
          textAlign: 'end',
        }}>
          {stock.change_pct >= 0 ? '+' : ''}{stock.change_pct?.toFixed(2)}%
        </span>
      </div>
    </Link>
  );
}

export function MarketMoversWidget() {
  const [tab, setTab] = useState<TabType>('gainers');
  const { t, language } = useLanguage();
  const { data: movers, loading, error, refetch } = useMarketMovers(tab, 8);

  const tabs: { id: TabType; labelAr: string; labelEn: string }[] = [
    { id: 'gainers', labelAr: 'الرابحون', labelEn: 'Gainers' },
    { id: 'losers', labelAr: 'الخاسرون', labelEn: 'Losers' },
  ];

  return (
    <section
      style={{
        background: P.surface,
        border: `1px solid ${P.border}`,
        borderRadius: 4,
        padding: '18px 0 10px',
        transition: 'border-color 0.2s ease',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = P.borderHover)}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = P.border)}
    >
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        marginBottom: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={{
            fontFamily: F.display,
            fontSize: 19.5,
            fontWeight: 600,
            color: P.goldBright,
            letterSpacing: '0.02em',
          }}>
            {t('محركات السوق', 'Market Movers')}
          </span>
          {/* Tab pills */}
          <div style={{ display: 'flex', gap: 4 }}>
            {tabs.map((item) => (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                style={{
                  fontFamily: F.mono,
                  fontSize: 12.5,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase' as const,
                  padding: '3px 8px',
                  borderRadius: 2,
                  border: `1px solid ${tab === item.id ? P.gold : 'transparent'}`,
                  background: tab === item.id ? P.goldSubtle : 'transparent',
                  color: tab === item.id ? P.gold : P.textMuted,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {language === 'ar' ? item.labelAr : item.labelEn}
              </button>
            ))}
          </div>
        </div>
        <Link
          href="/market"
          style={{
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
        <div style={{ padding: '20px 16px' }}>
          <LoadingSpinner message={t('جاري التحميل...', 'Loading...')} />
        </div>
      ) : error ? (
        <div style={{ padding: '20px 16px' }}>
          <button
            onClick={refetch}
            style={{
              fontFamily: F.mono,
              fontSize: 14.5,
              color: P.red,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            {t('إعادة المحاولة', 'RETRY')}
          </button>
        </div>
      ) : movers && movers.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {movers.map((stock) => (
            <MoverRow key={stock.ticker} stock={stock} isGainer={tab === 'gainers'} />
          ))}
        </div>
      ) : (
        <p style={{ fontFamily: F.mono, fontSize: 14.5, color: P.textMuted, padding: '0 16px' }}>
          {t('لا توجد بيانات', 'NO DATA')}
        </p>
      )}
    </section>
  );
}
