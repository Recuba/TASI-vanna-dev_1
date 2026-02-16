'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/providers/LanguageProvider';

const AUTO_DISMISS_MS = 15_000;

export interface NewArticlesBannerProps {
  count: number;
  onDismiss: () => void;
}

export function NewArticlesBanner({ count, onDismiss }: NewArticlesBannerProps) {
  const { t } = useLanguage();
  const [visible, setVisible] = useState(false);
  const [progressStarted, setProgressStarted] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    setVisible(false);
    // Wait for exit animation before calling onDismiss
    setTimeout(() => {
      onDismiss();
    }, 200);
  }, [onDismiss]);

  // Show banner when count becomes positive
  useEffect(() => {
    if (count > 0) {
      setVisible(true);
      // Trigger progress bar after a micro-tick so the transition kicks in
      requestAnimationFrame(() => {
        setProgressStarted(true);
      });
    } else {
      setVisible(false);
      setProgressStarted(false);
    }
  }, [count]);

  // Auto-dismiss timer
  useEffect(() => {
    if (count > 0 && visible) {
      timerRef.current = setTimeout(() => {
        dismiss();
      }, AUTO_DISMISS_MS);
      return () => {
        if (timerRef.current) clearTimeout(timerRef.current);
      };
    }
  }, [count, visible, dismiss]);

  if (count <= 0) return null;

  return (
    <div aria-live="polite" role="status">
      <button
        onClick={dismiss}
        className={cn(
          'w-full py-3 px-4 rounded-lg text-sm font-medium relative overflow-hidden',
          'bg-[#D4A84B]/10 text-[#D4A84B] border border-[#D4A84B]/25',
          'hover:bg-[#D4A84B]/20 transition-all duration-300 ease-out',
          'flex items-center gap-3',
          visible
            ? 'translate-y-0 opacity-100'
            : '-translate-y-2 opacity-0',
        )}
      >
        {/* Refresh icon */}
        <svg
          className="w-4 h-4 shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>

        {/* Count badge */}
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#D4A84B] text-[#0E0E0E] text-xs font-bold shrink-0">
          {count}
        </span>

        {/* Label */}
        <span className="flex-1 text-start">
          {t('أخبار جديدة — اضغط للتحديث', 'New articles — tap to refresh')}
        </span>

        {/* Close / dismiss X button */}
        <span
          role="img"
          aria-hidden="true"
          className="shrink-0 w-5 h-5 flex items-center justify-center rounded-full hover:bg-[#D4A84B]/20 transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            dismiss();
          }}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </span>

        {/* Auto-dismiss progress bar */}
        <span
          className={cn(
            'absolute bottom-0 start-0 h-0.5 bg-[#D4A84B]/40 ease-linear',
            progressStarted ? 'transition-all duration-[15000ms]' : '',
          )}
          style={{ width: progressStarted ? '100%' : '0%' }}
          aria-hidden="true"
        />
      </button>
    </div>
  );
}
