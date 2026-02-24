import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const OUT = 'nav-screenshots';
mkdirSync(OUT, { recursive: true });

const BACKEND = 'http://localhost:8084';
const FRONTEND = 'http://localhost:3000';

async function shot(page, name) {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
  console.log(`  📸 ${name}.png`);
}

async function waitReady(page) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1500);
}

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 300 });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  console.log('\n=== Ra\'d AI TASI Platform Navigation ===\n');

  // ── 1. Homepage ──────────────────────────────────────────
  console.log('1. Homepage');
  await page.goto(FRONTEND, { waitUntil: 'networkidle' });
  await waitReady(page);
  await shot(page, '01-homepage');

  // ── 2. Markets page ──────────────────────────────────────
  console.log('2. Markets page');
  await page.goto(`${FRONTEND}/market`, { waitUntil: 'networkidle' });
  await waitReady(page);
  await shot(page, '02-markets');

  // scroll down to see table rows
  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(800);
  await shot(page, '02-markets-scrolled');

  // ── 3. News page ─────────────────────────────────────────
  console.log('3. News page');
  await page.goto(`${FRONTEND}/news`, { waitUntil: 'networkidle' });
  await waitReady(page);
  await shot(page, '03-news');

  // click first article if visible
  const firstCard = page.locator('article, [data-testid="article-card"]').first();
  if (await firstCard.isVisible().catch(() => false)) {
    await firstCard.click();
    await waitReady(page);
    await shot(page, '03-news-article');
    await page.goBack();
    await waitReady(page);
  }

  // ── 4. Charts page ───────────────────────────────────────
  console.log('4. Charts page');
  await page.goto(`${FRONTEND}/charts`, { waitUntil: 'networkidle' });
  await waitReady(page);
  await shot(page, '04-charts');

  // ── 5. AI Chat page ──────────────────────────────────────
  console.log('5. AI Chat page');
  await page.goto(`${FRONTEND}/chat`, { waitUntil: 'networkidle' });
  await waitReady(page);
  await shot(page, '05-chat');

  // type a question
  const input = page.locator('textarea, input[type="text"]').first();
  if (await input.isVisible().catch(() => false)) {
    await input.click();
    await input.fill('ما هي أكبر 5 شركات من حيث رأس المال السوقي؟');
    await shot(page, '05-chat-question-typed');
    await input.press('Enter');
    console.log('  ⏳ Waiting for AI response (up to 45s)...');
    await page.waitForTimeout(45000);
    await shot(page, '05-chat-response');
  }

  // ── 6. Stock detail (Aramco 2222.SR) ─────────────────────
  console.log('6. Stock detail — Aramco (2222.SR)');
  await page.goto(`${FRONTEND}/stock/2222.SR`, { waitUntil: 'networkidle' });
  await waitReady(page);
  await shot(page, '06-stock-detail');

  // ── 7. Legacy UI (backend templates) ─────────────────────
  console.log('7. Legacy Vanna UI (port 8084)');
  await page.goto(BACKEND, { waitUntil: 'networkidle' });
  await waitReady(page);
  await shot(page, '07-legacy-ui');

  // ── 8. Health API ─────────────────────────────────────────
  console.log('8. Health endpoint');
  await page.goto(`${BACKEND}/health`, { waitUntil: 'networkidle' });
  await waitReady(page);
  await shot(page, '08-health-api');

  // ── 9. Watchlist page ────────────────────────────────────
  console.log('9. Watchlist page');
  await page.goto(`${FRONTEND}/watchlist`, { waitUntil: 'networkidle' });
  await waitReady(page);
  await shot(page, '09-watchlist');

  console.log(`\n✅ Done — screenshots saved to ./${OUT}/\n`);
  await browser.close();
})();
