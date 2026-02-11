'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/providers/LanguageProvider';

interface NavItem {
  label: string;
  labelAr: string;
  href: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  {
    label: 'Home',
    labelAr: 'الرئيسية',
    href: '/',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
  {
    label: 'Market',
    labelAr: 'السوق',
    href: '/market',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
  },
  {
    label: 'Charts',
    labelAr: 'الرسوم البيانية',
    href: '/charts',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 20V14" /><path d="M10 20V10" /><path d="M14 20V4" /><path d="M18 20V8" />
      </svg>
    ),
  },
  {
    label: 'News',
    labelAr: 'الأخبار',
    href: '/news',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" />
        <path d="M18 14h-8" /><path d="M15 18h-5" /><rect x="8" y="6" width="8" height="4" />
      </svg>
    ),
  },
  {
    label: 'Announcements',
    labelAr: 'الإعلانات',
    href: '/announcements',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 17H2a3 3 0 0 0 3-3V9a7 7 0 0 1 14 0v5a3 3 0 0 0 3 3zm-8.27 4a2 2 0 0 1-3.46 0" />
      </svg>
    ),
  },
  {
    label: 'AI Chat',
    labelAr: 'المحادثة',
    href: '/chat',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    label: 'Reports',
    labelAr: 'التقارير',
    href: '/reports',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" />
      </svg>
    ),
  },
  {
    label: 'Watchlist',
    labelAr: 'المفضلة',
    href: '/watchlist',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    ),
  },
];

interface SidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function Sidebar({ mobileOpen = false, onMobileClose }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const { language } = useLanguage();

  // Close mobile sidebar on route change
  useEffect(() => {
    if (mobileOpen && onMobileClose) {
      onMobileClose();
    }
    // Only trigger on pathname change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  const navContent = (
    <>
      {/* Nav Items */}
      <nav className="flex-1 py-3 px-2 ps-3 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3',
                'px-3 py-2.5 rounded-md',
                'text-sm font-medium',
                'transition-all duration-200',
                'relative',
                active
                  ? 'text-gold bg-gold/10'
                  : 'text-[var(--text-secondary)] hover:text-gold hover:bg-[var(--bg-card-hover)]',
                collapsed && 'justify-center px-2'
              )}
            >
              {/* Active indicator bar (end side for RTL) */}
              {active && (
                <span
                  className={cn(
                    'absolute top-1.5 bottom-1.5 end-0 w-[3px]',
                    'bg-gold rounded-full'
                  )}
                />
              )}
              <span className="flex-shrink-0">{item.icon}</span>
              {!collapsed && <span>{language === 'ar' ? item.labelAr : item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Bottom section: branding + collapse toggle */}
      <div className="border-t gold-border p-2 space-y-1">
        {!collapsed && (
          <div className="px-3 py-2 text-[10px] text-[var(--text-muted)] leading-relaxed">
            <span className="gold-text font-bold">Ra&apos;d AI</span>
            <span className="mx-1">v2.0</span>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            'w-full flex items-center justify-center',
            'p-2 rounded-md',
            'text-[var(--text-muted)] hover:text-gold',
            'hover:bg-[var(--bg-card-hover)]',
            'transition-colors duration-200'
          )}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={cn('transition-transform duration-300', collapsed ? 'rotate-180 flip-rtl' : 'flip-rtl')}
          >
            <polyline points="11 17 6 12 11 7" />
            <polyline points="18 17 13 12 18 7" />
          </svg>
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        role="navigation"
        aria-label="Main navigation"
        className={cn(
          'hidden lg:flex flex-col flex-shrink-0',
          'h-[calc(100vh-64px)]',
          'sticky top-[64px]',
          'border-e gold-border',
          'bg-[#141414] dark:bg-[#141414] bg-white',
          'transition-all duration-300',
          collapsed ? 'w-sidebar-collapsed' : 'w-sidebar'
        )}
      >
        {navContent}
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={onMobileClose}
          aria-hidden="true"
        />
      )}

      {/* Mobile sidebar */}
      <aside
        role="navigation"
        aria-label="Mobile navigation"
        aria-hidden={!mobileOpen}
        className={cn(
          'fixed top-[64px] end-0 z-50',
          'h-[calc(100vh-64px)] w-[260px]',
          'flex flex-col overflow-x-hidden',
          'border-s gold-border',
          'bg-[#141414] dark:bg-[#141414] bg-white',
          'transition-transform duration-300 ease-in-out',
          'lg:hidden',
          mobileOpen ? 'translate-x-0' : 'translate-x-full rtl:-translate-x-full'
        )}
      >
        {navContent}
      </aside>
    </>
  );
}
