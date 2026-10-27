import { chromium } from '@playwright/test';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addInitScript(() => {
    localStorage.setItem('retailfix_admin_token', 'retailfix_admin_dev_token');
    localStorage.setItem('retailfix_admin_user', JSON.stringify({ username: 'admin', role: 'admin' }));
  });
  const page = await context.newPage();
  await page.goto('http://localhost:5173/admin/models', { waitUntil: 'networkidle' });
  const previewBtn = page.locator('button:has-text("GLB 3D")').first();
  await previewBtn.waitFor({ state: 'visible' });
  await previewBtn.click();
  await page.waitForTimeout(3000);

  const res = await page.evaluate(() => {
    const scene = window.__previewScene;
    const rack = scene.children.find(c => c.userData?.type === 'rack_model');
    const uploadedGLB = rack.userData?.uploadedGLB;
    if (!uploadedGLB) return 'No uploadedGLB';

    const objects = [];
    uploadedGLB.traverse(o => {
      objects.push({
        name: o.name,
        type: o.type,
        childCount: o.children ? o.children.length : 0,
        meshCount: o.children ? o.children.filter(c => c.isMesh).length : 0
      });
    });
    return {
      uploadedGLBName: uploadedGLB.name,
      uploadedGLBChildren: uploadedGLB.children.map(c => ({ name: c.name, children: c.children.length })),
      objects: objects.slice(0, 20)
    };
  });
  console.log(JSON.stringify(res, null, 2));
  await browser.close();
}
main();
