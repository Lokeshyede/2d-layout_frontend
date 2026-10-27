import { chromium } from 'playwright';

async function testPhase2() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  console.log('1. Loading 10x20 project RF-SUR-2026-0056...');
  await page.goto('http://127.0.0.1:5173/cad/RF-SUR-2026-0056');
  await page.waitForTimeout(2000);

  console.log('2. Switching to 3D Store View...');
  await page.locator('button:has-text("3D Store")').click();
  await page.locator('text=Constructing 3D Store Scene').waitFor({ state: 'detached', timeout: 30000 });
  await page.waitForTimeout(2000);

  // Take screenshot of store with GLB racks rendered
  await page.screenshot({ path: 'test_phase2_10x20_racks.png' });
  console.log('Captured test_phase2_10x20_racks.png');

  // Click on the store canvas to select a rack
  console.log('3. Clicking on rack to test 3D selection and highlight...');
  // The rack is in the center-left area of the canvas. Center of viewport is (640, 360)
  await page.mouse.click(560, 420);
  await page.waitForTimeout(1000);

  // Check if Product Selection Info card appeared
  const infoCard = page.locator('text=Product Name');
  const isVisible = await infoCard.isVisible();
  console.log(`Product info card visible: ${isVisible}`);
  await page.screenshot({ path: 'test_phase2_rack_selected.png' });
  console.log('Captured test_phase2_rack_selected.png');

  // If inspect button is visible, click it
  const inspectBtn = page.locator('button:has-text("Inspect GLB Details")');
  if (await inspectBtn.isVisible()) {
    console.log('4. Clicking Inspect GLB Details...');
    await inspectBtn.click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: 'test_phase2_glb_diagnostics.png' });
    console.log('Captured test_phase2_glb_diagnostics.png');
  }

  // Click close button on info card
  console.log('5. Clicking Deselect button...');
  await page.locator('button[title="Deselect"]').click({ force: true });
  await page.waitForTimeout(400);

  // Click empty floor canvas at (400, 600)
  await page.mouse.click(400, 600);
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'test_phase2_deselected.png' });
  console.log('Captured test_phase2_deselected.png');

  await browser.close();
  console.log('Phase 2 browser tests completed successfully!');
}

testPhase2().catch((err) => {
  console.error('Browser test error:', err);
  process.exit(1);
});
