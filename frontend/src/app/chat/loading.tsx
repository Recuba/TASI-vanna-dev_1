'use client';

export default function ChatLoading() {
  return (
    <div className="flex-1 flex flex-col h-[calc(100dvh-128px)] lg:h-[calc(100dvh-64px)]">
      {/* Chat area */}
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 animate-fade-in-up">
          <div className="relative w-12 h-12">
            <div className="absolute inset-0 rounded-full border-2 border-gold/20" />
            <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-gold animate-spin" />
          </div>
          <span className="text-sm text-[var(--text-muted)]">Loading...</span>
        </div>
      </div>

      {/* Input bar skeleton */}
      <div className="border-t border-[#2A2A2A] p-4">
        <div className="max-w-3xl mx-auto">
          <div className="h-12 bg-[var(--bg-input)] rounded-xl animate-pulse" />
        </div>
      </div>
    </div>
  );
}
