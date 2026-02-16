'use client';

import { useEffect } from 'react';

export default function ChartsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.error('[charts/error.tsx]', error);
    }
  }, [error]);

  return (
    <div className="flex-1 flex items-center justify-center px-4 py-20">
      <div className="text-center max-w-md animate-fade-in-up">
        {/* Chart error icon */}
        <div className="mb-6 inline-flex items-center justify-center w-16 h-16 rounded-full bg-gold/10 border border-gold/20">
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
            <line x1="18" y1="20" x2="18" y2="10" />
            <line x1="12" y1="20" x2="12" y2="4" />
            <line x1="6" y1="20" x2="6" y2="14" />
          </svg>
        </div>

        <h2 className="text-xl font-bold text-[var(--text-primary)] mb-2">
          تعذّر تحميل الرسوم البيانية
        </h2>

        <p className="text-sm text-[var(--text-secondary)] mb-6">
          حدث خطأ أثناء تحميل الرسوم البيانية. يرجى المحاولة مرة أخرى.
        </p>

        {process.env.NODE_ENV === 'development' && error.message && (
          <details className="mb-6 text-start">
            <summary className="text-xs text-[var(--text-muted)] cursor-pointer hover:text-[var(--text-secondary)] transition-colors">
              تفاصيل الخطأ
            </summary>
            <pre className="mt-2 text-xs text-[var(--text-muted)] bg-[var(--bg-input)] p-3 rounded-lg overflow-x-auto font-mono whitespace-pre-wrap break-all">
              {error.message}
              {error.digest && `\nDigest: ${error.digest}`}
            </pre>
          </details>
        )}

        <div className="flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 bg-gold text-[#0E0E0E] font-medium px-6 py-3 rounded-xl hover:bg-gold-light hover:gold-glow-sm transition-all duration-300"
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
            >
              <polyline points="1 4 1 10 7 10" />
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
            </svg>
            إعادة المحاولة
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
