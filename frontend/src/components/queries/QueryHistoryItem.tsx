'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { QueryRecord } from '@/types/queries';

function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

interface QueryHistoryItemProps {
  record: QueryRecord;
  onRerun: (query: string) => void;
  onDelete: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onSave?: (record: QueryRecord) => void;
}

export function QueryHistoryItem({
  record,
  onRerun,
  onDelete,
  onToggleFavorite,
  onSave,
}: QueryHistoryItemProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const truncatedQuery =
    record.naturalLanguageQuery.length > 80
      ? record.naturalLanguageQuery.slice(0, 80) + '...'
      : record.naturalLanguageQuery;

  const handleCopySql = async () => {
    try {
      await navigator.clipboard.writeText(record.generatedSql);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: no-op
    }
  };

  return (
    <div
      className={cn(
        'border gold-border rounded-lg overflow-hidden transition-all duration-200',
        'bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)]',
        expanded && 'ring-1 ring-gold/30'
      )}
    >
      {/* Collapsed header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-3 py-2.5 flex items-start gap-2 text-start"
      >
        {/* Expand chevron */}
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={cn(
            'flex-shrink-0 mt-0.5 text-[var(--text-muted)] transition-transform duration-200',
            expanded && 'rotate-90'
          )}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>

        <div className="flex-1 min-w-0">
          <p className="text-sm text-[var(--text-primary)] truncate">{truncatedQuery}</p>
          <div className="flex items-center gap-3 mt-1 text-xs text-[var(--text-muted)]">
            <span>{timeAgo(record.executedAt)}</span>
            <span>{record.executionTimeMs}ms</span>
            <span>{record.rowCount} rows</span>
            {record.name && (
              <span className="text-gold truncate max-w-[120px]">{record.name}</span>
            )}
          </div>
        </div>

        {/* Favorite star */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(record.id);
          }}
          className={cn(
            'flex-shrink-0 p-1 rounded transition-colors',
            record.isFavorite
              ? 'text-gold hover:text-gold-light'
              : 'text-[var(--text-muted)] hover:text-gold/60'
          )}
          aria-label={record.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill={record.isFavorite ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth="2"
          >
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        </button>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-3 pb-3 border-t border-[var(--bg-input)] space-y-2">
          {/* SQL block */}
          {record.generatedSql && (
            <div className="mt-2">
              <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">
                SQL
              </p>
              <pre className="text-xs text-[var(--text-secondary)] bg-[var(--bg-input)] rounded p-2 overflow-x-auto max-h-[120px] overflow-y-auto whitespace-pre-wrap break-all">
                {record.generatedSql}
              </pre>
            </div>
          )}

          {/* Result preview */}
          {record.results && record.results.columns.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">
                Preview ({record.rowCount} rows)
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr>
                      {record.results.columns.map((col, i) => (
                        <th
                          key={i}
                          className="px-2 py-1 text-start text-gold font-medium whitespace-nowrap"
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {record.results.rows.slice(0, 3).map((row, ri) => (
                      <tr key={ri} className="border-t border-[var(--bg-input)]">
                        {row.map((cell, ci) => (
                          <td
                            key={ci}
                            className="px-2 py-1 text-[var(--text-secondary)] whitespace-nowrap"
                          >
                            {cell !== null && cell !== undefined ? String(cell) : '-'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tags */}
          {record.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {record.tags.map((tag, i) => (
                <span
                  key={i}
                  className="inline-block text-[10px] px-1.5 py-0.5 rounded-full bg-gold/10 text-gold border border-gold/20"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={() => onRerun(record.naturalLanguageQuery)}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-gold/10 text-gold hover:bg-gold/20 transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="1 4 1 10 7 10" />
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
              </svg>
              Re-run
            </button>
            <button
              onClick={handleCopySql}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-[var(--bg-input)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              {copied ? 'Copied!' : 'Copy SQL'}
            </button>
            {onSave && !record.isFavorite && (
              <button
                onClick={() => onSave(record)}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-[var(--bg-input)] text-[var(--text-secondary)] hover:text-gold transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                  <polyline points="17 21 17 13 7 13 7 21" />
                  <polyline points="7 3 7 8 15 8" />
                </svg>
                Save
              </button>
            )}
            <button
              onClick={() => onDelete(record.id)}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded text-accent-red/70 hover:text-accent-red hover:bg-accent-red/10 transition-colors ms-auto"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
