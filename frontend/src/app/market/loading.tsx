'use client';

export default function MarketLoading() {
  return (
    <div className="flex-1 px-4 sm:px-6 py-4 overflow-y-auto">
      <div className="max-w-content-lg mx-auto space-y-6">
        {/* Header skeleton */}
        <div>
          <div className="h-6 w-40 bg-[var(--bg-input)] rounded animate-pulse" />
          <div className="h-4 w-56 bg-[var(--bg-input)] rounded animate-pulse mt-2" />
        </div>

        {/* TASI chart skeleton */}
        <div className="bg-[var(--bg-card)] border border-[#2A2A2A] rounded-xl p-4">
          <div className="h-[250px] bg-[#1A1A1A] rounded-lg animate-pulse" />
        </div>

        {/* Search + filter row skeleton */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 h-10 bg-[var(--bg-input)] rounded-xl animate-pulse" />
          <div className="sm:w-56 h-10 bg-[var(--bg-input)] rounded-xl animate-pulse" />
        </div>

        {/* Sector chips skeleton */}
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="h-8 w-20 bg-[var(--bg-input)] rounded-full animate-pulse" />
          ))}
        </div>

        {/* Table skeleton */}
        <div className="bg-[var(--bg-card)] border border-[#2A2A2A] rounded-xl overflow-hidden">
          <div className="bg-[var(--bg-input)] h-10" />
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 px-4 py-3 border-t border-[#2A2A2A]/50"
            >
              <div className="flex-1 space-y-1">
                <div className="h-4 w-32 bg-[var(--bg-input)] rounded animate-pulse" />
                <div className="h-3 w-20 bg-[var(--bg-input)] rounded animate-pulse" />
              </div>
              <div className="h-4 w-16 bg-[var(--bg-input)] rounded animate-pulse" />
              <div className="h-5 w-14 bg-[var(--bg-input)] rounded-full animate-pulse" />
              <div className="h-4 w-16 bg-[var(--bg-input)] rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
