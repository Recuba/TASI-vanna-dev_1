'use client';

import { useState, useEffect, useRef } from 'react';
import { useLanguage } from '@/providers/LanguageProvider';
import { cn } from '@/lib/utils';

export function OfflineBanner() {
  const { t, language } = useLanguage();
  const [isOffline, setIsOffline] = useState(false);
  const [showBackOnline, setShowBackOnline] = useState(false);
  const backOnlineTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handleOffline = () => {
      setShowBackOnline(false);
      setIsOffline(true);
    };

    const handleOnline = () => {
      setIsOffline(false);
      setShowBackOnline(true);
      if (backOnlineTimer.current) clearTimeout(backOnlineTimer.current);
      backOnlineTimer.current = setTimeout(() => {
        setShowBackOnline(false);
      }, 3000);
    };

    // Check initial state
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setIsOffline(true);
    }

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
      if (backOnlineTimer.current) clearTimeout(backOnlineTimer.current);
    };
  }, []);

  if (!isOffline && !showBackOnline) return null;

  const dir = language === 'ar' ? 'rtl' : 'ltr';

  if (showBackOnline) {
    return (
      <div
        className={cn(
          'w-full px-4 py-2 text-center text-sm font-medium',
          'bg-accent-green/10 border-b border-accent-green/20 text-accent-green',
          'animate-slide-down',
        )}
        dir={dir}
        role="status"
        aria-live="polite"
      >
        <div className="flex items-center justify-center gap-2">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          {t('تم استعادة الاتصال', 'Back online')}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'w-full px-4 py-2 text-center text-sm font-medium',
        'bg-[#FFA726]/10 border-b border-[#FFA726]/20 text-[#FFA726]',
      )}
      dir={dir}
      role="alert"
      aria-live="assertive"
    >
      <div className="flex items-center justify-center gap-2">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
        {t('أنت غير متصل. بعض الميزات قد لا تكون متاحة.', 'You are offline. Some features may be unavailable.')}
      </div>
    </div>
  );
}
