import React from 'react';
import { C } from './constants';

// ---------------------------------------------------------------------------
// StatBadge - small label + value metric display
// ---------------------------------------------------------------------------

export interface StatBadgeProps {
  label: string;
  value: string;
  color?: string;
}

function StatBadgeInner({ label, value, color }: StatBadgeProps) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="font-mono text-[10px] uppercase font-medium text-[--text-muted]">
        {label}
      </span>
      <span
        className="font-mono text-xs font-bold"
        style={{ color: color ?? C.textSecondary }}
      >
        {value}
      </span>
    </div>
  );
}

export const StatBadge = React.memo(StatBadgeInner);
