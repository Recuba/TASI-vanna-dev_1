'use client';

import React, { memo, useState } from 'react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/providers/LanguageProvider';

// ---------------------------------------------------------------------------
// Help panel data
// ---------------------------------------------------------------------------

interface HelpCategory {
  titleAr: string;
  titleEn: string;
  icon: string;
  examples: { ar: string; en: string; queryAr: string; queryEn: string }[];
}

const HELP_CATEGORIES: HelpCategory[] = [
  {
    titleAr: 'القيمة',
    titleEn: 'Valuation',
    icon: 'chart-bar',
    examples: [
      { ar: 'أعلى 10 شركات من حيث القيمة السوقية', en: 'Top 10 by market cap', queryAr: 'ما هي أعلى 10 شركات من حيث القيمة السوقية مع القطاع والسعر الحالي؟', queryEn: 'What are the top 10 companies by market cap? Show name, sector, and current price.' },
      { ar: 'مكرر أرباح قطاع البنوك', en: 'Banking P/E ratios', queryAr: 'ما هو مكرر الأرباح والقيمة الدفترية لجميع شركات قطاع البنوك؟', queryEn: 'What is the trailing P/E and price-to-book for all companies in the banking sector?' },
      { ar: 'قارن أرامكو والراجحي', en: 'Compare Aramco vs Rajhi', queryAr: 'قارن بين أرامكو والراجحي من حيث القيمة السوقية ومكرر الأرباح والعائد على حقوق الملكية', queryEn: 'Compare Aramco and Al Rajhi Bank on market cap, P/E ratio, ROE, and profit margin' },
    ],
  },
  {
    titleAr: 'التوزيعات',
    titleEn: 'Dividends',
    icon: 'coins',
    examples: [
      { ar: 'أعلى الأسهم توزيعاً للأرباح', en: 'Top dividend stocks', queryAr: 'ما هي أعلى 10 أسهم من حيث عائد الأرباح الموزعة مع نسبة التوزيع؟', queryEn: 'What are the top 10 stocks by dividend yield? Include payout ratio and dividend rate.' },
      { ar: 'توزيعات البنوك السعودية', en: 'Bank dividends', queryAr: 'أظهر توزيعات الأرباح وعائد التوزيع لجميع البنوك السعودية', queryEn: 'Show dividend rate and yield for all Saudi banks' },
    ],
  },
  {
    titleAr: 'القوائم المالية',
    titleEn: 'Financial Statements',
    icon: 'file-text',
    examples: [
      { ar: 'أرباح البنوك السعودية', en: 'Saudi bank profits', queryAr: 'أظهر صافي الدخل وهامش الربح لجميع البنوك السعودية مرتبة من الأعلى', queryEn: 'Show net income and profit margin for all Saudi banks, ordered by net income descending' },
      { ar: 'إيرادات أرامكو السنوية', en: 'Aramco annual revenue', queryAr: 'أظهر الإيرادات السنوية لأرامكو من قائمة الدخل لجميع الفترات', queryEn: 'Show the annual total revenue for ticker 2222.SR from the income statement across all periods' },
      { ar: 'أعلى 10 شركات نمواً في الأرباح', en: 'Top 10 earnings growth', queryAr: 'ما هي أعلى 10 شركات من حيث نمو الأرباح مع القطاع وهامش الربح؟', queryEn: 'What are the top 10 companies by earnings growth? Include sector and profit margin.' },
    ],
  },
  {
    titleAr: 'تحليل القطاعات',
    titleEn: 'Sector Analysis',
    icon: 'layers',
    examples: [
      { ar: 'القيمة السوقية حسب القطاع', en: 'Market cap by sector', queryAr: 'ما هي القيمة السوقية الإجمالية لكل قطاع مرتبة من الأعلى؟', queryEn: 'What is the total market cap per sector, ordered descending?' },
      { ar: 'أفضل 5 شركات في كل قطاع', en: 'Top 5 per sector', queryAr: 'ما هي أفضل 5 شركات في قطاع البنوك من حيث القيمة السوقية؟', queryEn: 'What are the top 5 companies in the banking sector by market cap?' },
    ],
  },
  {
    titleAr: 'الرسوم البيانية',
    titleEn: 'Charts',
    icon: 'pie-chart',
    examples: [
      { ar: 'رسم بياني للقيمة السوقية', en: 'Market cap chart', queryAr: 'Plot a bar chart of total market cap grouped by sector for all sectors', queryEn: 'Plot a bar chart of total market cap grouped by sector for all sectors' },
      { ar: 'رسم إيرادات أرامكو', en: 'Aramco revenue chart', queryAr: 'Plot the annual total revenue for ticker 2222.SR from the income statement across all periods', queryEn: 'Plot the annual total revenue for ticker 2222.SR from the income statement across all periods' },
    ],
  },
];

// ---------------------------------------------------------------------------
// Icon helper
// ---------------------------------------------------------------------------

function HelpCategoryIcon({ name }: { name: string }) {
  const props = { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (name) {
    case 'chart-bar': return <svg {...props}><rect x="3" y="12" width="4" height="9" /><rect x="10" y="7" width="4" height="14" /><rect x="17" y="3" width="4" height="18" /></svg>;
    case 'coins': return <svg {...props}><circle cx="8" cy="8" r="6" /><path d="M18.09 10.37A6 6 0 1 1 10.34 18" /><line x1="7" y1="6" x2="7.01" y2="6" /><line x1="9" y1="10" x2="9.01" y2="10" /></svg>;
    case 'file-text': return <svg {...props}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>;
    case 'layers': return <svg {...props}><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" /></svg>;
    case 'pie-chart': return <svg {...props}><path d="M21.21 15.89A10 10 0 1 1 8 2.83" /><path d="M22 12A10 10 0 0 0 12 2v10z" /></svg>;
    default: return null;
  }
}

// ---------------------------------------------------------------------------
// HelpPanel component
// ---------------------------------------------------------------------------

interface HelpPanelProps {
  onSuggestionClick: (query: string) => void;
}

export const HelpPanel = memo(function HelpPanel({ onSuggestionClick }: HelpPanelProps) {
  const { t, language } = useLanguage();
  const [helpOpen, setHelpOpen] = useState(false);

  return (
    <div className="w-full max-w-2xl">
      <button
        onClick={() => setHelpOpen((v) => !v)}
        className={cn(
          'w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl',
          'text-sm font-medium transition-all duration-200',
          helpOpen
            ? 'text-gold bg-gold/10 border border-gold/20'
            : 'text-[var(--text-secondary)] hover:text-gold bg-[var(--bg-card)] border gold-border hover:border-gold/40',
        )}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        {t('ماذا يمكنني أن أسأل؟', 'What can I ask?')}
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className={cn('transition-transform duration-200', helpOpen && 'rotate-180')}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {helpOpen && (
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 animate-fade-in-up">
          {HELP_CATEGORIES.map((cat) => (
            <div
              key={cat.titleEn}
              className="bg-[var(--bg-card)] border gold-border rounded-xl p-3 hover:border-gold/30 transition-colors"
            >
              <h3 className="text-xs font-semibold text-gold mb-2 flex items-center gap-1.5">
                <HelpCategoryIcon name={cat.icon} />
                {t(cat.titleAr, cat.titleEn)}
              </h3>
              <div className="space-y-1.5">
                {cat.examples.map((ex, i) => (
                  <button
                    key={i}
                    onClick={() => onSuggestionClick(language === 'ar' ? ex.queryAr : ex.queryEn)}
                    className={cn(
                      'w-full text-start px-2.5 py-1.5 rounded-lg text-xs',
                      'text-[var(--text-secondary)]',
                      'hover:bg-gold/10 hover:text-[var(--text-primary)]',
                      'transition-colors duration-150',
                    )}
                  >
                    {t(ex.ar, ex.en)}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
