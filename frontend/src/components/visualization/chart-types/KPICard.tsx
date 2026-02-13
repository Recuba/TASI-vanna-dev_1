'use client';

interface KPICardProps {
  data: Record<string, unknown>[];
  title?: string;
  config?: {
    valueKey?: string;
    labelKey?: string;
  };
}

function formatValue(val: unknown): string {
  if (typeof val === 'number') {
    if (Math.abs(val) >= 1_000_000_000) {
      return (val / 1_000_000_000).toFixed(2) + 'B';
    }
    if (Math.abs(val) >= 1_000_000) {
      return (val / 1_000_000).toFixed(2) + 'M';
    }
    if (Math.abs(val) >= 1_000) {
      return (val / 1_000).toFixed(2) + 'K';
    }
    return val.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  return String(val ?? '-');
}

export function KPICard({ data, title, config }: KPICardProps) {
  if (!data || data.length === 0) return null;

  const row = data[0];
  const keys = Object.keys(row);
  const valueKey =
    config?.valueKey ?? keys.find((k) => typeof row[k] === 'number') ?? keys[0];
  const labelKey = config?.labelKey ?? keys.find((k) => k !== valueKey);

  const value = row[valueKey];
  const label = labelKey ? String(row[labelKey] ?? valueKey) : (title ?? valueKey);

  return (
    <div className="flex flex-col items-center justify-center p-6 rounded-xl border border-gold/20 bg-[#1A1A1A] min-h-[200px]">
      {title && (
        <span className="text-xs font-medium text-gold/60 uppercase tracking-wider mb-2">
          {title}
        </span>
      )}
      <span className="text-4xl font-bold text-gold mb-1">{formatValue(value)}</span>
      <span className="text-sm text-[#B0B0B0]">{label}</span>
    </div>
  );
}
