import { test, expect } from '@playwright/test';

test.describe('Contextual Back Navigation & Mobile Placement UX E2E Tests', () => {

  const setupMockApi = async (page: any, surveyId: string) => {
    page.on('dialog', (dialog: any) => dialog.accept().catch(() => {}));

    await page.route('**/api/products*', async (route: any) => {
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
          ],
          total: 1,
        }),
      });
    });

    await page.route('**/api/projects/*', async (route: any) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            surveyId: surveyId,
            title: `Store ${surveyId}`,
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
            title: `Store ${surveyId}`,
            ...postData,
            revision: 'REV 1',
          }),
        });
      }
    });
  };

  test('Rack Catalogue modal can be closed via Escape key or Close button without exiting CAD editor', async ({ browser }) => {
    const context = await browser.newContext({
      baseURL: 'http://127.0.0.1:4173',
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    });
    const page = await context.newPage();
    const surveyId = 'rf-back-modal-test';
    await setupMockApi(page, surveyId);

    await page.goto(`/cad/${surveyId}`, { waitUntil: 'domcontentloaded' });
    const canvas = page.locator('#cad-canvas');
    await expect(canvas).toBeVisible({ timeout: 10000 });

    // Open Rack Catalogue from mobile dock
    const dockRacksBtn = page.locator('#btn-mobile-dock-racks');
    await expect(dockRacksBtn).toBeVisible({ timeout: 5000 });
    await dockRacksBtn.click();

    // Verify modal is visible
    const modal = page.locator('#rack-catalogue-modal');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Press Escape key (which invokes contextual Back tier 2)
    await page.keyboard.press('Escape');

    // Verify modal is closed, and user remains in CAD editor
    await expect(modal).not.toBeVisible({ timeout: 5000 });
    await expect(canvas).toBeVisible();
    expect(page.url()).toContain(`/cad/${surveyId}`);

    // Re-open modal and close via Close button
    await dockRacksBtn.click();
    await expect(modal).toBeVisible();
    const closeBtn = page.locator('#btn-close-rack-catalogue');
    await expect(closeBtn).toBeVisible({ timeout: 5000 });
    await closeBtn.click();
    await expect(modal).not.toBeVisible({ timeout: 5000 });

    await context.close();
  });

  test('Placement mode can be cancelled via top-left Back button or action bar Cancel', async ({ browser }) => {
    const context = await browser.newContext({
      baseURL: 'http://127.0.0.1:4173',
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    });
    const page = await context.newPage();
    const surveyId = 'rf-back-placement-test';
    await setupMockApi(page, surveyId);

    await page.goto(`/cad/${surveyId}`, { waitUntil: 'domcontentloaded' });
    const canvas = page.locator('#cad-canvas');
    await expect(canvas).toBeVisible({ timeout: 10000 });

    // Open catalogue and select rack
    await page.locator('#btn-mobile-dock-racks').click();
    const selectBtn = page.locator('button:has-text("Select & Place on Canvas")').first();
    await expect(selectBtn).toBeVisible({ timeout: 5000 });
    await selectBtn.click();

    // Placement action bar is visible
    const actionBar = page.locator('#rack-placement-action-bar');
    await expect(actionBar).toBeVisible({ timeout: 5000 });

    // Press mobile Back button
    const backBtn = page.locator('#btn-mobile-back');
    await backBtn.click();

    // Placement mode is canceled, action bar removed, user remains in CAD editor
    await expect(actionBar).not.toBeVisible({ timeout: 5000 });
    await expect(canvas).toBeVisible();
    expect(page.url()).toContain(`/cad/${surveyId}`);

    await context.close();
  });

  test('Action Bar Confirm "Place Rack" button places rack cleanly without micro-tap dependency', async ({ browser }) => {
    const context = await browser.newContext({
      baseURL: 'http://127.0.0.1:4173',
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    });
    const page = await context.newPage();
    page.on('dialog', (dialog: any) => dialog.accept().catch(() => {}));
    const surveyId = 'rf-confirm-btn-test';

    let lastSavedEntities: any[] = [];
    await page.route('**/api/products*', async (route: any) => {
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
          ],
          total: 1,
        }),
      });
    });

    await page.route('**/api/projects/*', async (route: any) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            surveyId: surveyId,
            title: `Store ${surveyId}`,
            approxWidth: "50'-0\"",
            approxHeight: "30'-0\"",
            entities: [],
            versions: [],
            revision: 'REV 1',
          }),
        });
      } else {
        const postData = route.request().postDataJSON() || {};
        if (postData.entities) {
          lastSavedEntities = postData.entities;
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            surveyId: surveyId,
            title: `Store ${surveyId}`,
            ...postData,
            revision: 'REV 1',
          }),
        });
      }
    });

    await page.goto(`/cad/${surveyId}`, { waitUntil: 'domcontentloaded' });
    const canvas = page.locator('#cad-canvas');
    await expect(canvas).toBeVisible({ timeout: 10000 });

    // Open catalogue and select rack
    await page.locator('#btn-mobile-dock-racks').click();
    await page.locator('button:has-text("Select & Place on Canvas")').first().click();

    // Placement action bar visible
    const actionBar = page.locator('#rack-placement-action-bar');
    await expect(actionBar).toBeVisible({ timeout: 5000 });

    // Click explicit "Place Rack" confirmation button
    const confirmBtn = page.locator('#btn-rack-placement-confirm');
    await expect(confirmBtn).toBeVisible();
    await confirmBtn.click();

    // Action bar closes, rack is placed
    await expect(actionBar).not.toBeVisible({ timeout: 5000 });

    // Save project explicitly to ensure persistence
    const saveBtn = page.locator('#btn-mobile-save');
    await expect(saveBtn).toBeVisible();
    await saveBtn.click();

    // Verify saved payload has the placed rack
    await expect.poll(() => lastSavedEntities.length).toBeGreaterThanOrEqual(1);

    const placedRack = lastSavedEntities.find((e: any) => e.type === 'rack');
    expect(placedRack).toBeDefined();
    expect(placedRack.properties.productModelId).toBe('RF-PRD-0001');
    expect(placedRack.properties.sku).toBe('SKU-WR-73');
    expect(placedRack.geometry.width).toBe(36);
    expect(placedRack.geometry.height).toBe(84);
    expect(placedRack.geometry.depth).toBe(24);

    await context.close();
  });

  test('Unsaved changes trigger exit confirmation dialog before allowing navigation', async ({ browser }) => {
    const context = await browser.newContext({
      baseURL: 'http://127.0.0.1:4173',
      viewport: { width: 1024, height: 768 },
      hasTouch: false,
      isMobile: false,
    });
    const page = await context.newPage();
    const surveyId = 'rf-unsaved-dialog-test';
    await setupMockApi(page, surveyId);

    await page.goto(`/cad/${surveyId}`, { waitUntil: 'domcontentloaded' });
    const canvas = page.locator('#cad-canvas');
    await expect(canvas).toBeVisible({ timeout: 10000 });

    // Add a rack so layout is marked unsaved
    const addRackBtn = page.locator('#btn-desktop-add-rack');
    await expect(addRackBtn).toBeVisible({ timeout: 5000 });
    await addRackBtn.click();

    await page.locator('button:has-text("Select & Place on Canvas")').first().click();
    await page.locator('#btn-rack-placement-confirm').click();

    // Trigger exit via logo / back:
    // First back click deselects the newly placed entity (tier 5)
    const logoExit = page.locator('div[title="RetailFix CAD (Exit/Back)"]');
    await logoExit.click();

    // Second back click triggers unsaved changes confirmation dialog (tier 7)
    await logoExit.click();

    // Unsaved changes confirmation dialog appears
    const exitDialog = page.locator('#exit-confirm-dialog');
    await expect(exitDialog).toBeVisible({ timeout: 5000 });

    // Click "Keep Editing"
    const cancelBtn = page.locator('#btn-exit-cancel');
    await expect(cancelBtn).toBeVisible();
    await cancelBtn.click();

    // Dialog closes, canvas remains active
    await expect(exitDialog).not.toBeVisible({ timeout: 5000 });
    await expect(canvas).toBeVisible();

    await context.close();
  });

  test('3D Viewer Back returns user to 2D CAD Editor', async ({ browser }) => {
    const context = await browser.newContext({
      baseURL: 'http://127.0.0.1:4173',
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    });
    const page = await context.newPage();
    const surveyId = 'rf-3d-back-test';
    await setupMockApi(page, surveyId);

    await page.goto(`/cad/${surveyId}`, { waitUntil: 'domcontentloaded' });
    const canvas = page.locator('#cad-canvas');
    await expect(canvas).toBeVisible({ timeout: 10000 });

    // Switch to 3D View
    const view3dBtn = page.locator('#btn-mobile-view-3d');
    await expect(view3dBtn).toBeVisible();
    await view3dBtn.click();

    // 3D viewer container is visible
    const viewer3d = page.locator('#store-3d-viewer-container');
    await expect(viewer3d).toBeVisible({ timeout: 5000 });

    // Press mobile Back button (contextual Back tier 3)
    const backBtn = page.locator('#btn-mobile-back');
    await backBtn.click();

    // User is returned to 2D canvas
    await expect(canvas).toBeVisible({ timeout: 5000 });
    await expect(viewer3d).not.toBeVisible();

    await context.close();
  });

});
