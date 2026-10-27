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
    let candidate = null;
    uploadedGLB.traverse(obj => {
      if (candidate) return;
      if (obj.name === 'Assembly-41' && obj.children[2]?.children?.[0]) {
        candidate = obj.children[2].children[0];
      }
    });
    return {
      hasCandidate: Boolean(candidate),
      candidateChildCount: candidate ? candidate.children.length : 0,
      indicesExist: candidate ? [0, 12, 3, 9, 10, 11].map(i => Boolean(candidate.children[i])) : [],
      upright2Children: candidate?.children[2] ? candidate.children[2].children.length : 0,
      upright4Children: candidate?.children[4] ? candidate.children[4].children.length : 0,
    };
  });
  console.log('Result:', JSON.stringify(res, null, 2));
  await browser.close();
}
main();
