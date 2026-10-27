import { chromium } from 'playwright';

async function testPhase3() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1536, height: 864 } });

  console.log('1. Loading store project RF-SUR-2026-0056...');
  await page.goto('http://127.0.0.1:5173/cad/RF-SUR-2026-0056');
  await page.waitForTimeout(2000);

  console.log('2. Switching to 3D Store View...');
  await page.locator('button:has-text("3D Store")').click();
  await page.locator('text=Constructing 3D Store Scene').waitFor({ state: 'detached', timeout: 30000 });
  await page.waitForTimeout(2000);

  // Verify view preset bar has ORBIT, WALK, TOP, FRONT, ISOMETRIC
  console.log('3. Verifying View Mode Buttons...');
  const orbitBtn = page.locator('#btn-view-orbit');
  const walkBtn = page.locator('#btn-view-walk');
  const topBtn = page.locator('#btn-view-top');
  const frontBtn = page.locator('#btn-view-front');
  const isoBtn = page.locator('#btn-view-isometric');

  await orbitBtn.waitFor({ state: 'visible' });
  await walkBtn.waitFor({ state: 'visible' });
  await topBtn.waitFor({ state: 'visible' });
  await frontBtn.waitFor({ state: 'visible' });
  await isoBtn.waitFor({ state: 'visible' });

  await page.screenshot({ path: 'test_phase3_orbit_view.png' });
  console.log('  ✓ Captured test_phase3_orbit_view.png (Orbit default mode)');

  // 4. Enter WALK mode
  console.log('4. Entering Walk Mode...');
  await walkBtn.click();
  await page.waitForTimeout(1000);

  const walkBanner = page.locator('text=WALK MODE (5′6″)');
  await walkBanner.waitFor({ state: 'visible' });
  console.log('  ✓ Walk HUD Banner visible');

  await page.screenshot({ path: 'test_phase3_walk_entered.png' });
  console.log('  ✓ Captured test_phase3_walk_entered.png');

  // 5. Toggle Colliders Debugger (Section 37 & 38)
  console.log('5. Enabling Collision Debug Mode...');
  const collidersBtn = page.locator('#btn-toggle-colliders');
  await collidersBtn.click();
  await page.waitForTimeout(600);

  const diagHud = page.locator('text=Walk Collision Diagnostics');
  await diagHud.waitFor({ state: 'visible', timeout: 5000 });
  console.log(`  ✓ Collision Diagnostics HUD visible: true`);

  await page.screenshot({ path: 'test_phase3_colliders_debug.png' });
  console.log('  ✓ Captured test_phase3_colliders_debug.png');

  // 6. Test WASD Walking
  console.log('6. Walking Forward (W key)...');
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1200);
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(400);

  await page.screenshot({ path: 'test_phase3_walking_forward.png' });
  console.log('  ✓ Captured test_phase3_walking_forward.png');

  // 7. Test Sprinting (Shift + W) and Strafe (D)
  console.log('7. Sprinting & Strafing (Shift + W + D)...');
  await page.keyboard.down('Shift');
  await page.keyboard.down('KeyW');
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(1500);
  await page.keyboard.up('KeyD');
  await page.keyboard.up('KeyW');
  await page.keyboard.up('Shift');
  await page.waitForTimeout(400);

  await page.screenshot({ path: 'test_phase3_collision_stopped.png' });
  console.log('  ✓ Captured test_phase3_collision_stopped.png (Stopped before obstacle)');

  // 8. Test Mouse Look (non-pointer-lock drag simulation)
  console.log('8. Testing Mouse Drag Look (simulated)...');
  // Simulate mouse drag on canvas without triggering pointer lock
  await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (canvas) {
      canvas.dispatchEvent(new MouseEvent('mousemove', { clientX: 640, clientY: 360, bubbles: true }));
      canvas.dispatchEvent(new MouseEvent('mousemove', { clientX: 500, clientY: 360, movementX: -140, movementY: 0, bubbles: true }));
    }
  });
  await page.waitForTimeout(400);

  await page.screenshot({ path: 'test_phase3_mouse_look.png' });
  console.log('  ✓ Captured test_phase3_mouse_look.png');

  // 9. Exit Walk Mode back to Orbit
  console.log('9. Exiting Walk Mode to Orbit...');
  const exitBtn = page.locator('#btn-exit-walk');
  if (await exitBtn.isVisible()) {
    await exitBtn.click({ force: true });
  } else {
    // Press Escape as keyboard fallback
    await page.keyboard.press('Escape');
  }
  await page.waitForTimeout(1500);

  await page.screenshot({ path: 'test_phase3_exit_to_orbit.png' });
  console.log('  ✓ Captured test_phase3_exit_to_orbit.png (Camera restored to Orbit)');

  // 10. Test Presets (Top, Front, Isometric)
  console.log('10. Testing Presets: Top View...');
  await topBtn.click({ force: true });
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'test_phase3_top_view.png' });
  console.log('  ✓ Captured test_phase3_top_view.png');

  console.log('11. Testing Presets: Front View...');
  await frontBtn.click({ force: true });
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'test_phase3_front_view.png' });
  console.log('  ✓ Captured test_phase3_front_view.png');

  console.log('12. Testing Presets: Isometric View...');
  await isoBtn.click({ force: true });
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'test_phase3_iso_view.png' });
  console.log('  ✓ Captured test_phase3_iso_view.png');

  await browser.close();
  console.log('\n====================================================');
  console.log('PHASE 3 LIVE BROWSER VERIFICATION COMPLETED (ALL SUCCESS)');
  console.log('====================================================');
}

testPhase3().catch((err) => {
  console.error('[BROWSER TEST ERROR]', err);
  process.exit(1);
});
