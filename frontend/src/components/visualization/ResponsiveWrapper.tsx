'use client';

import { cn } from '@/lib/utils';
import { useBreakpoint, type Breakpoint } from '@/lib/hooks/useBreakpoint';

interface ResponsiveWrapperProps {
  children: React.ReactNode;
  className?: string;
  /** Render prop alternative for breakpoint-specific layouts */
  render?: (breakpoint: Breakpoint) => React.ReactNode;
}

export function ResponsiveWrapper({ children, className, render }: ResponsiveWrapperProps) {
  const breakpoint = useBreakpoint();

  if (render) {
    return <>{render(breakpoint)}</>;
  }

  return (
    <div
      className={cn(
        // Mobile: single column, compact padding
        breakpoint === 'mobile' && 'flex flex-col gap-3 px-2',
        // Tablet: two column grid
        breakpoint === 'tablet' && 'grid grid-cols-2 gap-4 px-4',
        // Desktop: full layout
        breakpoint === 'desktop' && 'grid grid-cols-1 gap-6 px-6',
        className,
      )}
    >
      {children}
    </div>
  );
}
