import { chromium } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'fs';

const FRONTEND = 'http://localhost:3000';
const SCREENSHOTS_DIR = 'C:/Users/User/saudi_stocks_fetcher/output/vanna-ai-testing/analysis/live-tests';

try { mkdirSync(SCREENSHOTS_DIR, { recursive: true }); } catch {}

const results = [];
function log(test, status, detail = '') {
  results.push({ test, status, detail });
  console.log(`[${status}] ${test}${detail ? ': ' + detail : ''}`);
}

let browser;
try {
  browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-gpu']
  });
} catch (e) {
  console.error('Failed to launch browser:', e.message);
  process.exit(1);
}

const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  locale: 'ar-SA',
});

const page = await context.newPage();

// Collect console errors
const consoleErrors = [];
page.on('console', msg => {
  if (msg.type() === 'error') {
    consoleErrors.push(msg.text());
  }
});

// Collect page crashes
const pageCrashes = [];
page.on('pageerror', err => {
  pageCrashes.push(err.message);
});

async function screenshot(name) {
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/${name}.png`, fullPage: false });
}

async function fullScreenshot(name) {
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/${name}.png`, fullPage: true });
}

// ========== TEST 1: HOMEPAGE ==========
console.log('\n=== TEST 1: HOMEPAGE ===');
try {
  const response = await page.goto(FRONTEND, { waitUntil: 'networkidle', timeout: 20000 });
  const status = response?.status();
  log('Homepage HTTP status', status === 200 ? 'PASS' : 'FAIL', `Status: ${status}`);

  await screenshot('01-homepage');

  // Check page title
  const title = await page.title();
  log('Homepage title', title ? 'PASS' : 'INFO', `"${title}"`);

  // Check for header
  const header = page.locator('header');
  const headerVisible = await header.isVisible().catch(() => false);
  log('Header visible', headerVisible ? 'PASS' : 'FAIL');

  // Check for navigation links
  const navLinks = await page.locator('nav a, header a').count();
  log('Navigation links', navLinks > 0 ? 'PASS' : 'INFO', `${navLinks} links found`);

  // Check for dark theme (background should be dark)
  const bgColor = await page.evaluate(() => {
    const body = document.body;
    return window.getComputedStyle(body).backgroundColor;
  });
  log('Theme background', 'INFO', bgColor);

  // Check for RTL direction
  const dir = await page.evaluate(() => document.documentElement.dir || document.body.dir || 'not set');
  log('Document direction', dir === 'rtl' ? 'PASS' : 'INFO', dir);

  // Check for Arabic text
  const hasArabic = await page.evaluate(() => {
    const text = document.body.innerText;
    return /[\u0600-\u06FF]/.test(text);
  });
  log('Arabic content present', hasArabic ? 'PASS' : 'INFO');

  await page.waitForTimeout(1500);
  await fullScreenshot('01-homepage-full');
  log('Homepage full screenshot', 'INFO', 'Saved');
} catch (e) {
  log('Homepage load', 'FAIL', e.message);
}

// ========== TEST 2: MARKET PAGE ==========
console.log('\n=== TEST 2: MARKET PAGE ===');
try {
  const response = await page.goto(`${FRONTEND}/market`, { waitUntil: 'networkidle', timeout: 20000 });
  log('Market page HTTP status', response?.status() === 200 ? 'PASS' : 'FAIL', `Status: ${response?.status()}`);
  await screenshot('02-market');

  // Check for table or card elements
  const tables = await page.locator('table').count();
  const cards = await page.locator('[class*="card"], [class*="Card"]').count();
  log('Market data containers', tables > 0 || cards > 0 ? 'PASS' : 'INFO', `Tables: ${tables}, Cards: ${cards}`);

  // Check for search/filter elements
  const inputs = await page.locator('input[type="text"], input[type="search"], input[placeholder]').count();
  log('Search/filter inputs', inputs > 0 ? 'PASS' : 'INFO', `${inputs} inputs found`);

  await page.waitForTimeout(1000);
  await fullScreenshot('02-market-full');
} catch (e) {
  log('Market page', 'FAIL', e.message);
}

// ========== TEST 3: SCREENER PAGE ==========
console.log('\n=== TEST 3: SCREENER PAGE ===');
try {
  const response = await page.goto(`${FRONTEND}/screener`, { waitUntil: 'networkidle', timeout: 20000 });
  log('Screener page HTTP status', response?.status() === 200 ? 'PASS' : 'FAIL', `Status: ${response?.status()}`);
  await screenshot('03-screener');

  // Check for preset/filter buttons
  const buttons = await page.locator('button').all();
  const buttonTexts = [];
  for (const btn of buttons.slice(0, 15)) {
    const text = await btn.textContent().catch(() => '');
    if (text.trim()) buttonTexts.push(text.trim().substring(0, 40));
  }
  log('Screener buttons', buttons.length > 0 ? 'PASS' : 'INFO', `${buttons.length} buttons. Sample: ${buttonTexts.slice(0, 5).join(', ')}`);

  // Try clicking a preset button if available
  const presets = page.getByRole('button').filter({ hasText: /value|growth|dividend|قيمة|نمو|توزيعات/i });
  const presetCount = await presets.count();
  if (presetCount > 0) {
    await presets.first().click();
    await page.waitForTimeout(1500);
    await screenshot('03-screener-preset-clicked');
    log('Preset filter click', 'PASS', `Found ${presetCount} preset buttons`);
  } else {
    log('Preset buttons', 'INFO', 'Not found with expected text');
  }

  await fullScreenshot('03-screener-full');
} catch (e) {
  log('Screener page', 'FAIL', e.message);
}

// ========== TEST 4: CALENDAR PAGE ==========
console.log('\n=== TEST 4: CALENDAR PAGE ===');
try {
  const response = await page.goto(`${FRONTEND}/calendar`, { waitUntil: 'networkidle', timeout: 20000 });
  log('Calendar page HTTP status', response?.status() === 200 ? 'PASS' : 'FAIL', `Status: ${response?.status()}`);
  await screenshot('04-calendar');

  // Check for calendar elements
  const calendarGrid = await page.locator('table, [class*="calendar"], [class*="grid"]').count();
  log('Calendar grid elements', calendarGrid > 0 ? 'PASS' : 'INFO', `${calendarGrid} elements found`);

  // Check for month navigation buttons
  const navButtons = await page.locator('button').filter({ hasText: /next|prev|>|<|التالي|السابق|→|←/i }).count();
  log('Calendar navigation buttons', navButtons > 0 ? 'PASS' : 'INFO', `${navButtons} nav buttons`);

  await fullScreenshot('04-calendar-full');
} catch (e) {
  log('Calendar page', 'FAIL', e.message);
}

// ========== TEST 5: PORTFOLIO PAGE ==========
console.log('\n=== TEST 5: PORTFOLIO PAGE ===');
try {
  // Clear portfolio localStorage first
  await page.goto(FRONTEND, { waitUntil: 'domcontentloaded', timeout: 10000 });
  await page.evaluate(() => {
    try { localStorage.removeItem('rad-ai-portfolio-transactions'); } catch {}
  });

  const response = await page.goto(`${FRONTEND}/portfolio`, { waitUntil: 'networkidle', timeout: 20000 });
  log('Portfolio page HTTP status', response?.status() === 200 ? 'PASS' : 'FAIL', `Status: ${response?.status()}`);
  await screenshot('05-portfolio-empty');

  // Check for empty state
  const emptyState = await page.locator('text=/no|empty|فارغ|لا توجد/i').count();
  log('Portfolio empty state', emptyState > 0 ? 'PASS' : 'INFO', `${emptyState} empty state indicators`);

  // Find add button
  const addBtn = page.getByRole('button').filter({ hasText: /add|إضافة|جديد/i }).first();
  const addBtnVisible = await addBtn.isVisible().catch(() => false);
  if (addBtnVisible) {
    await addBtn.click();
    await page.waitForTimeout(800);
    await screenshot('05-portfolio-modal-open');
    log('Portfolio add modal opens', 'PASS');

    // Close modal
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  } else {
    log('Portfolio add button', 'INFO', 'Not found');
  }

  await fullScreenshot('05-portfolio-full');
} catch (e) {
  log('Portfolio page', 'FAIL', e.message);
}

// ========== TEST 6: ALERTS PAGE ==========
console.log('\n=== TEST 6: ALERTS PAGE ===');
try {
  await page.goto(FRONTEND, { waitUntil: 'domcontentloaded', timeout: 10000 });
  await page.evaluate(() => {
    try { localStorage.removeItem('rad-ai-price-alerts'); } catch {}
  });

  const response = await page.goto(`${FRONTEND}/alerts`, { waitUntil: 'networkidle', timeout: 20000 });
  log('Alerts page HTTP status', response?.status() === 200 ? 'PASS' : 'FAIL', `Status: ${response?.status()}`);
  await screenshot('06-alerts-empty');

  // Check for alert creation form or empty state
  const formInputs = await page.locator('input, select').count();
  log('Alerts form elements', formInputs > 0 ? 'PASS' : 'INFO', `${formInputs} inputs/selects`);

  await fullScreenshot('06-alerts-full');
} catch (e) {
  log('Alerts page', 'FAIL', e.message);
}

// ========== TEST 7: WATCHLIST PAGE ==========
console.log('\n=== TEST 7: WATCHLIST PAGE ===');
try {
  const response = await page.goto(`${FRONTEND}/watchlist`, { waitUntil: 'networkidle', timeout: 20000 });
  log('Watchlist page HTTP status', response?.status() === 200 ? 'PASS' : 'FAIL', `Status: ${response?.status()}`);
  await screenshot('07-watchlist');
  await fullScreenshot('07-watchlist-full');
} catch (e) {
  log('Watchlist page', 'FAIL', e.message);
}

// ========== TEST 8: NEWS PAGE ==========
console.log('\n=== TEST 8: NEWS PAGE ===');
try {
  const response = await page.goto(`${FRONTEND}/news`, { waitUntil: 'networkidle', timeout: 20000 });
  log('News page HTTP status', response?.status() === 200 ? 'PASS' : 'FAIL', `Status: ${response?.status()}`);
  await screenshot('08-news');

  // Check for article cards or loading state
  const articleCards = await page.locator('article, [class*="article"], [class*="Article"], [class*="card"]').count();
  log('News article cards', articleCards > 0 ? 'PASS' : 'INFO', `${articleCards} cards (backend is down, may show loading/error)`);

  await fullScreenshot('08-news-full');
} catch (e) {
  log('News page', 'FAIL', e.message);
}

// ========== TEST 9: CHARTS PAGE ==========
console.log('\n=== TEST 9: CHARTS PAGE ===');
try {
  const response = await page.goto(`${FRONTEND}/charts`, { waitUntil: 'networkidle', timeout: 20000 });
  log('Charts page HTTP status', response?.status() === 200 ? 'PASS' : 'FAIL', `Status: ${response?.status()}`);
  await screenshot('09-charts');

  // Check for chart containers or iframes
  const charts = await page.locator('canvas, svg, iframe, [class*="chart"], [class*="Chart"]').count();
  log('Chart elements', charts > 0 ? 'PASS' : 'INFO', `${charts} chart/iframe elements`);

  await fullScreenshot('09-charts-full');
} catch (e) {
  log('Charts page', 'FAIL', e.message);
}

// ========== TEST 10: STOCK DETAIL PAGE ==========
console.log('\n=== TEST 10: STOCK DETAIL /stock/2222.SR ===');
try {
  const response = await page.goto(`${FRONTEND}/stock/2222.SR`, { waitUntil: 'networkidle', timeout: 25000 });
  log('Stock detail page HTTP status', response?.status() === 200 ? 'PASS' : 'FAIL', `Status: ${response?.status()}`);
  await screenshot('10-stock-detail');

  // Check for tabs
  const tabs = page.getByRole('tab').or(page.locator('[role="tablist"] button'));
  const tabCount = await tabs.count();
  log('Stock detail tabs', tabCount > 0 ? 'PASS' : 'INFO', `${tabCount} tabs`);

  // Check for stock name/ticker display
  const pageContent = await page.textContent('body');
  const has2222 = pageContent.includes('2222') || pageContent.includes('أرامكو');
  log('Stock ticker/name displayed', has2222 ? 'PASS' : 'INFO');

  await page.waitForTimeout(1500);
  await fullScreenshot('10-stock-detail-full');
} catch (e) {
  log('Stock detail page', 'FAIL', e.message);
}

// ========== TEST 11: CHAT PAGE ==========
console.log('\n=== TEST 11: CHAT PAGE ===');
try {
  const response = await page.goto(`${FRONTEND}/chat`, { waitUntil: 'networkidle', timeout: 20000 });
  log('Chat page HTTP status', response?.status() === 200 ? 'PASS' : 'FAIL', `Status: ${response?.status()}`);
  await screenshot('11-chat');

  // Check for chat input
  const chatInput = await page.locator('textarea, input[type="text"]').count();
  log('Chat input elements', chatInput > 0 ? 'PASS' : 'INFO', `${chatInput} inputs`);

  await fullScreenshot('11-chat-full');
} catch (e) {
  log('Chat page', 'FAIL', e.message);
}

// ========== TEST 12: HEADER & NAVIGATION INTERACTION ==========
console.log('\n=== TEST 12: HEADER & NAVIGATION ===');
try {
  await page.goto(FRONTEND, { waitUntil: 'networkidle', timeout: 15000 });

  // Check sidebar/nav visibility
  const sidebar = page.locator('nav, aside, [class*="sidebar"], [class*="Sidebar"]').first();
  const sidebarVisible = await sidebar.isVisible().catch(() => false);
  log('Sidebar/Nav visible', sidebarVisible ? 'PASS' : 'INFO');

  // Check for logo
  const logo = page.locator('img[alt*="logo" i], img[alt*="Ra" i], [class*="logo" i]').first();
  const logoVisible = await logo.isVisible().catch(() => false);
  log('Logo visible', logoVisible ? 'PASS' : 'INFO');

  // Check for theme toggle
  const themeToggle = page.locator('button').filter({ hasText: /theme|dark|light|الوضع/i }).or(
    page.locator('[aria-label*="theme" i], [aria-label*="dark" i], [aria-label*="mode" i]')
  ).first();
  const themeVisible = await themeToggle.isVisible().catch(() => false);
  log('Theme toggle', themeVisible ? 'PASS' : 'INFO');

  await screenshot('12-header-nav');
} catch (e) {
  log('Header & navigation', 'FAIL', e.message);
}

// ========== TEST 13: MOBILE RESPONSIVE (iPhone 14 Pro) ==========
console.log('\n=== TEST 13: MOBILE RESPONSIVE ===');
try {
  await page.setViewportSize({ width: 390, height: 844 }); // iPhone 14 Pro

  await page.goto(FRONTEND, { waitUntil: 'networkidle', timeout: 15000 });
  await screenshot('13-mobile-homepage');
  log('Mobile homepage renders', 'PASS');

  // Check for mobile menu / hamburger
  const hamburger = page.locator('button[aria-label*="menu" i], button[aria-label*="nav" i], [class*="hamburger" i], [class*="mobile-menu" i]').first();
  const hamburgerVisible = await hamburger.isVisible().catch(() => false);
  log('Mobile hamburger menu', hamburgerVisible ? 'PASS' : 'INFO');

  if (hamburgerVisible) {
    await hamburger.click();
    await page.waitForTimeout(500);
    await screenshot('13-mobile-menu-open');
    log('Mobile menu opens on click', 'PASS');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }

  // Screener mobile
  await page.goto(`${FRONTEND}/screener`, { waitUntil: 'networkidle', timeout: 15000 });
  await screenshot('13-mobile-screener');
  log('Mobile screener renders', 'PASS');

  // Market mobile
  await page.goto(`${FRONTEND}/market`, { waitUntil: 'networkidle', timeout: 15000 });
  await screenshot('13-mobile-market');
  log('Mobile market renders', 'PASS');

  // Portfolio mobile
  await page.goto(`${FRONTEND}/portfolio`, { waitUntil: 'networkidle', timeout: 15000 });
  await screenshot('13-mobile-portfolio');
  log('Mobile portfolio renders', 'PASS');

  // Stock detail mobile
  await page.goto(`${FRONTEND}/stock/2222.SR`, { waitUntil: 'networkidle', timeout: 20000 });
  await screenshot('13-mobile-stock-detail');
  log('Mobile stock detail renders', 'PASS');

  // Reset viewport
  await page.setViewportSize({ width: 1440, height: 900 });
} catch (e) {
  log('Mobile tests', 'FAIL', e.message);
}

// ========== TEST 14: TABLET RESPONSIVE (iPad) ==========
console.log('\n=== TEST 14: TABLET RESPONSIVE ===');
try {
  await page.setViewportSize({ width: 768, height: 1024 }); // iPad

  await page.goto(FRONTEND, { waitUntil: 'networkidle', timeout: 15000 });
  await screenshot('14-tablet-homepage');
  log('Tablet homepage renders', 'PASS');

  await page.goto(`${FRONTEND}/screener`, { waitUntil: 'networkidle', timeout: 15000 });
  await screenshot('14-tablet-screener');
  log('Tablet screener renders', 'PASS');

  // Reset viewport
  await page.setViewportSize({ width: 1440, height: 900 });
} catch (e) {
  log('Tablet tests', 'FAIL', e.message);
}

// ========== TEST 15: KEYBOARD NAVIGATION ==========
console.log('\n=== TEST 15: KEYBOARD NAVIGATION ===');
try {
  await page.goto(FRONTEND, { waitUntil: 'networkidle', timeout: 15000 });

  // Tab through elements to check focus styles
  await page.keyboard.press('Tab');
  await page.waitForTimeout(300);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(300);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(300);

  // Check if any element has focus ring/outline
  const focusedElement = await page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    const style = window.getComputedStyle(el);
    return {
      tag: el.tagName,
      text: el.textContent?.substring(0, 50),
      outline: style.outline,
      boxShadow: style.boxShadow,
    };
  });
  log('Keyboard focus navigation', focusedElement ? 'PASS' : 'INFO',
    focusedElement ? `Focused: ${focusedElement.tag} "${focusedElement.text}"` : 'No focused element detected');

  await screenshot('15-keyboard-focus');
} catch (e) {
  log('Keyboard navigation', 'FAIL', e.message);
}

// ========== TEST 16: ERROR HANDLING (404) ==========
console.log('\n=== TEST 16: 404 PAGE ===');
try {
  const response = await page.goto(`${FRONTEND}/nonexistent-page-12345`, { waitUntil: 'networkidle', timeout: 15000 });
  const status = response?.status();
  log('404 page status code', status === 404 ? 'PASS' : 'INFO', `Status: ${status}`);
  await screenshot('16-404-page');

  // Check for custom 404 content
  const pageText = await page.textContent('body');
  const has404Content = /not found|404|غير موجود/i.test(pageText);
  log('Custom 404 content', has404Content ? 'PASS' : 'INFO');
} catch (e) {
  log('404 page', 'FAIL', e.message);
}

await browser.close();

// ========== FINAL SUMMARY ==========
console.log('\n\n========================================');
console.log('       LIVE BROWSER TEST SUMMARY');
console.log('========================================\n');

const passed = results.filter(r => r.status === 'PASS').length;
const failed = results.filter(r => r.status === 'FAIL').length;
const info = results.filter(r => r.status === 'INFO').length;

console.log(`PASS: ${passed}`);
console.log(`FAIL: ${failed}`);
console.log(`INFO: ${info}`);
console.log(`TOTAL: ${results.length}`);

if (failed > 0) {
  console.log('\n--- FAILURES ---');
  results.filter(r => r.status === 'FAIL').forEach(r =>
    console.log(`  FAIL: ${r.test} - ${r.detail}`));
}

console.log('\n--- CONSOLE ERRORS ---');
if (consoleErrors.length > 0) {
  consoleErrors.slice(0, 20).forEach(e => console.log(`  ERROR: ${e.substring(0, 200)}`));
  if (consoleErrors.length > 20) console.log(`  ... and ${consoleErrors.length - 20} more`);
} else {
  console.log('  None captured');
}

console.log('\n--- PAGE CRASHES ---');
if (pageCrashes.length > 0) {
  pageCrashes.forEach(e => console.log(`  CRASH: ${e.substring(0, 200)}`));
} else {
  console.log('  None');
}

console.log(`\nScreenshots saved to: ${SCREENSHOTS_DIR}`);

// Write JSON report
const report = {
  timestamp: new Date().toISOString(),
  frontend_url: FRONTEND,
  backend_available: false,
  summary: { passed, failed, info, total: results.length },
  results,
  consoleErrors: consoleErrors.slice(0, 50),
  pageCrashes,
};
writeFileSync(`${SCREENSHOTS_DIR}/test-report.json`, JSON.stringify(report, null, 2));
console.log(`\nJSON report saved to: ${SCREENSHOTS_DIR}/test-report.json`);
