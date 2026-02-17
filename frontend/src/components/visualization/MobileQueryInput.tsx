'use client';

import { useCallback, useState } from 'react';
import { cn } from '@/lib/utils';

interface MobileQueryInputProps {
  onSubmit: (query: string) => void;
  isLoading?: boolean;
  placeholder?: string;
  className?: string;
}

export function MobileQueryInput({
  onSubmit,
  isLoading,
  placeholder = 'Ask about Saudi stocks...',
  className,
}: MobileQueryInputProps) {
  const [query, setQuery] = useState('');

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = query.trim();
      if (!trimmed || isLoading) return;
      onSubmit(trimmed);
      setQuery('');
    },
    [query, isLoading, onSubmit],
  );

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        'sticky bottom-0 z-20 bg-[#0E0E0E] border-t border-gold/10 p-3',
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          disabled={isLoading}
          className={cn(
            'flex-1 min-h-[44px] px-4 py-3 text-sm',
            'bg-[#1A1A1A] border border-gold/20 rounded-xl',
            'text-white placeholder:text-[#707070]',
            'focus:outline-none focus:border-gold/50',
            'disabled:opacity-50',
          )}
        />
        <button
          type="submit"
          disabled={!query.trim() || isLoading}
          className={cn(
            'min-w-[44px] min-h-[44px] flex items-center justify-center',
            'bg-gold/20 text-gold rounded-xl',
            'hover:bg-gold/30 transition-colors',
            'disabled:opacity-50 disabled:cursor-not-allowed',
          )}
        >
          {isLoading ? (
            <svg width="20" height="20" viewBox="0 0 24 24" className="animate-spin">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none" strokeDasharray="31.4 31.4" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          )}
        </button>
      </div>
    </form>
  );
}
