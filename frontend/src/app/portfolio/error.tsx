'use client';

export default function PortfolioError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center space-y-3">
        <p className="text-lg font-bold text-[var(--text-primary)]">Something went wrong</p>
        <p className="text-sm text-[var(--text-muted)]">{error.message}</p>
        <button onClick={reset} className="px-4 py-2 bg-gold/20 text-gold rounded-lg text-sm font-medium hover:bg-gold/30 transition-colors">
          Try again
        </button>
      </div>
    </div>
  );
}
