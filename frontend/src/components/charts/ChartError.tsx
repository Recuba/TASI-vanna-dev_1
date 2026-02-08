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
      className="flex flex-col items-center justify-center gap-4 rounded-xl"
      style={{
        height,
        border: '1px solid rgba(212, 168, 75, 0.3)',
        background: '#1A1A1A',
      }}
    >
      <svg
        width="32"
        height="32"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#D4A84B"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <p style={{ color: '#B0B0B0', fontSize: 14 }}>{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          style={{
            padding: '6px 16px',
            fontSize: 13,
            borderRadius: 6,
            border: '1px solid #D4A84B',
            background: 'transparent',
            color: '#D4A84B',
            cursor: 'pointer',
            transition: 'background 0.15s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(212, 168, 75, 0.1)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          Retry
        </button>
      )}
    </div>
  );
}
