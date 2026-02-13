'use client';

import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { queryStore } from '@/lib/queries/query-store';
import { QueryHistoryItem } from './QueryHistoryItem';
import type { QueryRecord, QuerySortField, SortDirection } from '@/types/queries';

interface QueryHistoryProps {
  onRerun: (query: string) => void;
  onSave?: (record: QueryRecord) => void;
  className?: string;
}

export function QueryHistory({ onRerun, onSave, className }: QueryHistoryProps) {
  const [records, setRecords] = useState<QueryRecord[]>([]);
  const [searchText, setSearchText] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [sortField, setSortField] = useState<QuerySortField>('executedAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [loading, setLoading] = useState(true);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const results = await queryStore.getHistory(
        { searchText: searchText || undefined, favoritesOnly, sortField, sortDirection },
        100
      );
      setRecords(results);
    } catch {
      // IndexedDB unavailable
    } finally {
      setLoading(false);
    }
  }, [searchText, favoritesOnly, sortField, sortDirection]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  const handleDelete = async (id: string) => {
    await queryStore.deleteQuery(id);
    setRecords((prev) => prev.filter((r) => r.id !== id));
  };

  const handleToggleFavorite = async (id: string) => {
    const updated = await queryStore.toggleFavorite(id);
    if (updated) {
      setRecords((prev) =>
        prev.map((r) => (r.id === id ? { ...r, isFavorite: updated.isFavorite } : r))
      );
    }
  };

  const handleClearAll = async () => {
    await queryStore.clearHistory();
    setRecords([]);
  };

  const toggleSort = (field: QuerySortField) => {
    if (sortField === field) {
      setSortDirection((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <div className="px-3 py-2 border-b gold-border flex items-center justify-between">
        <h3 className="text-sm font-medium text-[var(--text-primary)]">Query History</h3>
        {records.length > 0 && (
          <button
            onClick={handleClearAll}
            className="text-[10px] text-[var(--text-muted)] hover:text-accent-red transition-colors"
          >
            Clear All
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="px-3 py-2 space-y-2 border-b border-[var(--bg-input)]">
        {/* Search */}
        <div className="relative">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="absolute start-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search queries..."
            className="w-full ps-8 pe-2 py-1.5 text-xs bg-[var(--bg-input)] text-[var(--text-primary)] border gold-border rounded-lg placeholder:text-[var(--text-muted)] focus:outline-none focus:border-gold"
          />
        </div>

        {/* Filter row */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setFavoritesOnly(!favoritesOnly)}
            className={cn(
              'flex items-center gap-1 text-[10px] px-2 py-1 rounded-full border transition-colors',
              favoritesOnly
                ? 'bg-gold/20 border-gold/40 text-gold'
                : 'border-[var(--bg-input)] text-[var(--text-muted)] hover:border-gold/30'
            )}
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill={favoritesOnly ? 'currentColor' : 'none'}
              stroke="currentColor"
              strokeWidth="2"
            >
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            Favorites
          </button>

          {/* Sort buttons */}
          {(['executedAt', 'executionTimeMs', 'rowCount'] as const).map((field) => {
            const labels: Record<QuerySortField, string> = {
              executedAt: 'Date',
              executionTimeMs: 'Time',
              rowCount: 'Rows',
            };
            const isActive = sortField === field;
            return (
              <button
                key={field}
                onClick={() => toggleSort(field)}
                className={cn(
                  'text-[10px] px-2 py-1 rounded-full border transition-colors',
                  isActive
                    ? 'bg-gold/10 border-gold/30 text-gold'
                    : 'border-[var(--bg-input)] text-[var(--text-muted)] hover:border-gold/30'
                )}
              >
                {labels[field]}
                {isActive && (
                  <span className="ml-0.5">
                    {sortDirection === 'desc' ? '\u2193' : '\u2191'}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-5 h-5 border-2 border-gold/30 border-t-gold rounded-full animate-spin" />
          </div>
        ) : records.length === 0 ? (
          <div className="text-center py-8 text-xs text-[var(--text-muted)]">
            {searchText || favoritesOnly ? 'No matching queries found' : 'No query history yet'}
          </div>
        ) : (
          records.map((record) => (
            <QueryHistoryItem
              key={record.id}
              record={record}
              onRerun={onRerun}
              onDelete={handleDelete}
              onToggleFavorite={handleToggleFavorite}
              onSave={onSave}
            />
          ))
        )}
      </div>
    </div>
  );
}
