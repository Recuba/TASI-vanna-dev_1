'use client';

/**
 * Default error fallback component for the monitoring ErrorBoundary.
 * Shows a user-friendly error message with Reload and Go Home actions.
 * Dark-gold themed to match the Ra'd AI design system.
 */
interface ErrorFallbackProps {
  error: Error;
  onReset: () => void;
}

function sanitizeErrorMessage(error: Error): string {
  if (process.env.NODE_ENV === 'development') {
    return error.message;
  }
  // In production, strip stack traces and internal details
  const message = error.message;
  if (
    message.includes('at ') ||
    message.includes('webpack') ||
    message.includes('node_modules')
  ) {
    return 'An unexpected error occurred.';
  }
  // Truncate long messages
  if (message.length > 200) {
    return message.slice(0, 200) + '...';
  }
  return message;
}

export function ErrorFallback({ error, onReset }: ErrorFallbackProps) {
  const displayMessage = sanitizeErrorMessage(error);

  return (
    <div className="flex-1 flex items-center justify-center px-4 py-20">
      <div className="text-center max-w-md">
        {/* Warning icon */}
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
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>

        <h2 className="text-xl font-bold text-[var(--text-primary)] mb-2">
          Something went wrong
        </h2>

        <p className="text-sm text-[var(--text-secondary)] mb-6">
          {displayMessage}
        </p>

        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 bg-gold text-[#0E0E0E] font-medium px-6 py-3 rounded-xl hover:bg-gold-light transition-all duration-300"
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
            Reload
          </button>
          <button
            onClick={onReset}
            className="inline-flex items-center gap-2 text-sm text-gold border border-gold/20 px-5 py-3 rounded-xl hover:bg-gold/10 transition-all duration-300"
          >
            Try Again
          </button>
          <a
            href="/"
            className="inline-flex items-center gap-2 text-sm text-[var(--text-muted)] hover:text-gold transition-colors"
          >
            Go Home
          </a>
        </div>

        {/* Decorative gold line */}
        <div className="mt-10 mx-auto w-24 h-0.5 bg-gold-gradient rounded-full opacity-50" />
      </div>
    </div>
  );
}
