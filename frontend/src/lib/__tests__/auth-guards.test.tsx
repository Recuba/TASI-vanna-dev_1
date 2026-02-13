import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { PermissionGuard } from '@/components/auth/PermissionGuard';
import { RoleGuard } from '@/components/auth/RoleGuard';
import { AccessDenied } from '@/components/auth/AccessDenied';

// Mock the auth context
const mockCheckPermission = vi.fn();
const mockCheckRole = vi.fn();
const mockAuth = {
  user: { id: '1', email: 'test@test.com', name: 'Test', role: 'analyst' as const },
  isLoading: false,
  isAuthenticated: true,
  login: vi.fn(),
  logout: vi.fn(),
  refreshSession: vi.fn(),
  checkPermission: mockCheckPermission,
  checkRole: mockCheckRole,
};

vi.mock('@/contexts/AuthContext', () => ({
  useRBACAuth: () => mockAuth,
}));

describe('PermissionGuard', () => {
  beforeEach(() => {
    mockCheckPermission.mockReset();
    mockCheckRole.mockReset();
  });

  it('renders children when user has permission', () => {
    mockCheckPermission.mockReturnValue(true);
    render(
      <PermissionGuard action="view" resource="reports">
        <div>Protected Content</div>
      </PermissionGuard>,
    );
    expect(screen.getByText('Protected Content')).toBeDefined();
  });

  it('renders nothing when user lacks permission', () => {
    mockCheckPermission.mockReturnValue(false);
    const { container } = render(
      <PermissionGuard action="manage" resource="users">
        <div>Admin Only</div>
      </PermissionGuard>,
    );
    expect(container.textContent).toBe('');
  });

  it('renders fallback when user lacks permission', () => {
    mockCheckPermission.mockReturnValue(false);
    render(
      <PermissionGuard
        action="manage"
        resource="users"
        fallback={<div>No Access</div>}
      >
        <div>Admin Only</div>
      </PermissionGuard>,
    );
    expect(screen.getByText('No Access')).toBeDefined();
    expect(screen.queryByText('Admin Only')).toBeNull();
  });

  it('renders nothing when loading', () => {
    mockAuth.isLoading = true;
    const { container } = render(
      <PermissionGuard action="view" resource="reports">
        <div>Content</div>
      </PermissionGuard>,
    );
    expect(container.textContent).toBe('');
    mockAuth.isLoading = false;
  });
});

describe('RoleGuard', () => {
  beforeEach(() => {
    mockCheckPermission.mockReset();
    mockCheckRole.mockReset();
    mockAuth.isAuthenticated = true;
    mockAuth.isLoading = false;
  });

  it('renders children when user meets role requirement', () => {
    mockCheckRole.mockReturnValue(true);
    render(
      <RoleGuard minimumRole="analyst">
        <div>Analyst Content</div>
      </RoleGuard>,
    );
    expect(screen.getByText('Analyst Content')).toBeDefined();
  });

  it('renders AccessDenied when user does not meet role', () => {
    mockCheckRole.mockReturnValue(false);
    render(
      <RoleGuard minimumRole="admin">
        <div>Admin Content</div>
      </RoleGuard>,
    );
    expect(screen.getByText('Access Denied')).toBeDefined();
    expect(screen.queryByText('Admin Content')).toBeNull();
  });

  it('renders custom fallback when user does not meet role', () => {
    mockCheckRole.mockReturnValue(false);
    render(
      <RoleGuard minimumRole="admin" fallback={<div>Custom Denied</div>}>
        <div>Admin Content</div>
      </RoleGuard>,
    );
    expect(screen.getByText('Custom Denied')).toBeDefined();
  });

  it('shows AccessDenied when not authenticated', () => {
    mockAuth.isAuthenticated = false;
    render(
      <RoleGuard minimumRole="viewer">
        <div>Content</div>
      </RoleGuard>,
    );
    expect(screen.getByText('Access Denied')).toBeDefined();
  });
});

describe('AccessDenied', () => {
  it('renders access denied message', () => {
    render(<AccessDenied />);
    expect(screen.getByText('Access Denied')).toBeDefined();
    expect(screen.getByText('Go Home')).toBeDefined();
    expect(screen.getByText('Sign In')).toBeDefined();
  });

  it('shows required role when provided', () => {
    render(<AccessDenied requiredRole="admin" />);
    expect(screen.getByText('admin')).toBeDefined();
  });
});
