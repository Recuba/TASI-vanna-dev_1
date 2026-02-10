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
      className="relative overflow-hidden rounded-xl"
      style={{
        height,
        border: '1px solid rgba(212, 168, 75, 0.1)',
        background: '#1A1A1A',
      }}
    >
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(90deg, transparent 0%, rgba(212, 168, 75, 0.06) 50%, transparent 100%)',
          animation: 'chart-shimmer 1.5s ease-in-out infinite',
        }}
      />
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <div
          className="rounded"
          style={{
            width: '60%',
            height: 8,
            background: 'rgba(212, 168, 75, 0.1)',
          }}
        />
        <div
          className="rounded"
          style={{
            width: '40%',
            height: 8,
            background: 'rgba(212, 168, 75, 0.06)',
          }}
        />
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
