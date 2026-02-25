'use client';

import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { queryStore } from '@/lib/queries/query-store';
import type { QueryRecord } from '@/types/queries';

interface SavedQueriesProps {
  onRerun: (query: string) => void;
  className?: string;
}

export function SavedQueries({ onRerun, className }: SavedQueriesProps) {
  const [favorites, setFavorites] = useState<QueryRecord[]>([]);
  const [searchText, setSearchText] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadFavorites = useCallback(async () => {
    setLoading(true);
    try {
      const results = await queryStore.getFavorites();
      setFavorites(results);
    } catch {
      // IndexedDB unavailable
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFavorites();
  }, [loadFavorites]);

  // Gather all unique tags
  const allTags = Array.from(new Set(favorites.flatMap((f) => f.tags))).sort();

  // Filter
  let filtered = favorites;
  if (searchText) {
    const term = searchText.toLowerCase();
    filtered = filtered.filter(
      (f) =>
        f.naturalLanguageQuery.toLowerCase().includes(term) ||
        (f.name && f.name.toLowerCase().includes(term)) ||
        f.tags.some((t) => t.toLowerCase().includes(term))
    );
  }
  if (selectedTag) {
    filtered = filtered.filter((f) => f.tags.includes(selectedTag));
  }

  const handleRemoveFavorite = async (id: string) => {
    await queryStore.toggleFavorite(id);
    setFavorites((prev) => prev.filter((f) => f.id !== id));
  };

  const handleShare = async (record: QueryRecord) => {
    const text = [
      record.name ? `# ${record.name}` : '',
      `Query: ${record.naturalLanguageQuery}`,
      record.generatedSql ? `\nSQL:\n${record.generatedSql}` : '',
      record.notes ? `\nNotes: ${record.notes}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // no-op
    }
  };

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <div className="px-3 py-2 border-b gold-border">
        <h3 className="text-sm font-medium text-[var(--text-primary)]">Saved Queries</h3>
      </div>

      {/* Search + Tag filters */}
      <div className="px-3 py-2 space-y-2 border-b border-[var(--bg-input)]">
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
            placeholder="Search saved queries..."
            className="w-full ps-8 pe-2 py-1.5 text-xs bg-[var(--bg-input)] text-[var(--text-primary)] border gold-border rounded-lg placeholder:text-[var(--text-muted)] focus:outline-none focus:border-gold"
          />
        </div>

        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            <button
              onClick={() => setSelectedTag(null)}
              className={cn(
                'text-[13.5px] px-2 py-0.5 rounded-full border transition-colors',
                selectedTag === null
                  ? 'bg-gold/20 border-gold/40 text-gold'
                  : 'border-[var(--bg-input)] text-[var(--text-muted)] hover:border-gold/30'
              )}
            >
              All
            </button>
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                className={cn(
                  'text-[13.5px] px-2 py-0.5 rounded-full border transition-colors',
                  selectedTag === tag
                    ? 'bg-gold/20 border-gold/40 text-gold'
                    : 'border-[var(--bg-input)] text-[var(--text-muted)] hover:border-gold/30'
                )}
              >
                {tag}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-5 h-5 border-2 border-gold/30 border-t-gold rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8 text-xs text-[var(--text-muted)]">
            {searchText || selectedTag ? 'No matching saved queries' : 'No saved queries yet. Star a query to save it.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2">
            {filtered.map((record) => (
              <div
                key={record.id}
                className="p-3 bg-[var(--bg-card)] border gold-border rounded-lg hover:bg-[var(--bg-card-hover)] transition-colors"
              >
                {/* Name / Query */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    {record.name && (
                      <p className="text-xs font-medium text-gold truncate">{record.name}</p>
                    )}
                    <p className="text-xs text-[var(--text-secondary)] truncate mt-0.5">
                      {record.naturalLanguageQuery}
                    </p>
                  </div>
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="flex-shrink-0 text-gold mt-0.5"
                  >
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                </div>

                {/* Tags */}
                {record.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {record.tags.map((tag, i) => (
                      <span
                        key={i}
                        className="inline-block text-[13.5px] px-1.5 py-0.5 rounded-full bg-gold/10 text-gold border border-gold/20"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Notes */}
                {record.notes && (
                  <p className="text-[13.5px] text-[var(--text-muted)] mt-1.5 line-clamp-2">
                    {record.notes}
                  </p>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 mt-2">
                  <button
                    onClick={() => onRerun(record.naturalLanguageQuery)}
                    className="flex items-center gap-1 text-[13.5px] px-2 py-1 rounded bg-gold/10 text-gold hover:bg-gold/20 transition-colors"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                    Run
                  </button>
                  <button
                    onClick={() => handleShare(record)}
                    className="flex items-center gap-1 text-[13.5px] px-2 py-1 rounded bg-[var(--bg-input)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                    Share
                  </button>
                  <button
                    onClick={() => handleRemoveFavorite(record.id)}
                    className="text-[13.5px] px-2 py-1 rounded text-accent-red/70 hover:text-accent-red hover:bg-accent-red/10 transition-colors ms-auto"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
