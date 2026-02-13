'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { getSuggestions } from '@/lib/queries/suggestions';
import { queryStore } from '@/lib/queries/query-store';
import type { QueryRecord, QuerySuggestion } from '@/types/queries';

interface QuerySuggestionsProps {
  input: string;
  visible: boolean;
  language?: 'ar' | 'en';
  onSelect: (text: string) => void;
  onDismiss: () => void;
  className?: string;
}

export function QuerySuggestions({
  input,
  visible,
  language = 'en',
  onSelect,
  onDismiss,
  className,
}: QuerySuggestionsProps) {
  const [suggestions, setSuggestions] = useState<QuerySuggestion[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [recentQueries, setRecentQueries] = useState<QueryRecord[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Load recent queries once on mount
  useEffect(() => {
    queryStore.getRecent(20).then(setRecentQueries).catch(() => {});
  }, []);

  // Debounced suggestion computation
  useEffect(() => {
    if (!visible) {
      setSuggestions([]);
      return;
    }

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      const results = getSuggestions(input, recentQueries, language);
      setSuggestions(results);
      setSelectedIndex(-1);
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [input, visible, recentQueries, language]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!visible || suggestions.length === 0) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev < suggestions.length - 1 ? prev + 1 : 0
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev > 0 ? prev - 1 : suggestions.length - 1
          );
          break;
        case 'Enter':
          if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
            e.preventDefault();
            onSelect(suggestions[selectedIndex].text);
          }
          break;
        case 'Escape':
          e.preventDefault();
          onDismiss();
          break;
      }
    },
    [visible, suggestions, selectedIndex, onSelect, onDismiss]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Scroll selected item into view
  useEffect(() => {
    if (selectedIndex < 0 || !listRef.current) return;
    const items = listRef.current.querySelectorAll('[data-suggestion]');
    items[selectedIndex]?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (!visible || suggestions.length === 0) return null;

  return (
    <div
      ref={listRef}
      className={cn(
        'absolute z-30 w-full bg-[var(--bg-card)] border gold-border rounded-lg shadow-xl',
        'max-h-[280px] overflow-y-auto',
        className
      )}
    >
      {suggestions.map((suggestion, index) => (
        <button
          key={`${suggestion.source}-${suggestion.text}-${index}`}
          data-suggestion
          onClick={() => onSelect(suggestion.text)}
          onMouseEnter={() => setSelectedIndex(index)}
          className={cn(
            'w-full flex items-center gap-2 px-3 py-2 text-start transition-colors',
            index === selectedIndex
              ? 'bg-gold/10 text-[var(--text-primary)]'
              : 'text-[var(--text-secondary)] hover:bg-gold/5'
          )}
        >
          {/* Source icon */}
          {suggestion.source === 'recent' ? (
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="flex-shrink-0 text-[var(--text-muted)]"
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
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
              className="flex-shrink-0 text-gold/50"
            >
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          )}

          <span className="text-xs truncate">{suggestion.text}</span>
        </button>
      ))}
    </div>
  );
}
