'use client';

import { useRef, useState, useEffect } from 'react';
import { MiniSparkline } from '@/components/charts';
import { useMiniChartData } from '@/lib/hooks/use-chart-data';

function SparklineInner({ ticker }: { ticker: string }) {
  const { data, loading, error } = useMiniChartData(ticker);
  if (!data || data.length === 0) {
    if (loading) return <div className="w-[60px] h-[24px] rounded bg-[rgba(212,168,75,0.05)] animate-pulse" />;
    return <span className="text-[var(--text-muted)] text-xs">&mdash;</span>;
  }
  return <MiniSparkline data={data} width={60} height={24} loading={loading} error={error} />;
}

export function LazySparkline({ ticker }: { ticker: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { rootMargin: '100px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={ref} className="min-w-[60px] min-h-[24px] flex items-center justify-end">
      {visible && <SparklineInner ticker={ticker} />}
    </div>
  );
}
