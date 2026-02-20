'use client';

import { useMemo, useState } from 'react';
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

function compareValues(a: string | number | null, b: string | number | null): number {
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  // Both are numbers
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  // Try numeric comparison for string values that look like numbers
  const numA = Number(a);
  const numB = Number(b);
  if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
  // Fall back to string comparison
  return String(a).localeCompare(String(b));
}

/** Format a numeric cell value with smart formatting. */
function formatNumericCell(num: number, columnName: string): string {
  const colLower = columnName.toLowerCase();
  const isPct = colLower.includes('pct') || colLower.includes('%') || colLower.includes('percent')
    || colLower.includes('yield') || colLower.includes('ratio') || colLower.includes('change');

  if (isPct && Math.abs(num) < 1000) {
    return num.toFixed(2) + '%';
  }

  const abs = Math.abs(num);
  if (abs >= 1_000_000_000) return (num / 1_000_000_000).toFixed(1) + 'B';
  if (abs >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M';
  if (abs >= 1_000) return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (Number.isInteger(num)) return num.toLocaleString();
  return num.toFixed(2);
}

/** Format a cell value with smart number formatting. */
function formatCell(value: string | number | null, columnName: string): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'number') return formatNumericCell(value, columnName);
  if (typeof value === 'string') {
    const num = Number(value);
    if (!isNaN(num) && value.trim() !== '') return formatNumericCell(num, columnName);
    return value;
  }
  return String(value);
}

export function DataTable({ data }: DataTableProps) {
  const { columns, rows } = data;
  const { t } = useLanguage();
  const [sortColumn, setSortColumn] = useState<number | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const sortedRows = useMemo(() => {
    if (sortColumn === null) return rows;
    const colIdx = sortColumn;
    const dir = sortDirection === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => dir * compareValues(a[colIdx], b[colIdx]));
  }, [rows, sortColumn, sortDirection]);

  const handleHeaderClick = (colIdx: number) => {
    if (sortColumn === colIdx) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(colIdx);
      setSortDirection('asc');
    }
  };

  if (!columns || columns.length === 0) return null;

  return (
    <div className="rounded-lg border gold-border overflow-hidden">
      <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="bg-[var(--bg-input)]">
              <th
                scope="col"
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
                  scope="col"
                  tabIndex={0}
                  aria-sort={sortColumn === i ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
                  onClick={() => handleHeaderClick(i)}
                  onKeyDown={(e) => e.key === 'Enter' && handleHeaderClick(i)}
                  className={cn(
                    'px-3 py-2 text-start text-xs font-medium',
                    'uppercase tracking-wider',
                    'border-b gold-border whitespace-nowrap',
                    'cursor-pointer select-none transition-colors',
                    sortColumn === i ? 'text-gold' : 'text-gold/70 hover:text-gold'
                  )}
                >
                  <span className="inline-flex items-center gap-1">
                    {col}
                    {sortColumn === i ? (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                        {sortDirection === 'asc' ? (
                          <polyline points="18 15 12 9 6 15" />
                        ) : (
                          <polyline points="6 9 12 15 18 9" />
                        )}
                      </svg>
                    ) : (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 opacity-0 group-hover:opacity-30">
                        <polyline points="8 9 12 5 16 9" />
                        <polyline points="16 15 12 19 8 15" />
                      </svg>
                    )}
                  </span>
                </th>
              ))}
              <th scope="col" className="px-2 py-2 border-b gold-border w-8">
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
            {sortedRows.map((row, rowIdx) => (
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
                    title={cell !== null && cell !== undefined ? String(cell) : undefined}
                  >
                    {formatCell(cell, columns[cellIdx] ?? '')}
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
