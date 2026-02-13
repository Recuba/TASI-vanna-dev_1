/**
 * Playwright global setup.
 *
 * Verifies the dev server is reachable and prepares shared test state
 * (e.g. storage state files for authenticated sessions).
 */

import { chromium, type FullConfig } from '@playwright/test';

/** Simple JWT-like token for E2E test sessions (not cryptographically valid). */
function fakeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = btoa(JSON.stringify(payload));
  const sig = btoa('test-signature');
  return `${header}.${body}.${sig}`;
}

export const TEST_USERS = {
  admin: {
    email: 'admin@test.com',
    name: 'Test Admin',
    id: 'user-admin-001',
    role: 'admin',
  },
  analyst: {
    email: 'analyst@test.com',
    name: 'Test Analyst',
    id: 'user-analyst-001',
    role: 'analyst',
  },
  viewer: {
    email: 'viewer@test.com',
    name: 'Test Viewer',
    id: 'user-viewer-001',
    role: 'viewer',
  },
} as const;

export default async function globalSetup(_config: FullConfig) {
  const baseURL = process.env.BASE_URL || 'http://localhost:3000';

  // -----------------------------------------------------------------------
  // 1. Verify dev server is reachable (skip in CI -- webServer handles it)
  // -----------------------------------------------------------------------
  if (!process.env.CI) {
    try {
      const res = await fetch(baseURL, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) {
        console.warn(
          `Dev server responded with ${res.status}. Tests may fail.`,
        );
      }
    } catch {
      console.warn(
        `Could not reach dev server at ${baseURL}. ` +
          'Make sure "npm run dev" is running.',
      );
    }
  }

  // -----------------------------------------------------------------------
  // 2. Create storage-state files for each test role so specs can reuse them
  // -----------------------------------------------------------------------
  for (const [role, user] of Object.entries(TEST_USERS)) {
    const browser = await chromium.launch();
    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();

    // Navigate to a page so localStorage is on the correct origin
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const token = fakeJwt({
      sub: user.id,
      email: user.email,
      role: user.role,
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    await page.evaluate(
      ({ token, user }) => {
        localStorage.setItem('rad-ai-token', token);
        localStorage.setItem('rad-ai-refresh-token', 'fake-refresh-token');
        localStorage.setItem(
          'rad-ai-user',
          JSON.stringify({
            id: user.id,
            email: user.email,
            name: user.name,
          }),
        );
      },
      { token, user },
    );

    await context.storageState({
      path: `./e2e/.auth/${role}-state.json`,
    });

    await browser.close();
  }
}
