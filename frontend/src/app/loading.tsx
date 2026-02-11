'use client';

import { useLanguage } from '@/providers/LanguageProvider';

export default function Loading() {
  const { t } = useLanguage();

  return (
    <div className="flex-1 flex items-center justify-center px-4 py-20">
      <div className="flex flex-col items-center gap-4 animate-fade-in-up">
        {/* Gold spinning indicator */}
        <div className="relative w-12 h-12">
          <div className="absolute inset-0 rounded-full border-2 border-gold/20" />
          <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-gold animate-spin" />
        </div>

        {/* Loading text */}
        <span className="text-sm text-[var(--text-muted)]">
          {t('جاري التحميل...', 'Loading...')}
        </span>
      </div>
    </div>
  );
}
