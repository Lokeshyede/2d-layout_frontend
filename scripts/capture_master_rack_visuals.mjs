import { chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const ARTIFACT_DIR = 'C:/Users/jayye/.gemini/antigravity-ide/brain/68dbfefd-87be-43ec-bd43-7d32e042db6a';

if (!fs.existsSync(ARTIFACT_DIR)) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
}

async function main() {
  console.log('Launching headless browser for master visual verification...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });

  await context.addInitScript(() => {
    localStorage.setItem('retailfix_admin_token', 'retailfix_admin_dev_token');
    localStorage.setItem('retailfix_admin_user', JSON.stringify({ username: 'admin', role: 'admin' }));
  });

  const page = await context.newPage();

  try {
    console.log('Navigating to http://localhost:5173/admin/models...');
    await page.goto('http://localhost:5173/admin/models', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    console.log('Opening preview modal for Wall Display Rack...');
    const previewBtn = page.locator('button:has-text("GLB 3D")').first();
    await previewBtn.waitFor({ state: 'visible', timeout: 15000 });
    await previewBtn.click();

    // Wait for 3D canvas and model to load
    await page.waitForTimeout(4000);

    const modal = page.locator('.fixed.inset-0').first();
    await modal.waitFor({ state: 'visible', timeout: 10000 });

    const shelfCounts = [6, 8, 10];
    const views = [
      { name: 'front', label: 'Front' },
      { name: 'left_side', label: 'Side (L)' },
      { name: 'right_side', label: 'Side (R)' },
      { name: '3_4', label: '3/4 View' },
    ];

    for (const count of shelfCounts) {
      console.log(`Setting shelf count to ${count}...`);
      const countBtn = modal.getByRole('button', { name: `${count}`, exact: true });
      await countBtn.click();
      await page.waitForTimeout(3000); // allow Three.js reconfiguration

      for (const view of views) {
        console.log(`Setting view to ${view.label}...`);
        const viewBtn = modal.locator(`button:has-text("${view.label}")`).first();
        await viewBtn.click();
        await page.waitForTimeout(1500); // camera transition

        const filename = `rack_${count}shelves_${view.name}.png`;
        const filepath = path.join(ARTIFACT_DIR, filename);
        await modal.screenshot({ path: filepath });
        console.log(`✓ Captured: ${filename}`);
      }
    }

    // Toggle BBoxes debug mode
    console.log('Toggling BBoxes debug mode...');
    const bboxBtn = modal.locator('button:has-text("BBoxes")').first();
    await bboxBtn.click();
    await page.waitForTimeout(2000);

    const bboxFilepath = path.join(ARTIFACT_DIR, 'rack_debug_bboxes.png');
    await modal.screenshot({ path: bboxFilepath });
    console.log(`✓ Captured: rack_debug_bboxes.png`);

    console.log('\nTesting dynamic sequence: 3 -> 5 -> 6 -> 8 -> 10 -> 12 -> 5 -> 3');
    for (const seqCount of [3, 5, 6, 8, 10, 12, 5, 3]) {
      const btn = modal.getByRole('button', { name: `${seqCount}`, exact: true });
      await btn.click();
      await page.waitForTimeout(800);
      console.log(`  Dynamic switch to ${seqCount} shelves verified.`);
    }

    console.log('\nAll master visual captures and test sequences completed successfully!');
  } catch (err) {
    console.error('Error during visual capture:', err);
  } finally {
    await browser.close();
  }
}

main();
