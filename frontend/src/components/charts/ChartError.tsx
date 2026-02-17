'use client';

interface ChartErrorProps {
  message?: string;
  onRetry?: () => void;
  height?: number;
}

export function ChartError({
  message = 'Failed to load chart data',
  onRetry,
  height = 400,
}: ChartErrorProps) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-4 rounded-xl dark:bg-dark-card bg-white border border-gold/30"
      style={{
        height,
        animation: 'chart-fade-in 0.4s ease-out',
      }}
    >
      <svg
        width="36"
        height="36"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#D4A84B"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <p className="text-sm" style={{ color: '#B0B0B0' }}>{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          aria-label="Retry loading chart data"
          className="px-4 py-1.5 text-xs font-medium rounded-md border transition-all duration-200 hover:bg-[rgba(212,168,75,0.1)]"
          style={{
            border: '1px solid #D4A84B',
            background: 'transparent',
            color: '#D4A84B',
            cursor: 'pointer',
          }}
        >
          Retry
        </button>
      )}
      <style>{`
        @keyframes chart-fade-in {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
