'use client';

import { cn } from '@/lib/utils';

export type SortDirection = 'asc' | 'desc' | null;

interface DataTableHeaderProps {
  columns: string[];
  sortColumn: string | null;
  sortDirection: SortDirection;
  onSort: (column: string) => void;
  onFilterChange: (column: string, value: string) => void;
  filters: Record<string, string>;
  showFilters: boolean;
}

function SortArrow({ direction }: { direction: SortDirection }) {
  if (!direction) {
    return (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-30">
        <path d="M12 5v14M5 12l7 7 7-7" />
      </svg>
    );
  }
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={cn('transition-transform', direction === 'asc' && 'rotate-180')}
    >
      <path d="M12 5v14M5 12l7 7 7-7" />
    </svg>
  );
}

export function DataTableHeader({
  columns,
  sortColumn,
  sortDirection,
  onSort,
  onFilterChange,
  filters,
  showFilters,
}: DataTableHeaderProps) {
  return (
    <thead className="sticky top-0 z-10">
      <tr className="bg-[#2A2A2A]">
        <th scope="col" className="px-3 py-2 text-start text-xs font-medium text-[#707070] border-b border-gold/20 whitespace-nowrap w-10">
          #
        </th>
        {columns.map((col) => (
          <th
            key={col}
            scope="col"
            tabIndex={0}
            aria-sort={sortColumn === col ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
            className={cn(
              'px-3 py-2 text-start text-xs font-medium',
              'text-gold uppercase tracking-wider',
              'border-b border-gold/20 whitespace-nowrap',
              'cursor-pointer select-none hover:bg-gold/5 transition-colors',
            )}
            onClick={() => onSort(col)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSort(col);
              }
            }}
          >
            <div className="flex items-center gap-1">
              <span>{col}</span>
              <SortArrow direction={sortColumn === col ? sortDirection : null} />
            </div>
          </th>
        ))}
      </tr>
      {showFilters && (
        <tr className="bg-[#1A1A1A]">
          <td className="px-3 py-1 border-b border-gold/10" />
          {columns.map((col) => (
            <td key={`filter-${col}`} className="px-2 py-1 border-b border-gold/10">
              <input
                type="text"
                placeholder="Filter..."
                value={filters[col] ?? ''}
                onChange={(e) => onFilterChange(col, e.target.value)}
                className="w-full px-2 py-1 text-xs bg-[#2A2A2A] border border-gold/10 rounded text-white placeholder:text-[#707070] focus:outline-none focus:border-gold/40"
              />
            </td>
          ))}
        </tr>
      )}
    </thead>
  );
}
