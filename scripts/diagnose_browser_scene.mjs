import { chromium } from '@playwright/test';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });

  await context.addInitScript(() => {
    localStorage.setItem('retailfix_admin_token', 'retailfix_admin_dev_token');
    localStorage.setItem('retailfix_admin_user', JSON.stringify({ username: 'admin', role: 'admin' }));
  });

  const page = await context.newPage();
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.type(), msg.text()));
  page.on('pageerror', err => console.error('BROWSER ERROR:', err));

  await page.goto('http://localhost:5173/admin/models', { waitUntil: 'networkidle' });
  const previewBtn = page.locator('button:has-text("GLB 3D")').first();
  await previewBtn.waitFor({ state: 'visible' });
  await previewBtn.click();

  await page.waitForTimeout(4000);

  // Check scene objects via window.__previewScene
  const sceneSummary = await page.evaluate(() => {
    const scene = window.__previewScene;
    if (!scene) return 'No preview scene found';
    const meshNames = [];
    scene.traverse(o => {
      if (o.isMesh && o.visible) {
        meshNames.push({ name: o.name, parentName: o.parent?.name, pos: o.position, worldY: (new THREE.Box3().setFromObject(o).min.y) });
      }
    });
    return { meshCount: meshNames.length, meshes: meshNames };
  });

  console.log('Scene Summary:', JSON.stringify(sceneSummary, null, 2));

  await browser.close();
}

main().catch(console.error);
