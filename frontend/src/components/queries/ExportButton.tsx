'use client';

import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { exportToCsv, exportToExcel, exportToPdf } from '@/lib/export/exporters';
import type { QueryResults } from '@/types/queries';

interface ExportButtonProps {
  data: QueryResults;
  title?: string;
  className?: string;
}

type ExportFormat = 'csv' | 'excel' | 'pdf';

export function ExportButton({ data, title, className }: ExportButtonProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState<ExportFormat | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleExport = async (format: ExportFormat) => {
    setLoading(format);
    try {
      switch (format) {
        case 'csv':
          exportToCsv(data);
          break;
        case 'excel':
          await exportToExcel(data);
          break;
        case 'pdf':
          await exportToPdf(data, title);
          break;
      }
    } catch {
      // Export failed silently
    } finally {
      setLoading(null);
      setOpen(false);
    }
  };

  const formats: { key: ExportFormat; label: string; icon: string }[] = [
    { key: 'csv', label: 'CSV', icon: 'M14 3v4a1 1 0 0 0 1 1h4' },
    { key: 'excel', label: 'Excel', icon: 'M14 3v4a1 1 0 0 0 1 1h4' },
    { key: 'pdf', label: 'PDF', icon: 'M14 3v4a1 1 0 0 0 1 1h4' },
  ];

  if (!data.columns.length || !data.rows.length) return null;

  return (
    <div ref={dropdownRef} className={cn('relative inline-block', className)}>
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all',
          'bg-[var(--bg-card)] border gold-border',
          'text-[var(--text-secondary)] hover:text-gold hover:border-gold',
          open && 'border-gold text-gold'
        )}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        Export
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={cn('transition-transform', open && 'rotate-180')}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="absolute end-0 top-full mt-1 z-20 min-w-[140px] bg-[var(--bg-card)] border gold-border rounded-lg shadow-xl overflow-hidden animate-slide-down">
          {formats.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => handleExport(key)}
              disabled={loading !== null}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 text-xs text-start',
                'text-[var(--text-secondary)] hover:bg-gold/10 hover:text-gold',
                'disabled:opacity-50 transition-colors'
              )}
            >
              {loading === key ? (
                <div className="w-3.5 h-3.5 border-2 border-gold/30 border-t-gold rounded-full animate-spin" />
              ) : (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              )}
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
