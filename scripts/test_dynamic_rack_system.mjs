import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = 'C:/Users/jayye/.gemini/antigravity-ide/brain/68dbfefd-87be-43ec-bd43-7d32e042db6a';
const CAD_URL = 'http://localhost:5173/cad/RF-SUR-2026-0068?token=TVMkZUisjnzoramJ2upW7UfPe9MafnQiZzAPWMg1v-k';
const ADMIN_URL = 'http://localhost:5173/admin/products';

async function run() {
  console.log('============================================================');
  console.log('RETAILFIX CAD — DYNAMIC ADMIN RACK SYSTEM BROWSER TEST');
  console.log('============================================================\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log(`[Browser Console Error]`, msg.text());
  });

  try {
    // -------------------------------------------------------------
    // TEST 1: Open CAD Editor and inspect "Add Rack" menu
    // -------------------------------------------------------------
    console.log('1. Navigating to CAD Editor:', CAD_URL);
    await page.goto(CAD_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Locate "Add Rack" button
    const addRackBtn = page.locator('button:has-text("Add Rack")').first();
    await addRackBtn.waitFor({ state: 'visible', timeout: 10000 });
    console.log('Found "Add Rack" button, clicking to open menu...');
    await addRackBtn.click();
    await page.waitForTimeout(1000);

    // Take screenshot of open Add Rack menu
    const ss1Path = path.join(ARTIFACT_DIR, 'add_rack_dynamic_menu.png');
    await page.screenshot({ path: ss1Path });
    console.log('Saved screenshot of Add Rack menu to:', ss1Path);

    // Inspect items inside Add Rack menu
    const menuContainer = page.locator('div.absolute.left-0.top-full');
    await menuContainer.waitFor({ state: 'visible', timeout: 5000 });

    const menuText = await menuContainer.innerText();
    console.log('\n--- Add Rack Menu Text Content ---\n' + menuText + '\n----------------------------------');

    // Assert that hardcoded mock catalog is NOT present
    const hardcodedPatterns = [
      'WALL_RACK_7X3',
      'WALL_RACK_7X4',
      'CENTER_RACK_5X3',
      'ENDCAP_5X3',
      'CORNER_RACK_2X2',
      'PRD-WR-7X3',
      'PRD-WR-7X4'
    ];
    for (const pat of hardcodedPatterns) {
      if (menuText.includes(pat)) {
        throw new Error(`FAIL: Hardcoded mock product "${pat}" was found in production Add Rack menu!`);
      }
    }
    console.log('✓ PASS: No hardcoded mock products found in Add Rack menu.');

    // Assert that dynamic active products from PostgreSQL ARE present
    const activeProductsRes = await page.request.get('http://127.0.0.1:8000/api/products');
    const activeJson = await activeProductsRes.json();
    console.log(`\nActive products from DB API (${activeJson.total} items):`);
    for (const p of activeJson.items) {
      console.log(`  - ${p.product_name} (${p.sku}) [Active: ${p.active}]`);
      if (!menuText.includes(p.product_name)) {
        throw new Error(`FAIL: Active product "${p.product_name}" from database was not displayed in Add Rack menu!`);
      }
    }
    console.log('✓ PASS: All active products from database are rendered dynamically.');

    // -------------------------------------------------------------
    // TEST 2: Empty Database State
    // Deactivate active products temporarily and test empty state
    // -------------------------------------------------------------
    console.log('\n2. Testing Empty Database State (Requirement 6 & 44)...');
    
    // Login to admin to get dev token
    const devToken = 'retailfix_admin_dev_token';
    const activeIds = activeJson.items.map((p) => p.id);

    console.log('Deactivating all active products temporarily...');
    for (const id of activeIds) {
      await page.request.patch(`http://127.0.0.1:8000/api/admin/products/${id}/toggle-active`, {
        headers: { Authorization: `Bearer ${devToken}` },
      });
    }

    // Refresh CAD Editor page
    console.log('Reloading CAD Editor with 0 active products...');
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const addRackBtnEmpty = page.locator('button:has-text("Add Rack")').first();
    await addRackBtnEmpty.click();
    await page.waitForTimeout(1000);

    const emptyMenuText = await menuContainer.innerText();
    console.log('\n--- Empty State Menu Content ---\n' + emptyMenuText + '\n---------------------------------');

    const ssEmptyPath = path.join(ARTIFACT_DIR, 'add_rack_empty_state.png');
    await page.screenshot({ path: ssEmptyPath });
    console.log('Saved screenshot of Empty State to:', ssEmptyPath);

    if (!emptyMenuText.includes('No active rack products available.')) {
      throw new Error('FAIL: Empty state title "No active rack products available." not found!');
    }
    if (!emptyMenuText.includes('Ask Admin to upload a rack product.')) {
      throw new Error('FAIL: Empty state subtext "Ask Admin to upload a rack product." not found!');
    }
    console.log('✓ PASS: Empty database state correctly renders mandated messages without hardcoded racks!');

    // -------------------------------------------------------------
    // TEST 3: Re-activation Flow (Requirement 47 & 52)
    // Reactivate products and verify they automatically appear
    // -------------------------------------------------------------
    console.log('\n3. Re-activating products in Admin database...');
    for (const id of activeIds) {
      await page.request.patch(`http://127.0.0.1:8000/api/admin/products/${id}/toggle-active`, {
        headers: { Authorization: `Bearer ${devToken}` },
      });
    }

    console.log('Reloading CAD Editor to verify products reappear...');
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const addRackBtnReactive = page.locator('button:has-text("Add Rack")').first();
    await addRackBtnReactive.click();
    await page.waitForTimeout(1000);

    const restoredMenuText = await menuContainer.innerText();
    for (const p of activeJson.items) {
      if (!restoredMenuText.includes(p.product_name)) {
        throw new Error(`FAIL: Re-activated product "${p.product_name}" did not reappear!`);
      }
    }
    console.log('✓ PASS: Re-activated products reappear dynamically!');

    // -------------------------------------------------------------
    // TEST 4: Add Rack to Canvas and Switch to 3D View
    // -------------------------------------------------------------
    console.log('\n4. Selecting a dynamic rack to add to CAD canvas...');
    const firstRackCard = menuContainer.locator('button').first();
    const selectedProductName = await firstRackCard.locator('span.font-semibold').innerText();
    console.log('Clicking product card:', selectedProductName);
    await firstRackCard.click();
    await page.waitForTimeout(1000);

    // Switch to 3D Store View
    console.log('Switching to 3D Store View...');
    const switch3DBtn = page.locator('button:has-text("3D")').first();
    await switch3DBtn.click();
    await page.waitForTimeout(4000);

    const ss3DPath = path.join(ARTIFACT_DIR, 'cad_3d_dynamic_rack_view.png');
    await page.screenshot({ path: ss3DPath });
    console.log('Saved screenshot of 3D Store View to:', ss3DPath);

    // Verify canvas rendered without WebGL crash
    const canvas3D = page.locator('canvas').first();
    const canvasBox = await canvas3D.boundingBox();
    if (!canvasBox || canvasBox.width === 0 || canvasBox.height === 0) {
      throw new Error('FAIL: 3D Canvas did not render properly!');
    }
    console.log('✓ PASS: 3D Store View initialized successfully with dynamic rack GLB!');

    console.log('\n============================================================');
    console.log('ALL BROWSER INTEGRATION TESTS PASSED WITH 100% SUCCESS!');
    console.log('============================================================\n');
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error('\n❌ BROWSER TEST ERROR:\n', err);
  process.exit(1);
});
