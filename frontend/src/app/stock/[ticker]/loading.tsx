'use client';

export default function StockDetailLoading() {
  return (
    <div className="flex-1 px-4 sm:px-6 py-4 overflow-y-auto">
      <div className="max-w-content-lg mx-auto space-y-5 animate-pulse">
        {/* Breadcrumb skeleton */}
        <div className="flex items-center gap-2">
          <div className="h-4 w-12 bg-[var(--bg-input)] rounded" />
          <div className="h-3 w-3 bg-[var(--bg-input)] rounded" />
          <div className="h-4 w-14 bg-[var(--bg-input)] rounded" />
          <div className="h-3 w-3 bg-[var(--bg-input)] rounded" />
          <div className="h-4 w-20 bg-[var(--bg-input)] rounded" />
        </div>

        {/* Company header card skeleton */}
        <div className="bg-[var(--bg-card)] border border-[#2A2A2A] rounded-xl p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-[var(--bg-input)] rounded-full shrink-0" />
              <div className="space-y-2">
                <div className="h-6 w-48 bg-[var(--bg-input)] rounded" />
                <div className="flex items-center gap-2">
                  <div className="h-5 w-20 bg-[var(--bg-input)] rounded-full" />
                  <div className="h-5 w-24 bg-[var(--bg-input)] rounded-full" />
                </div>
              </div>
            </div>
            <div className="text-end space-y-2">
              <div className="h-8 w-28 bg-[var(--bg-input)] rounded" />
              <div className="h-4 w-20 bg-[var(--bg-input)] rounded ms-auto" />
            </div>
          </div>
        </div>

        {/* Price summary grid skeleton */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-[var(--bg-input)] rounded-xl px-4 py-3 space-y-2">
              <div className="h-3 w-20 bg-[#2A2A2A] rounded" />
              <div className="h-5 w-16 bg-[#2A2A2A] rounded" />
            </div>
          ))}
        </div>

        {/* Chart placeholder skeleton */}
        <div className="bg-[var(--bg-card)] border border-[#2A2A2A] rounded-xl p-4">
          <div className="h-5 w-32 bg-[var(--bg-input)] rounded mb-3" />
          <div className="h-[400px] bg-[var(--bg-input)] rounded-lg" />
        </div>

        {/* Metrics grid skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="bg-[var(--bg-card)] border border-[#2A2A2A] rounded-xl p-5 space-y-3">
              <div className="h-4 w-28 bg-[var(--bg-input)] rounded" />
              <div className="grid grid-cols-2 gap-2">
                {Array.from({ length: 4 }).map((_, j) => (
                  <div key={j} className="bg-[var(--bg-input)] rounded-xl px-4 py-3 space-y-2">
                    <div className="h-3 w-16 bg-[#2A2A2A] rounded" />
                    <div className="h-4 w-12 bg-[#2A2A2A] rounded" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
