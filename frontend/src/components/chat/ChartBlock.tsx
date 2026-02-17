'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { cn } from '@/lib/utils';
import type { SSEChartData } from '@/lib/types';
import { useLanguage } from '@/providers/LanguageProvider';

// Plotly must be loaded client-side only (no SSR)
const Plot = dynamic(() => import('react-plotly.js'), { ssr: false });

interface ChartBlockProps {
  data: SSEChartData;
}

export function ChartBlock({ data }: ChartBlockProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [chartHeight, setChartHeight] = useState(400);
  const { t } = useLanguage();

  // Responsive chart height
  useEffect(() => {
    function updateHeight() {
      if (typeof window === 'undefined') return;
      const vh = window.innerHeight;
      setChartHeight(Math.min(400, Math.max(250, Math.floor(vh * 0.5))));
    }
    updateHeight();
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, []);

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
    <>
      <div ref={containerRef} className="relative rounded-md border gold-border overflow-hidden bg-[var(--bg-card)] group">
        {/* Action buttons */}
        <div className={cn(
          'absolute top-2 start-2 z-10 flex items-center gap-1',
          'opacity-0 group-hover:opacity-100 transition-all duration-200'
        )}>
          {/* Download button */}
          <button
            onClick={handleDownload}
            disabled={downloading}
            className={cn(
              'p-1.5 rounded-md',
              'bg-[var(--bg-card)]/80 backdrop-blur-sm',
              'border border-[var(--bg-input)]',
              'text-[var(--text-muted)] hover:text-gold hover:border-gold/40',
              'transition-all duration-200',
              'disabled:opacity-50'
            )}
            title={t('تحميل الرسم البياني', 'Download chart')}
            aria-label={t('تحميل الرسم البياني', 'Download chart')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          </button>
          {/* Fullscreen button */}
          <button
            onClick={() => setIsFullscreen(true)}
            className={cn(
              'p-1.5 rounded-md',
              'bg-[var(--bg-card)]/80 backdrop-blur-sm',
              'border border-[var(--bg-input)]',
              'text-[var(--text-muted)] hover:text-gold hover:border-gold/40',
              'transition-all duration-200'
            )}
            title={t('عرض بملء الشاشة', 'Fullscreen')}
            aria-label={t('عرض بملء الشاشة', 'Fullscreen')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 3 21 3 21 9" />
              <polyline points="9 21 3 21 3 15" />
              <line x1="21" y1="3" x2="14" y2="10" />
              <line x1="3" y1="21" x2="10" y2="14" />
            </svg>
          </button>
        </div>

        <Plot
          data={plotData}
          layout={plotLayout}
          config={{
            responsive: true,
            displayModeBar: true,
            modeBarButtonsToRemove: ['lasso2d', 'select2d'],
            displaylogo: false,
          }}
          style={{ width: '100%', height: `${chartHeight}px` }}
          useResizeHandler
        />
      </div>

      {/* Fullscreen modal */}
      {isFullscreen && (
        <ChartFullscreenModal
          plotData={plotData}
          plotLayout={plotLayout}
          onClose={() => setIsFullscreen(false)}
          t={t}
        />
      )}
    </>
  );
}

function ChartFullscreenModal({
  plotData,
  plotLayout,
  onClose,
  t,
}: {
  plotData: Plotly.Data[];
  plotLayout: Partial<Plotly.Layout>;
  onClose: () => void;
  t: (ar: string, en: string) => string;
}) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [handleKeyDown]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative w-[95vw] h-[90vh] bg-[#0E0E0E] border gold-border rounded-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className={cn(
            'absolute top-3 end-3 z-10',
            'p-2 rounded-lg',
            'bg-[var(--bg-card)] border border-[var(--bg-input)]',
            'text-[var(--text-muted)] hover:text-gold hover:border-gold/40',
            'transition-all duration-200'
          )}
          title={t('إغلاق', 'Close')}
          aria-label={t('إغلاق', 'Close')}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
        <Plot
          data={plotData}
          layout={{
            ...plotLayout,
            margin: { t: 60, r: 40, b: 80, l: 80 },
          }}
          config={{
            responsive: true,
            displayModeBar: true,
            modeBarButtonsToRemove: ['lasso2d', 'select2d'],
            displaylogo: false,
          }}
          style={{ width: '100%', height: '100%' }}
          useResizeHandler
        />
      </div>
    </div>
  );
}
