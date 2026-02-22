'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.error('[global-error.tsx]', error);
    }
  }, [error]);

  return (
    <html lang="en" dir="ltr" className="dark">
      <body style={{ margin: 0, backgroundColor: '#0E0E0E', color: '#E5E5E5', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '1rem' }}>
          <div style={{ textAlign: 'center', maxWidth: '28rem' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 64,
                height: 64,
                borderRadius: '50%',
                backgroundColor: 'rgba(212,168,75,0.1)',
                border: '1px solid rgba(212,168,75,0.2)',
                marginBottom: 24,
              }}
            >
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#D4A84B"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>

            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: 8 }}>
              Something went wrong
            </h2>

            <p style={{ fontSize: '0.875rem', color: '#A0A0A0', marginBottom: 24 }}>
              An unexpected error occurred. Please try again.
            </p>

            {process.env.NODE_ENV === 'development' && error.message && (
              <pre
                style={{
                  fontSize: '0.75rem',
                  color: '#A0A0A0',
                  backgroundColor: '#1A1A1A',
                  padding: 12,
                  borderRadius: 8,
                  overflow: 'auto',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  textAlign: 'start',
                  marginBottom: 24,
                }}
              >
                {error.message}
                {error.digest && `\nDigest: ${error.digest}`}
              </pre>
            )}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
              <button
                onClick={reset}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  backgroundColor: '#D4A84B',
                  color: '#0E0E0E',
                  fontWeight: 500,
                  padding: '12px 24px',
                  borderRadius: 12,
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
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
                >
                  <polyline points="1 4 1 10 7 10" />
                  <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                </svg>
                Try Again
              </button>
              <a
                href="/"
                style={{
                  fontSize: '0.875rem',
                  color: '#A0A0A0',
                  textDecoration: 'none',
                }}
              >
                Back to Home
              </a>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
