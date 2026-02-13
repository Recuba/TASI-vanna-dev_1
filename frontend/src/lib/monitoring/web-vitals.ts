/**
 * Web Vitals tracking for Ra'd AI frontend.
 * Tracks LCP, FID, CLS, TTFB, FCP, INP and reports to Sentry + metricsCollector.
 *
 * Usage: Call initWebVitals() once in the root layout or a client component
 * that mounts on every page. Do NOT call multiple times.
 *
 * Example (in a client component imported by layout.tsx):
 *   import { initWebVitals } from '@/lib/monitoring/web-vitals';
 *   useEffect(() => { initWebVitals(); }, []);
 */

import type { Metric } from 'web-vitals';
import * as Sentry from '@sentry/nextjs';
import { metricsCollector } from './metrics-collector';
import type { WebVitalEntry } from './metrics-collector';

function getRating(metric: Metric): 'good' | 'needs-improvement' | 'poor' {
  return metric.rating ?? 'good';
}

function handleMetric(metric: Metric): void {
  // Report to Sentry as custom measurement
  Sentry.metrics.distribution(metric.name, metric.value, {
    unit: metric.name === 'CLS' ? '' : 'millisecond',
    tags: {
      rating: getRating(metric),
    },
  });

  // Store in metrics collector for admin display
  const entry: WebVitalEntry = {
    name: metric.name,
    value: metric.value,
    rating: getRating(metric),
    timestamp: Date.now(),
  };
  metricsCollector.trackWebVital(entry);
}

let initialized = false;

export async function initWebVitals(): Promise<void> {
  if (initialized) return;
  initialized = true;

  const { onCLS, onFCP, onLCP, onTTFB, onINP } = await import('web-vitals');

  onCLS(handleMetric);
  onFCP(handleMetric);
  onLCP(handleMetric);
  onTTFB(handleMetric);
  onINP(handleMetric);
}

/** Get the latest web vitals data for dashboard display */
export function getWebVitalsData(): WebVitalEntry[] {
  return metricsCollector.getMetrics().webVitals;
}
