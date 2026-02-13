'use client';

function SkeletonCard() {
  return (
    <div className="p-5 rounded-md bg-[var(--bg-card)] border border-[#2A2A2A] animate-pulse flex gap-4">
      <div className="flex-1 space-y-3">
        <div className="h-5 bg-[var(--bg-input)] rounded w-3/4" />
        <div className="space-y-2">
          <div className="h-3 bg-[var(--bg-input)] rounded w-full" />
          <div className="h-3 bg-[var(--bg-input)] rounded w-5/6" />
          <div className="h-3 bg-[var(--bg-input)] rounded w-2/3" />
        </div>
        <div className="flex items-center gap-3">
          <div className="h-5 bg-[var(--bg-input)] rounded-full w-16" />
          <div className="h-3 bg-[var(--bg-input)] rounded w-20" />
        </div>
      </div>
      <div className="w-10 h-10 bg-[var(--bg-input)] rounded-full shrink-0" />
    </div>
  );
}

export default function NewsLoading() {
  return (
    <div className="flex-1 px-4 sm:px-6 py-4 overflow-y-auto">
      <div className="max-w-content-lg mx-auto space-y-5">
        {/* Header skeleton */}
        <div>
          <div className="h-6 w-36 bg-[var(--bg-input)] rounded animate-pulse" />
          <div className="h-4 w-56 bg-[var(--bg-input)] rounded animate-pulse mt-2" />
        </div>

        {/* Search skeleton */}
        <div className="h-10 bg-[var(--bg-input)] rounded-lg animate-pulse" />

        {/* Filter chips skeleton */}
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-8 w-16 bg-[var(--bg-input)] rounded-full animate-pulse" />
          ))}
        </div>

        {/* Article skeletons */}
        <div className="space-y-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    </div>
  );
}
