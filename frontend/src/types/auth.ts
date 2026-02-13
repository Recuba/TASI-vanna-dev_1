/**
 * RBAC types and permission utilities for Ra'd AI.
 *
 * Role hierarchy: admin > analyst > viewer
 */

export type Role = 'admin' | 'analyst' | 'viewer';

export interface Permission {
  action: string;
  resource: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

/**
 * Ordered from most to least privileged.
 * Used by hasRole() for hierarchy checks.
 */
export const ROLE_HIERARCHY: readonly Role[] = ['admin', 'analyst', 'viewer'] as const;

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: [
    { action: 'manage', resource: 'users' },
    { action: 'manage', resource: 'settings' },
    { action: 'view', resource: 'admin_dashboard' },
    { action: 'export_data', resource: 'queries' },
    { action: 'execute', resource: 'queries' },
    { action: 'view', resource: 'reports' },
    { action: 'view', resource: 'news' },
    { action: 'view', resource: 'charts' },
    { action: 'view', resource: 'dashboard' },
  ],
  analyst: [
    { action: 'export_data', resource: 'queries' },
    { action: 'execute', resource: 'queries' },
    { action: 'view', resource: 'reports' },
    { action: 'view', resource: 'news' },
    { action: 'view', resource: 'charts' },
    { action: 'view', resource: 'dashboard' },
  ],
  viewer: [
    { action: 'view', resource: 'reports' },
    { action: 'view', resource: 'news' },
    { action: 'view', resource: 'charts' },
    { action: 'view', resource: 'dashboard' },
  ],
};

/**
 * Check if a role has a specific permission (action + resource).
 */
export function hasPermission(
  role: Role,
  action: string,
  resource: string,
): boolean {
  const permissions = ROLE_PERMISSIONS[role];
  if (!permissions) return false;
  return permissions.some((p) => p.action === action && p.resource === resource);
}

/**
 * Check if `userRole` meets or exceeds the `minimumRole` in the hierarchy.
 * admin >= analyst >= viewer
 */
export function hasRole(userRole: Role, minimumRole: Role): boolean {
  const userIndex = ROLE_HIERARCHY.indexOf(userRole);
  const minIndex = ROLE_HIERARCHY.indexOf(minimumRole);
  if (userIndex === -1 || minIndex === -1) return false;
  // Lower index = higher privilege
  return userIndex <= minIndex;
}
