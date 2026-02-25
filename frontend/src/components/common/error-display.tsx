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
        'تعذر تحميل البيانات. قد تكون خوادمنا غير متاحة مؤقتاً.',
        'Unable to load data. Our servers may be temporarily unavailable.',
      );
    }
    if (status === 404) {
      return t(
        'البيانات غير موجودة.',
        'Data not found.',
      );
    }
    if (status === 401 || status === 403) {
      return t(
        'غير مصرح بالوصول.',
        'Access not authorized.',
      );
    }
    // Other HTTP errors (4xx, etc.)
    return t(
      'حدث خطأ ما.',
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
      'خطأ في الاتصال. يرجى التحقق من الإنترنت.',
      'Connection error. Please check your internet.',
    );
  }

  // Fallback for any other unknown error
  return t(
    'حدث خطأ ما.',
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
          className="text-[13.5px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors mb-3 underline underline-offset-2"
        >
          {showDetails
            ? t('إخفاء التفاصيل', 'Hide details')
            : t('عرض التفاصيل', 'Show details')}
        </button>
      )}
      {showDetails && (
        <p className="text-[13.5px] text-[var(--text-muted)] mb-3 max-w-md mx-auto break-all font-mono opacity-60">
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
          {t('إعادة المحاولة', 'Retry')}
        </button>
      )}
    </div>
  );
}
