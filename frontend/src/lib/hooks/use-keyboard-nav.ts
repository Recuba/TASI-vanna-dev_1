'use client';

import { useEffect, RefObject } from 'react';

interface UseKeyboardNavOptions {
  /** Ref to the search input element to focus when '/' is pressed */
  searchRef?: RefObject<HTMLInputElement | null>;
  /** Array of row elements for j/k navigation */
  rowRefs?: RefObject<HTMLElement[]>;
  /** Called with the new active row index when j/k is pressed */
  onRowChange?: (index: number) => void;
  /** Whether the hook is enabled */
  enabled?: boolean;
}

/**
 * Keyboard navigation for market table:
 * - '/' -> focus search input
 * - 'j' -> next row
 * - 'k' -> prev row
 * - 'Enter' on row -> click the row link
 * - 'Escape' -> blur search
 */
export function useKeyboardNav({
  searchRef,
  rowRefs,
  onRowChange,
  enabled = true,
}: UseKeyboardNavOptions = {}) {
  useEffect(() => {
    if (!enabled) return;

    let activeIndex = -1;

    const handler = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in an input/textarea
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      if (e.key === '/' && !isInput) {
        e.preventDefault();
        // Focus search input
        const searchEl = searchRef?.current ?? (document.querySelector('[data-search-input]') as HTMLInputElement | null);
        searchEl?.focus();
        searchEl?.select();
        return;
      }

      if (e.key === 'Escape' && isInput) {
        (target as HTMLInputElement).blur();
        return;
      }

      if ((e.key === 'j' || e.key === 'k') && !isInput) {
        e.preventDefault();
        const rows = rowRefs?.current ?? Array.from(document.querySelectorAll('[data-stock-row]')) as HTMLElement[];
        if (rows.length === 0) return;

        if (e.key === 'j') activeIndex = Math.min(activeIndex + 1, rows.length - 1);
        else activeIndex = Math.max(activeIndex - 1, 0);

        rows[activeIndex]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        rows[activeIndex]?.focus();
        onRowChange?.(activeIndex);
        return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [enabled, searchRef, rowRefs, onRowChange]);
}
