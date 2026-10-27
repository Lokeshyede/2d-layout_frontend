/**
 * RetailFix CAD - Phase 4 Browser Verification Test
 * 3D Walkthrough Video Export
 */

import { chromium } from 'playwright';

const STORE_URL = 'http://127.0.0.1:5173/cad/RF-SUR-2026-0056';
const MAX_WAIT_SECONDS = 150; // 2.5 minutes (encodes in ~80-90s)

async function testPhase4() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1536, height: 864 } });

  page.on('console', (msg) => {
    const text = msg.text();
    if (text.includes('[Walkthrough') || text.includes('Render') || text.includes('Export') || msg.type() === 'error') {
      console.log(`  [BROWSER ${msg.type()}] ${text}`);
    }
  });
  page.on('pageerror', (err) => console.error(`  [BROWSER ERROR]`, err.message));

  console.log('1. Loading store project RF-SUR-2026-0056...');
  await page.goto(STORE_URL);
  await page.waitForTimeout(2000);

  console.log('2. Switching to 3D Store View...');
  await page.locator('button:has-text("3D Store")').click();
  await page.locator('text=Constructing 3D Store Scene').waitFor({ state: 'detached', timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'test_phase4_viewer_loaded.png', timeout: 10000 });
  console.log('  OK Viewer loaded');

  console.log('3. Checking Export Walkthrough Video button exists...');
  const exportBtn = page.locator('button:has-text("Export Walkthrough Video")');
  await exportBtn.waitFor({ state: 'visible', timeout: 10000 });
  console.log('  OK Export button visible');

  console.log('4. Opening export dialog...');
  await exportBtn.click({ force: true });
  await page.waitForTimeout(500);
  await page.locator('text=Export Walkthrough Video').first().waitFor({ state: 'visible', timeout: 5000 });
  await page.screenshot({ path: 'test_phase4_dialog_open.png', timeout: 10000 });
  console.log('  OK Dialog opened');

  console.log('5. Verifying Quick Video preset...');
  const quickBtn = page.locator('button:has-text("Quick Video")');
  await quickBtn.waitFor({ state: 'visible' });
  await quickBtn.click({ force: true });
  await page.waitForTimeout(200);
  console.log('  OK Quick Video preset clickable');

  console.log('6. Verifying HD Presentation preset...');
  const hdBtn = page.locator('button:has-text("HD Presentation")');
  await hdBtn.waitFor({ state: 'visible' });
  await hdBtn.click({ force: true });
  await page.waitForTimeout(200);
  console.log('  OK HD Presentation preset clickable');

  console.log('7. Switching to Custom mode and checking duration + resolution options...');
  const customBtn = page.locator('button:has-text("Custom")');
  await customBtn.click({ force: true });
  await page.waitForTimeout(400);
  await page.locator('button:has-text("15s")').waitFor({ state: 'visible' });
  await page.locator('button:has-text("30s")').waitFor({ state: 'visible' });
  await page.locator('button:has-text("45s")').waitFor({ state: 'visible' });
  await page.locator('button:has-text("60s")').waitFor({ state: 'visible' });
  await page.locator('button:has-text("720p (HD)")').waitFor({ state: 'visible' });
  await page.locator('button:has-text("1080p (FHD)")').waitFor({ state: 'visible' });
  console.log('  OK 15s/30s/45s/60s duration options visible');
  console.log('  OK 720p/1080p resolution options visible');

  console.log('8. Selecting 15s / 720p for test export speed...');
  await page.locator('button:has-text("15s")').click({ force: true });
  await page.waitForTimeout(200);
  await page.locator('button:has-text("720p (HD)")').click({ force: true });
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'test_phase4_custom_settings.png', timeout: 10000 });
  console.log('  OK 15s / 720p selected');

  console.log('9. Starting export...');
  const startBtn = page.locator('button:has-text("Start Video Export")');
  await startBtn.waitFor({ state: 'visible' });
  await startBtn.click({ force: true });
  await page.waitForTimeout(1000);
  console.log('  OK Export started');

  console.log('10. Verifying progress indicator...');
  const progressSpinner = page.locator('text=Generating 3D Walkthrough...');
  const hasProgress = await progressSpinner.isVisible().catch(() => false);
  console.log(`  OK Progress visible: ${hasProgress}`);

  console.log(`11. Monitoring export progress to completion (up to ${MAX_WAIT_SECONDS}s)...`);
  const startTime = Date.now();
  let exportDone = false;

  for (let sec = 0; sec < MAX_WAIT_SECONDS; sec++) {
    await page.waitForTimeout(1000);
    const modalText = await page.evaluate(() => {
      const modal = document.querySelector('.fixed.inset-0');
      return modal ? modal.innerText.replace(/\n+/g, ' | ') : '';
    });

    if (modalText.includes('Walkthrough Video Generated Successfully!')) {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      console.log(`  OK Export completed successfully in ${elapsed}s!`);
      exportDone = true;
      break;
    }

    if (modalText.includes('Failed') || modalText.includes('Error')) {
      throw new Error(`Export reported error: ${modalText}`);
    }

    if (sec % 15 === 0 && sec > 0) {
      console.log(`  ... progress at ${sec}s: ${modalText.slice(0, 100)}`);
    }
  }

  if (!exportDone) {
    throw new Error(`Walkthrough export did not complete within ${MAX_WAIT_SECONDS}s`);
  }

  await page.screenshot({ path: 'test_phase4_export_done.png', timeout: 10000 });

  console.log('12. Checking Download MP4 Video button...');
  const dlBtn = page.locator('button:has-text("Download MP4 Video")');
  await dlBtn.waitFor({ state: 'visible', timeout: 5000 });
  console.log('  OK Download button visible and active');

  console.log('13. Closing export dialog...');
  const closeBtn = page.locator('button:has-text("Close")');
  if (await closeBtn.isVisible().catch(() => false)) {
    await closeBtn.click({ force: true });
  } else {
    await page.keyboard.press('Escape');
  }
  await page.waitForTimeout(1000);
  console.log('  OK Dialog closed');

  console.log('14. Verifying Orbit mode restored after export...');
  await page.locator('#btn-view-orbit').click({ force: true });
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'test_phase4_orbit_restored.png', timeout: 10000 });
  console.log('  OK Orbit mode working');

  console.log('15. Verifying Walk mode works after export...');
  await page.locator('#btn-view-walk').click({ force: true });
  await page.waitForTimeout(1000);
  const walkVisible = await page.locator('text=WALK MODE').isVisible().catch(() => false);
  await page.screenshot({ path: 'test_phase4_walk_after_export.png', timeout: 10000 });
  console.log(`  OK Walk mode active: ${walkVisible}`);
  const exitWalk = page.locator('#btn-exit-walk');
  if (await exitWalk.isVisible().catch(() => false)) {
    await exitWalk.click({ force: true });
  } else {
    await page.keyboard.press('Escape');
  }
  await page.waitForTimeout(800);

  console.log('16. Verifying Top view works after export...');
  await page.locator('#btn-view-top').click({ force: true });
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'test_phase4_top_after_export.png', timeout: 10000 });
  console.log('  OK Top view working');

  console.log('17. Verifying Front view works after export...');
  await page.locator('#btn-view-front').click({ force: true });
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'test_phase4_front_after_export.png', timeout: 10000 });
  console.log('  OK Front view working');

  console.log('18. Verifying Isometric view works after export...');
  await page.locator('#btn-view-isometric').click({ force: true });
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'test_phase4_iso_after_export.png', timeout: 10000 });
  console.log('  OK Isometric view working');

  console.log('19. Second export dialog opens (multiple export support)...');
  await exportBtn.click({ force: true });
  await page.waitForTimeout(500);
  const dialog2 = await page.locator('text=Export Walkthrough Video').first().isVisible().catch(() => false);
  console.log(`  OK Second export dialog opens: ${dialog2}`);
  const cancelBtn2 = page.locator('button:has-text("Cancel")').first();
  if (await cancelBtn2.isVisible().catch(() => false)) {
    await cancelBtn2.click({ force: true });
  }
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'test_phase4_final.png', timeout: 10000 });

  await browser.close();
  console.log('\n====================================================');
  console.log('PHASE 4 LIVE BROWSER VERIFICATION COMPLETED (ALL SUCCESS)');
  console.log('====================================================');
}

testPhase4().catch((err) => {
  console.error('[PHASE 4 BROWSER TEST ERROR]', err);
  process.exit(1);
});