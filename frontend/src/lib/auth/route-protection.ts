/**
 * Route protection logic for Next.js middleware.
 *
 * The security-headers teammate creates middleware.ts and can import
 * `protectRoute()` from this module to enforce role-based access.
 */

import { NextRequest, NextResponse } from 'next/server';
import type { Role } from '@/types/auth';
import { hasRole, ROLE_HIERARCHY } from '@/types/auth';
import { getAuthConfig } from '@/config/auth';

// ---------------------------------------------------------------------------
// Route -> minimum role mapping
// ---------------------------------------------------------------------------

export interface RouteRule {
  /** Path prefix (matched with startsWith) */
  pattern: string;
  /** Minimum role required, or 'public' for unauthenticated access */
  access: Role | 'public';
}

/**
 * Ordered route rules. First match wins, so more specific patterns go first.
 */
export const ROUTE_RULES: RouteRule[] = [
  { pattern: '/login', access: 'public' },
  { pattern: '/register', access: 'public' },
  { pattern: '/api/', access: 'public' },
  { pattern: '/_next/', access: 'public' },
  { pattern: '/favicon.ico', access: 'public' },
  { pattern: '/admin', access: 'admin' },
  { pattern: '/dashboard', access: 'analyst' },
  { pattern: '/', access: 'viewer' },
];

// ---------------------------------------------------------------------------
// Token inspection (lightweight, no signature verification)
// ---------------------------------------------------------------------------

interface TokenClaims {
  sub?: string;
  role?: string;
  exp?: number;
}

function parseTokenClaims(token: string): TokenClaims | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = Buffer.from(base64, 'base64').toString('utf-8');
    return JSON.parse(json) as TokenClaims;
  } catch {
    return null;
  }
}

function isTokenExpired(claims: TokenClaims): boolean {
  if (!claims.exp) return false;
  return Date.now() >= claims.exp * 1000;
}

function extractRoleFromClaims(claims: TokenClaims): Role {
  const r = claims.role;
  if (r === 'admin' || r === 'analyst' || r === 'viewer') return r;
  return 'viewer';
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * Evaluate route protection rules against the incoming request.
 *
 * Returns either:
 * - `null`              if access is allowed (caller should continue with NextResponse.next())
 * - a `NextResponse`    redirect/error if access is denied
 *
 * Usage in middleware.ts:
 * ```ts
 * import { protectRoute } from '@/lib/auth/route-protection';
 *
 * export function middleware(request: NextRequest) {
 *   const result = protectRoute(request);
 *   if (result) return result;
 *   return NextResponse.next();
 * }
 * ```
 */
export function protectRoute(request: NextRequest): NextResponse | null {
  const { pathname } = request.nextUrl;
  const config = getAuthConfig();

  // Find matching rule
  const rule = ROUTE_RULES.find((r) => pathname.startsWith(r.pattern));

  // No rule matched — default to viewer (require auth)
  const requiredAccess = rule?.access ?? 'viewer';

  // Public routes need no auth check
  if (requiredAccess === 'public') return null;

  // Extract token from cookie or Authorization header
  const tokenFromCookie = request.cookies.get('rad-ai-token')?.value;
  const authHeader = request.headers.get('authorization');
  const tokenFromHeader = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : undefined;
  const token = tokenFromCookie || tokenFromHeader;

  if (!token) {
    // Redirect to login
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = config.loginPath;
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  const claims = parseTokenClaims(token);
  if (!claims || isTokenExpired(claims)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = config.loginPath;
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Check role hierarchy
  const userRole = extractRoleFromClaims(claims);
  if (!hasRole(userRole, requiredAccess)) {
    // 403 — user is authenticated but lacks the role
    return new NextResponse('Forbidden', { status: 403 });
  }

  return null;
}

/**
 * Get the minimum role required for a given path.
 * Useful for UI components that need to know route requirements.
 */
export function getRouteRequirement(pathname: string): Role | 'public' {
  const rule = ROUTE_RULES.find((r) => pathname.startsWith(r.pattern));
  return rule?.access ?? 'viewer';
}
