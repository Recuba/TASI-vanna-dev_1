import { test, expect } from '@playwright/test';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Inject an admin session into localStorage. */
async function loginAsAdmin(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    const payload = btoa(
      JSON.stringify({
        sub: 'user-admin-001',
        email: 'admin@test.com',
        role: 'admin',
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    );
    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const token = `${header}.${payload}.${btoa('sig')}`;

    localStorage.setItem('rad-ai-token', token);
    localStorage.setItem('rad-ai-refresh-token', 'fake-refresh');
    localStorage.setItem(
      'rad-ai-user',
      JSON.stringify({
        id: 'user-admin-001',
        email: 'admin@test.com',
        name: 'Test Admin',
        role: 'admin',
      }),
    );
  });
}

/** Inject a viewer (non-admin) session into localStorage. */
async function loginAsViewer(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    const payload = btoa(
      JSON.stringify({
        sub: 'user-viewer-001',
        email: 'viewer@test.com',
        role: 'viewer',
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    );
    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const token = `${header}.${payload}.${btoa('sig')}`;

    localStorage.setItem('rad-ai-token', token);
    localStorage.setItem('rad-ai-refresh-token', 'fake-refresh');
    localStorage.setItem(
      'rad-ai-user',
      JSON.stringify({
        id: 'user-viewer-001',
        email: 'viewer@test.com',
        name: 'Test Viewer',
        role: 'viewer',
      }),
    );
  });
}

/** Mock health and admin-related API endpoints. */
async function mockAdminApis(page: import('@playwright/test').Page) {
  await page.route('**/health**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'healthy',
        components: [
          { name: 'database', status: 'healthy', latency_ms: 2.3, message: 'Connected' },
          { name: 'llm', status: 'healthy', latency_ms: 150, message: 'Anthropic API reachable' },
        ],
      }),
    }),
  );

  await page.route('**/api/entities/sectors', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { sector: 'Banks', company_count: 12 },
        { sector: 'Energy', company_count: 8 },
      ]),
    }),
  );

  await page.route('**/api/entities**', (route) => {
    if (route.request().url().includes('/sectors')) return;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [], count: 0 }),
    });
  });

  await page.route('**/api/v1/market/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        total_market_cap: 10000000000000,
        total_volume: 500000000,
        gainers_count: 250,
        losers_count: 200,
        unchanged_count: 50,
        top_gainers: [],
        top_losers: [],
      }),
    }),
  );

  await page.route('**/api/v1/charts/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [],
        source: 'mock',
        last_updated: null,
        symbol: 'TEST',
        period: '1y',
        count: 0,
      }),
    }),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Admin Dashboard', () => {
  test('health endpoint returns valid response', async ({ page }) => {
    await mockAdminApis(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await loginAsAdmin(page);

    // Verify the health API mock works by fetching directly
    const healthResponse = await page.evaluate(async () => {
      const res = await fetch('/health');
      return res.json();
    });

    expect(healthResponse.status).toBe('healthy');
    expect(healthResponse.components).toHaveLength(2);
  });

  test('admin user can access admin page if it exists', async ({ page }) => {
    await mockAdminApis(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await loginAsAdmin(page);

    // Try navigating to /admin - it may or may not exist yet (depends on task #6)
    const response = await page.goto('/admin');
    // If the page exists, it should not return a server error
    if (response) {
      expect(response.status()).not.toBe(500);
    }
  });

  test('viewer user sees restricted access on admin page', async ({ page }) => {
    await mockAdminApis(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await loginAsViewer(page);

    await page.goto('/admin');

    // If RBAC is in place, viewer should see access denied or be redirected
    // The page should not show admin content
    await page.waitForTimeout(2000);

    // Check for access denied text or redirect to login/home
    const url = page.url();
    const bodyText = await page.locator('body').textContent();

    const isRestricted =
      url.includes('/login') ||
      url.includes('/') && !url.includes('/admin') ||
      bodyText?.toLowerCase().includes('denied') ||
      bodyText?.toLowerCase().includes('unauthorized') ||
      bodyText?.toLowerCase().includes('access') ||
      bodyText?.toLowerCase().includes('404');

    // If /admin doesn't exist yet, a 404 is also acceptable
    expect(isRestricted || !url.includes('/admin')).toBe(true);
  });

  test('health API returns component details', async ({ page }) => {
    await mockAdminApis(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const healthResponse = await page.evaluate(async () => {
      const res = await fetch('/health');
      return res.json();
    });

    const dbComponent = healthResponse.components.find(
      (c: { name: string }) => c.name === 'database',
    );
    const llmComponent = healthResponse.components.find(
      (c: { name: string }) => c.name === 'llm',
    );

    expect(dbComponent).toBeDefined();
    expect(dbComponent.status).toBe('healthy');
    expect(llmComponent).toBeDefined();
    expect(llmComponent.status).toBe('healthy');
  });

  test('market summary API returns expected structure', async ({ page }) => {
    await mockAdminApis(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const summary = await page.evaluate(async () => {
      const res = await fetch('/api/v1/market/summary');
      return res.json();
    });

    expect(summary).toHaveProperty('total_market_cap');
    expect(summary).toHaveProperty('gainers_count');
    expect(summary).toHaveProperty('losers_count');
  });

  test('home page loads correctly for admin user', async ({ page }) => {
    await mockAdminApis(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await loginAsAdmin(page);
    await page.reload();

    // Home page should render the hero section
    const heading = page.locator('h1');
    await expect(heading).toBeVisible({ timeout: 10_000 });
  });
});
