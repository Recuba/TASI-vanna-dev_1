'use client';

import React, { memo, useState } from 'react';
import { cn } from '@/lib/utils';
import { useStockFinancials, useStockFinancialSummary } from '@/lib/hooks/use-api';
import { LoadingSpinner } from '@/components/common/loading-spinner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type StatementTab = 'income_statement' | 'balance_sheet' | 'cash_flow';

const STATEMENT_TABS: { id: StatementTab; labelAr: string; labelEn: string }[] = [
  { id: 'income_statement', labelAr: 'قائمة الدخل', labelEn: 'Income Statement' },
  { id: 'balance_sheet', labelAr: 'الميزانية', labelEn: 'Balance Sheet' },
  { id: 'cash_flow', labelAr: 'التدفقات النقدية', labelEn: 'Cash Flow' },
];

const FIELD_LABELS: Record<string, { ar: string; en: string }> = {
  total_revenue: { ar: 'إجمالي الإيرادات', en: 'Total Revenue' },
  cost_of_revenue: { ar: 'تكلفة الإيرادات', en: 'Cost of Revenue' },
  gross_profit: { ar: 'إجمالي الربح', en: 'Gross Profit' },
  operating_income: { ar: 'الدخل التشغيلي', en: 'Operating Income' },
  net_income: { ar: 'صافي الدخل', en: 'Net Income' },
  ebitda: { ar: 'EBITDA', en: 'EBITDA' },
  total_assets: { ar: 'إجمالي الأصول', en: 'Total Assets' },
  total_liabilities: { ar: 'إجمالي الالتزامات', en: 'Total Liabilities' },
  total_equity: { ar: 'إجمالي حقوق الملكية', en: 'Total Equity' },
  total_debt: { ar: 'إجمالي الديون', en: 'Total Debt' },
  total_current_assets: { ar: 'الأصول المتداولة', en: 'Current Assets' },
  total_current_liabilities: { ar: 'الالتزامات المتداولة', en: 'Current Liabilities' },
  cash_and_equivalents: { ar: 'النقد وما يعادله', en: 'Cash & Equivalents' },
  retained_earnings: { ar: 'الأرباح المبقاة', en: 'Retained Earnings' },
  operating_cash_flow: { ar: 'التدفق النقدي التشغيلي', en: 'Operating Cash Flow' },
  investing_cash_flow: { ar: 'التدفق النقدي الاستثماري', en: 'Investing Cash Flow' },
  financing_cash_flow: { ar: 'التدفق النقدي التمويلي', en: 'Financing Cash Flow' },
  free_cash_flow: { ar: 'التدفق النقدي الحر', en: 'Free Cash Flow' },
  capital_expenditure: { ar: 'الإنفاق الرأسمالي', en: 'Capital Expenditure' },
  depreciation_and_amortization: { ar: 'الاستهلاك والإطفاء', en: 'Depreciation & Amortization' },
  change_in_working_capital: { ar: 'التغير في رأس المال العامل', en: 'Change in Working Capital' },
  interest_expense: { ar: 'مصروفات الفوائد', en: 'Interest Expense' },
  tax_provision: { ar: 'مخصص الضرائب', en: 'Tax Provision' },
  basic_eps: { ar: 'ربحية السهم الأساسية', en: 'Basic EPS' },
  diluted_eps: { ar: 'ربحية السهم المخففة', en: 'Diluted EPS' },
  operating_expense: { ar: 'المصروفات التشغيلية', en: 'Operating Expenses' },
  research_and_development: { ar: 'البحث والتطوير', en: 'Research & Development' },
};

function getFieldLabel(key: string, lang: string): string {
  const label = FIELD_LABELS[key];
  if (label) return lang === 'ar' ? label.ar : label.en;
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatNumber(val: number | null | undefined, opts?: { decimals?: number; prefix?: string; suffix?: string }): string {
  if (val === null || val === undefined) return '-';
  const { decimals = 2, prefix = '', suffix = '' } = opts || {};
  if (Math.abs(val) >= 1e9) return `${prefix}${(val / 1e9).toFixed(1)}B${suffix}`;
  if (Math.abs(val) >= 1e6) return `${prefix}${(val / 1e6).toFixed(1)}M${suffix}`;
  return `${prefix}${val.toFixed(decimals)}${suffix}`;
}

// ---------------------------------------------------------------------------
// MetricCard (shared within this file)
// ---------------------------------------------------------------------------

function MetricCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: 'green' | 'red' }) {
  return (
    <div className="bg-[var(--bg-input)] rounded-xl px-4 py-3">
      <p className="text-xs text-[var(--text-muted)] mb-1">{label}</p>
      <p className={cn('text-sm font-bold', accent === 'green' ? 'text-accent-green' : accent === 'red' ? 'text-accent-red' : 'text-[var(--text-primary)]')}>
        {value}
      </p>
      {sub && <p className="text-xs text-[var(--text-secondary)] mt-0.5">{sub}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// FinancialStatementsSection
// ---------------------------------------------------------------------------

interface SectionProps {
  ticker: string;
  language: string;
  t: (ar: string, en: string) => string;
}

function FinancialStatementsSection({ ticker, language, t }: SectionProps) {
  const [activeStatement, setActiveStatement] = useState<StatementTab>('income_statement');
  const { data: financials, loading: financialsLoading } = useStockFinancials(ticker, activeStatement, 'annual');

  const periods = financials?.periods ?? [];
  const dataKeys: string[] = [];
  const seenKeys = new Set<string>();
  for (const period of periods) {
    for (const key of Object.keys(period.data)) {
      if (!seenKeys.has(key)) { seenKeys.add(key); dataKeys.push(key); }
    }
  }

  if (!financialsLoading && periods.length === 0) return null;

  const dir = language === 'ar' ? 'rtl' : 'ltr';

  return (
    <section className="bg-[var(--bg-card)] border border-[#2A2A2A] rounded-xl p-5">
      <h2 className="text-sm font-bold text-gold mb-3 uppercase tracking-wider" dir={dir}>
        {t('القوائم المالية', 'Financial Statements')}
      </h2>
      <div className="flex gap-1 mb-4 bg-[var(--bg-input)] rounded-lg p-1 overflow-x-auto">
        {STATEMENT_TABS.map((tab) => (
          <button key={tab.id} onClick={() => setActiveStatement(tab.id)}
            className={cn('px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-all', activeStatement === tab.id ? 'bg-gold/20 text-gold' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]')}>
            {language === 'ar' ? tab.labelAr : tab.labelEn}
          </button>
        ))}
      </div>
      {financialsLoading ? (
        <div className="flex justify-center py-8"><LoadingSpinner message={t('جاري التحميل...', 'Loading...')} /></div>
      ) : periods.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)] text-center py-6" dir={dir}>{t('لا توجد بيانات مالية متاحة', 'No financial data available')}</p>
      ) : (
        <div className="relative">
          <div className="pointer-events-none absolute inset-y-0 end-0 w-6 bg-gradient-to-l from-[var(--bg-card)] to-transparent z-10" />
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-sm min-w-[500px]">
              <thead>
                <tr className="border-b border-[#2A2A2A]">
                  <th className="text-start px-2 py-2 text-xs font-medium text-[var(--text-muted)] sticky start-0 bg-[var(--bg-card)] min-w-[160px]">{t('البند', 'Item')}</th>
                  {periods.map((p) => (
                    <th key={p.period_index} className="text-end px-2 py-2 text-xs font-medium text-[var(--text-muted)] min-w-[100px]">{p.period_date || `P${p.period_index}`}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dataKeys.map((key) => (
                  <tr key={key} className="border-b border-[#2A2A2A]/30 hover:bg-[var(--bg-card-hover)] transition-colors">
                    <td className="px-2 py-1.5 text-xs text-[var(--text-secondary)] sticky start-0 bg-[var(--bg-card)]">{getFieldLabel(key, language)}</td>
                    {periods.map((p) => {
                      const val = p.data[key];
                      return (
                        <td key={p.period_index} className="text-end px-2 py-1.5 text-xs text-[var(--text-primary)] font-mono">
                          {val !== null && val !== undefined ? formatNumber(Number(val)) : '-'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// FinancialSummarySection
// ---------------------------------------------------------------------------

function FinancialSummarySection({ ticker, language, t }: SectionProps) {
  const { data: summary, loading } = useStockFinancialSummary(ticker);
  const dir = language === 'ar' ? 'rtl' : 'ltr';

  if (!loading && !summary) return null;

  return (
    <section className="bg-[var(--bg-card)] border border-[#2A2A2A] rounded-xl p-5">
      <h2 className="text-sm font-bold text-gold mb-3 uppercase tracking-wider" dir={dir}>{t('الملخص المالي', 'Financial Summary')}</h2>
      {loading ? (
        <div className="flex justify-center py-6"><LoadingSpinner message={t('جاري التحميل...', 'Loading...')} /></div>
      ) : summary ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          <MetricCard label={t('إجمالي الإيرادات', 'Total Revenue')} value={formatNumber(summary.total_revenue, { prefix: 'SAR ' })} />
          <MetricCard label={t('الإيراد للسهم', 'Revenue/Share')} value={summary.revenue_per_share?.toFixed(2) || '-'} />
          <MetricCard label={t('إجمالي النقد', 'Total Cash')} value={formatNumber(summary.total_cash, { prefix: 'SAR ' })} />
          <MetricCard label={t('إجمالي الديون', 'Total Debt')} value={formatNumber(summary.total_debt, { prefix: 'SAR ' })} />
          <MetricCard label={t('الديون/الملكية', 'Debt/Equity')} value={summary.debt_to_equity?.toFixed(2) || '-'} accent={summary.debt_to_equity !== null && summary.debt_to_equity !== undefined ? (summary.debt_to_equity < 1 ? 'green' : 'red') : undefined} />
          <MetricCard label={t('النسبة الجارية', 'Current Ratio')} value={summary.current_ratio?.toFixed(2) || '-'} accent={summary.current_ratio !== null && summary.current_ratio !== undefined ? (summary.current_ratio >= 1 ? 'green' : 'red') : undefined} />
          <MetricCard label={t('النسبة السريعة', 'Quick Ratio')} value={summary.quick_ratio?.toFixed(2) || '-'} />
          <MetricCard label="EBITDA" value={formatNumber(summary.ebitda, { prefix: 'SAR ' })} />
          <MetricCard label={t('إجمالي الربح', 'Gross Profit')} value={formatNumber(summary.gross_profit, { prefix: 'SAR ' })} />
          <MetricCard label={t('التدفق النقدي الحر', 'Free Cash Flow')} value={formatNumber(summary.free_cashflow, { prefix: 'SAR ' })} accent={summary.free_cashflow !== null && summary.free_cashflow !== undefined ? (summary.free_cashflow >= 0 ? 'green' : 'red') : undefined} />
          <MetricCard label={t('التدفق التشغيلي', 'Operating Cash Flow')} value={formatNumber(summary.operating_cashflow, { prefix: 'SAR ' })} />
        </div>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// StockFinancials (public export — combines both sections)
// ---------------------------------------------------------------------------

interface StockFinancialsProps {
  ticker: string;
  language: string;
  t: (ar: string, en: string) => string;
}

export const StockFinancials = memo(function StockFinancials({ ticker, language, t }: StockFinancialsProps) {
  return (
    <>
      <FinancialSummarySection ticker={ticker} language={language} t={t} />
      <FinancialStatementsSection ticker={ticker} language={language} t={t} />
    </>
  );
});
