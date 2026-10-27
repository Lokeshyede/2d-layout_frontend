import { chromium } from 'playwright';

async function testStores() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  console.log('Testing 60x30 multi-wall project RF-SUR-2026-0035 in 3D...');
  await page.goto('http://127.0.0.1:5173/cad/RF-SUR-2026-0035');
  await page.waitForTimeout(2000);
  console.log('2. Switching to 3D Store View...');
  await page.locator('button:has-text("3D Store")').click();
  console.log('3. Waiting for 3D store scene construction...');
  await page.locator('text=Constructing 3D Store Scene').waitFor({ state: 'detached', timeout: 30000 });
  await page.waitForTimeout(1000);

  // Take screenshot with HUD closed
  await page.screenshot({ path: 'test_60x30_store_clean.png' });
  console.log('Captured test_60x30_store_clean.png');

  // Test Top view
  await page.locator('button:has-text("Top")').click({ force: true });
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'test_60x30_top_clean.png' });
  console.log('Captured test_60x30_top_clean.png');

  // Test Front view
  await page.locator('button:has-text("Front")').click({ force: true });
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'test_60x30_front_clean.png' });
  console.log('Captured test_60x30_front_clean.png');

  await browser.close();
  console.log('Done!');
}

testStores().catch(err => {
  console.error(err);
  process.exit(1);
});
