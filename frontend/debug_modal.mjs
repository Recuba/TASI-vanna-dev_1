import { chromium } from '@playwright/test';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ baseURL: 'http://localhost:3005' });
const page = await context.newPage();

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
console.log('H1 found');

const buttons = await page.$$eval('button', btns => btns.map(b => b.textContent.trim()));
console.log('Buttons:', JSON.stringify(buttons));

const addBtn = page.locator('button').filter({ hasText: /Add Transaction|إضافة صفقة/ }).first();
console.log('visible:', await addBtn.isVisible(), 'enabled:', await addBtn.isEnabled());

const box = await addBtn.boundingBox();
console.log('box:', JSON.stringify(box));

const center = { x: box.x + box.width/2, y: box.y + box.height/2 };
const elAtCenter = await page.evaluate(({x,y}) => {
  const el = document.elementFromPoint(x, y);
  return el ? {tag: el.tagName, cls: el.className.slice(0,100), text: el.textContent?.slice(0,50)} : null;
}, center);
console.log('Element at center:', JSON.stringify(elAtCenter));

await addBtn.click();
await page.waitForTimeout(2000);

const h3s = await page.$$eval('h3', els => els.map(e => e.textContent?.trim()));
console.log('H3s after click:', JSON.stringify(h3s));

const insetEls = await page.$$eval('[class*="inset-0"]', els => els.map(e => e.className.slice(0,80)));
console.log('inset-0 elements:', JSON.stringify(insetEls));

await browser.close();
