import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();

  page.on('console', msg => console.log('[BROWSER CONSOLE]', msg.text()));

  console.log('Navigating to CAD editor with 10x20 project RF-SUR-2026-0056...');
  await page.goto('http://127.0.0.1:5173/cad/RF-SUR-2026-0056');
  await page.waitForTimeout(3000);

  // Look for 3D Store button
  const btn3D = page.locator('button:has-text("3D Store")');
  console.log('3D Store button found:', await btn3D.count());
  if (await btn3D.count() > 0) {
    await btn3D.click();
    console.log('Clicked 3D Store button. Waiting for 3D scene...');
    await page.waitForTimeout(3000);

    // Click Cam Info button
    const camInfoBtn = page.locator('button:has-text("Cam Info")');
    if (await camInfoBtn.count() > 0) {
      await camInfoBtn.click();
      await page.waitForTimeout(500);
      const hud = page.locator('text=Camera Framing Diagnostics');
      console.log('HUD visible:', await hud.count() > 0);
      const hudText = await page.locator('div:has(> div:has-text("Camera Framing Diagnostics"))').first().innerText();
      console.log('--- CAM INFO HUD ---');
      console.log(hudText);
      console.log('--------------------');
    }

    // Capture screenshot
    await page.screenshot({ path: 'test_3d_10x20.png' });
    console.log('Saved screenshot to test_3d_10x20.png');
  }

  await browser.close();
})();
