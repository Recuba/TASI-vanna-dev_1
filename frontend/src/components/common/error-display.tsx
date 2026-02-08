'use client';

import { cn } from '@/lib/utils';

interface ErrorDisplayProps {
  message: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorDisplay({ message, onRetry, className }: ErrorDisplayProps) {
  return (
    <div className={cn('text-center py-12', className)}>
      <p className="text-sm text-accent-red mb-3">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className={cn(
            'px-4 py-1.5 rounded-md text-xs font-medium',
            'bg-gold/10 text-gold border border-gold/20',
            'hover:bg-gold/20 transition-colors',
          )}
        >
          Retry
        </button>
      )}
    </div>
  );
}
