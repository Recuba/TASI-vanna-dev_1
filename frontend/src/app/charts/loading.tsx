'use client';

export default function ChartsLoading() {
  return (
    <div className="flex-1 px-4 sm:px-6 lg:px-8 py-4 overflow-y-auto">
      <div className="max-w-[1400px] mx-auto space-y-5">
        {/* Header skeleton */}
        <div>
          <div className="h-6 w-32 bg-[var(--bg-input)] rounded animate-pulse" />
          <div className="h-4 w-56 bg-[var(--bg-input)] rounded animate-pulse mt-2" />
        </div>

        {/* Tab bar skeleton */}
        <div className="flex items-center gap-0 rounded-lg overflow-hidden dark:bg-[#2A2A2A] bg-gray-100 h-10 animate-pulse" />

        {/* Search skeleton */}
        <div className="h-10 bg-[var(--bg-input)] rounded-md animate-pulse" />

        {/* Quick picks skeleton */}
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-8 w-20 bg-[var(--bg-input)] rounded-full animate-pulse" />
          ))}
        </div>

        {/* Chart area skeleton */}
        <div
          className="rounded-xl overflow-hidden"
          style={{
            height: 550,
            border: '1px solid rgba(212, 168, 75, 0.1)',
            background: '#1A1A1A',
          }}
        >
          <div
            className="flex items-center justify-between px-3 py-2"
            style={{ background: '#2A2A2A', borderBottom: '1px solid rgba(212, 168, 75, 0.1)' }}
          >
            <div className="flex items-center gap-2">
              <div className="h-4 w-12 bg-[rgba(212,168,75,0.15)] rounded" />
              <div className="h-3 w-24 bg-[rgba(212,168,75,0.08)] rounded" />
            </div>
            <div className="flex items-center gap-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-5 w-7 bg-[rgba(212,168,75,0.08)] rounded" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
