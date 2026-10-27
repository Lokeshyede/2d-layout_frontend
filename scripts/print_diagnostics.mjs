import { chromium } from '@playwright/test';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addInitScript(() => {
    localStorage.setItem('retailfix_admin_token', 'retailfix_admin_dev_token');
    localStorage.setItem('retailfix_admin_user', JSON.stringify({ username: 'admin', role: 'admin' }));
  });
  const page = await context.newPage();
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  
  const res = await page.evaluate(async () => {
    const btns = Array.from(document.querySelectorAll('button'));
    const btn3d = btns.find(b => b.textContent.includes('3D Preview') || b.textContent.includes('Preview 3D'));
    if (btn3d) btn3d.click();
    
    await new Promise(r => setTimeout(r, 6000));
    
    // In Store3DViewer, the converted scene is added to window.__storeScene? No, I'll search document.
    // Actually, I can just read the CAD entities from window.cadEntities if exposed, or fallback to math.
    return { error: 'Math verification available' };
  });
  console.log(JSON.stringify(res, null, 2));
  await browser.close();
}
main();
