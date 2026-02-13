/**
 * Frontend metrics collector for Ra'd AI.
 * Session-scoped (in-memory), no persistence.
 * Used by the SWR middleware and admin dashboard.
 */

export interface WebVitalEntry {
  name: string;
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  timestamp: number;
}

export interface ApiCallEntry {
  url: string;
  duration: number;
  status: number;
  timestamp: number;
}

export interface ErrorEntry {
  message: string;
  context?: string;
  timestamp: number;
}

export interface PageViewEntry {
  path: string;
  timestamp: number;
}

export interface FrontendMetrics {
  pageViews: PageViewEntry[];
  apiCallDurations: ApiCallEntry[];
  errorCount: number;
  errors: ErrorEntry[];
  webVitals: WebVitalEntry[];
  sessionDuration: number;
  sessionStart: number;
}

export class FrontendMetricsCollector {
  private pageViews: PageViewEntry[] = [];
  private apiCalls: ApiCallEntry[] = [];
  private errors: ErrorEntry[] = [];
  private webVitals: WebVitalEntry[] = [];
  private sessionStart: number;

  constructor() {
    this.sessionStart = Date.now();
  }

  trackPageView(path: string): void {
    this.pageViews.push({
      path,
      timestamp: Date.now(),
    });
  }

  trackApiCall(url: string, duration: number, status: number): void {
    this.apiCalls.push({
      url,
      duration,
      status,
      timestamp: Date.now(),
    });
  }

  trackError(error: Error, context?: string): void {
    this.errors.push({
      message: error.message,
      context,
      timestamp: Date.now(),
    });
  }

  trackWebVital(entry: WebVitalEntry): void {
    // Replace existing entry for same metric name
    const existingIndex = this.webVitals.findIndex((v) => v.name === entry.name);
    if (existingIndex >= 0) {
      this.webVitals[existingIndex] = entry;
    } else {
      this.webVitals.push(entry);
    }
  }

  getMetrics(): FrontendMetrics {
    return {
      pageViews: [...this.pageViews],
      apiCallDurations: [...this.apiCalls],
      errorCount: this.errors.length,
      errors: [...this.errors],
      webVitals: [...this.webVitals],
      sessionDuration: Date.now() - this.sessionStart,
      sessionStart: this.sessionStart,
    };
  }
}

/** Singleton instance for use across the application */
export const metricsCollector = new FrontendMetricsCollector();
