'use client';

import { cn } from '@/lib/utils';

interface LoadingSpinnerProps {
  message?: string;
  className?: string;
}

export function LoadingSpinner({ message, className }: LoadingSpinnerProps) {
  return (
    <div className={cn('flex items-center justify-center py-12', className)}>
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 bg-gold rounded-full animate-gold-pulse" />
        {message && (
          <span className="text-sm text-[var(--text-muted)]">{message}</span>
        )}
      </div>
    </div>
  );
}
