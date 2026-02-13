'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { href: '/admin', label: 'Dashboard', icon: '/' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-[calc(100vh-64px)]">
      {/* Admin sidebar */}
      <aside className="hidden md:flex w-56 flex-col bg-[#1A1A1A] border-r border-gold/10 p-4">
        <h2 className="text-sm font-bold text-gold uppercase tracking-wider mb-4">
          Admin
        </h2>
        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                'px-3 py-2 rounded-lg text-sm transition-colors',
                pathname === href
                  ? 'bg-gold/15 text-gold'
                  : 'text-[#B0B0B0] hover:bg-gold/5 hover:text-white',
              )}
            >
              {label}
            </Link>
          ))}
        </nav>
      </aside>

      {/* Content */}
      <main className="flex-1 p-4 md:p-6 overflow-auto">
        {children}
      </main>
    </div>
  );
}
