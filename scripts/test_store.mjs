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
    // Click 3D Preview button
    const btns = Array.from(document.querySelectorAll('button'));
    const btn3d = btns.find(b => b.textContent.includes('3D Preview') || b.textContent.includes('Preview 3D'));
    if (btn3d) btn3d.click();
    
    await new Promise(r => setTimeout(r, 6000)); // wait for 3D load
    
    const scene = window.__storeScene || window.__previewScene;
    if (!scene) return { error: 'No store scene' };
    
    const endcaps = [];
    scene.traverse(c => {
       if (c.userData && c.userData.rackType && c.userData.rackType.toLowerCase().includes('end')) {
           endcaps.push(c);
       } else if (c.userData && c.userData.productName && c.userData.productName.toLowerCase().includes('end')) {
           endcaps.push(c);
       }
    });
    
    if (endcaps.length === 0) return { error: 'No endcap found in scene' };
    
    const ec = endcaps[0];
    const box = new window.THREE.Box3().setFromObject(ec);
    const size = new window.THREE.Vector3();
    box.getSize(size);
    
    return {
      name: ec.name,
      userData: ec.userData,
      position: ec.position,
      rotation: { x: ec.rotation.x, y: ec.rotation.y, z: ec.rotation.z },
      worldSize: size,
      worldBox: box,
      diagnostics: ec.userData?.diagnostics
    };
  });
  console.log(JSON.stringify(res, null, 2));
  
  await page.screenshot({ path: 'endcap_scene.png' });
  await browser.close();

}
main();
