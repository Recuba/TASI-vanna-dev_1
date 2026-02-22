import { test, expect, type Page, type Route } from '@playwright/test';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MOCK_BATCH_QUOTES = [
  { ticker: '2222.SR', name: 'Saudi Aramco', short_name: 'Saudi Aramco', current_price: 30.0, change_pct: 1.5 },
];

async function mockPortfolioApis(page: Page) {
  await page.route('**/api/v1/stocks/batch-quotes**', (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_BATCH_QUOTES) }),
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
 * Navigate to /portfolio with empty localStorage, wait for full hydration.
 * Routes must already be mocked before calling this.
 */
async function gotoPortfolioEmpty(page: Page) {
  await page.goto('/portfolio', { waitUntil: 'domcontentloaded', timeout: 60_000 });

  // Clear portfolio data
  await page.evaluate(() => {
    localStorage.removeItem('rad-ai-portfolio-transactions');
  });

  // Reload and wait for the page to be fully hydrated
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });

  const pageHeading = page.locator('h1').filter({ hasText: /^Portfolio$|^المحفظة$/ });
  await expect(pageHeading).toBeVisible({ timeout: 30_000 });

  // The LanguageProvider uses navigator.language (en-US in Playwright) to set 'en' after mount.
  // Wait for this language switch to complete before clicking any buttons.
  // The h1 will read "Portfolio" once English is active.
  await expect(page.locator('h1').filter({ hasText: 'Portfolio' })).toBeVisible({ timeout: 15_000 });

  // Ensure the Add Transaction button is interactive
  const addBtn = page.locator('button').filter({ hasText: /Add Transaction|إضافة صفقة/ }).first();
  await expect(addBtn).toBeVisible({ timeout: 10_000 });
  await expect(addBtn).toBeEnabled({ timeout: 5_000 });
}

/**
 * Click the "+ Add Transaction" button and wait for the modal to open.
 * Works in both English and Arabic rendering modes.
 */
async function openAddTransactionModal(page: Page) {
  // The header button: "+ Add Transaction" (EN) or "+ إضافة صفقة" (AR)
  // The empty-state button: "Add First Transaction" (EN) or "إضافة أول صفقة" (AR)
  // Both open the same modal — use the header button (more specific match)
  const headerBtn = page.locator('button').filter({ hasText: /Add Transaction|إضافة صفقة/ }).first();
  await expect(headerBtn).toBeVisible({ timeout: 15_000 });
  await expect(headerBtn).toBeEnabled();
  await headerBtn.click();

  // Wait for modal h3 title
  const modalTitle = page.locator('h3').filter({ hasText: /Add Transaction|إضافة صفقة/ });
  await expect(modalTitle).toBeVisible({ timeout: 10_000 });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Portfolio Tracker Page', () => {
  test.describe.configure({ timeout: 90_000 });

  test('portfolio page loads at /portfolio', async ({ page }) => {
    await mockPortfolioApis(page);
    await page.goto('/portfolio', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await expect(page).toHaveURL(/\/portfolio/);
  });

  test('page heading "Portfolio" or "المحفظة" is visible', async ({ page }) => {
    await mockPortfolioApis(page);
    await page.goto('/portfolio', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    // Two h1s exist (header logo + page heading) — filter to the page heading
    const heading = page.locator('h1').filter({ hasText: /^Portfolio$|^المحفظة$/ });
    await expect(heading).toBeVisible({ timeout: 15_000 });
  });

  test('empty state renders when portfolio is empty', async ({ page }) => {
    await mockPortfolioApis(page);
    await gotoPortfolioEmpty(page);
    await expect(page.getByText(/Add First Transaction|إضافة أول صفقة/)).toBeVisible({ timeout: 15_000 });
  });

  test('"+ Add Transaction" button is visible in the page header', async ({ page }) => {
    await mockPortfolioApis(page);
    await page.goto('/portfolio', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    const btn = page.locator('button').filter({ hasText: /Add Transaction|إضافة صفقة/ }).first();
    await expect(btn).toBeVisible({ timeout: 15_000 });
  });

  test('modal opens when "+ Add Transaction" is clicked', async ({ page }) => {
    await mockPortfolioApis(page);
    await gotoPortfolioEmpty(page);
    await openAddTransactionModal(page);
    // Already verified in helper — assert stable state
    await expect(page.locator('h3').filter({ hasText: /Add Transaction|إضافة صفقة/ })).toBeVisible();
  });

  test('modal has Buy and Sell toggle buttons', async ({ page }) => {
    await mockPortfolioApis(page);
    await gotoPortfolioEmpty(page);
    await openAddTransactionModal(page);

    await expect(page.locator('button').filter({ hasText: /^Buy$|^شراء$/ })).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('button').filter({ hasText: /^Sell$|^بيع$/ })).toBeVisible({ timeout: 5_000 });
  });

  test('modal form has a Ticker input field', async ({ page }) => {
    await mockPortfolioApis(page);
    await gotoPortfolioEmpty(page);
    await openAddTransactionModal(page);

    const tickerInput = page.locator('input[placeholder*="2222"]');
    await expect(tickerInput).toBeVisible({ timeout: 5_000 });
  });

  test('valid buy transaction can be submitted via the modal', async ({ page }) => {
    await mockPortfolioApis(page);
    await gotoPortfolioEmpty(page);
    await openAddTransactionModal(page);

    await page.locator('input[placeholder*="2222"]').fill('2222');
    // Quantity (first number input), Price (second)
    const numberInputs = page.locator('input[type="number"]');
    await numberInputs.nth(0).fill('100');
    await numberInputs.nth(1).fill('28.50');

    // Submit: "Add" (EN) or "إضافة" (AR)
    const submitBtn = page.locator('button').filter({ hasText: /^Add$|^إضافة$/ });
    await expect(submitBtn).toBeVisible({ timeout: 5_000 });
    await submitBtn.click();

    // Modal closes on success
    await expect(
      page.locator('h3').filter({ hasText: /Add Transaction|إضافة صفقة/ }),
    ).not.toBeVisible({ timeout: 5_000 });
  });

  test('summary cards (Total Value, Total Cost) appear after adding a holding', async ({ page }) => {
    await mockPortfolioApis(page);
    await gotoPortfolioEmpty(page);
    await openAddTransactionModal(page);

    await page.locator('input[placeholder*="2222"]').fill('2222');
    await page.locator('input[type="number"]').nth(0).fill('100');
    await page.locator('input[type="number"]').nth(1).fill('28.50');
    await page.locator('button').filter({ hasText: /^Add$|^إضافة$/ }).click();

    await expect(page.getByText(/Total Value|القيمة الإجمالية/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Total Cost|التكلفة الإجمالية/)).toBeVisible({ timeout: 5_000 });
  });

  test('Holdings section is visible after adding a transaction', async ({ page }) => {
    await mockPortfolioApis(page);
    await gotoPortfolioEmpty(page);
    await openAddTransactionModal(page);

    await page.locator('input[placeholder*="2222"]').fill('2222');
    await page.locator('input[type="number"]').nth(0).fill('100');
    await page.locator('input[type="number"]').nth(1).fill('28.50');
    await page.locator('button').filter({ hasText: /^Add$|^إضافة$/ }).click();

    // h2 heading for Holdings section
    await expect(
      page.locator('h2').filter({ hasText: /^Holdings$|^الحيازات$/ }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('modal closes when Cancel button is clicked', async ({ page }) => {
    await mockPortfolioApis(page);
    await gotoPortfolioEmpty(page);
    await openAddTransactionModal(page);

    const modalTitle = page.locator('h3').filter({ hasText: /Add Transaction|إضافة صفقة/ });
    await page.locator('button').filter({ hasText: /^Cancel$|^إلغاء$/ }).click();
    await expect(modalTitle).not.toBeVisible({ timeout: 5_000 });
  });

  test('modal closes when clicking the backdrop overlay', async ({ page }) => {
    await mockPortfolioApis(page);
    await gotoPortfolioEmpty(page);
    await openAddTransactionModal(page);

    const modalTitle = page.locator('h3').filter({ hasText: /Add Transaction|إضافة صفقة/ });
    // Click the fixed backdrop (the div behind the modal card)
    await page.locator('.fixed.inset-0').click({ position: { x: 10, y: 10 } });
    await expect(modalTitle).not.toBeVisible({ timeout: 5_000 });
  });

  test('"Data stored in browser localStorage only" notice is visible', async ({ page }) => {
    await mockPortfolioApis(page);
    await page.goto('/portfolio', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await expect(
      page.getByText(/Data stored in browser localStorage only|البيانات محفوظة في المتصفح فقط/),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('portfolio page renders at 375px mobile viewport', async ({ page }) => {
    await mockPortfolioApis(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/portfolio', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await expect(
      page.locator('h1').filter({ hasText: /^Portfolio$|^المحفظة$/ }),
    ).toBeVisible({ timeout: 15_000 });
  });
});
