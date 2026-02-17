import { test, expect, type Page, type Route } from '@playwright/test';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Mock all API calls the markets page makes. */
async function mockMarketsApis(page: Page) {
  // Market analytics endpoints
  await page.route('**/api/v1/market/**', (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        total_market_cap: 9_500_000_000_000,
        total_volume: 1_200_000_000,
        gainers_count: 120,
        losers_count: 80,
        unchanged_count: 30,
        top_gainers: [],
        top_losers: [],
      }),
    }),
  );

  // Market live data (SSE or polling)
  await page.route('**/api/v1/market/live**', (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ instruments: [], status: 'ok' }),
    }),
  );

  // Market sectors
  await page.route('**/api/v1/market/sectors**', (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { sector: 'Energy', avg_change_pct: 1.2, company_count: 15, gainers: 10, losers: 5, total_volume: 500_000_000, total_market_cap: 2_000_000_000_000 },
        { sector: 'Banking', avg_change_pct: -0.5, company_count: 10, gainers: 4, losers: 6, total_volume: 300_000_000, total_market_cap: 1_500_000_000_000 },
      ]),
    }),
  );

  // Health endpoint (Header component polls this)
  await page.route('**/health**', (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'healthy' }),
    }),
  );

  // Widgets SSE stream
  await page.route('**/api/v1/widgets/stream**', (route: Route) =>
    route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
      body: ': connected\n\n',
    }),
  );

  // News stream SSE
  await page.route('**/api/v1/news/stream**', (route: Route) =>
    route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
      body: ': connected\n\n',
    }),
  );
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

test.describe('Markets Page', () => {
  // -------------------------------------------------------------------------
  // 1. Page loads and URL is correct
  // -------------------------------------------------------------------------
  test('markets page loads at /markets', async ({ page }) => {
    await mockMarketsApis(page);
    await page.goto('/markets', { waitUntil: 'domcontentloaded' });

    await expect(page).toHaveURL(/\/markets/);
  });

  // -------------------------------------------------------------------------
  // 2. Page heading is visible
  // -------------------------------------------------------------------------
  test('page title or heading is visible', async ({ page }) => {
    await mockMarketsApis(page);
    await page.goto('/markets', { waitUntil: 'domcontentloaded' });

    // The MarketHeader renders an h1 with "Market Overview 360°" (en) or "نظرة 360°" (ar)
    const heading = page.locator('h1');
    await expect(heading).toBeVisible({ timeout: 15_000 });
    const text = await heading.textContent();
    expect(text).toBeTruthy();
    // Should contain either English or Arabic version of the market overview title
    expect(text).toMatch(/Market Overview|نظرة|360/);
  });

  // -------------------------------------------------------------------------
  // 3. Breadcrumb navigation appears
  // -------------------------------------------------------------------------
  test('navigation breadcrumb appears', async ({ page }) => {
    await mockMarketsApis(page);
    await page.goto('/markets', { waitUntil: 'domcontentloaded' });

    // Breadcrumb renders inside a <nav> element
    const breadcrumb = page.locator('nav[aria-label], nav').first();
    await expect(breadcrumb).toBeVisible({ timeout: 15_000 });
  });

  // -------------------------------------------------------------------------
  // 4. Category legend is visible
  // -------------------------------------------------------------------------
  test('category legend is visible', async ({ page }) => {
    await mockMarketsApis(page);
    await page.goto('/markets', { waitUntil: 'domcontentloaded' });

    // CategoryLegend renders legend items with text like "Positive corr." or "ارتباط إيجابي"
    // and "Inverse corr." or "ارتباط عكسي"
    const legendContainer = page.locator('text=/Positive corr|ارتباط إيجابي|Inverse corr|ارتباط عكسي/').first();
    await expect(legendContainer).toBeVisible({ timeout: 15_000 });
  });

  // -------------------------------------------------------------------------
  // 5. Market instruments section renders (constellation canvas or mobile cards)
  // -------------------------------------------------------------------------
  test('market data section renders instruments or mobile cards', async ({ page }) => {
    await mockMarketsApis(page);
    await page.goto('/markets', { waitUntil: 'domcontentloaded' });

    // The page renders either a canvas (ConstellationCanvas) or mobile instrument cards.
    // At least one of these must be present.
    const canvas = page.locator('canvas');
    const mobileCards = page.locator('[class*="MobileCard"], [data-testid="mobile-card"]');
    const marketSummary = page.locator('text=/Market Summary|ملخص السوق/').first();

    // At least one data presentation element should be visible
    const hasCanvas = await canvas.count().then((c) => c > 0);
    const hasMobileCards = await mobileCards.count().then((c) => c > 0);
    const hasSummary = await marketSummary.isVisible({ timeout: 15_000 }).catch(() => false);

    expect(hasCanvas || hasMobileCards || hasSummary).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 6. Mobile card view works at narrow viewport
  // -------------------------------------------------------------------------
  test('mobile card view renders at narrow viewport (375px)', async ({ page }) => {
    await mockMarketsApis(page);

    // Set viewport to mobile width before navigating
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/markets', { waitUntil: 'domcontentloaded' });

    // MobileSummary is rendered inside a div.lg:hidden — visible on mobile
    // It contains the "Market Summary" / "ملخص السوق" heading
    const mobileSummary = page.locator('.lg\\:hidden').first();
    await expect(mobileSummary).toBeVisible({ timeout: 15_000 });
  });

  // -------------------------------------------------------------------------
  // 7. Correlation legend items render with correct labels
  // -------------------------------------------------------------------------
  test('correlation type indicators (positive / inverse) are displayed', async ({ page }) => {
    await mockMarketsApis(page);
    await page.goto('/markets', { waitUntil: 'domcontentloaded' });

    // CategoryLegend renders "+ρ" and "−ρ" labels alongside the legend items
    const rhoLabels = page.locator('text=/[+\u2212][\u03C1]/');
    // At least one rho label should be present in the legend
    await expect(rhoLabels.first()).toBeVisible({ timeout: 15_000 });
  });

  // -------------------------------------------------------------------------
  // 8. Connection status badge renders
  // -------------------------------------------------------------------------
  test('connection status badge renders with LIVE, STALE, or OFFLINE label', async ({ page }) => {
    await mockMarketsApis(page);
    await page.goto('/markets', { waitUntil: 'domcontentloaded' });

    // The MarketHeader renders a status badge with text LIVE / STALE / OFFLINE
    const statusBadge = page.locator('text=/^(LIVE|STALE|OFFLINE)$/').first();
    await expect(statusBadge).toBeVisible({ timeout: 15_000 });
  });
});
