import { chromium } from '@playwright/test';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => {
    localStorage.setItem('retailfix_admin_token', 'retailfix_admin_dev_token');
    localStorage.setItem('retailfix_admin_user', JSON.stringify({ username: 'admin', role: 'admin' }));
  });
  const page = await context.newPage();

  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));

  await page.goto('http://localhost:5173/admin/models', { waitUntil: 'networkidle' });
  const previewBtn = page.locator('button:has-text("GLB 3D")').first();
  await previewBtn.waitFor({ state: 'visible' });
  await previewBtn.click();
  await page.waitForTimeout(3000);

  const modal = page.locator('.fixed.inset-0').first();

  console.log('--- INITIAL (6 SHELVES) ---');
  let info = await page.evaluate(() => {
    const scene = window.__previewScene;
    if (!scene) return 'No scene';
    const rack = scene.children.find(c => c.userData?.type === 'rack_model');
    if (!rack) return 'No rack';
    const shelves = [];
    rack.traverse(o => {
      if (o.name && (o.name.includes('Shelf') || o.name.includes('shelf'))) {
        shelves.push({ name: o.name, visible: o.visible, z: o.position.z, y: o.position.y });
      }
    });
    return {
      diagnostics: rack.userData?.diagnostics,
      shelves,
      childrenCount: rack.children.length
    };
  });
  console.log('Initial diagnostics shelfCount:', info.diagnostics?.shelfCount);
  console.log('Initial shelves in traverse:', info.shelves);

  console.log('\n--- CLICKING 8 SHELVES ---');
  const btn8 = modal.getByRole('button', { name: '8', exact: true });
  await btn8.click();
  await page.waitForTimeout(3500);

  info = await page.evaluate(() => {
    const scene = window.__previewScene;
    if (!scene) return 'No scene';
    const rack = scene.children.find(c => c.userData?.type === 'rack_model');
    if (!rack) return 'No rack';
    const shelves = [];
    const visibleMeshes = [];
    rack.traverse(o => {
      if (o.isMesh && o.visible) {
        visibleMeshes.push({ name: o.name, parentName: o.parent?.name, pos: o.position });
      }
      if (o.name && (o.name.includes('Shelf') || o.name.includes('shelf') || o.name.includes('Assembly'))) {
        shelves.push({ name: o.name, visible: o.visible, z: o.position.z, y: o.position.y, childCount: o.children.length });
      }
    });
    return {
      diagnostics: rack.userData?.diagnostics,
      shelves,
      visibleMeshCount: visibleMeshes.length,
      sceneChildren: scene.children.map(c => ({ name: c.name, type: c.userData?.type }))
    };
  });
  console.log('Updated diagnostics shelfCount:', info.diagnostics?.shelfCount);
  console.log('Updated visibleMeshCount:', info.visibleMeshCount);
  console.log('Updated sceneChildren:', info.sceneChildren);
  console.log('Updated shelves:', info.shelves);

  await browser.close();
}

main();
