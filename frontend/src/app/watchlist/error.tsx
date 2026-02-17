'use client';

import { useEffect } from 'react';
import { useLanguage } from '@/providers/LanguageProvider';

export default function WatchlistError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useLanguage();

  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.error('[watchlist/error.tsx]', error);
    }
  }, [error]);

  return (
    <div className="flex-1 flex items-center justify-center px-4 py-20">
      <div className="text-center max-w-md animate-fade-in-up">
        {/* Star/bookmark icon */}
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
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        </div>

        <h2 className="text-xl font-bold text-[var(--text-primary)] mb-2">
          {t('\u062A\u0639\u0630\u0651\u0631 \u062A\u062D\u0645\u064A\u0644 \u0642\u0648\u0627\u0626\u0645 \u0627\u0644\u0645\u0631\u0627\u0642\u0628\u0629', 'Error loading watchlists')}
        </h2>

        <p className="text-sm text-[var(--text-secondary)] mb-6">
          {t(
            '\u062D\u062F\u062B \u062E\u0637\u0623 \u0623\u062B\u0646\u0627\u0621 \u062A\u062D\u0645\u064A\u0644 \u0642\u0648\u0627\u0626\u0645 \u0627\u0644\u0645\u0631\u0627\u0642\u0628\u0629. \u064A\u0631\u062C\u0649 \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629 \u0645\u0631\u0629 \u0623\u062E\u0631\u0649.',
            'An error occurred while loading watchlists. Please try again.'
          )}
        </p>

        {process.env.NODE_ENV === 'development' && error.message && (
          <details className="mb-6 text-start">
            <summary className="text-xs text-[var(--text-muted)] cursor-pointer hover:text-[var(--text-secondary)] transition-colors">
              {t('\u062A\u0641\u0627\u0635\u064A\u0644 \u0627\u0644\u062E\u0637\u0623', 'Error details')}
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
            {t('\u0625\u0639\u0627\u062F\u0629 \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629', 'Try Again')}
          </button>
          <a
            href="/"
            className="inline-flex items-center gap-2 text-sm text-[var(--text-muted)] hover:text-gold transition-colors"
          >
            {t('\u0627\u0644\u0639\u0648\u062F\u0629 \u0644\u0644\u0631\u0626\u064A\u0633\u064A\u0629', 'Back to Home')}
          </a>
        </div>

        <div className="mt-10 mx-auto w-24 h-0.5 bg-gold-gradient rounded-full opacity-50" />
      </div>
    </div>
  );
}
