'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { RoleGuard } from '@/components/auth/RoleGuard';
import { metricsCollector, type FrontendMetrics } from '@/lib/monitoring/metrics-collector';
import { getHealth, type HealthResponse } from '@/lib/api-client';

function useAutoRefresh<T>(fetcher: (signal: AbortSignal) => Promise<T>, intervalMs: number) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const execute = useCallback(() => {
    if (controllerRef.current) {
      controllerRef.current.abort();
    }
    const controller = new AbortController();
    controllerRef.current = controller;

    setLoading(true);
    fetcher(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setData(result);
          setError(null);
        }
      })
      .catch((err: Error) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (!controller.signal.aborted) setError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
  }, [fetcher]);

  useEffect(() => {
    execute();
    const id = window.setInterval(execute, intervalMs);
    return () => {
      controllerRef.current?.abort();
      window.clearInterval(id);
    };
  }, [execute, intervalMs]);

  return { data, loading, error, refetch: execute };
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={cn(
        'inline-block w-2.5 h-2.5 rounded-full',
        ok ? 'bg-accent-green' : 'bg-accent-red',
      )}
    />
  );
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="p-4 rounded-xl bg-dark-card border border-gold/10">
      <div className="text-xs text-text-muted uppercase tracking-wider mb-1">{label}</div>
      <div className="text-2xl font-bold text-gold">{value}</div>
      {sub && <div className="text-xs text-text-secondary mt-1">{sub}</div>}
    </div>
  );
}

function AdminDashboardContent() {
  const fetchHealth = useCallback(
    (signal: AbortSignal) => getHealth(signal),
    [],
  );
  const fetchReady = useCallback(
    (signal: AbortSignal) =>
      fetch('/health/ready', { signal }).then((r) => r.json()) as Promise<HealthResponse>,
    [],
  );

  const health = useAutoRefresh(fetchHealth, 30_000);
  const ready = useAutoRefresh(fetchReady, 30_000);

  const [metrics, setMetrics] = useState<FrontendMetrics | null>(null);
  useEffect(() => {
    setMetrics(metricsCollector.getMetrics());
    const id = window.setInterval(() => {
      setMetrics(metricsCollector.getMetrics());
    }, 10_000);
    return () => window.clearInterval(id);
  }, []);

  const isHealthy = health.data?.status === 'ok' || health.data?.status === 'healthy';
  const isReady = ready.data?.status === 'ok' || ready.data?.status === 'ready';
  const dbComponent = health.data?.components?.find((c) => c.name === 'database');
  const llmComponent = health.data?.components?.find((c) => c.name === 'llm');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">Admin Dashboard</h1>
        <span className="text-xs text-text-muted">Auto-refresh: 30s</span>
      </div>

      {/* System Health */}
      <section>
        <h2 className="text-sm font-bold text-gold uppercase tracking-wider mb-3">
          System Health
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl bg-dark-card border border-gold/10">
            <div className="flex items-center gap-2 mb-2">
              <StatusDot ok={isHealthy} />
              <span className="text-sm text-white">Health Check</span>
            </div>
            <div className="text-xs text-text-muted">
              {health.loading
                ? 'Checking...'
                : health.error
                  ? `Error: ${health.error}`
                  : `Status: ${health.data?.status ?? 'unknown'}`}
            </div>
          </div>

          <div className="p-4 rounded-xl bg-dark-card border border-gold/10">
            <div className="flex items-center gap-2 mb-2">
              <StatusDot ok={isReady} />
              <span className="text-sm text-white">Readiness</span>
            </div>
            <div className="text-xs text-text-muted">
              {ready.loading
                ? 'Checking...'
                : ready.error
                  ? `Error: ${ready.error}`
                  : `Status: ${ready.data?.status ?? 'unknown'}`}
            </div>
          </div>

          <div className="p-4 rounded-xl bg-dark-card border border-gold/10">
            <div className="flex items-center gap-2 mb-2">
              <StatusDot ok={!health.error && isHealthy} />
              <span className="text-sm text-white">Database</span>
            </div>
            <div className="text-xs text-text-muted">
              {dbComponent?.status ?? 'N/A'}
            </div>
          </div>

          <div className="p-4 rounded-xl bg-dark-card border border-gold/10">
            <div className="flex items-center gap-2 mb-2">
              <StatusDot ok={!health.error && isHealthy} />
              <span className="text-sm text-white">LLM Service</span>
            </div>
            <div className="text-xs text-text-muted">
              {llmComponent?.status ?? 'N/A'}
            </div>
          </div>
        </div>
      </section>

      {/* Usage Stats */}
      <section>
        <h2 className="text-sm font-bold text-gold uppercase tracking-wider mb-3">
          Usage Stats (Session)
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Page Views"
            value={metrics?.pageViews.length ?? 0}
          />
          <StatCard
            label="API Calls"
            value={metrics?.apiCallDurations.length ?? 0}
            sub={
              metrics?.apiCallDurations.length
                ? `Avg: ${Math.round(
                    metrics.apiCallDurations.reduce((s, c) => s + c.duration, 0) /
                      metrics.apiCallDurations.length,
                  )}ms`
                : undefined
            }
          />
          <StatCard
            label="Errors"
            value={metrics?.errorCount ?? 0}
          />
          <StatCard
            label="Session Duration"
            value={
              metrics
                ? `${Math.round(metrics.sessionDuration / 60000)}m`
                : '-'
            }
          />
        </div>
      </section>

      {/* Web Vitals */}
      {metrics?.webVitals && metrics.webVitals.length > 0 && (
        <section>
          <h2 className="text-sm font-bold text-gold uppercase tracking-wider mb-3">
            Web Vitals
          </h2>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {metrics.webVitals.map((vital) => (
              <div key={vital.name} className="p-4 rounded-xl bg-dark-card border border-gold/10">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-text-muted uppercase">{vital.name}</span>
                  <span
                    className={cn(
                      'text-xs px-1.5 py-0.5 rounded',
                      vital.rating === 'good' && 'bg-accent-green/20 text-accent-green',
                      vital.rating === 'needs-improvement' && 'bg-accent-warning/20 text-accent-warning',
                      vital.rating === 'poor' && 'bg-accent-red/20 text-accent-red',
                    )}
                  >
                    {vital.rating}
                  </span>
                </div>
                <div className="text-lg font-bold text-white">
                  {vital.value.toFixed(vital.name === 'CLS' ? 3 : 0)}
                  {vital.name !== 'CLS' && 'ms'}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recent API Calls */}
      {metrics?.apiCallDurations && metrics.apiCallDurations.length > 0 && (
        <section>
          <h2 className="text-sm font-bold text-gold uppercase tracking-wider mb-3">
            Recent API Calls
          </h2>
          <div className="rounded-xl border border-gold/10 overflow-hidden">
            <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-dark-input">
                  <tr>
                    <th className="px-3 py-2 text-start text-xs text-gold uppercase border-b border-gold/10">URL</th>
                    <th className="px-3 py-2 text-start text-xs text-gold uppercase border-b border-gold/10">Status</th>
                    <th className="px-3 py-2 text-start text-xs text-gold uppercase border-b border-gold/10">Duration</th>
                    <th className="px-3 py-2 text-start text-xs text-gold uppercase border-b border-gold/10">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {[...metrics.apiCallDurations].reverse().slice(0, 20).map((call, i) => (
                    <tr key={i} className="border-b border-dark-input hover:bg-gold/5">
                      <td className="px-3 py-2 text-text-secondary text-xs truncate max-w-[300px]">{call.url}</td>
                      <td className="px-3 py-2">
                        <span
                          className={cn(
                            'text-xs',
                            call.status < 400 ? 'text-accent-green' : 'text-accent-red',
                          )}
                        >
                          {call.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-text-secondary">{call.duration.toFixed(0)}ms</td>
                      <td className="px-3 py-2 text-xs text-text-muted">
                        {new Date(call.timestamp).toLocaleTimeString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

export default function AdminPage() {
  return (
    <RoleGuard minimumRole="admin">
      <AdminDashboardContent />
    </RoleGuard>
  );
}
