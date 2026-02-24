import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const OUT = '../nav-screenshots';
mkdirSync(OUT, { recursive: true });

const BACKEND = 'http://localhost:8084';
const FRONTEND = 'http://localhost:3000';

async function goto(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2500);
}

async function shot(page, name) {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
  console.log(`  📸 ${name}.png`);
}

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 250 });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  // Suppress SSE noise in console
  page.on('console', () => {});

  console.log('\n=== Ra\'d AI TASI Platform Navigation ===\n');

  // ── 1. Homepage ──────────────────────────────────────────
  console.log('1. Homepage');
  await goto(page, FRONTEND);
  await shot(page, '01-homepage');

  // ── 2. Markets page ──────────────────────────────────────
  console.log('2. Markets page');
  await goto(page, `${FRONTEND}/market`);
  await shot(page, '02-markets');
  await page.mouse.wheel(0, 500);
  await page.waitForTimeout(800);
  await shot(page, '02-markets-scrolled');

  // ── 3. News page ─────────────────────────────────────────
  console.log('3. News page');
  await goto(page, `${FRONTEND}/news`);
  await shot(page, '03-news');

  // Try clicking first article card
  const card = page.locator('article').first();
  const cardVisible = await card.isVisible().catch(() => false);
  if (cardVisible) {
    await card.click();
    await page.waitForTimeout(2000);
    await shot(page, '03-news-article');
    await page.goBack();
    await page.waitForTimeout(1500);
  }

  // ── 4. Charts page ───────────────────────────────────────
  console.log('4. Charts page');
  await goto(page, `${FRONTEND}/charts`);
  await shot(page, '04-charts');

  // ── 5. AI Chat page ──────────────────────────────────────
  console.log('5. AI Chat page');
  await goto(page, `${FRONTEND}/chat`);
  await shot(page, '05-chat-empty');

  // Find and use the chat input
  const textarea = page.locator('textarea').first();
  const inputVisible = await textarea.isVisible().catch(() => false);
  if (inputVisible) {
    await textarea.click();
    await textarea.fill('ما هي أكبر 5 شركات من حيث رأس المال السوقي؟');
    await shot(page, '05-chat-question');
    await textarea.press('Enter');
    console.log('  ⏳ Waiting for AI response (up to 60s)...');
    // Wait for response to appear — look for a message bubble or just wait
    await page.waitForTimeout(60000);
    await shot(page, '05-chat-response');
  }

  // ── 6. Stock detail — Aramco ─────────────────────────────
  console.log('6. Stock detail (Aramco 2222.SR)');
  await goto(page, `${FRONTEND}/stock/2222.SR`);
  await shot(page, '06-stock-detail');
  // Scroll to financials
  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(800);
  await shot(page, '06-stock-detail-financials');

  // ── 7. Watchlist page ────────────────────────────────────
  console.log('7. Watchlist page');
  await goto(page, `${FRONTEND}/watchlist`);
  await shot(page, '07-watchlist');

  // ── 8. Legacy backend UI ─────────────────────────────────
  console.log('8. Legacy Vanna UI (port 8084)');
  await goto(page, BACKEND);
  await shot(page, '08-legacy-ui');

  // ── 9. Health API ─────────────────────────────────────────
  console.log('9. Health API response');
  await goto(page, `${BACKEND}/health/ready`);
  await shot(page, '09-health-ready');

  console.log(`\n✅ Done. Screenshots → ./nav-screenshots/\n`);
  await browser.close();
})();

