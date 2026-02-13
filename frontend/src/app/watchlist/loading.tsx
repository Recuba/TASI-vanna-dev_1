'use client';

export default function WatchlistLoading() {
  return (
    <div className="flex-1 px-4 sm:px-6 py-4 overflow-y-auto">
      <div className="max-w-content-lg mx-auto space-y-4">
        {/* Header skeleton */}
        <div className="flex items-center justify-between">
          <div>
            <div className="h-6 w-36 bg-[var(--bg-input)] rounded animate-pulse" />
            <div className="h-4 w-52 bg-[var(--bg-input)] rounded animate-pulse mt-2" />
          </div>
          <div className="h-8 w-24 bg-[var(--bg-input)] rounded-md animate-pulse" />
        </div>

        {/* Tab chips skeleton */}
        <div className="flex gap-2 flex-wrap">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-8 w-24 bg-[var(--bg-input)] rounded-full animate-pulse" />
          ))}
        </div>

        {/* Add ticker skeleton */}
        <div className="flex gap-2">
          <div className="flex-1 h-9 bg-[var(--bg-input)] rounded-md animate-pulse" />
          <div className="h-9 w-16 bg-[var(--bg-input)] rounded-md animate-pulse" />
        </div>

        {/* Table skeleton */}
        <div className="bg-[var(--bg-card)] border border-[rgba(212,168,75,0.15)] rounded-md overflow-hidden">
          <div className="bg-[var(--bg-input)] h-9" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 px-3 py-2.5 border-t border-[var(--bg-input)]"
            >
              <div className="h-4 w-16 bg-[var(--bg-input)] rounded animate-pulse" />
              <div className="h-4 w-24 bg-[var(--bg-input)] rounded animate-pulse hidden sm:block" />
              <div className="h-4 w-16 bg-[var(--bg-input)] rounded animate-pulse hidden sm:block" />
              <div className="h-4 w-12 bg-[var(--bg-input)] rounded animate-pulse ml-auto" />
              <div className="h-4 w-14 bg-[var(--bg-input)] rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
