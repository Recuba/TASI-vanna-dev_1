'use client';

/**
 * Reusable skeleton loading components for lazy-loaded sections.
 * All follow the dark-gold Ra'd AI theme.
 */

export { ChartSkeleton } from '@/components/charts/ChartSkeleton';

// ---------------------------------------------------------------------------
// Shared shimmer class from globals.css: .animate-shimmer
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// TableSkeleton
// ---------------------------------------------------------------------------

interface TableSkeletonProps {
  rows?: number;
  columns?: number;
}

export function TableSkeleton({ rows = 8, columns = 5 }: TableSkeletonProps) {
  return (
    <div
      role="progressbar"
      aria-label="Loading table"
      aria-busy="true"
      className="relative overflow-hidden rounded-xl"
      style={{
        border: '1px solid rgba(212, 168, 75, 0.1)',
        background: '#1A1A1A',
      }}
    >
      <div className="absolute inset-0 animate-shimmer" />

      {/* Header row */}
      <div
        className="flex items-center gap-4 px-4 py-3"
        style={{
          background: '#2A2A2A',
          borderBottom: '1px solid rgba(212, 168, 75, 0.1)',
        }}
      >
        {Array.from({ length: columns }).map((_, i) => (
          <div
            key={`h-${i}`}
            className="rounded flex-1"
            style={{
              height: 12,
              background: 'rgba(212, 168, 75, 0.15)',
            }}
          />
        ))}
      </div>

      {/* Data rows */}
      {Array.from({ length: rows }).map((_, row) => (
        <div
          key={`r-${row}`}
          className="flex items-center gap-4 px-4 py-3"
          style={{
            borderBottom: '1px solid rgba(212, 168, 75, 0.05)',
          }}
        >
          {Array.from({ length: columns }).map((_, col) => (
            <div
              key={`c-${col}`}
              className="rounded flex-1"
              style={{
                height: 10,
                background:
                  col === 0
                    ? 'rgba(212, 168, 75, 0.12)'
                    : 'rgba(212, 168, 75, 0.06)',
              }}
            />
          ))}
        </div>
      ))}

    </div>
  );
}

// ---------------------------------------------------------------------------
// DashboardSkeleton
// ---------------------------------------------------------------------------

export function DashboardSkeleton() {
  return (
    <div
      role="progressbar"
      aria-label="Loading dashboard"
      aria-busy="true"
      className="relative space-y-4"
    >
      {/* Stat cards row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={`stat-${i}`}
            className="relative overflow-hidden rounded-xl p-4"
            style={{
              background: '#1A1A1A',
              border: '1px solid rgba(212, 168, 75, 0.1)',
            }}
          >
            <div className="absolute inset-0 animate-shimmer" />
            <div
              className="rounded mb-2"
              style={{
                width: 80,
                height: 10,
                background: 'rgba(212, 168, 75, 0.1)',
              }}
            />
            <div
              className="rounded"
              style={{
                width: 60,
                height: 20,
                background: 'rgba(212, 168, 75, 0.15)',
              }}
            />
          </div>
        ))}
      </div>

      {/* Chart placeholder */}
      <div
        className="relative overflow-hidden rounded-xl"
        style={{
          height: 300,
          background: '#1A1A1A',
          border: '1px solid rgba(212, 168, 75, 0.1)',
        }}
      >
        <div className="absolute inset-0 animate-shimmer" />
        <div className="flex items-end justify-center gap-2 h-full pb-8 px-8">
          {Array.from({ length: 12 }).map((_, i) => {
            const h = 30 + Math.sin(i * 0.8) * 20;
            return (
              <div
                key={`bar-${i}`}
                className="rounded-sm flex-1"
                style={{
                  height: `${h}%`,
                  background: 'rgba(212, 168, 75, 0.08)',
                  maxHeight: '70%',
                }}
              />
            );
          })}
        </div>
      </div>

      {/* Table placeholder */}
      <TableSkeleton rows={5} columns={4} />

    </div>
  );
}
