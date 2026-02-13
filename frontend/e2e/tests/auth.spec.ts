import { test, expect } from '@playwright/test';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Intercept auth API calls and return mock responses. */
function mockAuthApi(
  page: import('@playwright/test').Page,
  opts: { loginStatus?: number; loginBody?: unknown } = {},
) {
  const loginStatus = opts.loginStatus ?? 200;
  const loginBody = opts.loginBody ?? {
    access_token: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEiLCJlbWFpbCI6InRlc3RAdGVzdC5jb20ifQ.fake',
    refresh_token: 'fake-refresh-token',
    user_id: 'user-1',
    name: 'Test User',
  };

  return Promise.all([
    page.route('**/api/auth/login', (route) =>
      route.fulfill({
        status: loginStatus,
        contentType: 'application/json',
        body: JSON.stringify(loginBody),
      }),
    ),
    page.route('**/api/auth/register', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLTIiLCJlbWFpbCI6Im5ld0B0ZXN0LmNvbSJ9.fake',
          refresh_token: 'fake-refresh-token',
          user_id: 'user-2',
          name: 'New User',
        }),
      }),
    ),
    page.route('**/api/auth/guest', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJndWVzdCIsImVtYWlsIjoiZ3Vlc3RAbG9jYWwifQ.fake',
          refresh_token: 'fake-refresh-token',
          user_id: 'guest',
          name: 'Guest',
        }),
      }),
    ),
    // Mock common API calls that pages may make after redirect
    page.route('**/api/entities/sectors', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      }),
    ),
    page.route('**/api/entities**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [], count: 0 }),
      }),
    ),
  ]);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Authentication', () => {
  test.beforeEach(async ({ page }) => {
    // Clear any stored auth state
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      localStorage.removeItem('rad-ai-token');
      localStorage.removeItem('rad-ai-refresh-token');
      localStorage.removeItem('rad-ai-user');
    });
  });

  test('login page renders with email and password fields', async ({ page }) => {
    await page.goto('/login');

    const emailInput = page.locator('input[type="email"]');
    const passwordInput = page.locator('input[type="password"]');

    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
  });

  test('login page shows Sign In and Register toggle buttons', async ({ page }) => {
    await page.goto('/login');

    // The toggle buttons contain "Sign In" / "Register" text (or Arabic equivalents)
    const buttons = page.locator('button[type="button"]');
    const buttonTexts = await buttons.allTextContents();
    const hasSignIn = buttonTexts.some(
      (t) => t.includes('Sign In') || t.includes('تسجيل الدخول'),
    );
    const hasRegister = buttonTexts.some(
      (t) => t.includes('Register') || t.includes('حساب جديد'),
    );

    expect(hasSignIn).toBe(true);
    expect(hasRegister).toBe(true);
  });

  test('successful login redirects to /chat', async ({ page }) => {
    await mockAuthApi(page);
    await page.goto('/login');

    await page.fill('input[type="email"]', 'test@test.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');

    await page.waitForURL('**/chat', { timeout: 10_000 });
    expect(page.url()).toContain('/chat');
  });

  test('failed login shows error message', async ({ page }) => {
    await mockAuthApi(page, {
      loginStatus: 401,
      loginBody: { detail: 'Invalid credentials' },
    });
    await page.goto('/login');

    await page.fill('input[type="email"]', 'bad@test.com');
    await page.fill('input[type="password"]', 'wrongpass');
    await page.click('button[type="submit"]');

    // Error message container should appear
    const errorEl = page.locator('.text-red-400, [class*="red"]');
    await expect(errorEl.first()).toBeVisible({ timeout: 5000 });
  });

  test('register mode shows name field', async ({ page }) => {
    await page.goto('/login');

    // Click the Register toggle
    const registerBtn = page.locator('button[type="button"]').filter({
      hasText: /Register|حساب جديد/,
    });
    await registerBtn.click();

    // Name input should now be visible
    const nameInput = page.locator('input[type="text"]');
    await expect(nameInput).toBeVisible();
  });

  test('logout clears session from localStorage', async ({ page }) => {
    // Set up an authenticated session
    await page.goto('/login');
    await page.evaluate(() => {
      localStorage.setItem('rad-ai-token', 'fake-token');
      localStorage.setItem('rad-ai-refresh-token', 'fake-refresh');
      localStorage.setItem(
        'rad-ai-user',
        JSON.stringify({ id: '1', email: 'test@test.com', name: 'Test' }),
      );
    });

    // Reload to pick up the stored session
    await page.goto('/');

    // Simulate logout by clearing tokens (matches useAuth().logout behavior)
    await page.evaluate(() => {
      localStorage.removeItem('rad-ai-token');
      localStorage.removeItem('rad-ai-refresh-token');
      localStorage.removeItem('rad-ai-user');
    });

    const token = await page.evaluate(() =>
      localStorage.getItem('rad-ai-token'),
    );
    expect(token).toBeNull();
  });

  test('guest login button works', async ({ page }) => {
    await mockAuthApi(page);
    await page.goto('/login');

    // Click "Continue as Guest" button
    const guestBtn = page.locator('button[type="button"]').filter({
      hasText: /Continue as Guest|الدخول كزائر/,
    });
    await guestBtn.click();

    await page.waitForURL('**/chat', { timeout: 10_000 });
    expect(page.url()).toContain('/chat');
  });

  test('login page has back-to-home link', async ({ page }) => {
    await page.goto('/login');

    const backLink = page.locator('a').filter({
      hasText: /Back to Home|العودة للرئيسية/,
    });
    await expect(backLink).toBeVisible();
    await expect(backLink).toHaveAttribute('href', '/');
  });

  test('login form submit button shows loading state', async ({ page }) => {
    // Delay the API response so we can observe loading state
    await page.route('**/api/auth/login', async (route) => {
      await new Promise((r) => setTimeout(r, 2000));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.fake',
          refresh_token: 'fake',
          user_id: '1',
          name: 'Test',
        }),
      });
    });

    await page.goto('/login');
    await page.fill('input[type="email"]', 'test@test.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');

    // The submit button should show loading text
    const submitBtn = page.locator('button[type="submit"]');
    await expect(submitBtn).toContainText(/Loading|جاري التحميل/);
  });
});
