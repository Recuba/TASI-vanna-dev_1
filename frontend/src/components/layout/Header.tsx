'use client';

import { cn } from '@/lib/utils';
import { useTheme } from '@/providers/ThemeProvider';

export function Header() {
  const { theme, toggleTheme } = useTheme();

  return (
    <header
      className={cn(
        'sticky top-0 z-50',
        'h-header',
        'flex items-center justify-center',
        'px-6',
        'border-b gold-border',
        'backdrop-blur-xl',
        'dark:bg-dark-bg/85 bg-white/85'
      )}
    >
      <div className="w-full max-w-content-lg flex items-center gap-4">
        {/* Brand Mark */}
        <div
          className={cn(
            'w-[42px] h-[42px] flex-shrink-0',
            'bg-gold-gradient rounded-sm',
            'flex items-center justify-center',
            'text-lg font-bold text-dark-bg',
            'tracking-tight gold-glow-sm'
          )}
          aria-hidden="true"
        >
          RA
        </div>

        {/* Header Text */}
        <div className="flex flex-col gap-px">
          <h1 className="text-[17px] font-bold text-[var(--text-primary)] leading-tight">
            Ra&apos;d AI
          </h1>
          <p className="text-xs text-[var(--text-muted)] leading-tight hidden sm:block">
            Saudi Financial Intelligence Platform
          </p>
        </div>

        {/* Right side: shortcut hint + theme toggle + status */}
        <div className="ms-auto flex items-center gap-3">
          {/* Chat shortcut hint */}
          <span className="hidden sm:inline text-xs text-[var(--text-muted)]">
            Ctrl+K to chat
          </span>
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
          <div className="flex items-center gap-2">
            <span
              className="w-2 h-2 bg-accent-green rounded-full animate-gold-pulse"
              aria-hidden="true"
            />
            <span className="text-xs font-medium text-accent-green hidden sm:inline">
              Online
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
