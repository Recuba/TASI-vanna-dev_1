/**
 * Monitoring configuration for Ra'd AI frontend.
 * Reads from NEXT_PUBLIC_* environment variables.
 */

export interface MonitoringConfig {
  sentryDsn: string | undefined;
  tracesSampleRate: number;
  enableWebVitals: boolean;
  enableApiMetrics: boolean;
  metricsReportInterval: number;
}

let cachedConfig: MonitoringConfig | null = null;

export function getMonitoringConfig(): MonitoringConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const enabled = process.env.NEXT_PUBLIC_ENABLE_MONITORING !== 'false';

  cachedConfig = {
    sentryDsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 0.1,
    enableWebVitals: enabled,
    enableApiMetrics: enabled,
    metricsReportInterval: 60_000, // 1 minute
  };

  return cachedConfig;
}
