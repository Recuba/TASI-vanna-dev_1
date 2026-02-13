'use client';

import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ZAxis,
} from 'recharts';

interface VisScatterChartProps {
  data: Record<string, unknown>[];
  title?: string;
  config?: {
    xKey?: string;
    yKey?: string;
    zKey?: string;
  };
}

export function VisScatterChart({ data, title, config }: VisScatterChartProps) {
  if (!data || data.length === 0) return null;

  const numericKeys = Object.keys(data[0]).filter(
    (k) => typeof data[0][k] === 'number',
  );
  const xKey = config?.xKey ?? numericKeys[0];
  const yKey = config?.yKey ?? numericKeys[1] ?? numericKeys[0];
  const zKey = config?.zKey ?? numericKeys[2];

  return (
    <div className="w-full">
      {title && (
        <h3 className="text-sm font-bold text-gold uppercase tracking-wider mb-2">
          {title}
        </h3>
      )}
      <ResponsiveContainer width="100%" height={350}>
        <ScatterChart margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(212, 168, 75, 0.08)" />
          <XAxis
            dataKey={xKey}
            name={xKey}
            stroke="#707070"
            fontSize={12}
            tickLine={false}
          />
          <YAxis
            dataKey={yKey}
            name={yKey}
            stroke="#707070"
            fontSize={12}
            tickLine={false}
          />
          {zKey && <ZAxis dataKey={zKey} name={zKey} range={[40, 400]} />}
          <Tooltip
            contentStyle={{
              backgroundColor: '#1A1A1A',
              border: '1px solid rgba(212, 168, 75, 0.3)',
              borderRadius: '8px',
              color: '#FFFFFF',
              fontSize: 12,
            }}
            cursor={{ strokeDasharray: '3 3' }}
          />
          <Scatter
            data={data}
            fill="#D4AF37"
            fillOpacity={0.7}
          />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
