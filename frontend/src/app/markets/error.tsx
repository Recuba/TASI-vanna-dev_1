'use client';

import { useEffect } from 'react';

export default function MarketsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.error('[markets/error.tsx]', error);
    }
  }, [error]);

  return (
    <div className="flex-1 flex items-center justify-center px-4 py-20">
      <div className="text-center max-w-md animate-fade-in-up">
        {/* Error constellation icon */}
        <div className="relative mb-8 inline-flex items-center justify-center">
          {/* Outer pulsing ring */}
          <div
            className="absolute w-24 h-24 rounded-full animate-pulse"
            style={{
              border: '1px solid rgba(255,107,107,0.15)',
              boxShadow: '0 0 40px rgba(255,107,107,0.06)',
            }}
          />
          {/* Inner icon circle */}
          <div
            className="relative w-20 h-20 rounded-full flex items-center justify-center"
            style={{
              background: 'radial-gradient(circle, #1A1A1A 0%, #0E0E0E 100%)',
              border: '1px solid rgba(255,107,107,0.2)',
              boxShadow: '0 0 30px rgba(255,107,107,0.08)',
            }}
          >
            <svg
              width="36"
              height="36"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#FF6B6B"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              {/* Globe with crack */}
              <circle cx="12" cy="12" r="10" opacity="0.6" />
              <line x1="2" y1="12" x2="22" y2="12" opacity="0.4" />
              <path
                d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"
                opacity="0.4"
              />
              {/* Warning indicator */}
              <line x1="12" y1="8" x2="12" y2="12" strokeWidth="2" opacity="1" />
              <circle cx="12" cy="15" r="0.5" fill="#FF6B6B" strokeWidth="0" opacity="1" />
            </svg>
          </div>
        </div>

        <h2
          className="text-xl font-bold mb-2"
          style={{ color: 'var(--text-primary)' }}
        >
          {'\u062A\u0639\u0630\u0651\u0631 \u062A\u062D\u0645\u064A\u0644 \u0627\u0644\u0623\u0633\u0648\u0627\u0642 \u0627\u0644\u0639\u0627\u0644\u0645\u064A\u0629'}
        </h2>

        <p
          className="text-sm mb-3"
          style={{ color: 'var(--text-secondary)' }}
        >
          {'\u062D\u062F\u062B \u062E\u0637\u0623 \u0623\u062B\u0646\u0627\u0621 \u062C\u0644\u0628 \u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0623\u0633\u0648\u0627\u0642. \u064A\u0631\u062C\u0649 \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629 \u0645\u0631\u0629 \u0623\u062E\u0631\u0649.'}
        </p>

        {/* Network suggestion */}
        <div
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 mb-6"
          style={{
            background: 'rgba(212,168,75,0.06)',
            border: '1px solid rgba(212,168,75,0.12)',
          }}
        >
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
          <span className="font-mono text-xs" style={{ color: '#D4A84B' }}>
            {'\u062A\u0623\u0643\u062F \u0645\u0646 \u0627\u062A\u0635\u0627\u0644\u0643 \u0628\u0627\u0644\u0625\u0646\u062A\u0631\u0646\u062A'}
          </span>
        </div>

        {process.env.NODE_ENV === 'development' && error.message && (
          <details className="mb-6 text-start">
            <summary
              className="text-xs cursor-pointer transition-colors"
              style={{ color: 'var(--text-muted)' }}
            >
              {'\u062A\u0641\u0627\u0635\u064A\u0644 \u0627\u0644\u062E\u0637\u0623'}
            </summary>
            <pre
              className="mt-2 text-xs p-3 rounded-lg overflow-x-auto font-mono whitespace-pre-wrap break-all"
              style={{
                color: 'var(--text-muted)',
                background: '#2A2A2A',
                border: '1px solid #2A2A2A',
              }}
            >
              {error.message}
              {error.digest && `\nDigest: ${error.digest}`}
            </pre>
          </details>
        )}

        <div className="flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 font-medium px-6 py-3 rounded-xl transition-all duration-300"
            style={{
              background: '#D4A84B',
              color: '#0E0E0E',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = '#E8C872';
              e.currentTarget.style.boxShadow = '0 0 20px rgba(212,168,75,0.3)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = '#D4A84B';
              e.currentTarget.style.boxShadow = 'none';
            }}
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
              aria-hidden="true"
            >
              <polyline points="1 4 1 10 7 10" />
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
            </svg>
            {'\u0625\u0639\u0627\u062F\u0629 \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629'}
          </button>
          <a
            href="/"
            className="inline-flex items-center gap-2 text-sm transition-colors"
            style={{ color: 'var(--text-muted)' }}
            onMouseOver={(e) => {
              e.currentTarget.style.color = '#D4A84B';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.color = 'var(--text-muted)';
            }}
          >
            {'\u0627\u0644\u0639\u0648\u062F\u0629 \u0644\u0644\u0631\u0626\u064A\u0633\u064A\u0629'}
          </a>
        </div>

        <div
          className="mt-10 mx-auto w-24 h-0.5 rounded-full opacity-50"
          style={{
            background: 'linear-gradient(135deg, #D4A84B 0%, #E8C872 50%, #B8860B 100%)',
          }}
        />
      </div>
    </div>
  );
}
