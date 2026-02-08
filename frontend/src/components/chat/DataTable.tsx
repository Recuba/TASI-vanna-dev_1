'use client';

import { cn } from '@/lib/utils';
import type { SSETableData } from '@/lib/types';

interface DataTableProps {
  data: SSETableData;
}

export function DataTable({ data }: DataTableProps) {
  const { columns, rows } = data;

  if (!columns || columns.length === 0) return null;

  return (
    <div className="rounded-md border gold-border overflow-hidden">
      <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="bg-[var(--bg-input)]">
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
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIdx) => (
              <tr
                key={rowIdx}
                className={cn(
                  'border-b border-[var(--bg-input)]',
                  'hover:bg-[var(--bg-card-hover)] transition-colors'
                )}
              >
                {row.map((cell, cellIdx) => (
                  <td
                    key={cellIdx}
                    className="px-3 py-2 text-[var(--text-secondary)] whitespace-nowrap"
                  >
                    {cell !== null && cell !== undefined ? String(cell) : '-'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-3 py-1.5 bg-[var(--bg-input)] text-xs text-[var(--text-muted)] border-t gold-border">
        {rows.length} row{rows.length !== 1 ? 's' : ''}
      </div>
    </div>
  );
}
