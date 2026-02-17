'use client';

import { cn } from '@/lib/utils';
import { useLanguage } from '@/providers/LanguageProvider';

interface RetryButtonProps {
  onRetry: () => void;
  label?: string;
  isRetrying?: boolean;
  className?: string;
}

export function RetryButton({ onRetry, label, isRetrying = false, className }: RetryButtonProps) {
  const { t } = useLanguage();
  const defaultLabel = t('حاول مجددا\u064B', 'Try Again');

  return (
    <button
      onClick={onRetry}
      disabled={isRetrying}
      className={cn(
        'inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium',
        'bg-gold/10 text-gold border border-gold/20',
        'hover:bg-gold/20 transition-all duration-200',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        className,
      )}
    >
      <svg
        className={cn('w-4 h-4', isRetrying && 'animate-spin')}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <polyline points="1 4 1 10 7 10" />
        <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
      </svg>
      {isRetrying
        ? t('جاري المحاولة...', 'Retrying...')
        : (label || defaultLabel)
      }
    </button>
  );
}
