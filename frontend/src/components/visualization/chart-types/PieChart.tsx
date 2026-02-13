'use client';

import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
} from 'recharts';

interface VisPieChartProps {
  data: Record<string, unknown>[];
  title?: string;
  config?: {
    nameKey?: string;
    valueKey?: string;
  };
}

const COLORS = ['#D4AF37', '#4A9FFF', '#4CAF50', '#FF6B6B', '#FFA726', '#E8C872', '#B8860B', '#9C27B0'];

export function VisPieChart({ data, title, config }: VisPieChartProps) {
  if (!data || data.length === 0) return null;

  const keys = Object.keys(data[0]);
  const nameKey = config?.nameKey ?? keys.find((k) => typeof data[0][k] === 'string') ?? keys[0];
  const valueKey =
    config?.valueKey ?? keys.find((k) => typeof data[0][k] === 'number') ?? keys[1];

  return (
    <div className="w-full">
      {title && (
        <h3 className="text-sm font-bold text-gold uppercase tracking-wider mb-2">
          {title}
        </h3>
      )}
      <ResponsiveContainer width="100%" height={350}>
        <PieChart>
          <Pie
            data={data}
            dataKey={valueKey}
            nameKey={nameKey}
            cx="50%"
            cy="50%"
            outerRadius={120}
            innerRadius={60}
            paddingAngle={2}
            label
            labelLine={{ stroke: '#707070' }}
          >
            {data.map((_, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: '#1A1A1A',
              border: '1px solid rgba(212, 168, 75, 0.3)',
              borderRadius: '8px',
              color: '#FFFFFF',
              fontSize: 12,
            }}
          />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
