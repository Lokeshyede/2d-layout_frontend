import { chromium } from '@playwright/test';

async function auditCurrentState() {
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
  await page.waitForTimeout(3000);

  const modal = page.locator('.fixed.inset-0').first();
  const testCounts = [3, 5, 6, 8, 10];
  const auditResults = {};

  for (const count of testCounts) {
    const btn = modal.getByRole('button', { name: `${count}`, exact: true });
    await btn.click();
    await page.waitForTimeout(2000);

    const stats = await page.evaluate((cnt) => {
      const scene = window.__previewScene;
      if (!scene) return { error: 'No scene' };

      let visibleShelfMeshes = 0;
      let visibleBracketMeshes = 0;
      let frameMeshes = 0;
      let hiddenShelfNodes = 0;
      let hiddenBracketNodes = 0;
      let generatedShelves = 0;
      let generatedBrackets = 0;

      scene.traverse((o) => {
        const name = o.name || '';
        const isParametricShelf = name.startsWith('ParametricShelf_') || name === 'ParametricDeck';
        const isParametricBracket = name.startsWith('ParametricBracket_');
        const isNativeShelf = name.includes('Shelf') && !isParametricShelf;
        const isNativeBracket = name.includes('Bracket') && !isParametricBracket;

        if (isParametricShelf && o.type === 'Object3D') {
          generatedShelves++;
        }
        if (isParametricBracket && o.type === 'Object3D') {
          generatedBrackets++;
        }

        if (o.isMesh) {
          if (o.visible) {
            // Find what kind of object it belongs to
            let p = o.parent;
            let meshType = 'frame';
            while (p) {
              if (p.name && (p.name.startsWith('ParametricShelf_') || p.name === 'ParametricDeck')) {
                meshType = 'shelf';
                break;
              }
              if (p.name && p.name.startsWith('ParametricBracket_')) {
                meshType = 'bracket';
                break;
              }
              p = p.parent;
            }
            if (meshType === 'shelf') visibleShelfMeshes++;
            else if (meshType === 'bracket') visibleBracketMeshes++;
            else frameMeshes++;
          } else {
            if (name.includes('Shelf') || o.parent?.name?.includes('Shelf')) hiddenShelfNodes++;
            if (name.includes('Bracket') || o.parent?.name?.includes('Bracket')) hiddenBracketNodes++;
          }
        }
      });

      return {
        shelfCountConfig: cnt,
        visibleShelfMeshes,
        visibleBracketMeshes,
        frameMeshes,
        hiddenShelfNodes,
        hiddenBracketNodes,
        generatedShelves,
        generatedBrackets,
      };
    }, count);

    auditResults[count] = stats;
  }

  console.log('AUDIT RECORD (BEFORE FIX):');
  console.log(JSON.stringify(auditResults, null, 2));

  await browser.close();
}

auditCurrentState().catch(console.error);
