'use client';

function ShimmerOverlay({ delay = 0 }: { delay?: number }) {
  return (
    <div
      className="absolute inset-0 bg-gradient-to-r from-transparent via-[rgba(212,168,75,0.05)] to-transparent"
      style={{
        animation: 'shimmer 2s ease-in-out infinite',
        animationDelay: `${delay}ms`,
      }}
    />
  );
}

export function SkeletonCard({ index = 0 }: { index?: number }) {
  const delay = index * 150;

  return (
    <div
      className="relative overflow-hidden rounded-md bg-[var(--bg-card)] border border-[#2A2A2A]"
      style={{
        borderInlineEndWidth: '4px',
        borderInlineEndColor: 'var(--bg-input)',
      }}
    >
      <div className="p-5 flex gap-4">
        {/* Main content area */}
        <div className="flex-1 min-w-0 space-y-3">
          {/* Sentiment badge placeholder */}
          <div className="flex items-center justify-between">
            <div className="h-4 bg-[var(--bg-input)] rounded-full w-14" />
            <div className="h-4 w-4 bg-[var(--bg-input)] rounded" />
          </div>

          {/* Title placeholder - two lines */}
          <div className="space-y-1.5">
            <div className="h-5 bg-[var(--bg-input)] rounded w-full" />
            <div className="h-5 bg-[var(--bg-input)] rounded w-3/5" />
          </div>

          {/* Body text placeholder */}
          <div className="space-y-1.5">
            <div className="h-3.5 bg-[var(--bg-input)] rounded w-full" />
            <div className="h-3.5 bg-[var(--bg-input)] rounded w-5/6" />
            <div className="h-3.5 bg-[var(--bg-input)] rounded w-2/3" />
          </div>

          {/* Footer: source badge + time + chevron */}
          <div className="flex items-center gap-3 pt-1">
            <div className="h-5 bg-[var(--bg-input)] rounded-full w-16" />
            <div className="h-3 bg-[var(--bg-input)] rounded w-20" />
            <div className="h-3 bg-[var(--bg-input)] rounded w-14" />
            <div className="ms-auto h-4 w-4 bg-[var(--bg-input)] rounded" />
          </div>
        </div>

        {/* Source icon placeholder */}
        <div className="w-10 h-10 bg-[var(--bg-input)] rounded-full shrink-0" />
      </div>

      {/* Shimmer overlay */}
      <ShimmerOverlay delay={delay} />
    </div>
  );
}
