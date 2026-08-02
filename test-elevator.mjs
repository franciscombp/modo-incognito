import { chromium } from 'playwright';

const browser = await chromium.launch({ 
  executablePath: '/opt/pw-browsers/chromium',
  headless: true 
});
const page = await browser.newPage();
await page.setViewportSize({ width: 1280, height: 720 });
await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
await page.screenshot({ path: '/tmp/elevator-style.png', fullPage: true });
console.log('Screenshot saved');
await browser.close();
