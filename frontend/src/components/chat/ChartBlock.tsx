'use client';

import dynamic from 'next/dynamic';
import type { SSEChartData } from '@/lib/types';

// Plotly must be loaded client-side only (no SSR)
const Plot = dynamic(() => import('react-plotly.js'), { ssr: false });

interface ChartBlockProps {
  data: SSEChartData;
}

export function ChartBlock({ data }: ChartBlockProps) {
  const plotlyJson = data.plotly_json;
  if (!plotlyJson) return null;

  // Extract data and layout from the Plotly JSON
  const plotData = (plotlyJson.data || []) as Plotly.Data[];
  const plotLayout = {
    ...(plotlyJson.layout || {}),
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'transparent',
    font: { color: '#B0B0B0', family: 'IBM Plex Sans Arabic, sans-serif' },
    margin: { t: 40, r: 20, b: 60, l: 60 },
    xaxis: {
      ...((plotlyJson.layout as Record<string, unknown>)?.xaxis || {}),
      gridcolor: 'rgba(212, 168, 75, 0.1)',
      zerolinecolor: 'rgba(212, 168, 75, 0.2)',
    },
    yaxis: {
      ...((plotlyJson.layout as Record<string, unknown>)?.yaxis || {}),
      gridcolor: 'rgba(212, 168, 75, 0.1)',
      zerolinecolor: 'rgba(212, 168, 75, 0.2)',
    },
  } as Partial<Plotly.Layout>;

  return (
    <div className="rounded-md border gold-border overflow-hidden bg-[var(--bg-card)]">
      <Plot
        data={plotData}
        layout={plotLayout}
        config={{
          responsive: true,
          displayModeBar: true,
          modeBarButtonsToRemove: ['lasso2d', 'select2d'],
          displaylogo: false,
        }}
        style={{ width: '100%', height: '400px' }}
        useResizeHandler
      />
    </div>
  );
}
