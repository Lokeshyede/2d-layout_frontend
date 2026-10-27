import { chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const ARTIFACT_DIR = 'C:/Users/jayye/.gemini/antigravity-ide/brain/393df4c0-9584-4547-8e71-cd8b2d3c9929';

async function main() {
  console.log('Launching browser to capture visual proof screenshots...');
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

    // Look for GLB 3D button on Wall Display Rack row
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
      { name: '3_4', label: '3/4 View' },
      { name: 'front', label: 'Front' },
      { name: 'right_side', label: 'Side (R)' },
      { name: 'left_side', label: 'Side (L)' }
    ];

    for (const count of shelfCounts) {
      console.log(`Setting shelf count to ${count}...`);
      // Find the exact button with text `${count}`
      const countBtn = modal.getByRole('button', { name: `${count}`, exact: true });
      await countBtn.click();
      await page.waitForTimeout(3500); // allow Three.js to reconfigure and render

      for (const view of views) {
        console.log(`Setting view to ${view.label}...`);
        const viewBtn = modal.locator(`button:has-text("${view.label}")`).first();
        await viewBtn.click();
        await page.waitForTimeout(1500); // allow OrbitControls / camera update

        const filename = `bracket_${count}shelves_${view.name}.png`;
        const filepath = path.join(ARTIFACT_DIR, filename);
        await modal.screenshot({ path: filepath });
        console.log(`Captured: ${filepath}`);
      }
    }

    // Capture BBox Debug view
    console.log('Toggling BBox Debug mode...');
    const bboxBtn = modal.locator('button:has-text("BBoxes")').first();
    await bboxBtn.click();
    await page.waitForTimeout(2000);

    const bboxFilepath = path.join(ARTIFACT_DIR, 'bracket_bbox_debug.png');
    await modal.screenshot({ path: bboxFilepath });
    console.log(`Captured: ${bboxFilepath}`);

    console.log('All visual proof screenshots captured successfully!');
  } catch (err) {
    console.error('Error during screenshot capture:', err);
  } finally {
    await browser.close();
  }
}

main();
