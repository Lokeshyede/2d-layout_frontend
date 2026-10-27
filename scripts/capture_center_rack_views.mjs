import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = 'C:/Users/jayye/.gemini/antigravity-ide/brain/68dbfefd-87be-43ec-bd43-7d32e042db6a';
const ADMIN_MODELS_URL = 'http://localhost:5173/admin/models';
const CAD_URL = 'http://localhost:5173/cad/RF-SUR-2026-0068?token=TVMkZUisjnzoramJ2upW7UfPe9MafnQiZzAPWMg1v-k';

async function main() {
  console.log('============================================================');
  console.log('CENTER RACK 3D VISUAL VALIDATION & CAPTURE SUITE');
  console.log('============================================================\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });

  // Pre-seed localStorage with admin token so we bypass login
  await context.addInitScript(() => {
    localStorage.setItem('retailfix_admin_token', 'retailfix_admin_dev_token');
    localStorage.setItem('retailfix_admin_user', JSON.stringify({ username: 'admin', role: 'admin' }));
  });

  const page = await context.newPage();

  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log(`[Browser Console Error]`, msg.text());
  });

  try {
    // -----------------------------------------------------------------
    // PART 1: Admin Product 3D Model Inspector for "Center Rack 5x3"
    // -----------------------------------------------------------------
    console.log('1. Navigating to Admin Models Page:', ADMIN_MODELS_URL);
    await page.goto(ADMIN_MODELS_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Find the Center Rack row or card
    console.log('Locating Center Rack 5x3 row...');
    const centerRackRow = page.locator('tr:has-text("Center Rack 5x3")').first();
    await centerRackRow.waitFor({ state: 'visible', timeout: 10000 });

    // Click 3D Preview button for Center Rack
    console.log('Opening 3D Model Preview modal for Center Rack...');
    const previewBtn = centerRackRow.locator('button[title*="Preview"], button:has-text("Preview"), button:has(svg.lucide-box), button:has(svg.lucide-eye)').first();
    await previewBtn.click();
    await page.waitForTimeout(3000);

    // Verify Model Preview Modal is open
    const modal = page.locator('div.fixed.inset-0.z-50');
    await modal.waitFor({ state: 'visible', timeout: 5000 });
    console.log('✓ Model Preview Modal opened successfully.');

    // Wait for 3D model to load inside modal
    await page.waitForTimeout(3000);

    // 1. Capture 3/4 View (Default or clicked)
    console.log('Capturing 3/4 Isometric View...');
    const btn34 = modal.locator('button:has-text("3/4 View")').first();
    await btn34.click();
    await page.waitForTimeout(1000);
    const ss34 = path.join(ARTIFACT_DIR, 'center_rack_3_4.png');
    await modal.screenshot({ path: ss34 });
    console.log('Saved 3/4 view to:', ss34);

    // 2. Capture Front View
    console.log('Capturing Front View...');
    const btnFront = modal.locator('button:has-text("Front")').first();
    await btnFront.click();
    await page.waitForTimeout(1000);
    const ssFront = path.join(ARTIFACT_DIR, 'center_rack_front.png');
    await modal.screenshot({ path: ssFront });
    console.log('Saved Front view to:', ssFront);

    // 3. Capture Left Side View
    console.log('Capturing Left Side View...');
    const btnLeft = modal.locator('button:has-text("Side (L)")').first();
    await btnLeft.click();
    await page.waitForTimeout(1000);
    const ssLeft = path.join(ARTIFACT_DIR, 'center_rack_left_side.png');
    await modal.screenshot({ path: ssLeft });
    console.log('Saved Left Side view to:', ssLeft);

    // 4. Capture Right Side View
    console.log('Capturing Right Side View...');
    const btnRight = modal.locator('button:has-text("Side (R)")').first();
    await btnRight.click();
    await page.waitForTimeout(1000);
    const ssRight = path.join(ARTIFACT_DIR, 'center_rack_right_side.png');
    await modal.screenshot({ path: ssRight });
    console.log('Saved Right Side view to:', ssRight);

    // 5. Capture Top View
    console.log('Capturing Top View...');
    const btnTop = modal.locator('button:has-text("Top")').first();
    await btnTop.click();
    await page.waitForTimeout(1000);
    const ssTop = path.join(ARTIFACT_DIR, 'center_rack_top.png');
    await modal.screenshot({ path: ssTop });
    console.log('Saved Top view to:', ssTop);

    // 6. Test Shelves Variation: 8 Shelves in 3/4 View
    console.log('Testing 8 shelves configuration...');
    const btn8 = modal.locator('button:has-text("8")').first();
    await btn8.click();
    await btn34.click();
    await page.waitForTimeout(1000);
    const ss8 = path.join(ARTIFACT_DIR, 'center_rack_8shelves_3_4.png');
    await modal.screenshot({ path: ss8 });
    console.log('Saved 8 shelves 3/4 view to:', ss8);

    // 7. Test Shelves Variation: 10 Shelves in 3/4 View
    console.log('Testing 10 shelves configuration...');
    const btn10 = modal.locator('button:has-text("10")').first();
    await btn10.click();
    await page.waitForTimeout(1000);
    const ss10 = path.join(ARTIFACT_DIR, 'center_rack_10shelves_3_4.png');
    await modal.screenshot({ path: ss10 });
    console.log('Saved 10 shelves 3/4 view to:', ss10);

    // Close preview modal
    const closeBtn = modal.locator('button:has(svg.lucide-x)').first();
    await closeBtn.click();
    await page.waitForTimeout(1000);

    // -----------------------------------------------------------------
    // PART 2: CAD Editor Store Layout with Center Racks in 3D
    // -----------------------------------------------------------------
    console.log('\n2. Navigating to CAD Editor with Center Racks:', CAD_URL);
    await page.goto(CAD_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Switch to 3D View
    console.log('Switching to 3D Store View...');
    const switch3DBtn = page.locator('button:has-text("3D")').first();
    await switch3DBtn.click();
    await page.waitForTimeout(5000);

    const ssCAD3D = path.join(ARTIFACT_DIR, 'center_rack_cad_3d_store.png');
    await page.screenshot({ path: ssCAD3D });
    console.log('Saved CAD 3D Store View to:', ssCAD3D);

    console.log('\n============================================================');
    console.log('ALL CENTER RACK VISUAL VIEWS CAPTURED SUCCESSFULLY!');
    console.log('============================================================\n');
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('\n❌ CAPTURE ERROR:\n', err);
  process.exit(1);
});
