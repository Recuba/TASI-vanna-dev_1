import { describe, it, expect } from 'vitest';
import {
  hasPermission,
  hasRole,
  ROLE_HIERARCHY,
  ROLE_PERMISSIONS,
  type Role,
} from '@/types/auth';

describe('auth types', () => {
  describe('ROLE_HIERARCHY', () => {
    it('has admin, analyst, viewer in order', () => {
      expect(ROLE_HIERARCHY).toEqual(['admin', 'analyst', 'viewer']);
    });
  });

  describe('ROLE_PERMISSIONS', () => {
    it('admin has manage users permission', () => {
      const perms = ROLE_PERMISSIONS.admin;
      expect(perms.some((p) => p.action === 'manage' && p.resource === 'users')).toBe(true);
    });

    it('analyst does not have manage users permission', () => {
      const perms = ROLE_PERMISSIONS.analyst;
      expect(perms.some((p) => p.action === 'manage' && p.resource === 'users')).toBe(false);
    });

    it('viewer can view reports', () => {
      const perms = ROLE_PERMISSIONS.viewer;
      expect(perms.some((p) => p.action === 'view' && p.resource === 'reports')).toBe(true);
    });

    it('viewer cannot export data', () => {
      const perms = ROLE_PERMISSIONS.viewer;
      expect(perms.some((p) => p.action === 'export_data')).toBe(false);
    });

    it('analyst can export data', () => {
      const perms = ROLE_PERMISSIONS.analyst;
      expect(perms.some((p) => p.action === 'export_data' && p.resource === 'queries')).toBe(true);
    });
  });

  describe('hasPermission', () => {
    it('returns true for valid admin permission', () => {
      expect(hasPermission('admin', 'manage', 'users')).toBe(true);
    });

    it('returns false for invalid permission', () => {
      expect(hasPermission('viewer', 'manage', 'users')).toBe(false);
    });

    it('returns false for unknown action', () => {
      expect(hasPermission('admin', 'unknown_action', 'users')).toBe(false);
    });

    it('returns false for unknown role', () => {
      expect(hasPermission('superadmin' as Role, 'manage', 'users')).toBe(false);
    });
  });

  describe('hasRole', () => {
    it('admin meets admin requirement', () => {
      expect(hasRole('admin', 'admin')).toBe(true);
    });

    it('admin meets analyst requirement', () => {
      expect(hasRole('admin', 'analyst')).toBe(true);
    });

    it('admin meets viewer requirement', () => {
      expect(hasRole('admin', 'viewer')).toBe(true);
    });

    it('analyst meets analyst requirement', () => {
      expect(hasRole('analyst', 'analyst')).toBe(true);
    });

    it('analyst does NOT meet admin requirement', () => {
      expect(hasRole('analyst', 'admin')).toBe(false);
    });

    it('viewer meets viewer requirement', () => {
      expect(hasRole('viewer', 'viewer')).toBe(true);
    });

    it('viewer does NOT meet analyst requirement', () => {
      expect(hasRole('viewer', 'analyst')).toBe(false);
    });

    it('unknown role returns false', () => {
      expect(hasRole('guest' as Role, 'viewer')).toBe(false);
    });
  });
});
