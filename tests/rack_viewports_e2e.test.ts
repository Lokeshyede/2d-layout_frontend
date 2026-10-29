import { test, expect } from '@playwright/test';

interface ViewportConfig {
  name: string;
  width: number;
  height: number;
  category: 'mobile' | 'tablet' | 'desktop';
}

const VIEWPORTS: ViewportConfig[] = [
  { name: 'Small Phone (320x640)', width: 320, height: 640, category: 'mobile' },
  { name: 'Standard Mobile (360x800)', width: 360, height: 800, category: 'mobile' },
  { name: 'iPhone 13/14 (390x844)', width: 390, height: 844, category: 'mobile' },
  { name: 'iPhone Pro Max (430x932)', width: 430, height: 932, category: 'mobile' },
  { name: 'Foldable / Mini Tablet (600x960)', width: 600, height: 960, category: 'mobile' },
  { name: 'iPad Portrait (768x1024)', width: 768, height: 1024, category: 'tablet' },
  { name: 'iPad Air (820x1180)', width: 820, height: 1180, category: 'tablet' },
  { name: 'iPad Landscape (1024x768)', width: 1024, height: 768, category: 'tablet' },
  { name: 'Laptop Display (1280x720)', width: 1280, height: 720, category: 'desktop' },
  { name: 'Desktop Monitor (1440x900)', width: 1440, height: 900, category: 'desktop' },
];

test.describe('Cross-Device CAD Rack Add & Placement E2E Matrix', () => {

  for (const vp of VIEWPORTS) {
    test(`Viewport ${vp.name} [${vp.width}x${vp.height}]: Complete Rack Add & Placement Workflow`, async ({ browser }) => {
      const isTouch = vp.category === 'mobile' || vp.category === 'tablet';
      const isMobile = vp.category === 'mobile';
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        hasTouch: isTouch,
        isMobile: isMobile,
      });
      const page = await context.newPage();
      await page.route('**/api/products*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items: [
              {
                id: 1,
                productId: 'RF-PRD-0001',
                productName: 'Standard Wall Display Rack 7x3',
                productType: 'Wall Rack',
                sku: 'SKU-WR-73',
                category: 'Wall Display',
                width: 36,
                depth: 24,
                height: 84,
                shelfCount: 6,
                shelfThickness: 1.25,
                active: true,
              },
              {
                id: 2,
                productId: 'RF-PRD-0002',
                productName: 'Center Island Double-Sided Gondola 5x3',
                productType: 'Center Rack',
                sku: 'SKU-CG-53',
                category: 'Center Gondola',
                width: 36,
                depth: 36,
                height: 60,
                shelfCount: 5,
                shelfThickness: 1.25,
                active: true,
              },
              {
                id: 3,
                productId: 'RF-PRD-0003',
                productName: 'Gondola Endcap Rack 5x2',
                productType: 'Endcap',
                sku: 'SKU-EC-52',
                category: 'Endcaps',
                width: 24,
                depth: 18,
                height: 60,
                shelfCount: 5,
                shelfThickness: 1.25,
                active: true,
              },
            ],
            total: 3,
          }),
        });
      });

      const surveyId = `rf-e2e-${vp.width}x${vp.height}`;
      await page.route('**/api/projects/*', async (route) => {
        if (route.request().method() === 'GET') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              surveyId: surveyId,
              title: `Test Store ${surveyId}`,
              approxWidth: "50'-0\"",
              approxHeight: "30'-0\"",
              entities: [],
              versions: [],
              revision: 'REV 1',
            }),
          });
        } else {
          const postData = route.request().postDataJSON() || {};
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              surveyId: surveyId,
              title: `Test Store ${surveyId}`,
              ...postData,
              revision: 'REV 1',
            }),
          });
        }
      });

      // 2. Configure viewport emulation
      await page.goto(`/cad/${surveyId}`, { waitUntil: 'domcontentloaded' });

      // 3. Wait for canvas to mount
      const canvas = page.locator('#cad-canvas');
      await expect(canvas).toBeVisible({ timeout: 10000 });

      // 4. Open Rack Catalogue
      if (vp.width < 768) {
        // Mobile bottom dock
        const dockRacksBtn = page.locator('#btn-mobile-dock-racks');
        await expect(dockRacksBtn).toBeVisible({ timeout: 5000 });
        await dockRacksBtn.click();
      } else {
        // Tablet / Desktop toolbar
        const desktopAddBtn = page.locator('#btn-desktop-add-rack');
        await expect(desktopAddBtn).toBeVisible({ timeout: 5000 });
        await desktopAddBtn.click();
      }

      // 5. Verify Catalogue Modal is open, accessible, and fits within viewport
      const modal = page.locator('#rack-catalogue-modal');
      await expect(modal).toBeVisible({ timeout: 5000 });
      const modalBox = await modal.boundingBox();
      expect(modalBox).not.toBeNull();
      if (modalBox) {
        expect(modalBox.width).toBeLessThanOrEqual(vp.width);
      }

      // 6. Select a real rack item (first available rack: Standard Wall Display Rack 7x3)
      const selectBtn = page.locator('button:has-text("Select & Place on Canvas")').first();
      await expect(selectBtn).toBeVisible({ timeout: 5000 });
      await selectBtn.click();

      // 7. Verify modal closes and Floating Action Bar appears
      await expect(modal).not.toBeVisible({ timeout: 5000 });
      const actionBar = page.locator('#rack-placement-action-bar');
      await expect(actionBar).toBeVisible({ timeout: 5000 });

      // 8. Test rotation controls in placement mode
      const rotateBtn = page.locator('#btn-rack-placement-rotate');
      await expect(rotateBtn).toBeVisible();
      await rotateBtn.click();

      // 9. Place rack on CAD canvas
      const canvasBox = await canvas.boundingBox();
      expect(canvasBox).not.toBeNull();
      if (canvasBox) {
        const placeX = canvasBox.x + canvasBox.width * 0.45;
        const placeY = canvasBox.y + canvasBox.height * 0.45;

        if (isTouch) {
          await page.touchscreen.tap(placeX, placeY);
        } else {
          await page.mouse.click(placeX, placeY);
        }
      }

      // 10. Verify placement confirmed: action bar exits, rack is committed
      await expect(actionBar).not.toBeVisible({ timeout: 5000 });

      // 11. Place a second rack to verify subsequent placement and connection
      if (vp.width < 768) {
        await page.locator('#btn-mobile-dock-racks').click();
      } else {
        await page.locator('#btn-desktop-add-rack').click();
      }
      await expect(modal).toBeVisible();
      await page.locator('button:has-text("Select & Place on Canvas")').first().click();
      await expect(actionBar).toBeVisible();

      // Place 2nd rack
      if (canvasBox) {
        const placeX2 = canvasBox.x + canvasBox.width * 0.55;
        const placeY2 = canvasBox.y + canvasBox.height * 0.45;
        if (isTouch) {
          await page.touchscreen.tap(placeX2, placeY2);
        } else {
          await page.mouse.click(placeX2, placeY2);
        }
      }
      await expect(actionBar).not.toBeVisible({ timeout: 5000 });

      // 12. Save Layout
      if (vp.width < 768) {
        const saveBtn = page.locator('#btn-mobile-save');
        await expect(saveBtn).toBeVisible();
        await saveBtn.click();
      } else {
        const saveBtn = page.locator('#btn-desktop-save');
        await expect(saveBtn).toBeVisible();
        await saveBtn.click();
      }

      // 13. Switch to 3D View and back to 2D
      const view3dBtn = vp.width < 768 ? page.locator('#btn-mobile-view-3d') : page.locator('#btn-desktop-view-3d');
      await expect(view3dBtn).toBeVisible();
      await view3dBtn.click();

      const viewer3d = page.locator('#store-3d-viewer-container');
      await expect(viewer3d).toBeVisible({ timeout: 5000 });

      const view2dBtn = vp.width < 768 ? page.locator('#btn-mobile-view-2d') : page.locator('#btn-desktop-view-2d');
      await expect(view2dBtn).toBeVisible();
      await view2dBtn.click();
      await expect(canvas).toBeVisible();

      // 14. Reload and confirm persistence
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(canvas).toBeVisible({ timeout: 10000 });
      
      // Confirm stored entities survive reload from local cache
      const storedData = await page.evaluate((id) => localStorage.getItem(`retailfix_cad_${id}`), surveyId);
      expect(storedData).not.toBeNull();
      if (storedData) {
        const parsed = JSON.parse(storedData);
        expect(parsed.entities.length).toBeGreaterThanOrEqual(2);
        const placedRacks = parsed.entities.filter((e: any) => e.type === 'rack');
        expect(placedRacks.length).toBeGreaterThanOrEqual(2);
      }

      await context.close();
    });
  }
});
