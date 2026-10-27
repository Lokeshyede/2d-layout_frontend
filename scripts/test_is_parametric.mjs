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

  const diag = await page.evaluate(() => {
    const rack = window.__previewScene.children.find(c => c.userData?.type === 'rack_model');
    return rack.userData?.diagnostics;
  });
  console.log('isParametric:', diag?.isParametric, 'shelfCount:', diag?.shelfCount, 'bracketCount:', diag?.bracketCount);
  await browser.close();
}
main();
