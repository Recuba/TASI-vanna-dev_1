'use client';

import React, { memo } from 'react';
import { useLanguage } from '@/providers/LanguageProvider';
import type { IChartApi } from 'lightweight-charts';
import type { OHLCVData } from '../chart-types';

interface ChartExportButtonProps {
  chartRef: React.RefObject<IChartApi | null>;
  data: OHLCVData[] | null;
  period: string;
}

function exportCSV(data: OHLCVData[], period: string) {
  const header = 'Date,Open,High,Low,Close,Volume\n';
  const rows = data
    .map((d) => `${d.time},${d.open},${d.high},${d.low},${d.close},${d.volume ?? 0}`)
    .join('\n');
  const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `TASI_${period}_ohlcv.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export const ChartExportButton = memo(function ChartExportButton({
  chartRef,
  data,
  period,
}: ChartExportButtonProps) {
  const { t } = useLanguage();

  const handleScreenshot = () => {
    if (!chartRef.current) return;
    const canvas = chartRef.current.takeScreenshot();
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    const dateStr = new Date().toISOString().split('T')[0];
    a.download = `TASI_${period}_${dateStr}.png`;
    a.click();
  };

  const handleCSVExport = () => {
    if (!data) return;
    exportCSV(data, period);
  };

  return (
    <div className="flex items-center gap-0.5 p-0.5 rounded-md bg-gold/5">
      <button
        onClick={handleScreenshot}
        title={t('تحميل PNG', 'Download PNG')}
        aria-label={t('تحميل صورة الرسم البياني', 'Download chart image')}
        className="text-[13.5px] px-1.5 py-0.5 rounded transition-colors hidden sm:block text-[#707070] hover:text-gold"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21,15 16,10 5,21" />
        </svg>
      </button>
      <button
        onClick={handleCSVExport}
        title={t('تصدير CSV', 'Export CSV')}
        aria-label={t('تصدير بيانات الرسم البياني كملف CSV', 'Export chart data as CSV')}
        className="text-[13.5px] px-1.5 py-0.5 rounded transition-colors hidden sm:block text-[#707070] hover:text-gold"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M14,2 L6,2 C4.9,2 4,2.9 4,4 L4,20 C4,21.1 4.9,22 6,22 L18,22 C19.1,22 20,21.1 20,20 L20,8 Z" />
          <polyline points="14,2 14,8 20,8" />
          <line x1="12" y1="12" x2="12" y2="18" />
          <polyline points="9,15 12,18 15,15" />
        </svg>
      </button>
    </div>
  );
});
