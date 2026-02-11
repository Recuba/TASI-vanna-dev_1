'use client';

import { cn } from '@/lib/utils';
import type { SSETableData } from '@/lib/types';
import { useLanguage } from '@/providers/LanguageProvider';

interface DataTableProps {
  data: SSETableData;
}

function exportCSV(columns: string[], rows: (string | number | null)[][]) {
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
  // Add BOM for Arabic text support in Excel
  const bom = '\uFEFF';
  const csv = bom + header + '\n' + body;

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
  a.href = url;
  a.download = `raid_ai_results_${timestamp}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function DataTable({ data }: DataTableProps) {
  const { columns, rows } = data;
  const { t } = useLanguage();

  if (!columns || columns.length === 0) return null;

  return (
    <div className="rounded-lg border gold-border overflow-hidden">
      <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="bg-[var(--bg-input)]">
              <th
                className={cn(
                  'px-3 py-2 text-start text-xs font-medium',
                  'text-[var(--text-muted)] border-b gold-border whitespace-nowrap w-10'
                )}
              >
                #
              </th>
              {columns.map((col, i) => (
                <th
                  key={i}
                  className={cn(
                    'px-3 py-2 text-start text-xs font-medium',
                    'text-gold uppercase tracking-wider',
                    'border-b gold-border whitespace-nowrap'
                  )}
                >
                  {col}
                </th>
              ))}
              <th className="px-2 py-2 border-b gold-border w-8">
                <button
                  onClick={() => exportCSV(columns, rows)}
                  className="p-1 rounded text-[var(--text-muted)] hover:text-gold hover:bg-gold/10 transition-colors"
                  title={t('تصدير CSV', 'Export CSV')}
                  aria-label={t('تصدير CSV', 'Export CSV')}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIdx) => (
              <tr
                key={rowIdx}
                className={cn(
                  'border-b border-[var(--bg-input)]',
                  'hover:bg-gold/5 transition-colors',
                  rowIdx % 2 === 1 && 'bg-[var(--bg-input)]/30'
                )}
              >
                <td className="px-3 py-2 text-[var(--text-muted)] text-xs whitespace-nowrap">
                  {rowIdx + 1}
                </td>
                {row.map((cell, cellIdx) => (
                  <td
                    key={cellIdx}
                    className="px-3 py-2 text-[var(--text-secondary)] whitespace-nowrap"
                  >
                    {cell !== null && cell !== undefined ? String(cell) : '-'}
                  </td>
                ))}
                <td className="px-2 py-2" />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--bg-input)] text-xs text-[var(--text-muted)] border-t gold-border">
        <span>{rows.length} {rows.length === 1 ? t('صف', 'row') : t('صفوف', 'rows')}</span>
        <span>{columns.length} {columns.length === 1 ? t('عمود', 'column') : t('أعمدة', 'columns')}</span>
      </div>
    </div>
  );
}
