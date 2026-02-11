'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/providers/LanguageProvider';

export function Footer() {
  const { t } = useLanguage();

  return (
    <footer
      className={cn(
        'py-6 px-6',
        'border-t gold-border',
        'bg-[var(--bg-card)]'
      )}
    >
      <div className="max-w-content-lg mx-auto">
        {/* Top row: links */}
        <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 mb-4">
          <Link
            href="/market"
            className="text-xs text-[var(--text-secondary)] hover:text-gold transition-colors"
          >
            {t('السوق', 'Market')}
          </Link>
          <Link
            href="/charts"
            className="text-xs text-[var(--text-secondary)] hover:text-gold transition-colors"
          >
            {t('الرسوم البيانية', 'Charts')}
          </Link>
          <Link
            href="/news"
            className="text-xs text-[var(--text-secondary)] hover:text-gold transition-colors"
          >
            {t('الأخبار', 'News')}
          </Link>
          <Link
            href="/chat"
            className="text-xs text-[var(--text-secondary)] hover:text-gold transition-colors"
          >
            {t('المحادثة الذكية', 'AI Chat')}
          </Link>
          <Link
            href="/reports"
            className="text-xs text-[var(--text-secondary)] hover:text-gold transition-colors"
          >
            {t('التقارير', 'Reports')}
          </Link>
        </div>

        {/* Divider */}
        <div className="border-t border-gold/[0.08] mb-4" />

        {/* Bottom row: copyright + attribution */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-[var(--text-muted)]">
          <p>&copy; {new Date().getFullYear()} Ra&apos;d AI - {t('رائد للذكاء الاصطناعي', 'Ra\'d AI')}</p>
          <p>
            Powered by{' '}
            <span className="gold-text font-medium">Vanna AI</span>
            <span className="mx-2 text-[var(--text-muted)]/40">|</span>
            {t('البيانات من تداول (تاسي)', 'Data sourced from Tadawul (TASI)')}
          </p>
        </div>
      </div>
    </footer>
  );
}
