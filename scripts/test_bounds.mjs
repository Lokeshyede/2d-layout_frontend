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
  
  // Wait for the table to load
  await page.waitForTimeout(2000);
  
  const res = await page.evaluate(async () => {
    // Find the row for Endcap ID 11
    const rows = Array.from(document.querySelectorAll('tr'));
    const endcapRow = rows.find(r => r.textContent.includes('RF-PRD-0009') || r.textContent.includes('end cap'));
    if (!endcapRow) return { error: 'Row not found' };
    
    const btns = Array.from(endcapRow.querySelectorAll('button'));
    const btn = btns.find(b => b.textContent.includes('GLB 3D') || b.title === 'Preview 3D');
    if (!btn) return { error: 'Button not found' };
    
    btn.click();
    await new Promise(r => setTimeout(r, 4000)); // wait for 3D render
    
    const scene = window.__previewScene;
    if (!scene) return { error: 'No preview scene' };
    
    const rack = scene.children.find(c => c.userData?.type === 'rack_model');
    if (!rack) return { error: 'No rack found in scene' };
    
    let modelRoot = null;
    rack.traverse(c => {
       if (c.name === 'ModelRoot') modelRoot = c;
    });
    
    const diag = rack.userData?.diagnostics;
    
    return {
      rackScale: rack.scale,
      modelRootScale: modelRoot ? modelRoot.scale : null,
      diagnostics: diag,
    };
  });
  console.log(JSON.stringify(res, null, 2));
  await browser.close();
}
main();
