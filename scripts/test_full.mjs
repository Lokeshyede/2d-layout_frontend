import { chromium } from 'playwright';

async function testFull() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1536, height: 864 } });

  page.on('console', (msg) => console.log('LOG:', msg.type(), msg.text()));
  page.on('pageerror', (err) => console.error('PAGE_ERR:', err));

  await page.goto('http://127.0.0.1:5173/cad/RF-SUR-2026-0056');
  await page.waitForTimeout(2000);
  await page.locator('button:has-text("3D Store")').click();
  await page.locator('text=Constructing 3D Store Scene').waitFor({ state: 'detached', timeout: 30000 });
  await page.waitForTimeout(1000);

  const exportBtn = page.locator('button:has-text("Export Walkthrough Video")');
  await exportBtn.click({ force: true });
  await page.waitForTimeout(500);

  await page.locator('button:has-text("Custom")').click({ force: true });
  await page.waitForTimeout(200);

  await page.locator('button:has-text("15s")').click({ force: true });
  await page.locator('button:has-text("720p (HD)")').click({ force: true });

  console.log('STARTING EXPORT...');
  await page.locator('button:has-text("Start Video Export")').click({ force: true });

  const start = Date.now();
  for (let i = 0; i < 70; i++) {
    await page.waitForTimeout(1000);
    const state = await page.evaluate(() => {
      const modal = document.querySelector('.fixed.inset-0');
      return modal ? modal.innerText.replace(/\n+/g, ' | ') : 'NO MODAL';
    });
    console.log(`[${Math.round((Date.now() - start)/1000)}s] ${state.slice(0, 120)}`);
    if (state.includes('Walkthrough Video Generated Successfully!') || state.includes('Failed') || state.includes('error')) {
      console.log('TERMINAL STATE REACHED!');
      break;
    }
  }
  await page.screenshot({ path: 'test_terminal_state.png' });
  await browser.close();
}

testFull().catch(console.error);