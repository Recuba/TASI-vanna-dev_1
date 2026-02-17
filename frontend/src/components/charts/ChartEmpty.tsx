'use client';

interface ChartEmptyProps {
  message?: string;
  height?: number;
}

export function ChartEmpty({
  message = 'No data available',
  height = 400,
}: ChartEmptyProps) {
  return (
    <div
      role="status"
      className="flex flex-col items-center justify-center gap-3 rounded-xl dark:bg-dark-card bg-white border border-gold/10"
      style={{
        height,
        animation: 'chart-fade-in 0.4s ease-out',
      }}
    >
      <svg
        width="40"
        height="40"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#404040"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
      <p className="text-sm" style={{ color: '#707070' }}>{message}</p>
      <style>{`
        @keyframes chart-fade-in {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
