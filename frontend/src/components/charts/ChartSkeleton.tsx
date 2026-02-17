'use client';

interface ChartSkeletonProps {
  height?: number;
}

export function ChartSkeleton({ height = 400 }: ChartSkeletonProps) {
  return (
    <div
      role="progressbar"
      aria-label="Loading chart"
      aria-busy="true"
      className="relative overflow-hidden rounded-xl dark:bg-dark-card bg-white border border-gold/10"
      style={{ height }}
    >
      {/* Shimmer overlay */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(90deg, transparent 0%, rgba(212, 168, 75, 0.06) 50%, transparent 100%)',
          animation: 'chart-shimmer 1.5s ease-in-out infinite',
        }}
      />

      {/* Toolbar skeleton */}
      <div
        className="flex items-center justify-between px-3 py-2 dark:bg-[#2A2A2A] bg-gray-100 border-b border-gold/10"
      >
        <div className="flex items-center gap-2">
          <div
            className="rounded"
            style={{ width: 48, height: 14, background: 'rgba(212, 168, 75, 0.15)' }}
          />
          <div
            className="rounded"
            style={{ width: 100, height: 10, background: 'rgba(212, 168, 75, 0.08)' }}
          />
        </div>
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="rounded"
              style={{ width: 28, height: 18, background: 'rgba(212, 168, 75, 0.08)' }}
            />
          ))}
        </div>
      </div>

      {/* Chart area skeleton with fake candle hints */}
      <div className="flex items-end justify-center gap-1.5 h-full pb-12 px-8">
        {Array.from({ length: 24 }).map((_, i) => {
          const h = 20 + Math.sin(i * 0.6) * 15 + Math.random() * 20;
          return (
            <div
              key={i}
              className="rounded-sm flex-1 max-w-3"
              style={{
                height: `${h}%`,
                background: 'rgba(212, 168, 75, 0.08)',
                maxHeight: '70%',
              }}
            />
          );
        })}
      </div>

      <style>{`
        @keyframes chart-shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}
