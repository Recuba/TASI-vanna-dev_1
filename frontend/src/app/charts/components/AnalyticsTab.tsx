'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { useLanguage } from '@/providers/LanguageProvider';

const PreBuiltCharts = dynamic(
  () => import('@/components/charts/PreBuiltCharts'),
  { ssr: false, loading: () => <div className="h-[400px] rounded-xl dark:bg-[#1A1A1A] bg-gray-100 animate-pulse" /> },
);

function AnalyticsTabInner() {
  const { t } = useLanguage();

  return (
    <div className="space-y-5 animate-tab-in">
      <section>
        <div className="mb-4">
          <h2 className="text-lg font-bold text-[var(--text-primary)]">
            {t('تحليلات السوق', 'Market Analytics')}
          </h2>
          <p className="text-sm text-[var(--text-muted)]">
            {t('بيانات تحليلية مباشرة من سوق تداول', 'Live analytical data from Tadawul market')}
          </p>
        </div>
        <PreBuiltCharts />
      </section>
    </div>
  );
}

export const AnalyticsTab = React.memo(AnalyticsTabInner);
