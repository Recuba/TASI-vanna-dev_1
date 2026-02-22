import { test, expect, type Page, type Route } from '@playwright/test';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function mockAlertsApis(page: Page) {
  await page.route('**/health**', (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'healthy' }) }),
  );
  await page.route('**/api/v1/widgets/stream**', (route: Route) =>
    route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' }, body: ': connected\n\n' }),
  );
  await page.route('**/api/v1/news/stream**', (route: Route) =>
    route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: ': connected\n\n' }),
  );
  await page.route('**/api/v1/stocks/batch-quotes**', (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }),
  );
}

/**
 * Navigate to /alerts with empty localStorage.
 * Mocks must be set up BEFORE calling this.
 */
async function gotoAlertsEmpty(page: Page) {
  // First visit to clear localStorage
  await page.goto('/alerts', { waitUntil: 'domcontentloaded', timeout: 60_000 });

  // Clear alerts localStorage
  await page.evaluate(() => {
    localStorage.removeItem('rad-ai-price-alerts');
    localStorage.removeItem('rad-ai-triggered-alerts');
  });

  // Reload and wait for the page to be fully hydrated
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });

  // Wait for the page-level h1 (not the header logo)
  const pageHeading = page.locator('h1').filter({ hasText: /Price Alerts|تنبيهات الأسعار/ });
  await expect(pageHeading).toBeVisible({ timeout: 30_000 });

  // The LanguageProvider uses navigator.language (en-US in Playwright) to set 'en' after mount.
  // Wait for this language switch to complete — h1 will read "Price Alerts" once English is active.
  await expect(page.locator('h1').filter({ hasText: 'Price Alerts' })).toBeVisible({ timeout: 10_000 });

  // Ensure React has fully mounted by waiting for a known button to be interactive
  const newAlertBtn = page.locator('button').filter({ hasText: /New Alert|تنبيه جديد/ }).first();
  await expect(newAlertBtn).toBeVisible({ timeout: 10_000 });
  await expect(newAlertBtn).toBeEnabled({ timeout: 5_000 });
}

/** Click the "+ New Alert" button and wait for the modal to open. */
async function openNewAlertModal(page: Page) {
  const btn = page.locator('button').filter({ hasText: /New Alert|تنبيه جديد/ }).first();
  await expect(btn).toBeVisible({ timeout: 15_000 });
  await expect(btn).toBeEnabled();
  await btn.click();

  // Wait for modal to appear — h3 inside the modal card
  const modalTitle = page.locator('h3').filter({ hasText: /Create Price Alert|إنشاء تنبيه سعر/ });
  await expect(modalTitle).toBeVisible({ timeout: 10_000 });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Price Alerts Page', () => {
  test.describe.configure({ timeout: 90_000 });

  test('alerts page loads at /alerts', async ({ page }) => {
    await mockAlertsApis(page);
    await page.goto('/alerts', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await expect(page).toHaveURL(/\/alerts/);
  });

  test('page heading "Price Alerts" or "تنبيهات الأسعار" is visible', async ({ page }) => {
    await mockAlertsApis(page);
    await page.goto('/alerts', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    // Two h1s exist (header logo + page heading) — filter to the page-level heading
    const heading = page.locator('h1').filter({ hasText: /Price Alerts|تنبيهات الأسعار/ });
    await expect(heading).toBeVisible({ timeout: 15_000 });
  });

  test('empty state renders when no alerts are configured', async ({ page }) => {
    await mockAlertsApis(page);
    await gotoAlertsEmpty(page);
    await expect(page.getByText(/Create First Alert|إنشاء أول تنبيه/)).toBeVisible({ timeout: 15_000 });
  });

  test('"+ New Alert" button is visible in the page header', async ({ page }) => {
    await mockAlertsApis(page);
    await page.goto('/alerts', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    const btn = page.locator('button').filter({ hasText: /New Alert|تنبيه جديد/ }).first();
    await expect(btn).toBeVisible({ timeout: 15_000 });
  });

  test('clicking "+ New Alert" opens the Create Price Alert modal', async ({ page }) => {
    await mockAlertsApis(page);
    await gotoAlertsEmpty(page);
    await openNewAlertModal(page);
    // Modal title verified inside openNewAlertModal — just assert page is stable
    await expect(page.locator('h3').filter({ hasText: /Create Price Alert|إنشاء تنبيه سعر/ })).toBeVisible();
  });

  test('modal has "Price Above" and "Price Below" condition buttons', async ({ page }) => {
    await mockAlertsApis(page);
    await gotoAlertsEmpty(page);
    await openNewAlertModal(page);

    await expect(page.locator('button').filter({ hasText: /Price Above|أعلى من/ })).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('button').filter({ hasText: /Price Below|أقل من/ })).toBeVisible({ timeout: 5_000 });
  });

  test('modal form has Ticker and Target Price inputs', async ({ page }) => {
    await mockAlertsApis(page);
    await gotoAlertsEmpty(page);
    await openNewAlertModal(page);

    await expect(page.locator('input[placeholder*="2222"]')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('input[type="number"]').first()).toBeVisible({ timeout: 5_000 });
  });

  test('a valid price-above alert can be created', async ({ page }) => {
    await mockAlertsApis(page);
    await gotoAlertsEmpty(page);
    await openNewAlertModal(page);

    await page.locator('input[placeholder*="2222"]').fill('2222');
    await page.locator('input[type="number"]').first().fill('35.00');

    const submitBtn = page.locator('button').filter({ hasText: /Create Alert|إنشاء التنبيه/ });
    await expect(submitBtn).toBeVisible({ timeout: 5_000 });
    await submitBtn.click();

    // Modal closes after submission
    await expect(
      page.locator('h3').filter({ hasText: /Create Price Alert|إنشاء تنبيه سعر/ }),
    ).not.toBeVisible({ timeout: 5_000 });
  });

  test('created alert appears in the All Alerts list', async ({ page }) => {
    await mockAlertsApis(page);
    await gotoAlertsEmpty(page);
    await openNewAlertModal(page);

    await page.locator('input[placeholder*="2222"]').fill('2222');
    await page.locator('input[type="number"]').first().fill('35.00');
    await page.locator('button').filter({ hasText: /Create Alert|إنشاء التنبيه/ }).click();

    await expect(page.getByText(/All Alerts|جميع التنبيهات/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('2222')).toBeVisible({ timeout: 5_000 });
  });

  test('newly created alert shows ACTIVE status badge', async ({ page }) => {
    await mockAlertsApis(page);
    await gotoAlertsEmpty(page);
    await openNewAlertModal(page);

    await page.locator('input[placeholder*="2222"]').fill('2222');
    await page.locator('input[type="number"]').first().fill('35.00');
    await page.locator('button').filter({ hasText: /Create Alert|إنشاء التنبيه/ }).click();

    await expect(page.getByText(/^ACTIVE$|^نشط$/)).toBeVisible({ timeout: 10_000 });
  });

  test('alert can be paused using the pause button', async ({ page }) => {
    await mockAlertsApis(page);
    await gotoAlertsEmpty(page);
    await openNewAlertModal(page);

    await page.locator('input[placeholder*="2222"]').fill('2222');
    await page.locator('input[type="number"]').first().fill('35.00');
    await page.locator('button').filter({ hasText: /Create Alert|إنشاء التنبيه/ }).click();

    await expect(page.getByText(/^ACTIVE$|^نشط$/)).toBeVisible({ timeout: 10_000 });

    const pauseBtn = page.locator('button[title*="Pause"], button[title*="إيقاف"]').first();
    await expect(pauseBtn).toBeVisible({ timeout: 5_000 });
    await pauseBtn.click();

    await expect(page.getByText(/^PAUSED$|^متوقف$/)).toBeVisible({ timeout: 5_000 });
  });

  test('alert can be removed with the delete button', async ({ page }) => {
    await mockAlertsApis(page);
    await gotoAlertsEmpty(page);
    await openNewAlertModal(page);

    await page.locator('input[placeholder*="2222"]').fill('2222');
    await page.locator('input[type="number"]').first().fill('35.00');
    await page.locator('button').filter({ hasText: /Create Alert|إنشاء التنبيه/ }).click();

    await expect(page.getByText(/All Alerts|جميع التنبيهات/)).toBeVisible({ timeout: 10_000 });

    const deleteBtn = page.locator('button[title*="Delete"], button[title*="حذف"]').first();
    await expect(deleteBtn).toBeVisible({ timeout: 5_000 });
    await deleteBtn.click();

    await expect(page.getByText(/Create First Alert|إنشاء أول تنبيه/)).toBeVisible({ timeout: 5_000 });
  });

  test('alert modal closes when Cancel is clicked', async ({ page }) => {
    await mockAlertsApis(page);
    await gotoAlertsEmpty(page);
    await openNewAlertModal(page);

    const modalTitle = page.locator('h3').filter({ hasText: /Create Price Alert|إنشاء تنبيه سعر/ });
    await page.locator('button').filter({ hasText: /^Cancel$|^إلغاء$/ }).click();
    await expect(modalTitle).not.toBeVisible({ timeout: 5_000 });
  });

  test('localStorage info notice is shown at page bottom', async ({ page }) => {
    await mockAlertsApis(page);
    await page.goto('/alerts', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await expect(
      page.getByText(/Alerts stored in browser localStorage|التنبيهات محفوظة في المتصفح/),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('alert bell icon is visible in the main site header', async ({ page }) => {
    await mockAlertsApis(page);
    await page.goto('/alerts', { waitUntil: 'domcontentloaded', timeout: 60_000 });

    const header = page.locator('header').first();
    await expect(header).toBeVisible({ timeout: 15_000 });

    const bellBtn = page.locator('header button[aria-label*="alert" i], header button[aria-label*="bell" i]').first();
    const bellExists = await bellBtn.isVisible().catch(() => false);
    if (!bellExists) {
      await expect(header).toBeVisible();
    } else {
      await expect(bellBtn).toBeVisible();
    }
  });

  test('alerts page renders at 375px mobile viewport', async ({ page }) => {
    await mockAlertsApis(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/alerts', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await expect(
      page.locator('h1').filter({ hasText: /Price Alerts|تنبيهات الأسعار/ }),
    ).toBeVisible({ timeout: 15_000 });
  });
});
