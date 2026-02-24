import { chromium } from '@playwright/test';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ baseURL: 'http://localhost:3005' });
const page = await context.newPage();

// Capture console errors
page.on('console', msg => {
  if (msg.type() === 'error') console.log('CONSOLE ERROR:', msg.text());
});
page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

await page.route('**/api/v1/stocks/batch-quotes**', route => 
  route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
await page.route('**/health**', route => 
  route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":"healthy"}' }));
await page.route('**/api/v1/widgets/stream**', route => 
  route.fulfill({ status: 200, headers: {'Content-Type': 'text/event-stream'}, body: ': connected\n\n' }));
await page.route('**/api/v1/news/stream**', route => 
  route.fulfill({ status: 200, headers: {'Content-Type': 'text/event-stream'}, body: ': connected\n\n' }));

await page.goto('/portfolio', { waitUntil: 'domcontentloaded' });
await page.evaluate(() => localStorage.removeItem('rad-ai-portfolio-transactions'));
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('h1', { timeout: 15000 });

// Try evaluate click
const result = await page.evaluate(() => {
  const buttons = document.querySelectorAll('button');
  for (const btn of buttons) {
    if (btn.textContent?.includes('Add Transaction') || btn.textContent?.includes('إضافة صفقة')) {
      btn.click();
      return `clicked: ${btn.textContent?.trim()}`;
    }
  }
  return 'no button found';
});
console.log('evaluate click result:', result);

await page.waitForTimeout(2000);

const h3s = await page.$$eval('h3', els => els.map(e => e.textContent?.trim()));
console.log('H3s after evaluate click:', JSON.stringify(h3s));

// Try dispatchEvent
const result2 = await page.evaluate(() => {
  const buttons = document.querySelectorAll('button');
  for (const btn of buttons) {
    if (btn.textContent?.includes('Add Transaction') || btn.textContent?.includes('إضافة صفقة')) {
      const event = new MouseEvent('click', { bubbles: true, cancelable: true });
      btn.dispatchEvent(event);
      return `dispatched: ${btn.textContent?.trim()}`;
    }
  }
  return 'no button found';
});
console.log('dispatchEvent result:', result2);

await page.waitForTimeout(2000);

const h3s2 = await page.$$eval('h3', els => els.map(e => e.textContent?.trim()));
console.log('H3s after dispatchEvent:', JSON.stringify(h3s2));

// Check React root
const reactRoot = await page.evaluate(() => {
  const root = document.getElementById('__NEXT_DATA__');
  return root ? root.textContent?.slice(0, 200) : 'null';
});
console.log('Next data:', reactRoot?.slice(0, 100));

await browser.close();
