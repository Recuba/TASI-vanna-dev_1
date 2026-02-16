'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useTheme } from '@/providers/ThemeProvider';
import { useLanguage } from '@/providers/LanguageProvider';
import { HEALTH_POLL_INTERVAL_MS } from '@/lib/config';

interface HeaderProps {
  onToggleMobileSidebar?: () => void;
}

const navLinks = [
  { href: '/', labelAr: 'الرئيسية', labelEn: 'Home' },
  { href: '/market', labelAr: 'السوق', labelEn: 'Market' },
  { href: '/markets', labelAr: 'الأسواق العالمية', labelEn: 'World 360°' },
  { href: '/charts', labelAr: 'الرسوم البيانية', labelEn: 'Charts' },
  { href: '/news', labelAr: 'الأخبار', labelEn: 'News' },
  { href: '/chat', labelAr: 'المحادثة', labelEn: 'AI Chat' },
];

export function Header({ onToggleMobileSidebar }: HeaderProps) {
  const { theme, toggleTheme } = useTheme();
  const { language, toggleLanguage, t } = useLanguage();
  const pathname = usePathname();
  const [backendStatus, setBackendStatus] = useState<'online' | 'offline' | 'checking'>('checking');

  useEffect(() => {
    const controller = new AbortController();
    const checkHealth = async () => {
      try {
        const res = await fetch('/health', { signal: controller.signal });
        setBackendStatus(res.ok ? 'online' : 'offline');
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setBackendStatus('offline');
      }
    };
    checkHealth();
    const interval = setInterval(checkHealth, HEALTH_POLL_INTERVAL_MS);
    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, []);

  return (
    <header
      className={cn(
        'sticky top-0 z-50',
        'h-header',
        'flex items-center justify-center',
        'px-4 sm:px-6',
        'border-b gold-border',
        'backdrop-blur-xl',
        'dark:bg-dark-bg/90 bg-white/90'
      )}
    >
      <div className="w-full max-w-content-lg flex items-center gap-3">
        {/* Mobile hamburger */}
        <button
          onClick={onToggleMobileSidebar}
          className={cn(
            'lg:hidden p-2 rounded-md',
            'text-[var(--text-muted)] hover:text-gold',
            'hover:bg-[var(--bg-card-hover)]',
            'transition-colors duration-200'
          )}
          aria-label="Toggle navigation menu"
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>

        {/* Brand Mark */}
        <Link href="/" className="flex items-center gap-3 flex-shrink-0">
          <div
            className={cn(
              'w-[38px] h-[38px] flex-shrink-0',
              'bg-gold-gradient rounded-sm',
              'flex items-center justify-center',
              'text-base font-bold text-dark-bg',
              'tracking-tight gold-glow-sm'
            )}
            aria-hidden="true"
          >
            RA
          </div>
          <div className="flex flex-col gap-px">
            <h1 className="text-[16px] font-bold text-[var(--text-primary)] leading-tight">
              Ra&apos;d AI
            </h1>
            <p className="text-[10px] text-[var(--text-muted)] leading-tight hidden sm:block">
              {t('رعد للذكاء الاصطناعي', 'Saudi Stock Market AI')}
            </p>
          </div>
        </Link>

        {/* Desktop nav links */}
        <nav className={cn('hidden md:flex lg:hidden items-center gap-1', language === 'ar' ? 'me-6' : 'ms-6')}>
          {navLinks.map((link) => {
            const isActive =
              link.href === '/'
                ? pathname === '/'
                : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  'px-3 py-1.5 rounded-md text-sm font-medium',
                  'transition-colors duration-200',
                  isActive
                    ? 'text-gold bg-gold/10'
                    : 'text-[var(--text-secondary)] hover:text-gold hover:bg-[var(--bg-card-hover)]'
                )}
              >
                {language === 'ar' ? link.labelAr : link.labelEn}
              </Link>
            );
          })}
        </nav>

        {/* Right side controls */}
        <div className={cn('flex items-center gap-2', language === 'ar' ? 'me-auto' : 'ms-auto')}>
          {/* Search / Command palette hint */}
          <button
            onClick={() => {
              window.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }),
              );
            }}
            className={cn(
              'hidden lg:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md',
              'text-xs text-[var(--text-muted)]',
              'bg-[var(--bg-input)] border border-[#2A2A2A]',
              'hover:border-[#D4A84B]/30 hover:text-gold',
              'transition-colors duration-200 cursor-pointer',
            )}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <span>Ctrl+K</span>
          </button>

          {/* Language toggle */}
          <button
            onClick={toggleLanguage}
            className={cn(
              'px-2.5 py-1.5 rounded-md transition-colors',
              'text-xs font-semibold',
              'text-[var(--text-muted)] hover:text-gold',
              'hover:bg-[var(--bg-card-hover)]',
              'border border-[#2A2A2A] hover:border-[#D4A84B]/30'
            )}
            aria-label={language === 'ar' ? 'Switch to English' : 'Switch to Arabic'}
          >
            {language === 'ar' ? 'EN' : 'عربي'}
          </button>

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className={cn(
              'p-2 rounded-md transition-colors',
              'text-[var(--text-muted)] hover:text-gold',
              'hover:bg-[var(--bg-card-hover)]'
            )}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>

          {/* Status indicator */}
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                'w-2 h-2 rounded-full',
                backendStatus === 'online' && 'bg-accent-green animate-gold-pulse',
                backendStatus === 'offline' && 'bg-accent-red',
                backendStatus === 'checking' && 'bg-amber-400 animate-pulse',
              )}
              aria-hidden="true"
            />
            <span
              className={cn(
                'text-xs font-medium hidden sm:inline',
                backendStatus === 'online' && 'text-accent-green',
                backendStatus === 'offline' && 'text-accent-red',
                backendStatus === 'checking' && 'text-amber-400',
              )}
            >
              {backendStatus === 'online' && t('متصل', 'Online')}
              {backendStatus === 'offline' && t('غير متصل', 'Offline')}
              {backendStatus === 'checking' && t('جاري الفحص...', 'Checking...')}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
