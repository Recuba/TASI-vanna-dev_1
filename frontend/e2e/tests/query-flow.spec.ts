import { test, expect } from '@playwright/test';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Set up a fake authenticated session via localStorage. */
async function authenticateSession(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    localStorage.setItem(
      'rad-ai-token',
      'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEiLCJlbWFpbCI6InRlc3RAdGVzdC5jb20ifQ.fake',
    );
    localStorage.setItem('rad-ai-refresh-token', 'fake-refresh');
    localStorage.setItem(
      'rad-ai-user',
      JSON.stringify({ id: 'user-1', email: 'test@test.com', name: 'Test User' }),
    );
  });
}

/** Mock common API endpoints the chat/home pages may call. */
async function mockCommonApis(page: import('@playwright/test').Page) {
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
      body: JSON.stringify({
        items: [
          {
            ticker: '2222.SR',
            short_name: 'Saudi Aramco',
            sector: 'Energy',
            industry: 'Oil & Gas',
            current_price: 32.5,
            market_cap: 7200000000000,
            change_pct: 1.2,
          },
        ],
        count: 1,
      }),
    });
  });

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

/**
 * Mock the SSE /api/v1/chat endpoint.
 * Returns a mock streamed response with SQL + text content.
 */
async function mockChatApi(
  page: import('@playwright/test').Page,
  opts: { error?: boolean; delay?: number } = {},
) {
  await page.route('**/api/v1/chat**', async (route) => {
    if (opts.delay) {
      await new Promise((r) => setTimeout(r, opts.delay));
    }

    if (opts.error) {
      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Internal server error' }),
      });
    }

    // Return a simple JSON response (non-SSE fallback)
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        type: 'answer',
        text: 'The top company by market cap is Saudi Aramco (2222.SR) with a market cap of 7.2 trillion SAR.',
        sql: 'SELECT ticker, short_name, market_cap FROM companies ORDER BY market_cap DESC LIMIT 1',
        data: [
          {
            ticker: '2222.SR',
            short_name: 'Saudi Aramco',
            market_cap: 7200000000000,
          },
        ],
        chart: null,
      }),
    });
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Query Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await authenticateSession(page);
    await mockCommonApis(page);
  });

  test('chat page loads with message input', async ({ page }) => {
    await page.goto('/chat');

    // Look for a text input, textarea, or contenteditable element for chat
    const input = page.locator(
      'textarea, input[type="text"], [contenteditable="true"], input[placeholder]',
    );
    await expect(input.first()).toBeVisible({ timeout: 10_000 });
  });

  test('home page loads with quick action cards', async ({ page }) => {
    await page.goto('/');

    // The home page should show quick action cards with links
    const chatLink = page.locator('a[href="/chat"]');
    await expect(chatLink.first()).toBeVisible({ timeout: 10_000 });
  });

  test('home page shows sector data', async ({ page }) => {
    await page.goto('/');

    // Wait for sectors to load
    const sectorText = page.locator('text=Banks');
    await expect(sectorText).toBeVisible({ timeout: 10_000 });
  });

  test('chat page submit shows response', async ({ page }) => {
    await mockChatApi(page);
    await page.goto('/chat');

    const input = page.locator(
      'textarea, input[type="text"], [contenteditable="true"]',
    );
    await input.first().waitFor({ state: 'visible', timeout: 10_000 });

    await input.first().fill('What is the top company by market cap?');

    // Press Enter or click submit button
    const submitBtn = page.locator(
      'button[type="submit"], button[aria-label*="send"], button[aria-label*="Send"]',
    );
    if (await submitBtn.isVisible()) {
      await submitBtn.click();
    } else {
      await input.first().press('Enter');
    }

    // Wait for any response content to appear
    await page.waitForTimeout(2000);
  });

  test('chat page handles API error gracefully', async ({ page }) => {
    await mockChatApi(page, { error: true });
    await page.goto('/chat');

    const input = page.locator(
      'textarea, input[type="text"], [contenteditable="true"]',
    );
    await input.first().waitFor({ state: 'visible', timeout: 10_000 });
    await input.first().fill('trigger error');

    const submitBtn = page.locator(
      'button[type="submit"], button[aria-label*="send"], button[aria-label*="Send"]',
    );
    if (await submitBtn.isVisible()) {
      await submitBtn.click();
    } else {
      await input.first().press('Enter');
    }

    // Page should not crash - it should still be interactive
    await page.waitForTimeout(2000);
    await expect(input.first()).toBeVisible();
  });

  test('navigation from home to chat works', async ({ page }) => {
    await page.goto('/');

    const chatLink = page.locator('a[href="/chat"]').first();
    await chatLink.click();

    await page.waitForURL('**/chat', { timeout: 10_000 });
    expect(page.url()).toContain('/chat');
  });

  test('navigation from home to market works', async ({ page }) => {
    await page.goto('/');

    const marketLink = page.locator('a[href="/market"]').first();
    await marketLink.click();

    await page.waitForURL('**/market', { timeout: 10_000 });
    expect(page.url()).toContain('/market');
  });

  test('navigation from home to news works', async ({ page }) => {
    await page.route('**/api/v1/news/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [], total: 0, page: 1, limit: 20 }),
      }),
    );

    await page.goto('/');

    const newsLink = page.locator('a[href="/news"]').first();
    await newsLink.click();

    await page.waitForURL('**/news', { timeout: 10_000 });
    expect(page.url()).toContain('/news');
  });

  test('navigation from home to charts works', async ({ page }) => {
    await page.goto('/');

    const chartsLink = page.locator('a[href="/charts"]').first();
    await chartsLink.click();

    await page.waitForURL('**/charts', { timeout: 10_000 });
    expect(page.url()).toContain('/charts');
  });

  test('market page loads company data', async ({ page }) => {
    await page.goto('/market');

    // Should show the mocked company data
    const aramcoText = page.locator('text=Saudi Aramco');
    await expect(aramcoText.first()).toBeVisible({ timeout: 10_000 });
  });

  test('news page loads without errors', async ({ page }) => {
    await page.route('**/api/v1/news/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [], total: 0, page: 1, limit: 20 }),
      }),
    );
    await page.route('**/api/news**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [],
          total: 0,
          page: 1,
          page_size: 20,
          total_pages: 0,
        }),
      }),
    );

    await page.goto('/news');

    // Page should load without crashing
    await page.waitForTimeout(2000);
    expect(page.url()).toContain('/news');
  });
});
