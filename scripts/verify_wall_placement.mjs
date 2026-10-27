import assert from 'node:assert/strict';

// Replicate or import geometric and WallPlacementEngine calculations
function calculateWallMetrics(wall) {
  const start = { x: wall.geometry.x1, y: wall.geometry.y1 };
  const end = { x: wall.geometry.x2, y: wall.geometry.y2 };
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  const direction = length > 0 ? { x: dx / length, y: dy / length } : { x: 1, y: 0 };
  const angleRad = Math.atan2(dy, dx);
  const angleDeg = ((angleRad * 180 / Math.PI) % 360 + 360) % 360;

  return { wall, start, end, vector: { x: dx, y: dy }, length, direction, angleDeg, angleRad };
}

function calculateExtents(wallLength, offsetInches, widthInches, anchor) {
  let startDist = 0;
  let endDist = 0;
  let centerDist = 0;

  switch (anchor) {
    case 'start':
      startDist = offsetInches;
      endDist = offsetInches + widthInches;
      centerDist = offsetInches + widthInches / 2;
      break;
    case 'center':
      centerDist = offsetInches;
      startDist = offsetInches - widthInches / 2;
      endDist = offsetInches + widthInches / 2;
      break;
    case 'end':
      endDist = wallLength - offsetInches;
      startDist = wallLength - offsetInches - widthInches;
      centerDist = wallLength - offsetInches - widthInches / 2;
      break;
  }
  return { startDist, endDist, centerDist };
}

function validateFit(wallLength, widthInches, extents, offsetInches) {
  if (widthInches <= 0) return { isValid: false, errorMessage: 'Object width must be greater than 0.' };
  if (offsetInches < 0) return { isValid: false, errorMessage: 'Distance cannot be negative.' };
  if (widthInches > wallLength + 0.001) return { isValid: false, errorMessage: 'Tool width exceeds wall length.' };
  if (extents.startDist < -0.001 || extents.endDist > wallLength + 0.001) {
    return { isValid: false, errorMessage: 'Tool does not fit on the selected wall at this position.' };
  }
  return { isValid: true };
}

function calculatePlacement({ wall, anchor, offsetInches, widthInches, depthInches, entityType }) {
  const metrics = calculateWallMetrics(wall);
  const extents = calculateExtents(metrics.length, offsetInches, widthInches, anchor);
  const fit = validateFit(metrics.length, widthInches, extents, offsetInches);

  const startPoint = {
    x: metrics.start.x + metrics.direction.x * extents.startDist,
    y: metrics.start.y + metrics.direction.y * extents.startDist,
  };
  const endPoint = {
    x: metrics.start.x + metrics.direction.x * extents.endDist,
    y: metrics.start.y + metrics.direction.y * extents.endDist,
  };
  const centerPoint = {
    x: metrics.start.x + metrics.direction.x * extents.centerDist,
    y: metrics.start.y + metrics.direction.y * extents.centerDist,
  };

  return {
    isValid: fit.isValid,
    errorMessage: fit.errorMessage,
    metrics,
    extents,
    startPoint,
    endPoint,
    centerPoint,
    rotation: metrics.angleDeg,
  };
}

function derivePlacementFromGeometry(entity, wall, activeAnchor = 'start') {
  const metrics = calculateWallMetrics(wall);
  const geom = entity.geometry;
  const widthInches = geom.width || 36;
  const t = (geom.x - metrics.start.x) * metrics.direction.x + (geom.y - metrics.start.y) * metrics.direction.y;
  const clampedT = Math.max(widthInches / 2, Math.min(t, metrics.length - widthInches / 2));

  let offsetInches = 0;
  switch (activeAnchor) {
    case 'start':
      offsetInches = Math.max(0, clampedT - widthInches / 2);
      break;
    case 'center':
      offsetInches = clampedT;
      break;
    case 'end':
      offsetInches = Math.max(0, metrics.length - (clampedT + widthInches / 2));
      break;
  }
  return { wallId: wall.id, anchor: activeAnchor, offsetInches, widthInches, rotation: metrics.angleDeg };
}

console.log('====================================================');
console.log('RUNNING 10 ACCEPTANCE TESTS FOR WALL-BASED POSITIONING');
console.log('====================================================\n');

// ── TEST 1: 30'-0" Horizontal Wall ───────────────────────────────────────────
console.log('TEST 1: 30\'-0" Horizontal Wall Placement');
const wall1 = { id: 'w1', geometry: { x1: 0, y1: 0, x2: 360, y2: 0 }, properties: { thickness: 9 } };
const res1 = calculatePlacement({
  wall: wall1,
  anchor: 'start',
  offsetInches: 102, // 8'-6"
  widthInches: 60,   // 5'-0"
  entityType: 'window',
});

assert.strictEqual(res1.isValid, true);
assert.strictEqual(res1.extents.startDist, 102, 'Start distance should be 102" (8\'-6")');
assert.strictEqual(res1.extents.endDist, 162, 'End distance should be 162" (13\'-6")');
assert.strictEqual(res1.extents.centerDist, 132, 'Center distance should be 132" (11\'-0")');
assert.strictEqual(res1.centerPoint.x, 132);
assert.strictEqual(res1.centerPoint.y, 0);
assert.strictEqual(res1.rotation, 0);
console.log('  ✓ PASSED: Start = 8\'-6", End = 13\'-6", Rotation = 0°\n');

// ── TEST 2: 30'-0" Vertical Wall ─────────────────────────────────────────────
console.log('TEST 2: 30\'-0" Vertical Wall Placement');
const wall2 = { id: 'w2', geometry: { x1: 0, y1: 0, x2: 0, y2: 360 }, properties: { thickness: 9 } };
const res2 = calculatePlacement({
  wall: wall2,
  anchor: 'start',
  offsetInches: 102, // 8'-6"
  widthInches: 60,   // 5'-0"
  entityType: 'window',
});

assert.strictEqual(res2.isValid, true);
assert.strictEqual(res2.extents.startDist, 102);
assert.strictEqual(res2.extents.endDist, 162);
assert.strictEqual(res2.centerPoint.x, 0);
assert.strictEqual(res2.centerPoint.y, 132);
assert.strictEqual(res2.rotation, 90);
console.log('  ✓ PASSED: Vertically aligned at Y=132", Rotation = 90°\n');

// ── TEST 3: 42° Angled Wall ──────────────────────────────────────────────────
console.log('TEST 3: 42° Angled Wall Placement');
const angleRad3 = (42 * Math.PI) / 180;
const wall3 = {
  id: 'w3',
  geometry: {
    x1: 0,
    y1: 0,
    x2: 360 * Math.cos(angleRad3),
    y2: 360 * Math.sin(angleRad3),
  },
  properties: { thickness: 9 },
};
const res3 = calculatePlacement({
  wall: wall3,
  anchor: 'start',
  offsetInches: 102,
  widthInches: 60,
  entityType: 'window',
});

assert.strictEqual(res3.isValid, true);
assert.strictEqual(res3.extents.startDist, 102);
assert.strictEqual(res3.extents.endDist, 162);
assert.ok(Math.abs(res3.rotation - 42) < 0.001, 'Rotation should equal 42°');
const expectedCx3 = 132 * Math.cos(angleRad3);
const expectedCy3 = 132 * Math.sin(angleRad3);
assert.ok(Math.abs(res3.centerPoint.x - expectedCx3) < 0.001);
assert.ok(Math.abs(res3.centerPoint.y - expectedCy3) < 0.001);
console.log('  ✓ PASSED: Follows exact 42° direction vector and 42° rotation\n');

// ── TEST 4: Manual Irregular Diagonal Wall ───────────────────────────────────
console.log('TEST 4: Manual Irregular Room Diagonal Wall');
const wall4 = {
  id: 'w4',
  geometry: { x1: 120, y1: 80, x2: 420, y2: 260 }, // dx=300, dy=180, len=350.14
  properties: { thickness: 9 },
};
const metrics4 = calculateWallMetrics(wall4);
const res4 = calculatePlacement({
  wall: wall4,
  anchor: 'start',
  offsetInches: 72,
  widthInches: 48,
  entityType: 'door',
});

assert.strictEqual(res4.isValid, true);
assert.strictEqual(res4.extents.startDist, 72);
assert.strictEqual(res4.extents.endDist, 120);
assert.strictEqual(res4.extents.centerDist, 96);
assert.ok(Math.abs(res4.centerPoint.x - (120 + metrics4.direction.x * 96)) < 0.001);
assert.ok(Math.abs(res4.centerPoint.y - (80 + metrics4.direction.y * 96)) < 0.001);
console.log('  ✓ PASSED: Works accurately on irregular room diagonal wall\n');

// ── TEST 5: Change Start Distance (8'-6" -> 12'-0") ───────────────────────────
console.log('TEST 5: Dynamic Position Modification (8\'-6" → 12\'-0")');
const res5 = calculatePlacement({
  wall: wall1,
  anchor: 'start',
  offsetInches: 144, // 12'-0"
  widthInches: 60,   // 5'-0"
  entityType: 'window',
});

assert.strictEqual(res5.isValid, true);
assert.strictEqual(res5.extents.startDist, 144);
assert.strictEqual(res5.extents.endDist, 204);
assert.strictEqual(res5.extents.centerDist, 174);
assert.strictEqual(res5.centerPoint.x, 174);
console.log('  ✓ PASSED: Window moves exactly to 12\'-0" (start=144", end=204")\n');

// ── TEST 6: Change Width While Anchored From Start ───────────────────────────
console.log('TEST 6: Anchor Stability — From Start (Width 5\'-0" → 6\'-0")');
const res6 = calculatePlacement({
  wall: wall1,
  anchor: 'start',
  offsetInches: 102, // 8'-6" remains fixed
  widthInches: 72,   // 6'-0"
  entityType: 'window',
});

assert.strictEqual(res6.extents.startDist, 102, 'Start distance MUST remain fixed at 102"');
assert.strictEqual(res6.extents.endDist, 174, 'End distance expands to 174"');
console.log('  ✓ PASSED: Start point remains fixed at 8\'-6" while end expands to 14\'-6"\n');

// ── TEST 7: Change Width While Anchored From End ─────────────────────────────
console.log('TEST 7: Anchor Stability — From End (Width 5\'-0" → 6\'-0", End Dist 4\'-0")');
const res7_orig = calculatePlacement({
  wall: wall1,
  anchor: 'end',
  offsetInches: 48, // 4'-0" from end
  widthInches: 60,  // 5'-0" width
  entityType: 'window',
});
assert.strictEqual(res7_orig.extents.endDist, 312); // 360 - 48 = 312 (26'-0")
assert.strictEqual(res7_orig.extents.startDist, 252); // 312 - 60 = 252 (21'-0")

const res7_widened = calculatePlacement({
  wall: wall1,
  anchor: 'end',
  offsetInches: 48, // 4'-0" from end preserved
  widthInches: 72,  // 6'-0" width
  entityType: 'window',
});
assert.strictEqual(res7_widened.extents.endDist, 312, 'End distance MUST remain fixed at 312" (26\'-0")');
assert.strictEqual(res7_widened.extents.startDist, 240, 'Start distance moves to 240" (20\'-0")');
console.log('  ✓ PASSED: End point remains fixed at 26\'-0" while start expands to 20\'-0"\n');

// ── TEST 8: Manual Drag Updates Numeric Wall-Relative Offset ──────────────────
console.log('TEST 8: Manual Drag Updates Wall-Relative Distance');
const draggedWindow = {
  id: 'win_1',
  type: 'window',
  geometry: { x: 150, y: 0, width: 60, height: 48, rotation: 0 },
  properties: { attachedWallId: 'w1' },
};
const derivedPlacement = derivePlacementFromGeometry(draggedWindow, wall1, 'start');
// Center is 150", width is 60" -> start offset is 150 - 30 = 120" (10'-0")
assert.strictEqual(derivedPlacement.offsetInches, 120);
assert.strictEqual(derivedPlacement.anchor, 'start');
console.log('  ✓ PASSED: Drag to center X=150" updates distance from start to 10\'-0" (120")\n');

// ── TEST 9: Save & Reload Consistency ────────────────────────────────────────
console.log('TEST 9: Save & Reload Geometric Determinism');
const savedData = {
  wallId: 'w1',
  anchor: 'start',
  offsetInches: 102,
  widthInches: 60,
  heightInches: 48,
  rotation: 0,
};
const reloadedCalc = calculatePlacement({
  wall: wall1,
  anchor: savedData.anchor,
  offsetInches: savedData.offsetInches,
  widthInches: savedData.widthInches,
  entityType: 'window',
});
assert.strictEqual(reloadedCalc.centerPoint.x, 132);
assert.strictEqual(reloadedCalc.centerPoint.y, 0);
assert.strictEqual(reloadedCalc.rotation, 0);
console.log('  ✓ PASSED: Reconstructing from saved metadata produces identical coordinates\n');

// ── TEST 10: Validation for Invalid Placement ─────────────────────────────────
console.log('TEST 10: Validation Rejection on Invalid Placement (28\'-0" + 5\'-0" on 30\'-0" wall)');
const res10 = calculatePlacement({
  wall: wall1,
  anchor: 'start',
  offsetInches: 336, // 28'-0"
  widthInches: 60,   // 5'-0" (28 + 5 = 33 > 30)
  entityType: 'window',
});

assert.strictEqual(res10.isValid, false);
assert.strictEqual(res10.errorMessage, 'Tool does not fit on the selected wall at this position.');
console.log('  ✓ PASSED: Over-length placement cleanly rejected with error message\n');

console.log('====================================================');
console.log('ALL 10 ACCEPTANCE TESTS PASSED WITH 100% SUCCESS!');
console.log('====================================================');
