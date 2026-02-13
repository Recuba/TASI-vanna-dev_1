'use client';

import type { ReactNode } from 'react';
import type { Role } from '@/types/auth';
import { useRBACAuth } from '@/contexts/AuthContext';
import { AccessDenied } from './AccessDenied';

interface RoleGuardProps {
  minimumRole: Role;
  children: ReactNode;
  /** Rendered when user does not meet the role. Defaults to AccessDenied page. */
  fallback?: ReactNode;
}

/**
 * Renders children only if the current user meets the minimum role level.
 */
export function RoleGuard({
  minimumRole,
  children,
  fallback,
}: RoleGuardProps) {
  const { checkRole, isLoading, isAuthenticated } = useRBACAuth();

  if (isLoading) return null;

  if (!isAuthenticated || !checkRole(minimumRole)) {
    return <>{fallback ?? <AccessDenied requiredRole={minimumRole} />}</>;
  }

  return <>{children}</>;
}
