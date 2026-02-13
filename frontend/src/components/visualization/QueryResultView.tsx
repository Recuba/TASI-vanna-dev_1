'use client';

import { useCallback, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { AutoChart } from './AutoChart';
import { DataTable } from './DataTable';
import { ResultToolbar, type ViewMode } from './ResultToolbar';

interface QueryResultViewProps {
  columns: string[];
  rows: (string | number | null)[][];
  sql?: string;
  executionTime?: number;
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  className?: string;
}

function toRecords(columns: string[], rows: (string | number | null)[][]): Record<string, unknown>[] {
  return rows.map((row) => {
    const record: Record<string, unknown> = {};
    columns.forEach((col, i) => {
      record[col] = row[i];
    });
    return record;
  });
}

function LoadingSkeleton() {
  return (
    <div
      role="progressbar"
      aria-label="Loading results"
      aria-busy="true"
      className="relative overflow-hidden rounded-xl min-h-[300px]"
      style={{ background: '#1A1A1A', border: '1px solid rgba(212, 168, 75, 0.1)' }}
    >
      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(90deg, transparent 0%, rgba(212, 168, 75, 0.06) 50%, transparent 100%)',
          animation: 'result-shimmer 1.5s ease-in-out infinite',
        }}
      />
      <div className="flex items-end justify-center gap-2 h-full pb-12 px-8 min-h-[300px]">
        {Array.from({ length: 16 }).map((_, i) => {
          const h = 20 + Math.sin(i * 0.6) * 15 + 10;
          return (
            <div
              key={i}
              className="rounded-sm flex-1 max-w-4"
              style={{ height: `${h}%`, background: 'rgba(212, 168, 75, 0.08)', maxHeight: '70%' }}
            />
          );
        })}
      </div>
      <style>{`
        @keyframes result-shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}

function ErrorDisplay({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center p-8 rounded-xl border border-accent-red/30 bg-[#1A1A1A] min-h-[200px]">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#FF6B6B" strokeWidth="2" className="mb-3">
        <circle cx="12" cy="12" r="10" />
        <line x1="15" y1="9" x2="9" y2="15" />
        <line x1="9" y1="9" x2="15" y2="15" />
      </svg>
      <p className="text-sm text-[#FF6B6B] mb-3 text-center">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-4 py-2 text-xs bg-gold/20 text-gold rounded-lg hover:bg-gold/30 transition-colors"
        >
          Retry
        </button>
      )}
    </div>
  );
}

export function QueryResultView({
  columns,
  rows,
  sql,
  executionTime,
  isLoading,
  error,
  onRetry,
  className,
}: QueryResultViewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [showSql, setShowSql] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const chartData = toRecords(columns, rows);

  const handleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (!isFullscreen) {
      containerRef.current.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
    setIsFullscreen((p) => !p);
  }, [isFullscreen]);

  const handleExport = useCallback(() => {
    const escape = (val: string | number | null) => {
      if (val === null || val === undefined) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };
    const header = columns.map(escape).join(',');
    const body = rows.map((row) => row.map(escape).join(',')).join('\n');
    const csv = '\uFEFF' + header + '\n' + body;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `raid_ai_results_${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [columns, rows]);

  if (isLoading) return <LoadingSkeleton />;
  if (error) return <ErrorDisplay message={error} onRetry={onRetry} />;
  if (!columns || columns.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className={cn(
        'rounded-xl border border-gold/20 overflow-hidden bg-[#0E0E0E]',
        isFullscreen && 'fixed inset-0 z-50 rounded-none',
        className,
      )}
    >
      <ResultToolbar
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onExport={handleExport}
        onFullscreen={handleFullscreen}
        isFullscreen={isFullscreen}
      />

      {/* Query metadata */}
      <div className="flex items-center gap-4 px-3 py-1.5 bg-[#1A1A1A] border-b border-gold/10 text-xs text-[#707070]">
        <span>{rows.length} {rows.length === 1 ? 'row' : 'rows'}</span>
        <span>{columns.length} {columns.length === 1 ? 'column' : 'columns'}</span>
        {executionTime !== undefined && (
          <span>{executionTime.toFixed(0)}ms</span>
        )}
        {sql && (
          <button
            onClick={() => setShowSql((p) => !p)}
            className="text-gold/60 hover:text-gold transition-colors"
          >
            {showSql ? 'Hide SQL' : 'Show SQL'}
          </button>
        )}
      </div>

      {/* Collapsible SQL */}
      {showSql && sql && (
        <div className="px-3 py-2 bg-[#1A1A1A] border-b border-gold/10">
          <pre className="text-xs text-[#B0B0B0] font-mono overflow-x-auto whitespace-pre-wrap">
            {sql}
          </pre>
        </div>
      )}

      {/* Content area */}
      <div className={cn(
        viewMode === 'split' && 'grid grid-cols-1 lg:grid-cols-2 gap-0',
      )}>
        {(viewMode === 'chart' || viewMode === 'split') && (
          <div className={cn('p-4', viewMode === 'split' && 'border-b lg:border-b-0 lg:border-r border-gold/10')}>
            <AutoChart data={chartData} />
          </div>
        )}
        {(viewMode === 'table' || viewMode === 'split') && (
          <div className={viewMode === 'split' ? 'overflow-auto' : 'p-0'}>
            <DataTable columns={columns} rows={rows} />
          </div>
        )}
      </div>
    </div>
  );
}
