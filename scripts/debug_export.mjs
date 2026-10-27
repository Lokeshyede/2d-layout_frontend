import { chromium } from 'playwright';

async function debug() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1536, height: 864 } });

  page.on('console', (msg) => console.log('BROWSER_LOG:', msg.type(), msg.text()));
  page.on('pageerror', (err) => console.error('BROWSER_PAGE_ERROR:', err));

  await page.goto('http://127.0.0.1:5173/cad/RF-SUR-2026-0056');
  await page.waitForTimeout(2000);
  await page.locator('button:has-text("3D Store")').click();
  await page.locator('text=Constructing 3D Store Scene').waitFor({ state: 'detached', timeout: 30000 });
  await page.waitForTimeout(1000);

  const exportBtn = page.locator('button:has-text("Export Walkthrough Video")');
  await exportBtn.click({ force: true });
  await page.waitForTimeout(500);

  const customBtn = page.locator('button:has-text("Custom")');
  await customBtn.click({ force: true });
  await page.waitForTimeout(200);

  await page.locator('button:has-text("15s")').click({ force: true });
  await page.locator('button:has-text("720p (HD)")').click({ force: true });

  console.log('CLICKING START...');
  await page.locator('button:has-text("Start Video Export")').click({ force: true });

  for (let i = 0; i < 25; i++) {
    await page.waitForTimeout(1000);
    const text = await page.evaluate(() => {
      const modal = document.querySelector('.fixed.inset-0');
      return modal ? modal.innerText : 'NO MODAL';
    });
    console.log(`TICK ${i}:`, text.split('\n').filter(Boolean).slice(0, 8).join(' | '));
    if (text.includes('Walkthrough Video Generated Successfully!') || text.includes('Failed')) break;
  }
  await browser.close();
}

debug().catch(console.error);