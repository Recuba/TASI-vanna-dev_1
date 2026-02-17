'use client';

export default function ArticleDetailLoading() {
  return (
    <div className="flex-1 px-4 sm:px-6 py-4 overflow-y-auto">
      <div className="max-w-content-lg mx-auto space-y-5 animate-pulse">
        {/* Breadcrumb skeleton */}
        <div className="flex items-center gap-2">
          <div className="h-4 w-14 bg-[var(--bg-input)] rounded" />
          <div className="h-3 w-3 bg-[var(--bg-input)] rounded" />
          <div className="h-4 w-40 bg-[var(--bg-input)] rounded" />
        </div>

        {/* Badges row skeleton */}
        <div className="flex items-center gap-2">
          <div className="h-6 bg-[var(--bg-input)] rounded-full w-16" />
          <div className="h-6 bg-[var(--bg-input)] rounded-full w-20" />
        </div>

        {/* Title skeleton */}
        <div className="space-y-2">
          <div className="h-8 bg-[var(--bg-input)] rounded w-full" />
          <div className="h-8 bg-[var(--bg-input)] rounded w-3/4" />
        </div>

        {/* Meta row: source badge + date */}
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-[var(--bg-input)] rounded-full" />
          <div className="h-5 bg-[var(--bg-input)] rounded-full w-24" />
          <div className="ms-auto space-y-1.5">
            <div className="h-4 bg-[var(--bg-input)] rounded w-36" />
            <div className="h-3 bg-[var(--bg-input)] rounded w-24" />
          </div>
        </div>

        {/* Divider */}
        <div className="h-px bg-[var(--bg-input)]" />

        {/* Body lines skeleton */}
        <div className="space-y-3">
          <div className="h-5 bg-[var(--bg-input)] rounded w-full" />
          <div className="h-5 bg-[var(--bg-input)] rounded w-full" />
          <div className="h-5 bg-[var(--bg-input)] rounded w-5/6" />
          <div className="h-5 bg-[var(--bg-input)] rounded w-4/6" />
          <div className="h-5 bg-[var(--bg-input)] rounded w-full" />
          <div className="h-5 bg-[var(--bg-input)] rounded w-3/4" />
          <div className="h-5 bg-[var(--bg-input)] rounded w-full" />
          <div className="h-5 bg-[var(--bg-input)] rounded w-2/3" />
        </div>
      </div>
    </div>
  );
}
