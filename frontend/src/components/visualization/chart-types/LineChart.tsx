'use client';

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';

interface VisLineChartProps {
  data: Record<string, unknown>[];
  title?: string;
  config?: {
    xKey?: string;
    yKeys?: string[];
  };
}

const COLORS = ['#D4AF37', '#4A9FFF', '#4CAF50', '#FF6B6B', '#FFA726', '#E8C872'];

export function VisLineChart({ data, title, config }: VisLineChartProps) {
  if (!data || data.length === 0) return null;

  const keys = Object.keys(data[0]);
  const xKey = config?.xKey ?? keys[0];
  const yKeys =
    config?.yKeys ??
    keys.filter(
      (k) => k !== xKey && typeof data[0][k] === 'number',
    );

  return (
    <div className="w-full">
      {title && (
        <h3 className="text-sm font-bold text-gold uppercase tracking-wider mb-2">
          {title}
        </h3>
      )}
      <ResponsiveContainer width="100%" height={350}>
        <LineChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(212, 168, 75, 0.08)" />
          <XAxis
            dataKey={xKey}
            stroke="#707070"
            fontSize={12}
            tickLine={false}
          />
          <YAxis stroke="#707070" fontSize={12} tickLine={false} />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1A1A1A',
              border: '1px solid rgba(212, 168, 75, 0.3)',
              borderRadius: '8px',
              color: '#FFFFFF',
              fontSize: 15.5,
            }}
          />
          {yKeys.length > 1 && <Legend />}
          {yKeys.map((key, i) => (
            <Line
              key={key}
              type="monotone"
              dataKey={key}
              stroke={COLORS[i % COLORS.length]}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: COLORS[i % COLORS.length] }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
