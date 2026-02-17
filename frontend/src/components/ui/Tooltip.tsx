'use client';

import { cn } from '@/lib/utils';

interface TooltipProps {
  text: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  children: React.ReactNode;
}

const positionClasses: Record<string, string> = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
  left: 'right-full top-1/2 -translate-y-1/2 me-2',
  right: 'left-full top-1/2 -translate-y-1/2 ms-2',
};

const arrowClasses: Record<string, string> = {
  top: 'top-full left-1/2 -translate-x-1/2 border-t-[var(--bg-card)] border-x-transparent border-b-transparent',
  bottom: 'bottom-full left-1/2 -translate-x-1/2 border-b-[var(--bg-card)] border-x-transparent border-t-transparent',
  left: 'left-full top-1/2 -translate-y-1/2 border-s-[var(--bg-card)] border-y-transparent border-e-transparent',
  right: 'right-full top-1/2 -translate-y-1/2 border-e-[var(--bg-card)] border-y-transparent border-s-transparent',
};

export function Tooltip({ text, position = 'top', children }: TooltipProps) {
  return (
    <div className="group relative inline-flex">
      {children}
      <span
        role="tooltip"
        className={cn(
          'absolute z-50 pointer-events-none',
          'invisible opacity-0 group-hover:visible group-hover:opacity-100',
          'transition-opacity duration-150',
          'bg-[var(--bg-card)] text-[var(--text-primary)] text-xs',
          'px-2 py-1 rounded-md whitespace-nowrap',
          'border gold-border shadow-lg',
          positionClasses[position],
        )}
      >
        {text}
        <span
          className={cn(
            'absolute w-0 h-0 border-4',
            arrowClasses[position],
          )}
        />
      </span>
    </div>
  );
}
