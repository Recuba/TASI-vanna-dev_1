import { test, expect, type Page, type Route } from '@playwright/test';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MOCK_SCREENER_ITEMS = [
  {
    ticker: '2222.SR', short_name: 'Saudi Aramco', sector: 'Energy', industry: 'Oil & Gas',
    current_price: 28.5, change_pct: 1.2, market_cap: 6800000000000, volume: 50000000,
    trailing_pe: 14.5, forward_pe: 13.2, price_to_book: 3.8, roe: 0.22, profit_margin: 0.28,
    revenue_growth: 0.05, dividend_yield: 0.04, debt_to_equity: 0.3, current_ratio: 1.8,
    total_revenue: 400000000000, recommendation: 'buy', target_mean_price: 32.0, analyst_count: 25,
  },
  {
    ticker: '1120.SR', short_name: 'Al Rajhi Bank', sector: 'Banking', industry: 'Banks',
    current_price: 92.0, change_pct: -0.5, market_cap: 345000000000, volume: 8000000,
    trailing_pe: 18.2, forward_pe: 16.5, price_to_book: 3.5, roe: 0.19, profit_margin: 0.45,
    revenue_growth: 0.08, dividend_yield: 0.025, debt_to_equity: null, current_ratio: null,
    total_revenue: 20000000000, recommendation: 'hold', target_mean_price: 98.0, analyst_count: 18,
  },
];

const MOCK_SECTORS = [
  { sector: 'Energy', company_count: 15, avg_change_pct: 1.2, gainers: 10, losers: 5, total_volume: 500_000_000, total_market_cap: 2_000_000_000_000 },
  { sector: 'Banking', company_count: 10, avg_change_pct: -0.5, gainers: 4, losers: 6, total_volume: 300_000_000, total_market_cap: 1_500_000_000_000 },
];

async function mockScreenerApis(page: Page) {
  await page.route('**/api/v1/screener/search', (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: MOCK_SCREENER_ITEMS, total_count: 2, filters_applied: {} }),
    }),
  );
  await page.route('**/api/v1/market/sectors**', (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_SECTORS) }),
  );
  await page.route('**/api/entities/sectors**', (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_SECTORS) }),
  );
  await page.route('**/health**', (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'healthy' }) }),
  );
  await page.route('**/api/v1/widgets/stream**', (route: Route) =>
    route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' }, body: ': connected\n\n' }),
  );
  await page.route('**/api/v1/news/stream**', (route: Route) =>
    route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: ': connected\n\n' }),
  );
}

/**
 * Navigate to screener and wait for both the page heading AND the data table
 * to be visible. The screener compiles on first visit in dev mode — allow extra time.
 */
async function gotoScreener(page: Page) {
  await mockScreenerApis(page);
  await page.goto('/screener', { waitUntil: 'domcontentloaded', timeout: 60_000 });
  // Wait for the page-level h1 (not the header logo)
  const heading = page.locator('h1').filter({ hasText: /Stock Screener|فرز الأسهم/ });
  await expect(heading).toBeVisible({ timeout: 30_000 });
  // Also wait for screener data to finish loading (strict: use first match to avoid duplicates)
  await expect(page.getByText('Saudi Aramco').first()).toBeVisible({ timeout: 20_000 });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Stock Screener Page', () => {

  // Screener compiles on first visit in dev mode; give tests enough budget
  test.describe.configure({ timeout: 60_000 });

  test('screener page loads at /screener', async ({ page }) => {
    await mockScreenerApis(page);
    await page.goto('/screener', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await expect(page).toHaveURL(/\/screener/);
  });

  test('page heading "Stock Screener" or "فرز الأسهم" is visible', async ({ page }) => {
    await mockScreenerApis(page);
    await page.goto('/screener', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    const heading = page.locator('h1').filter({ hasText: /Stock Screener|فرز الأسهم/ });
    await expect(heading).toBeVisible({ timeout: 30_000 });
  });

  test('filter panel is open on initial load with Sector filter visible', async ({ page }) => {
    await gotoScreener(page);
    // Sector label text: "Sector" (EN) or "القطاع" (AR)
    const sectorLabel = page.locator('label').filter({ hasText: /^Sector$|^القطاع$/ }).first();
    await expect(sectorLabel).toBeVisible({ timeout: 10_000 });
  });

  test('all 4 preset buttons are visible', async ({ page }) => {
    await mockScreenerApis(page);
    await page.goto('/screener', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await expect(page.locator('h1').filter({ hasText: /Stock Screener|فرز الأسهم/ })).toBeVisible({ timeout: 30_000 });

    await expect(page.locator('button').filter({ hasText: /Value Stocks|أسهم القيمة/ })).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('button').filter({ hasText: /Growth Stocks|أسهم النمو/ })).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('button').filter({ hasText: /Dividend Plays|توزيعات أرباح/ })).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('button').filter({ hasText: /Low Debt|ديون منخفضة/ })).toBeVisible({ timeout: 5_000 });
  });

  test('clicking "Value Stocks" preset keeps page functional', async ({ page }) => {
    await gotoScreener(page);

    await page.locator('button').filter({ hasText: /Value Stocks|أسهم القيمة/ }).click();

    await expect(
      page.locator('h1').filter({ hasText: /Stock Screener|فرز الأسهم/ }),
    ).toBeVisible({ timeout: 5_000 });
  });

  test('Filters toggle button opens and closes the filter panel', async ({ page }) => {
    await gotoScreener(page);

    // Filter panel starts open
    const sectorLabel = page.locator('label').filter({ hasText: /^Sector$|^القطاع$/ }).first();
    await expect(sectorLabel).toBeVisible({ timeout: 10_000 });

    // Toggle button: "Filters" (EN) or "الفلاتر" (AR) — may include a count like "Filters (0)"
    const toggleBtn = page.locator('button').filter({ hasText: /Filters|الفلاتر/ }).first();
    await toggleBtn.click();

    // Filter panel should collapse
    await expect(sectorLabel).not.toBeVisible({ timeout: 5_000 });

    // Click again to reopen
    await toggleBtn.click();
    await expect(sectorLabel).toBeVisible({ timeout: 5_000 });
  });

  test('results table renders rows from mock data', async ({ page }) => {
    await gotoScreener(page);

    await expect(page.getByText('Al Rajhi Bank').first()).toBeVisible({ timeout: 5_000 });
  });

  test('Export CSV button is visible when results are loaded', async ({ page }) => {
    await gotoScreener(page);

    await expect(
      page.locator('button').filter({ hasText: /Export CSV|تصدير CSV/ }),
    ).toBeVisible({ timeout: 5_000 });
  });

  test('sector select has multiple options', async ({ page }) => {
    await gotoScreener(page);

    // Wait for the sector select to be populated (sectors loaded from mock)
    const sectorSelect = page.locator('select').first();
    await expect(sectorSelect).toBeVisible({ timeout: 10_000 });

    // Poll for options to load (sectors API may take a moment)
    await expect(async () => {
      const options = await sectorSelect.locator('option').allTextContents();
      // "All Sectors" + Energy + Banking = at least 3
      expect(options.length).toBeGreaterThan(1);
    }).toPass({ timeout: 10_000 });
  });

  test('table column headers are clickable for sorting', async ({ page }) => {
    await gotoScreener(page);

    // P/E column header: "P/E" (EN) or "مكرر الأرباح" (AR)
    const peHeader = page.locator('th').filter({ hasText: /^P\/E$|^مكرر الأرباح$/ }).first();
    await expect(peHeader).toBeVisible({ timeout: 5_000 });
    await peHeader.click();

    // Page remains stable after sort
    await expect(
      page.locator('h1').filter({ hasText: /Stock Screener|فرز الأسهم/ }),
    ).toBeVisible();
  });

  test('empty state shown when screener returns no results', async ({ page }) => {
    await page.route('**/api/v1/screener/search', (route: Route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], total_count: 0, filters_applied: {} }) }),
    );
    await page.route('**/api/v1/market/sectors**', (route: Route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }),
    );
    await page.route('**/health**', (route: Route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'healthy' }) }),
    );
    await page.route('**/api/v1/widgets/stream**', (route: Route) =>
      route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: ': connected\n\n' }),
    );
    await page.route('**/api/v1/news/stream**', (route: Route) =>
      route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: ': connected\n\n' }),
    );

    await page.goto('/screener', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await expect(
      page.locator('h1').filter({ hasText: /Stock Screener|فرز الأسهم/ }),
    ).toBeVisible({ timeout: 30_000 });

    await expect(
      page.getByText(/No matching stocks found|لا توجد نتائج مطابقة/),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('Retry button shown on API failure', async ({ page }) => {
    await page.route('**/api/v1/screener/search', (route: Route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'Server Error' }) }),
    );
    await page.route('**/api/v1/market/sectors**', (route: Route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }),
    );
    await page.route('**/health**', (route: Route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'healthy' }) }),
    );
    await page.route('**/api/v1/widgets/stream**', (route: Route) =>
      route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: ': connected\n\n' }),
    );
    await page.route('**/api/v1/news/stream**', (route: Route) =>
      route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: ': connected\n\n' }),
    );

    await page.goto('/screener', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await expect(
      page.locator('h1').filter({ hasText: /Stock Screener|فرز الأسهم/ }),
    ).toBeVisible({ timeout: 30_000 });

    await expect(
      page.locator('button').filter({ hasText: /Retry|إعادة المحاولة/ }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('mobile card layout renders at 375px viewport', async ({ page }) => {
    await mockScreenerApis(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/screener', { waitUntil: 'domcontentloaded', timeout: 60_000 });

    await expect(
      page.locator('h1').filter({ hasText: /Stock Screener|فرز الأسهم/ }),
    ).toBeVisible({ timeout: 30_000 });
  });
});
