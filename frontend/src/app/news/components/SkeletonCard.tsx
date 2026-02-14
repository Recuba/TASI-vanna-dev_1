'use client';

export function SkeletonCard() {
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
