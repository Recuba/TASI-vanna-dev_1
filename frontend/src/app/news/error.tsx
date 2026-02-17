'use client';

import { useEffect, useState } from 'react';

export default function NewsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.error('[news/error.tsx]', error);
    }
  }, [error]);

  const handleRetry = () => {
    setRetrying(true);
    reset();
    setTimeout(() => setRetrying(false), 2000);
  };

  return (
    <div className="flex-1 flex items-center justify-center px-4 py-20">
      <div className="text-center max-w-md animate-fade-in-up">
        {/* News error icon with gold glow */}
        <div className="relative mb-6 inline-flex items-center justify-center">
          <div className="absolute inset-0 w-20 h-20 -translate-x-2 -translate-y-2 rounded-full bg-gold/8 blur-xl" />
          <div
            className="relative w-16 h-16 rounded-full bg-gold/10 border border-gold/20 flex items-center justify-center animate-float"
          >
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-gold"
            >
              <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" />
              <path d="M18 14h-8" />
              <path d="M15 18h-5" />
              <path d="M10 6h8v4h-8V6Z" />
            </svg>
          </div>
        </div>

        <h2 className="text-xl font-bold text-[var(--text-primary)] mb-2">
          تعذّر تحميل الأخبار
          <span className="block text-sm font-normal text-[var(--text-muted)] mt-1">
            (Failed to load news)
          </span>
        </h2>

        <p className="text-sm text-[var(--text-secondary)] mb-1">
          حدث خطأ أثناء جلب آخر الأخبار. يرجى المحاولة مرة أخرى.
        </p>
        <p className="text-xs text-[var(--text-muted)] mb-6">
          (An error occurred while fetching news. Please try again.)
        </p>

        {process.env.NODE_ENV === 'development' && error.message && (
          <details className="mb-6 text-start">
            <summary className="text-xs text-[var(--text-muted)] cursor-pointer hover:text-[var(--text-secondary)] transition-colors">
              تفاصيل الخطأ (Error Details)
            </summary>
            <pre className="mt-2 text-xs text-[var(--text-muted)] bg-[var(--bg-input)] p-3 rounded-lg overflow-x-auto font-mono whitespace-pre-wrap break-all">
              {error.message}
              {error.digest && `\nDigest: ${error.digest}`}
            </pre>
          </details>
        )}

        {/* Gold accent separator */}
        <div className="w-16 h-0.5 mx-auto mb-6 rounded-full bg-gold-gradient opacity-40" />

        <div className="flex items-center justify-center gap-3">
          <button
            onClick={handleRetry}
            disabled={retrying}
            className="inline-flex items-center gap-2 bg-gold text-[#0E0E0E] font-medium px-6 py-3 rounded-xl hover:bg-gold-light hover:gold-glow-sm transition-all duration-300 active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={retrying ? 'animate-spin' : ''}
            >
              <polyline points="1 4 1 10 7 10" />
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
            </svg>
            {retrying ? 'جاري المحاولة...' : 'إعادة المحاولة'}
          </button>
          <a
            href="/"
            className="inline-flex items-center gap-2 text-sm text-[var(--text-muted)] hover:text-gold transition-colors"
          >
            العودة للرئيسية
          </a>
        </div>

        <div className="mt-10 mx-auto w-24 h-0.5 bg-gold-gradient rounded-full opacity-50" />
      </div>
    </div>
  );
}
