'use client';

import { useEffect, useState } from 'react';
import { RetryButton } from '@/components/common/RetryButton';

export default function MarketsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [isRetrying, setIsRetrying] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.error('[markets/error.tsx]', error);
    }
  }, [error]);

  const handleRetry = () => {
    setIsRetrying(true);
    reset();
    setTimeout(() => setIsRetrying(false), 2000);
  };

  return (
    <div className="flex-1 flex items-center justify-center px-4 py-20">
      <div className="text-center max-w-md animate-fade-in-up">
        {/* Gold warning icon */}
        <div className="relative mb-8 inline-flex items-center justify-center">
          <div className="absolute w-24 h-24 rounded-full animate-pulse border border-gold/15" />
          <div className="relative w-20 h-20 rounded-full flex items-center justify-center bg-[radial-gradient(circle,#1A1A1A_0%,#0E0E0E_100%)] border border-gold/20">
            <svg
              width="36"
              height="36"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#D4A84B"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" strokeWidth="2" />
              <circle cx="12" cy="17" r="0.5" fill="#D4A84B" strokeWidth="0" />
            </svg>
          </div>
        </div>

        <h2 className="text-xl font-bold mb-2 text-[var(--text-primary)]">
          {'\u062A\u0639\u0630\u0651\u0631 \u062A\u062D\u0645\u064A\u0644 \u0627\u0644\u0623\u0633\u0648\u0627\u0642 \u0627\u0644\u0639\u0627\u0644\u0645\u064A\u0629'}
        </h2>

        <p className="text-sm mb-3 text-[var(--text-secondary)]">
          {'\u062D\u062F\u062B \u062E\u0637\u0623 \u0623\u062B\u0646\u0627\u0621 \u062C\u0644\u0628 \u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0623\u0633\u0648\u0627\u0642. \u064A\u0631\u062C\u0649 \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629 \u0645\u0631\u0629 \u0623\u062E\u0631\u0649.'}
        </p>

        {/* Network suggestion */}
        <div className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 mb-6 bg-gold/5 border border-gold/10">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#D4A84B"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M5 12.55a11 11 0 0 1 14.08 0" />
            <path d="M1.42 9a16 16 0 0 1 21.16 0" />
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
            <circle cx="12" cy="20" r="1" fill="#D4A84B" />
          </svg>
          <span className="font-mono text-xs text-gold">
            {'\u062A\u0623\u0643\u062F \u0645\u0646 \u0627\u062A\u0635\u0627\u0644\u0643 \u0628\u0627\u0644\u0625\u0646\u062A\u0631\u0646\u062A'}
          </span>
        </div>

        {process.env.NODE_ENV === 'development' && error.message && (
          <details className="mb-6 text-start">
            <summary className="text-xs cursor-pointer transition-colors text-[var(--text-muted)]">
              {'\u062A\u0641\u0627\u0635\u064A\u0644 \u0627\u0644\u062E\u0637\u0623'}
            </summary>
            <pre className="mt-2 text-xs p-3 rounded-lg overflow-x-auto font-mono whitespace-pre-wrap break-all text-[var(--text-muted)] bg-[#2A2A2A] border border-[#2A2A2A]">
              {error.message}
              {error.digest && `\nDigest: ${error.digest}`}
            </pre>
          </details>
        )}

        <div className="flex items-center justify-center gap-3">
          <RetryButton onRetry={handleRetry} isRetrying={isRetrying} />
          <a
            href="/"
            className="inline-flex items-center gap-2 text-sm text-[var(--text-muted)] hover:text-gold transition-colors"
          >
            {'\u0627\u0644\u0639\u0648\u062F\u0629 \u0644\u0644\u0631\u0626\u064A\u0633\u064A\u0629'}
          </a>
        </div>

        <div className="mt-10 mx-auto w-24 h-0.5 rounded-full opacity-50 bg-gold-gradient" />
      </div>
    </div>
  );
}
