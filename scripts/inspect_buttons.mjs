import { chromium } from '@playwright/test';

async function test() {
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

  const modal = page.locator('.fixed.inset-0').first();
  const buttons = await modal.locator('button').all();
  for (let i = 0; i < buttons.length; i++) {
    const text = await buttons[i].innerText();
    const title = await buttons[i].getAttribute('title');
    console.log(i, 'text:', JSON.stringify(text), 'title:', JSON.stringify(title));
  }
  await browser.close();
}
test();
