'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/providers/LanguageProvider';

interface RecentSearchesProps {
  recentSearches: { ticker: string; name: string }[];
  onSelect: (ticker: string, name: string) => void;
}

function RecentSearchesInner({ recentSearches, onSelect }: RecentSearchesProps) {
  const { t } = useLanguage();

  if (recentSearches.length === 0) return null;

  return (
    <div
      className={cn(
        'absolute z-20 w-full mt-1',
        'bg-[var(--bg-card)] border gold-border rounded-md',
        'shadow-lg shadow-black/40 overflow-hidden animate-slide-down',
      )}
    >
      <div className="px-3 py-1.5 text-xs text-[var(--text-muted)] border-b border-[var(--bg-input)]">
        {t('عمليات البحث الأخيرة', 'Recent searches')}
      </div>
      {recentSearches.map((r) => (
        <button
          key={r.ticker}
          onClick={() => onSelect(r.ticker, r.name)}
          className="w-full flex items-center gap-2 px-3 py-2 text-start hover:bg-[var(--bg-card-hover)] transition-colors border-b border-[var(--bg-input)] last:border-0"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-[var(--text-muted)] shrink-0"
          >
            <polyline points="1 4 1 10 7 10" />
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
          </svg>
          <span className="text-sm font-medium text-gold">{r.ticker}</span>
          <span className="text-sm text-[var(--text-secondary)]">{r.name}</span>
        </button>
      ))}
    </div>
  );
}

export const RecentSearches = React.memo(RecentSearchesInner);
