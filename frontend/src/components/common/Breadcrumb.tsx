'use client';

import Link from 'next/link';
import { useLanguage } from '@/providers/LanguageProvider';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

function ChevronSeparator() {
  return (
    <svg
      className="w-3 h-3 text-gold/50 rtl:rotate-180 shrink-0"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

export function Breadcrumb({ items }: BreadcrumbProps) {
  const { t } = useLanguage();

  return (
    <nav className="flex items-center gap-2 text-sm flex-wrap">
      <Link
        href="/"
        className="text-gold hover:text-gold-light transition-colors"
      >
        {t('\u0627\u0644\u0631\u0626\u064A\u0633\u064A\u0629', 'Home')}
      </Link>
      {items.map((item, idx) => (
        <span key={idx} className="flex items-center gap-2">
          <ChevronSeparator />
          {item.href ? (
            <Link
              href={item.href}
              className="text-gold hover:text-gold-light transition-colors"
            >
              {item.label}
            </Link>
          ) : (
            <span className="text-[var(--text-muted)] truncate max-w-[300px]">
              {item.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}
