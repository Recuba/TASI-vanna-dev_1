'use client';

import React, { memo } from 'react';
import { cn } from '@/lib/utils';
import { MA20_COLOR, MA50_COLOR } from '../chart-config';
import { useLanguage } from '@/providers/LanguageProvider';
import type { ChartType } from './useChartIndicators';

interface IndicatorToggleBarProps {
  showMA20: boolean;
  showMA50: boolean;
  chartType: ChartType;
  onToggleMA20: () => void;
  onToggleMA50: () => void;
  onSetChartType: (type: ChartType) => void;
}

export const IndicatorToggleBar = memo(function IndicatorToggleBar({
  showMA20,
  showMA50,
  chartType,
  onToggleMA20,
  onToggleMA50,
  onSetChartType,
}: IndicatorToggleBarProps) {
  const { t } = useLanguage();

  return (
    <div className="flex items-center gap-1">
      {/* MA toggles */}
      <div className="flex items-center gap-0.5 p-0.5 rounded-md bg-gold/5">
        <button
          onClick={onToggleMA20}
          title={t('المتوسط المتحرك 20', 'Moving Average 20')}
          aria-label={t('تبديل المتوسط المتحرك 20', 'Toggle Moving Average 20')}
          aria-pressed={showMA20}
          className="text-[13.5px] px-1.5 py-0.5 rounded transition-colors font-medium"
          style={{
            background: showMA20 ? 'rgba(212, 168, 75, 0.2)' : 'transparent',
            color: showMA20 ? MA20_COLOR : '#707070',
            border: showMA20 ? `1px solid ${MA20_COLOR}` : '1px solid transparent',
          }}
        >
          MA20
        </button>
        <button
          onClick={onToggleMA50}
          title={t('المتوسط المتحرك 50', 'Moving Average 50')}
          aria-label={t('تبديل المتوسط المتحرك 50', 'Toggle Moving Average 50')}
          aria-pressed={showMA50}
          className="text-[13.5px] px-1.5 py-0.5 rounded transition-colors font-medium"
          style={{
            background: showMA50 ? 'rgba(74, 159, 255, 0.2)' : 'transparent',
            color: showMA50 ? MA50_COLOR : '#707070',
            border: showMA50 ? `1px solid ${MA50_COLOR}` : '1px solid transparent',
          }}
        >
          MA50
        </button>
      </div>

      {/* Chart type toggle */}
      <div className="flex items-center gap-0.5 p-0.5 rounded-md bg-gold/5">
        <button
          onClick={() => onSetChartType('candlestick')}
          title={t('شموع يابانية', 'Candlestick')}
          aria-label={t('رسم بياني شمعي', 'Candlestick chart')}
          aria-pressed={chartType === 'candlestick'}
          className={cn(
            'text-[13.5px] px-1.5 py-0.5 rounded transition-colors border',
            chartType === 'candlestick'
              ? 'bg-gold/20 text-gold border-gold'
              : 'bg-transparent text-[#707070] border-transparent',
          )}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <line x1="9" y1="2" x2="9" y2="22" />
            <rect x="5" y="7" width="8" height="10" fill="currentColor" opacity="0.3" />
            <line x1="17" y1="4" x2="17" y2="20" />
            <rect x="13" y="9" width="8" height="6" fill="currentColor" opacity="0.3" />
          </svg>
        </button>
        <button
          onClick={() => onSetChartType('line')}
          title={t('رسم خطي', 'Line Chart')}
          aria-label={t('رسم بياني خطي', 'Line chart')}
          aria-pressed={chartType === 'line'}
          className={cn(
            'text-[13.5px] px-1.5 py-0.5 rounded transition-colors border',
            chartType === 'line'
              ? 'bg-gold/20 text-gold border-gold'
              : 'bg-transparent text-[#707070] border-transparent',
          )}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <polyline points="3,17 8,11 13,15 21,5" />
          </svg>
        </button>
        <button
          onClick={() => onSetChartType('area')}
          title={t('رسم مساحي', 'Area Chart')}
          aria-label={t('رسم بياني مساحي', 'Area chart')}
          aria-pressed={chartType === 'area'}
          className={cn(
            'text-[13.5px] px-1.5 py-0.5 rounded transition-colors border',
            chartType === 'area'
              ? 'bg-gold/20 text-gold border-gold'
              : 'bg-transparent text-[#707070] border-transparent',
          )}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M3,17 L8,11 L13,15 L21,5 L21,21 L3,21 Z" fill="currentColor" opacity="0.2" />
            <polyline points="3,17 8,11 13,15 21,5" />
          </svg>
        </button>
      </div>
    </div>
  );
});
