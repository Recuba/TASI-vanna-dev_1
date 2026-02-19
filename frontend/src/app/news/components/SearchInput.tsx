'use client';

import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/providers/LanguageProvider';

export interface SearchInputProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'ابحث في الأخبار...',
}: SearchInputProps) {
  const { isRTL, t } = useLanguage();
  const [local, setLocal] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocal(value);
  }, [value]);

  const handleChange = (v: string) => {
    setLocal(v);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onChange(v), 300);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <div className="relative">
      {/* Search icon */}
      <svg
        className="absolute end-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)] pointer-events-none"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <input
        type="text"
        value={local}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        aria-label={t('البحث في الأخبار', 'Search news')}
        className={cn(
          'w-full pe-10 ps-10 py-2.5 rounded-lg text-sm',
          'bg-[var(--bg-input)] border border-[#2A2A2A]',
          'text-[var(--text-primary)] placeholder:text-[var(--text-muted)]',
          'focus:outline-none focus:border-[#D4A84B]/50 focus:ring-1 focus:ring-[#D4A84B]/20',
          'focus:shadow-[0_0_0_3px_rgba(212,168,75,0.1)]',
          'transition-all duration-200',
        )}
        dir={isRTL ? 'rtl' : 'ltr'}
      />
      {/* Clear button */}
      {local && (
        <button
          onClick={() => {
            setLocal('');
            onChange('');
          }}
          aria-label={t('مسح البحث', 'Clear search')}
          className="absolute start-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}
