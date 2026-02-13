'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { cn } from '@/lib/utils';
import { DataTableHeader, type SortDirection } from './DataTableHeader';

interface DataTableProps {
  columns: string[];
  rows: (string | number | null)[][];
  pageSize?: number;
  className?: string;
}

function compareValues(a: string | number | null, b: string | number | null, dir: SortDirection): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;

  const numA = typeof a === 'number' ? a : parseFloat(String(a));
  const numB = typeof b === 'number' ? b : parseFloat(String(b));

  if (!isNaN(numA) && !isNaN(numB)) {
    return dir === 'asc' ? numA - numB : numB - numA;
  }

  const strA = String(a).toLowerCase();
  const strB = String(b).toLowerCase();
  const cmp = strA.localeCompare(strB);
  return dir === 'asc' ? cmp : -cmp;
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

const PAGE_SIZES = [10, 25, 50, 100];
const VIRTUAL_THRESHOLD = 200;

export function DataTable({ columns, rows, pageSize: initialPageSize = 25, className }: DataTableProps) {
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const parentRef = useRef<HTMLDivElement>(null);

  const onSort = useCallback((col: string) => {
    setSortDirection((prev) => {
      if (sortColumn !== col) return 'asc';
      if (prev === 'asc') return 'desc';
      if (prev === 'desc') return null;
      return 'asc';
    });
    setSortColumn(col);
    setPage(0);
  }, [sortColumn]);

  const onFilterChange = useCallback((col: string, value: string) => {
    setFilters((prev) => ({ ...prev, [col]: value }));
    setPage(0);
  }, []);

  // Filter rows
  const filteredRows = useMemo(() => {
    const activeFilters = Object.entries(filters).filter(([, v]) => v.length > 0);
    if (activeFilters.length === 0) return rows;

    return rows.filter((row) =>
      activeFilters.every(([col, val]) => {
        const colIdx = columns.indexOf(col);
        if (colIdx === -1) return true;
        const cell = row[colIdx];
        if (cell === null || cell === undefined) return false;
        return String(cell).toLowerCase().includes(val.toLowerCase());
      }),
    );
  }, [rows, filters, columns]);

  // Sort rows
  const sortedRows = useMemo(() => {
    if (!sortColumn || !sortDirection) return filteredRows;
    const colIdx = columns.indexOf(sortColumn);
    if (colIdx === -1) return filteredRows;

    return [...filteredRows].sort((a, b) =>
      compareValues(a[colIdx], b[colIdx], sortDirection),
    );
  }, [filteredRows, sortColumn, sortDirection, columns]);

  // Paginate
  const totalPages = Math.ceil(sortedRows.length / pageSize);
  const pagedRows = useMemo(
    () => sortedRows.slice(page * pageSize, (page + 1) * pageSize),
    [sortedRows, page, pageSize],
  );

  const useVirtual = pagedRows.length > VIRTUAL_THRESHOLD;

  const virtualizer = useVirtualizer({
    count: pagedRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 10,
    enabled: useVirtual,
  });

  if (!columns || columns.length === 0) return null;

  const renderRow = (row: (string | number | null)[], rowIdx: number, style?: React.CSSProperties) => (
    <tr
      key={rowIdx}
      className={cn(
        'border-b border-[#2A2A2A]',
        'hover:bg-gold/5 transition-colors',
        rowIdx % 2 === 1 && 'bg-[#1A1A1A]/50',
      )}
      style={style}
    >
      <td className="px-3 py-2 text-[#707070] text-xs whitespace-nowrap">
        {page * pageSize + rowIdx + 1}
      </td>
      {row.map((cell, cellIdx) => (
        <td key={cellIdx} className="px-3 py-2 text-[#B0B0B0] whitespace-nowrap text-sm">
          {cell !== null && cell !== undefined ? String(cell) : '-'}
        </td>
      ))}
    </tr>
  );

  return (
    <div className={cn('rounded-xl border border-gold/20 overflow-hidden bg-[#1A1A1A]', className)}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#2A2A2A] border-b border-gold/10">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters((p) => !p)}
            className={cn(
              'px-2 py-1 text-xs rounded transition-colors',
              showFilters ? 'bg-gold/20 text-gold' : 'text-[#B0B0B0] hover:text-gold hover:bg-gold/10',
            )}
          >
            Filter
          </button>
          <span className="text-xs text-[#707070]">
            {filteredRows.length} of {rows.length} rows
          </span>
        </div>
        <button
          onClick={() => exportCSV(columns, sortedRows)}
          className="p-1.5 rounded text-[#B0B0B0] hover:text-gold hover:bg-gold/10 transition-colors"
          title="Export CSV"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </button>
      </div>

      {/* Table */}
      <div ref={parentRef} className="overflow-x-auto max-h-[500px] overflow-y-auto">
        <table className="w-full text-sm">
          <DataTableHeader
            columns={columns}
            sortColumn={sortColumn}
            sortDirection={sortDirection}
            onSort={onSort}
            onFilterChange={onFilterChange}
            filters={filters}
            showFilters={showFilters}
          />
          <tbody>
            {useVirtual ? (
              <>
                {virtualizer.getVirtualItems().map((virtualRow) => {
                  const row = pagedRows[virtualRow.index];
                  return renderRow(row, virtualRow.index, {
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start - (virtualizer.getVirtualItems()[0]?.start ?? 0)}px)`,
                  });
                })}
              </>
            ) : (
              pagedRows.map((row, idx) => renderRow(row, idx))
            )}
          </tbody>
        </table>
      </div>

      {/* Footer / pagination */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#2A2A2A] border-t border-gold/10 text-xs text-[#707070]">
        <div className="flex items-center gap-2">
          <span>Rows per page:</span>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(0);
            }}
            className="bg-[#1A1A1A] border border-gold/10 rounded px-1 py-0.5 text-[#B0B0B0] text-xs"
          >
            {PAGE_SIZES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span>
            Page {page + 1} of {Math.max(totalPages, 1)}
          </span>
          <button
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
            className="px-2 py-1 rounded disabled:opacity-30 hover:bg-gold/10 transition-colors"
          >
            Prev
          </button>
          <button
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => p + 1)}
            className="px-2 py-1 rounded disabled:opacity-30 hover:bg-gold/10 transition-colors"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
