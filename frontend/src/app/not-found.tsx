'use client';

import Link from 'next/link';
import { useLanguage } from '@/providers/LanguageProvider';

export default function NotFound() {
  const { t, isRTL } = useLanguage();

  return (
    <div className="flex-1 flex items-center justify-center px-4 py-20">
      <div className="text-center animate-fade-in-up">
        {/* Gold 404 number */}
        <div className="mb-6">
          <span className="text-8xl font-bold gold-text">404</span>
        </div>

        {/* Heading */}
        <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-3" dir={isRTL ? 'rtl' : 'ltr'}>
          {t('الصفحة غير موجودة', 'Page Not Found')}
        </h1>

        {/* Description */}
        <p className="text-sm text-[var(--text-secondary)] mb-8 max-w-md mx-auto" dir={isRTL ? 'rtl' : 'ltr'}>
          {t(
            'عذرا، لم نتمكن من العثور على الصفحة التي تبحث عنها. قد تكون قد حذفت أو نقلت.',
            'Sorry, we couldn\'t find the page you\'re looking for. It may have been deleted or moved.'
          )}
        </p>

        {/* Return home button */}
        <Link
          href="/"
          className="inline-flex items-center gap-2 bg-gold text-[#0E0E0E] font-medium px-6 py-3 rounded-xl hover:bg-gold-light hover:gold-glow-sm transition-all duration-300"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
          {t('العودة للرئيسية', 'Back to Home')}
        </Link>

        {/* Decorative gold line */}
        <div className="mt-10 mx-auto w-24 h-0.5 bg-gold-gradient rounded-full opacity-50" />
      </div>
    </div>
  );
}
