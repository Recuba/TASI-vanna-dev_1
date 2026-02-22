/**
 * Playwright global setup.
 *
 * Verifies the dev server is reachable and prepares shared test state
 * (e.g. storage state files for authenticated sessions).
 */

import { chromium, type FullConfig } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

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
  //    Use /api/health (fast) instead of root which triggers slow compilation.
  // -----------------------------------------------------------------------
  if (!process.env.CI) {
    try {
      const res = await fetch(`${baseURL}/portfolio`, { signal: AbortSignal.timeout(10_000) });
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
  // 2. Create storage-state files for each test role so specs can reuse them.
  //    In local dev we write these directly as JSON to avoid browser launch
  //    overhead and Next.js compilation stalls on first-load. The specs for
  //    /screener, /calendar, /portfolio, /alerts do not require auth state,
  //    but the files must exist so other spec files that do use storageState
  //    can load without error.
  // -----------------------------------------------------------------------
  const authDir = path.resolve('./e2e/.auth');
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  for (const [role, user] of Object.entries(TEST_USERS)) {
    const token = fakeJwt({
      sub: user.id,
      email: user.email,
      role: user.role,
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    const storageState = {
      cookies: [],
      origins: [
        {
          origin: baseURL,
          localStorage: [
            { name: 'rad-ai-token', value: token },
            { name: 'rad-ai-refresh-token', value: 'fake-refresh-token' },
            {
              name: 'rad-ai-user',
              value: JSON.stringify({
                id: user.id,
                email: user.email,
                name: user.name,
              }),
            },
          ],
        },
      ],
    };

    const statePath = path.join(authDir, `${role}-state.json`);
    fs.writeFileSync(statePath, JSON.stringify(storageState, null, 2));
    console.log(`  Created storage state: ${statePath}`);
  }

  // -----------------------------------------------------------------------
  // 3. In CI, use a browser to set localStorage on the real origin so that
  //    the storage state files are valid for any spec that loads them.
  // -----------------------------------------------------------------------
  if (process.env.CI) {
    for (const [role, user] of Object.entries(TEST_USERS)) {
      const browser = await chromium.launch();
      const context = await browser.newContext({ baseURL });
      const page = await context.newPage();

      await page.goto('/portfolio', { waitUntil: 'domcontentloaded', timeout: 120_000 });

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
}
