'use client';

import { useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { cn } from '@/lib/utils';
import type { SSEChartData } from '@/lib/types';

// Plotly must be loaded client-side only (no SSR)
const Plot = dynamic(() => import('react-plotly.js'), { ssr: false });

interface ChartBlockProps {
  data: SSEChartData;
}

export function ChartBlock({ data }: ChartBlockProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

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

  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      // Find the plotly div inside the container
      const plotDiv = containerRef.current?.querySelector('.js-plotly-plot') as HTMLElement | null;
      if (plotDiv && typeof window !== 'undefined') {
        // Access Plotly from the global scope (loaded by react-plotly.js)
        const Plotly = (window as unknown as Record<string, unknown>).Plotly as {
          downloadImage: (el: HTMLElement, opts: Record<string, unknown>) => Promise<void>;
        } | undefined;
        if (Plotly?.downloadImage) {
          const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
          await Plotly.downloadImage(plotDiv, {
            format: 'png',
            width: 1200,
            height: 600,
            filename: `raid_ai_chart_${timestamp}`,
          });
        }
      }
    } catch {
      // Silently fail if download not available
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div ref={containerRef} className="relative rounded-md border gold-border overflow-hidden bg-[var(--bg-card)] group">
      {/* Download button */}
      <button
        onClick={handleDownload}
        disabled={downloading}
        className={cn(
          'absolute top-2 left-2 z-10',
          'p-1.5 rounded-md',
          'bg-[var(--bg-card)]/80 backdrop-blur-sm',
          'border border-[var(--bg-input)]',
          'text-[var(--text-muted)] hover:text-gold hover:border-gold/40',
          'opacity-0 group-hover:opacity-100',
          'transition-all duration-200',
          'disabled:opacity-50'
        )}
        title="تحميل الرسم البياني"
        aria-label="تحميل الرسم البياني"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
      </button>

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
