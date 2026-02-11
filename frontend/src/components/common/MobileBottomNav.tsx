'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Nav items
// ---------------------------------------------------------------------------

const navItems = [
  {
    href: '/',
    label: '\u0627\u0644\u0631\u0626\u064A\u0633\u064A\u0629',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
  {
    href: '/market',
    label: '\u0627\u0644\u0633\u0648\u0642',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
  },
  {
    href: '/chat',
    label: '\u0631\u0627\u0626\u062F',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
    center: true,
  },
  {
    href: '/news',
    label: '\u0627\u0644\u0623\u062E\u0628\u0627\u0631',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" />
        <path d="M18 14h-8" /><path d="M15 18h-5" /><rect x="8" y="6" width="8" height="4" />
      </svg>
    ),
  },
  {
    href: '/charts',
    label: '\u0627\u0644\u0631\u0633\u0648\u0645',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 20V14" /><path d="M10 20V10" /><path d="M14 20V4" /><path d="M18 20V8" />
      </svg>
    ),
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MobileBottomNav() {
  const pathname = usePathname();
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  // Detect virtual keyboard by watching viewport height changes
  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;

    const viewport = window.visualViewport;
    const handleResize = () => {
      // If viewport height is significantly smaller than window height, keyboard is open
      const heightDiff = window.innerHeight - viewport.height;
      setKeyboardOpen(heightDiff > 150);
    };

    viewport.addEventListener('resize', handleResize);
    return () => viewport.removeEventListener('resize', handleResize);
  }, []);

  if (keyboardOpen) return null;

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <nav
      className={cn(
        'fixed bottom-0 inset-x-0 z-50',
        'lg:hidden',
        'h-16',
        'bg-[#0E0E0E] border-t border-[#2A2A2A]',
        'flex items-center justify-around',
        'pb-[env(safe-area-inset-bottom)]',
      )}
      dir="rtl"
    >
      {navItems.map((item) => {
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex flex-col items-center justify-center gap-0.5',
              'flex-1 h-full',
              'transition-colors duration-200',
              item.center && 'relative',
              active
                ? 'text-[#D4A84B]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]',
            )}
          >
            {item.center ? (
              <span
                className={cn(
                  'flex items-center justify-center',
                  'w-12 h-12 -mt-4 rounded-full',
                  'shadow-lg',
                  active
                    ? 'bg-[#D4A84B] text-[#0E0E0E]'
                    : 'bg-[#1A1A1A] border border-[#2A2A2A] text-[var(--text-muted)]',
                  'transition-colors duration-200',
                )}
              >
                {item.icon}
              </span>
            ) : (
              <span className="flex-shrink-0">{item.icon}</span>
            )}
            <span className={cn(
              'text-[10px] font-medium',
              item.center && 'mt-0.5',
            )}>
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
