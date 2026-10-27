import { chromium } from '@playwright/test';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });

  await context.addInitScript(() => {
    localStorage.setItem('retailfix_admin_token', 'retailfix_admin_dev_token');
    localStorage.setItem('retailfix_admin_user', JSON.stringify({ username: 'admin', role: 'admin' }));
  });

  const page = await context.newPage();
  await page.goto('http://localhost:5173/admin/models', { waitUntil: 'networkidle' });
  const previewBtn = page.locator('button:has-text("GLB 3D")').first();
  await previewBtn.waitFor({ state: 'visible' });
  await previewBtn.click();
  await page.waitForTimeout(4000);

  const data = await page.evaluate(() => {
    const scene = window.__previewScene;
    if (!scene) return { error: 'no scene' };

    const objects = [];
    scene.traverse(o => {
      const e = o.matrixWorld?.elements;
      const worldY = e ? e[13] : null;
      const worldX = e ? e[12] : null;
      const worldZ = e ? e[14] : null;

      objects.push({
        name: o.name,
        type: o.type,
        visible: o.visible,
        localZ: o.position?.z,
        worldY,
        worldX,
        worldZ,
        childrenCount: o.children?.length,
      });
    });
    return { count: objects.length, objects: objects.filter(o => o.name && (o.name.includes('Parametric') || o.name.includes('Shelf') || o.name.includes('Bracket') || o.name.includes('3DGeom'))) };
  });

  console.log('Result:', JSON.stringify(data, null, 2));
  await browser.close();
}

main().catch(console.error);
