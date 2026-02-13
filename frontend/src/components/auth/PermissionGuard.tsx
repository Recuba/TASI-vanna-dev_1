'use client';

import type { ReactNode } from 'react';
import { useRBACAuth } from '@/contexts/AuthContext';

interface PermissionGuardProps {
  action: string;
  resource: string;
  children: ReactNode;
  /** Rendered when user lacks permission. Defaults to null (hidden). */
  fallback?: ReactNode;
}

/**
 * Renders children only if the current user has the specified permission.
 */
export function PermissionGuard({
  action,
  resource,
  children,
  fallback = null,
}: PermissionGuardProps) {
  const { checkPermission, isLoading } = useRBACAuth();

  if (isLoading) return null;

  if (!checkPermission(action, resource)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
