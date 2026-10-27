import { chromium } from 'playwright';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();

  page.on('console', msg => {
    const text = msg.text();
    if (!text.includes('Download the React DevTools') && !text.includes('GPU stall')) {
      console.log('[BROWSER]', text);
    }
  });

  console.log('1. Navigating to CAD Editor for 10x20 Project RF-SUR-2026-0056...');
  await page.goto('http://127.0.0.1:5173/cad/RF-SUR-2026-0056');
  await page.waitForTimeout(2000);

  console.log('2. Switching to 3D Store View...');
  await page.locator('button:has-text("3D Store")').click();
  await page.waitForTimeout(2000);

  // Enable Cam Info HUD
  await page.locator('button:has-text("Cam Info")').click();
  await page.waitForTimeout(500);

  async function getDiagText() {
    const hud = page.locator('div:has(> div:has-text("Camera Framing Diagnostics"))').first();
    return await hud.innerText();
  }

  // 1. Initial / Isometric View
  console.log('\n--- TEST: INITIAL ISOMETRIC VIEW ---');
  await page.screenshot({ path: 'test_1_isometric.png' });
  console.log(await getDiagText());

  // 2. Test TOP View
  console.log('\n--- TEST: TOP VIEW ---');
  await page.locator('button:has-text("Top")').click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'test_2_top.png' });
  console.log(await getDiagText());

  // 3. Test FRONT View
  console.log('\n--- TEST: FRONT VIEW ---');
  await page.locator('button:has-text("Front")').click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'test_3_front.png' });
  console.log(await getDiagText());

  // 4. Test SIDE View
  console.log('\n--- TEST: SIDE VIEW ---');
  await page.locator('button:has-text("Side")').click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'test_4_side.png' });
  console.log(await getDiagText());

  // 5. Test FIT View
  console.log('\n--- TEST: FIT BUTTON ---');
  await page.locator('button:has-text("Fit")').click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'test_5_fit.png' });
  console.log(await getDiagText());

  // 6. Test RESET View
  console.log('\n--- TEST: RESET BUTTON ---');
  await page.locator('button:has-text("Reset")').click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'test_6_reset.png' });
  console.log(await getDiagText());

  // 7. Test Mobile Viewport Responsive Framing
  console.log('\n--- TEST: MOBILE PORTRAIT VIEWPORT (390x844) ---');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'test_7_mobile_portrait.png' });
  console.log(await getDiagText());

  await browser.close();
  console.log('\nAll browser visual tests completed successfully!');
}

run().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
