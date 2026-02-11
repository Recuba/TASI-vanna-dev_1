'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/providers/LanguageProvider';

interface ErrorDisplayProps {
  message: string;
  onRetry?: () => void;
  className?: string;
}

/**
 * Parse the error message to extract the HTTP status code (if present).
 * ApiError messages follow the format: "[API_ERROR:<status>] ..."
 */
function parseErrorStatus(message: string): number | null {
  const match = message.match(/^\[API_ERROR:(\d+)\]/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Returns a user-friendly bilingual error message based on the error string.
 */
function getUserFriendlyMessage(
  message: string,
  t: (ar: string, en: string) => string,
): string {
  const status = parseErrorStatus(message);

  if (status !== null) {
    if (status >= 500) {
      return t(
        '\u062A\u0639\u0630\u0631 \u062A\u062D\u0645\u064A\u0644 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A. \u0642\u062F \u062A\u0643\u0648\u0646 \u062E\u0648\u0627\u062F\u0645\u0646\u0627 \u063A\u064A\u0631 \u0645\u062A\u0627\u062D\u0629 \u0645\u0624\u0642\u062A\u0627\u064B.',
        'Unable to load data. Our servers may be temporarily unavailable.',
      );
    }
    if (status === 404) {
      return t(
        '\u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629.',
        'Data not found.',
      );
    }
    if (status === 401 || status === 403) {
      return t(
        '\u063A\u064A\u0631 \u0645\u0635\u0631\u062D \u0628\u0627\u0644\u0648\u0635\u0648\u0644.',
        'Access not authorized.',
      );
    }
    // Other HTTP errors (4xx, etc.)
    return t(
      '\u062D\u062F\u062B \u062E\u0637\u0623 \u0645\u0627.',
      'Something went wrong.',
    );
  }

  // Network / fetch errors (no status code)
  const lower = message.toLowerCase();
  if (
    lower.includes('fetch') ||
    lower.includes('network') ||
    lower.includes('failed to fetch') ||
    lower.includes('err_connection') ||
    lower.includes('timeout') ||
    lower.includes('aborted')
  ) {
    return t(
      '\u062E\u0637\u0623 \u0641\u064A \u0627\u0644\u0627\u062A\u0635\u0627\u0644. \u064A\u0631\u062C\u0649 \u0627\u0644\u062A\u062D\u0642\u0642 \u0645\u0646 \u0627\u0644\u0625\u0646\u062A\u0631\u0646\u062A.',
      'Connection error. Please check your internet.',
    );
  }

  // Fallback for any other unknown error
  return t(
    '\u062D\u062F\u062B \u062E\u0637\u0623 \u0645\u0627.',
    'Something went wrong.',
  );
}

export function ErrorDisplay({ message, onRetry, className }: ErrorDisplayProps) {
  const { t } = useLanguage();
  const [showDetails, setShowDetails] = useState(false);

  const friendlyMessage = getUserFriendlyMessage(message, t);

  return (
    <div className={cn('text-center py-12', className)}>
      <p className="text-sm text-accent-red mb-2">{friendlyMessage}</p>

      {/* Technical detail toggle */}
      {message && (
        <button
          onClick={() => setShowDetails((prev) => !prev)}
          className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors mb-3 underline underline-offset-2"
        >
          {showDetails
            ? t('\u0625\u062E\u0641\u0627\u0621 \u0627\u0644\u062A\u0641\u0627\u0635\u064A\u0644', 'Hide details')
            : t('\u0639\u0631\u0636 \u0627\u0644\u062A\u0641\u0627\u0635\u064A\u0644', 'Show details')}
        </button>
      )}
      {showDetails && (
        <p className="text-[10px] text-[var(--text-muted)] mb-3 max-w-md mx-auto break-all font-mono opacity-60">
          {message}
        </p>
      )}

      {onRetry && (
        <button
          onClick={onRetry}
          className={cn(
            'px-4 py-1.5 rounded-md text-xs font-medium',
            'bg-gold/10 text-gold border border-gold/20',
            'hover:bg-gold/20 transition-colors',
          )}
        >
          {t('\u0625\u0639\u0627\u062F\u0629 \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629', 'Retry')}
        </button>
      )}
    </div>
  );
}
