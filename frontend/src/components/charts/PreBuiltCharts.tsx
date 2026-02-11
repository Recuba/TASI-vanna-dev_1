'use client';

import { useEffect, useState, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChartDataPoint {
  label: string;
  value: number;
}

interface ChartResponse {
  chart_type: string;
  title: string;
  data: ChartDataPoint[];
}

interface ChartCardConfig {
  endpoint: string;
  titleAr: string;
  suffix?: string;
  color: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

const CHART_CONFIGS: ChartCardConfig[] = [
  {
    endpoint: '/api/charts/sector-market-cap',
    titleAr: 'القيمة السوقية حسب القطاع',
    suffix: 'SAR',
    color: '#D4A84B',
  },
  {
    endpoint: '/api/charts/top-companies?limit=10',
    titleAr: 'أكبر الشركات',
    suffix: 'SAR',
    color: '#2196F3',
  },
  {
    endpoint: '/api/charts/sector-pe',
    titleAr: 'مكرر الأرباح حسب القطاع',
    suffix: 'x',
    color: '#4CAF50',
  },
  {
    endpoint: '/api/charts/dividend-yield-top?limit=10',
    titleAr: 'أعلى توزيعات أرباح',
    suffix: '%',
    color: '#F44336',
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatLargeNumber(val: number, suffix?: string): string {
  if (suffix === 'SAR') {
    if (val >= 1e12) return (val / 1e12).toFixed(1) + 'T';
    if (val >= 1e9) return (val / 1e9).toFixed(1) + 'B';
    if (val >= 1e6) return (val / 1e6).toFixed(1) + 'M';
    if (val >= 1e3) return (val / 1e3).toFixed(1) + 'K';
    return val.toFixed(0);
  }
  if (suffix === '%') return val.toFixed(1) + '%';
  if (suffix === 'x') return val.toFixed(1) + 'x';
  return val.toFixed(1);
}

// ---------------------------------------------------------------------------
// Single chart card
// ---------------------------------------------------------------------------

function BarChartCard({ config }: { config: ChartCardConfig }) {
  const [data, setData] = useState<ChartDataPoint[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}${config.endpoint}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: ChartResponse = await res.json();
      setData(json.data ?? []);
    } catch {
      setError('Failed to load');
    } finally {
      setLoading(false);
    }
  }, [config.endpoint]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const maxVal = data ? Math.max(...data.map((d) => d.value), 1) : 1;

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: '#1A1A1A',
        border: '1px solid #2A2A2A',
      }}
    >
      {/* Card header */}
      <div
        className="px-4 py-3"
        style={{ borderBottom: '1px solid #2A2A2A' }}
        dir="rtl"
      >
        <h3 className="text-sm font-bold text-[var(--text-primary)]">
          {config.titleAr}
        </h3>
      </div>

      {/* Card body */}
      <div className="p-4">
        {loading && (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div
                  className="rounded h-3"
                  style={{
                    width: `${60 - i * 8}%`,
                    background: 'rgba(212,168,75,0.08)',
                  }}
                />
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="flex items-center justify-center py-6">
            <div className="text-center">
              <p className="text-xs text-red-400">{error}</p>
              <button
                onClick={fetchData}
                className="text-xs text-gold hover:text-gold-light mt-1"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {!loading && !error && data && data.length > 0 && (
          <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
            {data.map((item) => {
              const pct = Math.max((item.value / maxVal) * 100, 2);
              return (
                <div key={item.label} className="group">
                  <div className="flex items-center justify-between mb-0.5">
                    <span
                      className="text-[11px] text-[var(--text-secondary)] truncate max-w-[60%]"
                      title={item.label}
                    >
                      {item.label}
                    </span>
                    <span className="text-[11px] font-medium text-[var(--text-primary)] shrink-0 ml-2">
                      {formatLargeNumber(item.value, config.suffix)}
                    </span>
                  </div>
                  <div
                    className="h-[6px] rounded-full overflow-hidden"
                    style={{ background: 'rgba(212,168,75,0.06)' }}
                  >
                    <div
                      className="h-full rounded-full transition-all duration-700 ease-out"
                      style={{
                        width: `${pct}%`,
                        background: config.color,
                        opacity: 0.85,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!loading && !error && data && data.length === 0 && (
          <p className="text-xs text-[var(--text-muted)] text-center py-6">
            No data available
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main grid component
// ---------------------------------------------------------------------------

export default function PreBuiltCharts() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {CHART_CONFIGS.map((config) => (
        <BarChartCard key={config.endpoint} config={config} />
      ))}
    </div>
  );
}
