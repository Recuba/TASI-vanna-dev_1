'use client';

import React, { memo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/providers/LanguageProvider';

export const PERIODS = [
  { label: '1D', value: '1d', intraday: true },
  { label: '1W', value: '5d', intraday: true },
  { label: '3M', value: '3mo' },
  { label: '6M', value: '6mo' },
  { label: '1Y', value: '1y' },
  { label: '2Y', value: '2y' },
  { label: '5Y', value: '5y' },
] as const;

export type PeriodValue = (typeof PERIODS)[number]['value'];

interface PeriodSelectorProps {
  period: string;
  onPeriodChange: (period: string) => void;
}

export const PeriodSelector = memo(function PeriodSelector({
  period,
  onPeriodChange,
}: PeriodSelectorProps) {
  const { t } = useLanguage();

  const handleClick = useCallback(
    (value: string) => {
      onPeriodChange(value);
    },
    [onPeriodChange],
  );

  return (
    <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-gold/5">
      {PERIODS.map((p) => (
        <button
          key={p.value}
          onClick={() => handleClick(p.value)}
          title={'intraday' in p && p.intraday ? t('قريبا', 'Coming soon') : undefined}
          aria-label={`${t('فترة', 'Period')} ${p.label}`}
          className={cn(
            'text-xs px-2.5 py-1 rounded-md font-medium transition-all duration-200',
            period === p.value
              ? 'bg-gold/20 text-gold shadow-sm'
              : 'bg-transparent text-[#707070] hover:text-gold',
          )}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
});
