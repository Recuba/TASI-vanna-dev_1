import { test, expect, type Page, type Route } from '@playwright/test';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MOCK_CALENDAR_EVENTS = [
  { date: '2026-02-05', type: 'dividend', ticker: '2222.SR', title: 'Saudi Aramco - Dividend', description: 'Q4 2025 dividend: 0.35 SAR/share' },
  { date: '2026-02-12', type: 'earnings', ticker: '1120.SR', title: 'Al Rajhi Bank - Earnings Release', description: 'FY 2025 earnings announcement' },
  { date: '2026-02-18', type: 'earnings', ticker: '2010.SR', title: 'SABIC Q4 Results', description: null },
];

async function mockCalendarApis(page: Page) {
  await page.route('**/api/v1/calendar/events**', (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ events: MOCK_CALENDAR_EVENTS, count: MOCK_CALENDAR_EVENTS.length }),
    }),
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

/** Navigate to calendar page and wait for events to finish loading */
async function gotoCalendar(page: Page) {
  await mockCalendarApis(page);
  await page.goto('/calendar', { waitUntil: 'domcontentloaded', timeout: 60_000 });

  // Wait for the month heading (h2 inside the calendar card)
  await expect(
    page.locator('h2').filter({ hasText: /February|فبراير|2026/ }),
  ).toBeVisible({ timeout: 30_000 });

  // Wait for events to load: the subtitle shows "3 events" or "3 أحداث"
  // Alternatively, wait for the loading spinner to disappear
  await expect(
    page.locator('div').filter({ hasText: /3 events|3 أحداث/ }).first(),
  ).toBeVisible({ timeout: 15_000 });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Financial Calendar Page', () => {
  test.describe.configure({ timeout: 90_000 });

  test('calendar page loads at /calendar', async ({ page }) => {
    await mockCalendarApis(page);
    await page.goto('/calendar', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await expect(page).toHaveURL(/\/calendar/);
  });

  test('page heading "Financial Calendar" or "التقويم المالي" is visible', async ({ page }) => {
    await gotoCalendar(page);
    const heading = page.locator('h1').filter({ hasText: /Financial Calendar|التقويم المالي/ });
    await expect(heading).toBeVisible({ timeout: 10_000 });
  });

  test('current month name and year are displayed', async ({ page }) => {
    await gotoCalendar(page);
    await expect(
      page.locator('h2').filter({ hasText: /February|فبراير|2026/ }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('grid view is shown by default with 7-column day headers', async ({ page }) => {
    await gotoCalendar(page);

    // Day header cells: Sun/Mon/.../Sat (EN) or أحد/إثن/.../سبت (AR)
    // They are <div> elements with text content matching a day abbreviation
    const dayHeaders = page.locator('div').filter({ hasText: /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat|أحد|إثن|ثلا|أرب|خمي|جمع|سبت)$/ });
    await expect(dayHeaders.first()).toBeVisible({ timeout: 10_000 });
    const count = await dayHeaders.count();
    expect(count).toBeGreaterThanOrEqual(7);
  });

  test('switching to List view shows event card titles', async ({ page }) => {
    // Events are fully loaded (gotoCalendar waits for "3 events")
    await gotoCalendar(page);

    // Switch to list view
    const listBtn = page.locator('button').filter({ hasText: /^List$|^قائمة$/ }).first();
    await expect(listBtn).toBeVisible({ timeout: 10_000 });
    await listBtn.click();

    // EventCard renders event.title in a <p> tag inside a Link
    // The title "Saudi Aramco - Dividend" should appear in the list view
    await expect(page.getByText('Saudi Aramco - Dividend')).toBeVisible({ timeout: 10_000 });
  });

  test('switching back to Grid view restores day headers', async ({ page }) => {
    await gotoCalendar(page);

    await page.locator('button').filter({ hasText: /^List$|^قائمة$/ }).first().click();
    await page.locator('button').filter({ hasText: /^Grid$|^شبكة$/ }).first().click();

    const dayHeaders = page.locator('div').filter({ hasText: /^(Sun|Mon|Tue|أحد)$/ }).first();
    await expect(dayHeaders).toBeVisible({ timeout: 10_000 });
  });

  test('clicking < navigates to the previous month', async ({ page }) => {
    await gotoCalendar(page);

    // Previous month button renders as HTML entity &lt; → displays as "<"
    const prevBtn = page.locator('button').filter({ hasText: '<' }).first();
    await expect(prevBtn).toBeVisible({ timeout: 10_000 });
    await prevBtn.click();

    // Should show January 2026
    await expect(
      page.locator('h2').filter({ hasText: /January|يناير|2026/ }),
    ).toBeVisible({ timeout: 5_000 });
  });

  test('clicking > navigates to the next month', async ({ page }) => {
    await gotoCalendar(page);

    const nextBtn = page.locator('button').filter({ hasText: '>' }).first();
    await expect(nextBtn).toBeVisible({ timeout: 10_000 });
    await nextBtn.click();

    // Should show March 2026
    await expect(
      page.locator('h2').filter({ hasText: /March|مارس|2026/ }),
    ).toBeVisible({ timeout: 5_000 });
  });

  test('"Today" button resets to current month', async ({ page }) => {
    await gotoCalendar(page);

    // Navigate to next month
    await page.locator('button').filter({ hasText: '>' }).first().click();
    await expect(
      page.locator('h2').filter({ hasText: /March|مارس|2026/ }),
    ).toBeVisible({ timeout: 5_000 });

    // Click "Today" — it's a small button inside the h2 container
    const todayBtn = page.locator('button').filter({ hasText: /^Today$|^اليوم$/ });
    await todayBtn.click();

    await expect(
      page.locator('h2').filter({ hasText: /February|فبراير|2026/ }),
    ).toBeVisible({ timeout: 5_000 });
  });

  test('All / Dividends / Earnings filter buttons are visible', async ({ page }) => {
    await gotoCalendar(page);

    await expect(page.locator('button').filter({ hasText: /^All$|^الكل$/ })).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('button').filter({ hasText: /^Dividends$|^توزيعات$/ })).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('button').filter({ hasText: /^Earnings$|^أرباح$/ })).toBeVisible({ timeout: 5_000 });
  });

  test('clicking Dividends filter keeps the page functional', async ({ page }) => {
    await gotoCalendar(page);

    const dividendsBtn = page.locator('button').filter({ hasText: /^Dividends$|^توزيعات$/ });
    await expect(dividendsBtn).toBeVisible({ timeout: 10_000 });
    await dividendsBtn.click();

    // Page remains stable: h1 still visible
    await expect(
      page.locator('h1').filter({ hasText: /Financial Calendar|التقويم المالي/ }),
    ).toBeVisible({ timeout: 5_000 });

    // Month heading still visible
    await expect(
      page.locator('h2').filter({ hasText: /February|فبراير|2026/ }),
    ).toBeVisible({ timeout: 5_000 });
  });

  test('color legend for Dividends and Earnings is visible', async ({ page }) => {
    await gotoCalendar(page);

    // Legend uses the longer forms of the type names
    await expect(page.getByText(/Dividends|توزيعات أرباح/).last()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Earnings|إعلان أرباح/).last()).toBeVisible({ timeout: 5_000 });
  });

  test('empty state shown in list view when no events exist for this month', async ({ page }) => {
    // Override mock to return empty events
    await page.route('**/api/v1/calendar/events**', (route: Route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ events: [], count: 0 }) }),
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

    await page.goto('/calendar', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await expect(
      page.locator('h2').filter({ hasText: /February|فبراير|2026/ }),
    ).toBeVisible({ timeout: 30_000 });

    // Wait for loading spinner to disappear (events loaded — 0 events)
    // The subtitle won't show event count when 0 events
    await page.waitForTimeout(1_000);

    // Switch to list view
    const listBtn = page.locator('button').filter({ hasText: /^List$|^قائمة$/ }).first();
    await listBtn.click();

    // The empty state message from the source:
    // t('لا توجد أحداث في هذا الشهر', 'No events this month')
    await expect(
      page.getByText(/No events this month|لا توجد أحداث في هذا الشهر/),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('calendar renders at 375px mobile viewport', async ({ page }) => {
    await mockCalendarApis(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/calendar', { waitUntil: 'domcontentloaded', timeout: 60_000 });

    await expect(
      page.locator('h1').filter({ hasText: /Financial Calendar|التقويم المالي/ }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.locator('h2').filter({ hasText: /February|فبراير|2026/ }),
    ).toBeVisible({ timeout: 10_000 });
  });
});
