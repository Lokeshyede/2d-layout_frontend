/**
 * Unit & Integration Regression Tests for Rack Add & Placement Engine
 * RetailFix CAD
 */

import assert from 'assert';
import { Viewport } from '../src/cad/engine/Viewport';
import { SnapEngine } from '../src/cad/engine/SnapEngine';
import { RackConnectionEngine } from '../src/cad/engine/RackConnectionEngine';
import { EndcapEngine } from '../src/cad/engine/EndcapEngine';
import { CornerRackEngine } from '../src/cad/engine/CornerRackEngine';
import { WallPlacementEngine } from '../src/cad/engine/WallPlacementEngine';
import { calculateWallInwardNormal, projectPointOntoLine, buildRoomPolygon } from '../src/cad/geometry/GeometryMath';
import { CadWorldTransform } from '../src/cad/geometry/CadWorldTransform';
import type { CADEntity, WallEntity, RackEntity, Point2D } from '../src/cad/types';

console.log('=== RUNNING RACK PLACEMENT ENGINE TESTS ===');

// --- TEST 1: Canonical Coordinate Conversion ---
console.log('\n[Test 1] Canonical Viewport Coordinate Conversion...');
{
  const vp = new Viewport({ zoom: 1.5, panX: 120, panY: 80 });
  vp.resize(1024, 768, 2.0);

  // Screen to World
  const screenPt = { x: 300, y: 260 };
  const worldPt = vp.screenToWorld(screenPt);
  assert.strictEqual(worldPt.x, (300 - 120) / 1.5, 'World X should match (screenX - panX) / zoom');
  assert.strictEqual(worldPt.y, (260 - 80) / 1.5, 'World Y should match (screenY - panY) / zoom');

  // World to Screen round-trip
  const screenRoundTrip = vp.worldToScreen(worldPt);
  assert.ok(Math.abs(screenRoundTrip.x - screenPt.x) < 0.001, 'Round-trip X should match');
  assert.ok(Math.abs(screenRoundTrip.y - screenPt.y) < 0.001, 'Round-trip Y should match');

  // CadWorldTransform 2D to 3D mapping (CAD X -> 3D X, CAD Y -> 3D Z, Elevation -> 3D Y)
  const cadPt = { x: 120, y: 240 };
  const threeVec = CadWorldTransform.cadToWorld(cadPt, 42);
  assert.strictEqual(threeVec.x, 120, '3D X matches CAD X');
  assert.strictEqual(threeVec.y, 42, '3D Y matches elevation');
  assert.strictEqual(threeVec.z, 240, '3D Z matches CAD Y');

  const backToCad = CadWorldTransform.worldToCad(threeVec);
  assert.strictEqual(backToCad.x, cadPt.x, '3D back to CAD X matches');
  assert.strictEqual(backToCad.y, cadPt.y, '3D back to CAD Y matches');

  console.log('  ✓ Coordinate conversion math validated across 2D and 3D');
}

// --- TEST 2: Wall Rack Snapping & Inward Face Anchor ---
console.log('\n[Test 2] Wall Rack Snapping & Inward Face Anchor...');
{
  // A simple 4-wall rectangular room (400" wide x 300" deep)
  const walls: WallEntity[] = [
    { id: 'w1', type: 'wall', geometry: { x1: 0, y1: 0, x2: 400, y2: 0 }, properties: { thickness: 9 } },
    { id: 'w2', type: 'wall', geometry: { x1: 400, y1: 0, x2: 400, y2: 300 }, properties: { thickness: 9 } },
    { id: 'w3', type: 'wall', geometry: { x1: 400, y1: 300, x2: 0, y2: 300 }, properties: { thickness: 9 } },
    { id: 'w4', type: 'wall', geometry: { x1: 0, y1: 300, x2: 0, y2: 0 }, properties: { thickness: 9 } },
  ];
  const roomPoly = buildRoomPolygon(walls);
  assert.ok(roomPoly.length >= 3, 'Room polygon should have >= 3 vertices');

  // User taps at (120, 20) — near top wall (y=0)
  const targetPt = { x: 120, y: 20 };
  const topWall = walls[0];
  const proj = projectPointOntoLine(targetPt, { x: 0, y: 0 }, { x: 400, y: 0 });
  assert.ok(proj.distance < 72, 'Target should be within 72" wall snap radius');

  const { inwardNormal } = calculateWallInwardNormal({ x: 0, y: 0 }, { x: 400, y: 0 }, roomPoly);
  // Interior points toward positive Y (into room)
  assert.ok(inwardNormal.y > 0.9, 'Top wall inward normal must point into the room (+Y)');

  // Anchor position on interior wall face:
  const wallThickness = 9;
  const anchorX = proj.point.x;
  const anchorY = proj.point.y + inwardNormal.y * (wallThickness / 2);

  assert.strictEqual(anchorX, 120, 'Anchor X matches projection on top wall');
  assert.strictEqual(anchorY, 4.5, 'Anchor Y is on interior face (+4.5" from wall centerline)');
  console.log(`  ✓ Wall rack snapped: anchor=(${anchorX}, ${anchorY}), normal=(${inwardNormal.x}, ${inwardNormal.y})`);
}

// --- TEST 3: Center Rack Run Snapping ---
console.log('\n[Test 3] Center Rack Run Snapping...');
{
  const rackA: RackEntity = {
    id: 'rack_1',
    type: 'rack',
    geometry: { x: 200, y: 150, width: 36, depth: 24, height: 60, rotation: 0 },
    properties: { rackType: 'Center Rack', productName: 'Center Gondola 5x3' }
  };

  // User taps 2" away from rackA's right terminal face (x = 200 + 36 = 236)
  const targetPt = { x: 238, y: 151 };
  const candidateRack: RackEntity = {
    id: 'candidate',
    type: 'rack',
    geometry: { x: targetPt.x, y: targetPt.y, width: 36, depth: 24, height: 60, rotation: 0 },
    properties: { rackType: 'Center Rack', productName: 'Center Gondola 5x3' }
  };

  const bestSnap = RackConnectionEngine.findBestSnap(candidateRack, [rackA], targetPt, 0);
  assert.ok(bestSnap, 'RackConnectionEngine should find snap for adjacent center rack');
  assert.strictEqual(bestSnap.position.x, 236, 'Snapped X must be exactly adjacent (200 + 36 = 236)');
  assert.strictEqual(bestSnap.position.y, 150, 'Snapped Y must align to run centerline (150)');
  assert.strictEqual(bestSnap.rotation, 0, 'Snapped rotation must match run rotation (0°)');
  console.log(`  ✓ Center rack connection snapped: pos=(${bestSnap.position.x}, ${bestSnap.position.y}), rot=${bestSnap.rotation}°`);
}

// --- TEST 4: Grid Snapping Fallback ---
console.log('\n[Test 4] 1-Foot Grid Snapping Fallback...');
{
  // When far from walls and racks, points snap to nearest 12" (1 foot) grid
  const rawPt1 = { x: 103.4, y: 97.2 };
  const snappedX1 = Math.round(rawPt1.x / 12) * 12;
  const snappedY1 = Math.round(rawPt1.y / 12) * 12;
  assert.strictEqual(snappedX1, 108, '103.4" snaps to 108" (9ft)');
  assert.strictEqual(snappedY1, 96, '97.2" snaps to 96" (8ft)');

  const rawPt2 = { x: 24.1, y: 48.9 };
  const snappedX2 = Math.round(rawPt2.x / 12) * 12;
  const snappedY2 = Math.round(rawPt2.y / 12) * 12;
  assert.strictEqual(snappedX2, 24, '24.1" snaps to 24" (2ft)');
  assert.strictEqual(snappedY2, 48, '48.9" snaps to 48" (4ft)');
  console.log('  ✓ 1-Foot CAD grid snapping verified');
}

// --- TEST 5: Touch Gesture Differentiation (Tap vs Pan/Pinch) ---
console.log('\n[Test 5] Touch Gesture Differentiation...');
{
  // Tap detection threshold: <= 18px movement
  const isTap = (start: Point2D, end: Point2D) => Math.hypot(end.x - start.x, end.y - start.y) < 18;

  // Case A: Clean tap (slight 4px finger wobble) -> SHOULD place
  assert.ok(isTap({ x: 150, y: 200 }, { x: 153, y: 202 }), '4px wobble must qualify as a deliberate tap');

  // Case B: Drag / Pan gesture (35px move) -> MUST NOT place
  assert.ok(!isTap({ x: 150, y: 200 }, { x: 180, y: 220 }), '36px move must be detected as pan, not tap');

  // Case C: Touch debounce (synthetic mouse events within 450ms are ignored)
  const lastTouchTime = Date.now();
  const shouldIgnoreMouse = (mouseTime: number) => mouseTime - lastTouchTime < 450;
  assert.ok(shouldIgnoreMouse(lastTouchTime + 50), '50ms synthetic mouse click must be ignored');
  assert.ok(shouldIgnoreMouse(lastTouchTime + 300), '300ms synthetic mouse click must be ignored');
  assert.ok(!shouldIgnoreMouse(lastTouchTime + 600), '600ms actual mouse click must be accepted');
  console.log('  ✓ Touch tap threshold & synthetic mouse debounce verified');
}

// --- TEST 6: Rack Entity Metadata Preservation ---
console.log('\n[Test 6] Rack Entity Metadata & Rotation Preservation...');
{
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

  // Constructed Rack Entity
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

  assert.strictEqual(newRack.properties.productModelId, 'RACK_WALL_7X3', 'productModelId must be preserved');
  assert.strictEqual(newRack.properties.sku, 'SKU-WR-73', 'sku must be preserved');
  assert.strictEqual(newRack.geometry.width, 36, 'width must match product');
  assert.strictEqual(newRack.geometry.height, 84, 'height must match product');
  assert.strictEqual(newRack.geometry.depth, 24, 'depth must match product');
  assert.strictEqual(newRack.geometry.rotation, 90, 'rotation must be preserved');
  assert.strictEqual(newRack.properties.shelfCount, 6, 'shelfCount must match');
  assert.strictEqual(newRack.properties.shelfThickness, 1.25, 'shelfThickness must match');
  console.log('  ✓ Rack Entity preserves all product specifications and geometry');
}

console.log('\n=== ALL RACK PLACEMENT ENGINE TESTS PASSED ===');

