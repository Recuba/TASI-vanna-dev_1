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
      className="flex flex-col items-center justify-center gap-3 rounded-xl"
      style={{
        height,
        border: '1px solid rgba(212, 168, 75, 0.1)',
        background: '#1A1A1A',
      }}
    >
      <svg
        width="32"
        height="32"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#707070"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
      <p style={{ color: '#707070', fontSize: 14 }}>{message}</p>
    </div>
  );
}
