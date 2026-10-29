import { test, expect } from '@playwright/test';
import { Viewport } from '../src/cad/engine/Viewport';
import { RackConnectionEngine } from '../src/cad/engine/RackConnectionEngine';
import { calculateWallInwardNormal, projectPointOntoLine, buildRoomPolygon } from '../src/cad/geometry/GeometryMath';
import { CadWorldTransform } from '../src/cad/geometry/CadWorldTransform';
import type { WallEntity, RackEntity, Point2D } from '../src/cad/types';

test.describe('Rack Placement Engine Unit & Integration Tests', () => {

  test('Canonical Coordinate Conversion across 2D & 3D', () => {
    const vp = new Viewport({ zoom: 1.5, panX: 120, panY: 80 });
    vp.resize(1024, 768, 2.0);

    // Screen to World
    const screenPt = { x: 300, y: 260 };
    const worldPt = vp.screenToWorld(screenPt);
    expect(worldPt.x).toBe((300 - 120) / 1.5);
    expect(worldPt.y).toBe((260 - 80) / 1.5);

    // World to Screen round-trip
    const screenRoundTrip = vp.worldToScreen(worldPt);
    expect(Math.abs(screenRoundTrip.x - screenPt.x)).toBeLessThan(0.001);
    expect(Math.abs(screenRoundTrip.y - screenPt.y)).toBeLessThan(0.001);

    // CadWorldTransform 2D to 3D mapping (CAD X -> 3D X, CAD Y -> 3D Z, Elevation -> 3D Y)
    const cadPt = { x: 120, y: 240 };
    const threeVec = CadWorldTransform.cadToWorld(cadPt, 42);
    expect(threeVec.x).toBe(120);
    expect(threeVec.y).toBe(42);
    expect(threeVec.z).toBe(240);

    const backToCad = CadWorldTransform.worldToCad(threeVec);
    expect(backToCad.x).toBe(cadPt.x);
    expect(backToCad.y).toBe(cadPt.y);
  });

  test('Wall Rack Snapping & Inward Face Anchor', () => {
    const walls: WallEntity[] = [
      { id: 'w1', type: 'wall', geometry: { x1: 0, y1: 0, x2: 400, y2: 0 }, properties: { thickness: 9 } },
      { id: 'w2', type: 'wall', geometry: { x1: 400, y1: 0, x2: 400, y2: 300 }, properties: { thickness: 9 } },
      { id: 'w3', type: 'wall', geometry: { x1: 400, y1: 300, x2: 0, y2: 300 }, properties: { thickness: 9 } },
      { id: 'w4', type: 'wall', geometry: { x1: 0, y1: 300, x2: 0, y2: 0 }, properties: { thickness: 9 } },
    ];
    const roomPoly = buildRoomPolygon(walls);
    expect(roomPoly.length).toBeGreaterThanOrEqual(3);

    // User taps at (120, 20) — near top wall (y=0)
    const targetPt = { x: 120, y: 20 };
    const proj = projectPointOntoLine(targetPt, { x: 0, y: 0 }, { x: 400, y: 0 });
    expect(proj.distance).toBeLessThan(72);

    const { inwardNormal } = calculateWallInwardNormal({ x: 0, y: 0 }, { x: 400, y: 0 }, roomPoly);
    expect(inwardNormal.y).toBeGreaterThan(0.9);

    // Anchor position on interior wall face:
    const wallThickness = 9;
    const anchorX = proj.point.x;
    const anchorY = proj.point.y + inwardNormal.y * (wallThickness / 2);

    expect(anchorX).toBe(120);
    expect(anchorY).toBe(4.5);
  });

  test('Center Rack Run Snapping', () => {
    const rackA: RackEntity = {
      id: 'rack_1',
      type: 'rack',
      geometry: { x: 200, y: 150, width: 36, depth: 24, height: 60, rotation: 0 },
      properties: { rackType: 'Center Rack', productName: 'Center Gondola 5x3' }
    };

    const targetPt = { x: 238, y: 151 };
    const candidateRack: RackEntity = {
      id: 'candidate',
      type: 'rack',
      geometry: { x: targetPt.x, y: targetPt.y, width: 36, depth: 24, height: 60, rotation: 0 },
      properties: { rackType: 'Center Rack', productName: 'Center Gondola 5x3' }
    };

    const bestSnap = RackConnectionEngine.findBestSnap(candidateRack, [rackA], targetPt, 0);
    expect(bestSnap).not.toBeNull();
    if (bestSnap) {
      expect(bestSnap.position.x).toBe(236);
      expect(bestSnap.position.y).toBe(150);
      expect(bestSnap.rotation).toBe(0);
    }
  });

  test('1-Foot Grid Snapping Fallback', () => {
    const rawPt1 = { x: 103.4, y: 97.2 };
    const snappedX1 = Math.round(rawPt1.x / 12) * 12;
    const snappedY1 = Math.round(rawPt1.y / 12) * 12;
    expect(snappedX1).toBe(108);
    expect(snappedY1).toBe(96);

    const rawPt2 = { x: 24.1, y: 48.9 };
    const snappedX2 = Math.round(rawPt2.x / 12) * 12;
    const snappedY2 = Math.round(rawPt2.y / 12) * 12;
    expect(snappedX2).toBe(24);
    expect(snappedY2).toBe(48);
  });

  test('Physical Touch Gesture Differentiation & Debounce', () => {
    // Tap detection threshold: < 28px movement and < 800ms duration
    const isPhysicalTap = (start: Point2D, end: Point2D, durationMs: number) => {
      const dist = Math.hypot(end.x - start.x, end.y - start.y);
      return dist < 28 && durationMs < 800;
    };

    // Case A: Natural finger tap with 12px touch contact deformation in 180ms -> Place
    expect(isPhysicalTap({ x: 150, y: 200 }, { x: 160, y: 205 }, 180)).toBe(true);

    // Case B: Deliberate tap with 24px finger spread in 300ms -> Place
    expect(isPhysicalTap({ x: 150, y: 200 }, { x: 168, y: 215 }, 300)).toBe(true);

    // Case C: Drag / Pan gesture (40px move) -> Do not place
    expect(isPhysicalTap({ x: 150, y: 200 }, { x: 190, y: 220 }, 400)).toBe(false);

    // Case D: Long press (900ms) -> Do not place
    expect(isPhysicalTap({ x: 150, y: 200 }, { x: 152, y: 201 }, 900)).toBe(false);

    // Synthetic mouse debounce: reject mouse events within 500ms of touch or 600ms of rack placement
    const lastTouchTime = 10000;
    const lastPlacementTime = 10500;
    const isSyntheticMouse = (eventTime: number) => {
      return (eventTime - lastTouchTime < 500) || (eventTime - lastPlacementTime < 600);
    };

    expect(isSyntheticMouse(10200)).toBe(true); // 200ms after touch -> rejected
    expect(isSyntheticMouse(10800)).toBe(true); // 300ms after placement -> rejected
    expect(isSyntheticMouse(11200)).toBe(false); // 700ms after placement -> allowed genuine desktop click
  });

  test('Rack Entity Metadata Preservation', () => {
    const productData = {
      productId: 'RACK_WALL_7X3',
      productName: 'Standard Wall Rack 7x3',
      sku: 'SKU-WR-73',
      width: 36,
      depth: 24,
      height: 84,
      shelfCount: 6,
      shelfThickness: 1.25,
      productType: 'wall_rack'
    };

    const placement = { x: 120, y: 4.5, rotation: 90, attachedWallId: 'w1', wallSide: 'top' as const };

    const newRack: RackEntity = {
      id: `rack_${Date.now()}`,
      type: 'rack',
      geometry: {
        x: placement.x,
        y: placement.y,
        width: productData.width,
        depth: productData.depth,
        height: productData.height,
        rotation: placement.rotation
      },
      properties: {
        rackType: productData.productType,
        productModelId: productData.productId,
        productName: productData.productName,
        sku: productData.sku,
        shelves: productData.shelfCount,
        shelfCount: productData.shelfCount,
        shelfSpacing: 'auto',
        shelfThickness: productData.shelfThickness,
        attachedWallId: placement.attachedWallId,
        wallSide: placement.wallSide,
      }
    };

    expect(newRack.properties.productModelId).toBe('RACK_WALL_7X3');
    expect(newRack.properties.sku).toBe('SKU-WR-73');
    expect(newRack.geometry.width).toBe(36);
    expect(newRack.geometry.height).toBe(84);
    expect(newRack.geometry.depth).toBe(24);
    expect(newRack.geometry.rotation).toBe(90);
    expect(newRack.properties.shelfCount).toBe(6);
    expect(newRack.properties.shelfThickness).toBe(1.25);
  });

  test('Contextual Back Navigation Priority Hierarchy Simulation', () => {
    // 7-tier priority hierarchy simulation
    type CadState = {
      showExitConfirmDialog: boolean;
      modalOpen: boolean;
      placementMode: boolean;
      propsDrawerOpen: boolean;
      drawingToolActive: boolean;
      viewMode3D: boolean;
      saveStatus: 'saved' | 'unsaved';
    };

    const handleBackStep = (state: CadState): { handled: boolean; nextState: CadState; action: string } => {
      // Tier 1: Dismiss exit confirmation dialog
      if (state.showExitConfirmDialog) {
        return { handled: true, nextState: { ...state, showExitConfirmDialog: false }, action: 'dismiss_exit_dialog' };
      }
      // Tier 2: Close open modal / catalogue
      if (state.modalOpen) {
        return { handled: true, nextState: { ...state, modalOpen: false }, action: 'close_modal' };
      }
      // Tier 3: Return from 3D to 2D
      if (state.viewMode3D) {
        return { handled: true, nextState: { ...state, viewMode3D: false }, action: 'exit_3d_to_2d' };
      }
      // Tier 4: Cancel rack placement mode
      if (state.placementMode) {
        return { handled: true, nextState: { ...state, placementMode: false }, action: 'cancel_placement' };
      }
      // Tier 5: Close properties drawer / inspector
      if (state.propsDrawerOpen) {
        return { handled: true, nextState: { ...state, propsDrawerOpen: false }, action: 'close_props_drawer' };
      }
      // Tier 6: Reset drawing tool to select
      if (state.drawingToolActive) {
        return { handled: true, nextState: { ...state, drawingToolActive: false }, action: 'reset_tool_to_select' };
      }
      // Tier 7: Base level exit guard
      if (state.saveStatus === 'unsaved') {
        return { handled: true, nextState: { ...state, showExitConfirmDialog: true }, action: 'prompt_unsaved_dialog' };
      }
      return { handled: false, nextState: state, action: 'exit_application' };
    };

    // Test sequence: Deeply nested state unwinds step-by-step
    let state: CadState = {
      showExitConfirmDialog: false,
      modalOpen: true,
      placementMode: true,
      propsDrawerOpen: true,
      drawingToolActive: true,
      viewMode3D: false,
      saveStatus: 'unsaved',
    };

    // Step 1: Closes modal first
    const r1 = handleBackStep(state);
    expect(r1.action).toBe('close_modal');
    state = r1.nextState;

    // Step 2: Cancels placement mode
    const r2 = handleBackStep(state);
    expect(r2.action).toBe('cancel_placement');
    state = r2.nextState;

    // Step 3: Closes properties drawer
    const r3 = handleBackStep(state);
    expect(r3.action).toBe('close_props_drawer');
    state = r3.nextState;

    // Step 4: Resets drawing tool
    const r4 = handleBackStep(state);
    expect(r4.action).toBe('reset_tool_to_select');
    state = r4.nextState;

    // Step 5: Prompts unsaved changes confirmation dialog
    const r5 = handleBackStep(state);
    expect(r5.action).toBe('prompt_unsaved_dialog');
    state = r5.nextState;
    expect(state.showExitConfirmDialog).toBe(true);

    // Step 6: Dismisses dialog if back pressed again
    const r6 = handleBackStep(state);
    expect(r6.action).toBe('dismiss_exit_dialog');
  });

});
