import { test, expect, type Page, type Route } from '@playwright/test';

// ---------------------------------------------------------------------------
// Test data factories
// ---------------------------------------------------------------------------

function makeStockDetail(ticker = '2222.SR') {
  return {
    ticker,
    short_name: 'Saudi Aramco',
    long_name: 'Saudi Arabian Oil Company',
    sector: 'Energy',
    industry: 'Oil & Gas',
    currency: 'SAR',
    exchange: 'Tadawul',
    current_price: 31.5,
    previous_close: 31.2,
    day_low: 31.0,
    day_high: 31.8,
    week_52_low: 25.0,
    week_52_high: 35.5,
    volume: 12_000_000,
    market_cap: 7_500_000_000_000,
    beta: 0.82,
    trailing_pe: 14.5,
    forward_pe: 13.2,
    price_to_book: 3.1,
    trailing_eps: 2.17,
    roe: 0.28,
    profit_margin: 0.24,
    revenue_growth: 0.05,
    recommendation: 'BUY',
    target_mean_price: 36.0,
    analyst_count: 18,
  };
}

function makeFinancialData() {
  return {
    periods: [
      {
        period_index: 0,
        period_date: '2023-12-31',
        period_type: 'annual',
        data: {
          total_revenue: 1_200_000_000_000,
          net_income: 288_000_000_000,
          gross_profit: 600_000_000_000,
          operating_income: 400_000_000_000,
          ebitda: 450_000_000_000,
        },
      },
      {
        period_index: 1,
        period_date: '2022-12-31',
        period_type: 'annual',
        data: {
          total_revenue: 1_350_000_000_000,
          net_income: 316_000_000_000,
          gross_profit: 680_000_000_000,
          operating_income: 480_000_000_000,
          ebitda: 530_000_000_000,
        },
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Mock all API calls the stock detail page makes for ticker 2222. */
async function mockStockApis(page: Page, ticker = '2222.SR') {
  const encodedTicker = encodeURIComponent(ticker);

  // Stock detail (company + valuation + profitability)
  await page.route(`**/api/v1/stocks/${encodedTicker}**`, (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(makeStockDetail(ticker)),
    }),
  );

  // Wildcard for any stock endpoint
  await page.route(`**/api/v1/stocks/**`, (route: Route) => {
    const url = route.request().url();
    // Financial statements
    if (url.includes('/financials')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(makeFinancialData()),
      });
    }
    // Dividends
    if (url.includes('/dividends')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          dividend_rate: 0.75,
          dividend_yield: 0.024,
          payout_ratio: 0.34,
          five_year_avg_dividend_yield: 3.5,
          ex_dividend_date: '2024-03-15',
          last_dividend_value: 0.75,
          last_dividend_date: '2024-01-10',
          trailing_annual_dividend_rate: 3.0,
          trailing_annual_dividend_yield: 0.095,
        }),
      });
    }
    // Financial summary
    if (url.includes('/financial-summary')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total_revenue: 1_200_000_000_000,
          revenue_per_share: 48.5,
          total_cash: 280_000_000_000,
          total_debt: 150_000_000_000,
          debt_to_equity: 0.28,
          current_ratio: 1.8,
          quick_ratio: 1.5,
          ebitda: 450_000_000_000,
          gross_profit: 600_000_000_000,
          free_cashflow: 130_000_000_000,
          operating_cashflow: 200_000_000_000,
        }),
      });
    }
    // OHLCV chart data
    if (url.includes('/ohlcv')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { time: '2024-01-02', open: 30.5, high: 31.2, low: 30.1, close: 31.0, volume: 8_000_000 },
          { time: '2024-01-03', open: 31.0, high: 31.8, low: 30.8, close: 31.5, volume: 10_000_000 },
        ]),
      });
    }
    // Fallback for other stock endpoints
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(makeStockDetail(ticker)),
    });
  });

  // News by ticker
  await page.route('**/api/v1/news/feed**', (route: Route) => {
    if (route.request().url().includes('/batch')) return route.continue();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          {
            id: 'news-1',
            title: 'Aramco Reports Record Profits',
            body: 'Saudi Aramco announced record profits...',
            source_name: 'العربية',
            source_url: 'https://example.com/1',
            published_at: new Date().toISOString(),
            sentiment_score: 0.8,
            sentiment_label: 'إيجابي',
            priority: 3,
            language: 'ar',
            created_at: new Date().toISOString(),
            ticker,
          },
        ],
        total: 1,
        page: 1,
        limit: 5,
      }),
    });
  });

  // Reports by ticker
  await page.route('**/api/v1/reports**', (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [], total: 0, page: 1, limit: 5 }),
    }),
  );

  // Health endpoint
  await page.route('**/health**', (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'healthy' }),
    }),
  );

  // SSE streams
  await page.route('**/api/v1/widgets/stream**', (route: Route) =>
    route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
      body: ': connected\n\n',
    }),
  );

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

test.describe('Stock Detail Page', () => {
  // -------------------------------------------------------------------------
  // 1. Stock detail page loads at /stock/2222
  // -------------------------------------------------------------------------
  test('stock detail page loads at /stock/2222', async ({ page }) => {
    await mockStockApis(page);
    await page.goto('/stock/2222', { waitUntil: 'domcontentloaded' });

    await expect(page).toHaveURL(/\/stock\/2222/);
  });

  // -------------------------------------------------------------------------
  // 2. Stock header shows ticker and company name
  // -------------------------------------------------------------------------
  test('stock header shows ticker badge and company name', async ({ page }) => {
    await mockStockApis(page);
    await page.goto('/stock/2222', { waitUntil: 'domcontentloaded' });

    // Company name heading (h1)
    const companyName = page.locator('h1');
    await expect(companyName).toBeVisible({ timeout: 15_000 });
    await expect(companyName).toContainText('Saudi Aramco');

    // Ticker badge: a span/badge showing the ticker code "2222.SR"
    const tickerBadge = page.locator('text=2222.SR').first();
    await expect(tickerBadge).toBeVisible({ timeout: 10_000 });
  });

  // -------------------------------------------------------------------------
  // 3. Price and change percentage are displayed
  // -------------------------------------------------------------------------
  test('price and change percentage are displayed', async ({ page }) => {
    await mockStockApis(page);
    await page.goto('/stock/2222', { waitUntil: 'domcontentloaded' });

    // Current price: rendered as "31.50" with "SAR" unit
    const priceEl = page.locator('text=31.50').first();
    await expect(priceEl).toBeVisible({ timeout: 15_000 });

    // Change indicator: rendered as "+0.30 (0.96%)" with a ▲ or ▼ symbol
    // The price change section has a text matching +/- pattern with %
    const changeEl = page.locator('text=/%/').first();
    await expect(changeEl).toBeVisible({ timeout: 10_000 });
  });

  // -------------------------------------------------------------------------
  // 4. Navigation breadcrumb appears
  // -------------------------------------------------------------------------
  test('breadcrumb navigation appears with Home > Market links', async ({ page }) => {
    await mockStockApis(page);
    await page.goto('/stock/2222', { waitUntil: 'domcontentloaded' });

    // Breadcrumb nav with Home and Market links
    const homeLink = page.locator('nav a').filter({ hasText: /Home|الرئيسية/ });
    await expect(homeLink).toBeVisible({ timeout: 15_000 });

    const marketLink = page.locator('nav a').filter({ hasText: /Market|السوق/ });
    await expect(marketLink).toBeVisible({ timeout: 10_000 });
  });

  // -------------------------------------------------------------------------
  // 5. Watchlist button is interactive
  // -------------------------------------------------------------------------
  test('watchlist button toggles watchlist state', async ({ page }) => {
    await mockStockApis(page);
    await page.goto('/stock/2222', { waitUntil: 'domcontentloaded' });

    // Watchlist button: aria-label "Add to watchlist" or "إضافة للمفضلة"
    const watchlistBtn = page.locator('button[aria-label*="watchlist"], button[aria-label*="مفضلة"]').first();
    await expect(watchlistBtn).toBeVisible({ timeout: 15_000 });

    // Click to add to watchlist
    await watchlistBtn.click();

    // After clicking, aria-label should change to "Remove from watchlist"
    const removeBtn = page.locator('button[aria-label*="Remove from watchlist"], button[aria-label*="إزالة من المفضلة"]').first();
    await expect(removeBtn).toBeVisible({ timeout: 5_000 });
  });

  // -------------------------------------------------------------------------
  // 6. Tab navigation renders Overview, Financials, Dividends, News tabs
  // -------------------------------------------------------------------------
  test('page tab navigation renders all four tabs', async ({ page }) => {
    await mockStockApis(page);
    await page.goto('/stock/2222', { waitUntil: 'domcontentloaded' });

    // The tab bar has role="tablist" with 4 tabs
    const tablist = page.locator('[role="tablist"]');
    await expect(tablist).toBeVisible({ timeout: 15_000 });

    const tabs = tablist.locator('[role="tab"]');
    await expect(tabs).toHaveCount(4);

    // Verify tab labels (English or Arabic)
    const tabTexts = await tabs.allTextContents();
    const joined = tabTexts.join(' ');
    expect(joined).toMatch(/Overview|نظرة عامة/);
    expect(joined).toMatch(/Financials|البيانات المالية/);
    expect(joined).toMatch(/Dividends|التوزيعات/);
    expect(joined).toMatch(/News|الأخبار/);
  });

  // -------------------------------------------------------------------------
  // 7. Switching to Financials tab shows financial statements section
  // -------------------------------------------------------------------------
  test('switching to Financials tab shows financial statements', async ({ page }) => {
    await mockStockApis(page);
    await page.goto('/stock/2222', { waitUntil: 'domcontentloaded' });

    // Wait for tabs to render
    const tablist = page.locator('[role="tablist"]');
    await expect(tablist).toBeVisible({ timeout: 15_000 });

    // Click the Financials tab
    const financialsTab = tablist.locator('[role="tab"]').filter({
      hasText: /Financials|البيانات المالية/,
    });
    await expect(financialsTab).toBeVisible();
    await financialsTab.click();

    // The FinancialStatementsSection renders a <section> with h2 "Financial Statements"
    const statementsSection = page.locator('text=/Financial Statements|القوائم المالية/').first();
    await expect(statementsSection).toBeVisible({ timeout: 10_000 });

    // Statement type tabs: Income Statement, Balance Sheet, Cash Flow
    const incomeTab = page.locator('button').filter({ hasText: /Income Statement|قائمة الدخل/ }).first();
    await expect(incomeTab).toBeVisible();

    const balanceTab = page.locator('button').filter({ hasText: /Balance Sheet|الميزانية/ }).first();
    await expect(balanceTab).toBeVisible();

    const cashFlowTab = page.locator('button').filter({ hasText: /Cash Flow|التدفقات النقدية/ }).first();
    await expect(cashFlowTab).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // 8. Tab switching between income/balance/cashflow works
  // -------------------------------------------------------------------------
  test('statement type tabs switch between income, balance, and cash flow', async ({ page }) => {
    await mockStockApis(page);
    await page.goto('/stock/2222', { waitUntil: 'domcontentloaded' });

    // Navigate to Financials tab first
    const tablist = page.locator('[role="tablist"]');
    await expect(tablist).toBeVisible({ timeout: 15_000 });

    const financialsTab = tablist.locator('[role="tab"]').filter({
      hasText: /Financials|البيانات المالية/,
    });
    await financialsTab.click();

    // Wait for the statement tabs to render
    const balanceTab = page.locator('button').filter({ hasText: /Balance Sheet|الميزانية/ }).first();
    await expect(balanceTab).toBeVisible({ timeout: 10_000 });

    // Click Balance Sheet tab
    await balanceTab.click();

    // The table should update — wait for a balance-sheet-specific field label
    // "Total Assets" or "إجمالي الأصول" should appear
    const totalAssetsRow = page.locator('text=/Total Assets|إجمالي الأصول/').first();
    await expect(totalAssetsRow).toBeVisible({ timeout: 10_000 });

    // Click Cash Flow tab
    const cashFlowTab = page.locator('button').filter({ hasText: /Cash Flow|التدفقات النقدية/ }).first();
    await cashFlowTab.click();

    // "Operating Cash Flow" or "التدفق النقدي التشغيلي" should appear
    const operatingCFRow = page.locator('text=/Operating Cash Flow|التدفق النقدي التشغيلي/').first();
    await expect(operatingCFRow).toBeVisible({ timeout: 10_000 });
  });
});
