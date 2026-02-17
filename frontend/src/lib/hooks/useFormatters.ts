'use client';

import { useMemo } from 'react';
import { useLanguage } from '@/providers/LanguageProvider';

/**
 * Locale-aware number/date/percent formatters driven by the current language.
 * Uses Intl.NumberFormat and Intl.DateTimeFormat under the hood.
 */
export function useFormatters() {
  const { language } = useLanguage();
  const locale = language === 'ar' ? 'ar-SA' : 'en-US';

  return useMemo(() => {
    const numberFmt = new Intl.NumberFormat(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    const percentFmt = new Intl.NumberFormat(locale, {
      style: 'percent',
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });

    const dateFmt = new Intl.DateTimeFormat(locale, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    const timeFmt = new Intl.DateTimeFormat(locale, {
      hour: '2-digit',
      minute: '2-digit',
    });

    return {
      formatNumber: (n: number | null | undefined): string =>
        n != null ? numberFmt.format(n) : '\u2014',

      formatPercent: (n: number | null | undefined): string =>
        n != null ? percentFmt.format(n) : '\u2014',

      formatDate: (d: Date | string | null | undefined): string => {
        if (!d) return '\u2014';
        const date = typeof d === 'string' ? new Date(d) : d;
        if (isNaN(date.getTime())) return '\u2014';
        return dateFmt.format(date);
      },

      formatTime: (d: Date | string | null | undefined): string => {
        if (!d) return '\u2014';
        const date = typeof d === 'string' ? new Date(d) : d;
        if (isNaN(date.getTime())) return '\u2014';
        return timeFmt.format(date);
      },

      locale,
    };
  }, [locale]);
}
