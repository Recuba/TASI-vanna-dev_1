'use client';

import Link from 'next/link';
import type { Role } from '@/types/auth';

interface AccessDeniedProps {
  requiredRole?: Role;
}

/**
 * Dark-gold themed access denied page.
 */
export function AccessDenied({ requiredRole }: AccessDeniedProps) {
  return (
    <div className="flex flex-1 items-center justify-center min-h-[60vh] px-4">
      <div className="text-center space-y-4 max-w-md">
        {/* Shield icon */}
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-xl bg-red-500/10 border border-red-500/20">
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="text-red-400"
          >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        </div>

        <h1 className="text-xl font-bold text-[var(--text-primary)]">
          Access Denied
        </h1>

        <p className="text-sm text-[var(--text-muted)]">
          You do not have permission to view this page.
          {requiredRole && (
            <span>
              {' '}
              This area requires <span className="text-gold font-medium">{requiredRole}</span> access
              or higher.
            </span>
          )}
        </p>

        <div className="flex justify-center gap-3 pt-2">
          <Link
            href="/"
            className="px-4 py-2 text-sm font-medium rounded-md bg-gold/10 border border-gold/20 text-gold hover:bg-gold/20 transition-colors"
          >
            Go Home
          </Link>
          <Link
            href="/login"
            className="px-4 py-2 text-sm font-medium rounded-md bg-gold text-[#0E0E0E] hover:bg-[#e0b85c] transition-colors"
          >
            Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}
