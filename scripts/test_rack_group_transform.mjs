import { RackGroupTransformEngine } from '../src/cad/engine/RackGroupTransformEngine.ts';
import { HistoryManager } from '../src/cad/engine/HistoryManager.ts';
import { CenterGondolaEngine } from '../src/cad/engine/CenterGondolaEngine.ts';

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`✓ ${message}`);
  }
}

console.log('====================================================');
console.log('RETAILFIX CAD — RACK GROUP TRANSFORMATION TEST SUITE');
console.log('====================================================\n');

// 1. SETUP: Vertical group of 4 Center Racks (width 36, depth 24)
// When rotation = 90, width (36) spans vertically along Y.
// Racks are stacked along Y: 100, 136, 172, 208 (adjacent, 36 inches apart).
const rack1 = {
  id: 'rack_1',
  type: 'rack',
  geometry: { x: 200, y: 100, width: 36, depth: 24, height: 60, rotation: 90 },
  properties: { productName: 'Center Gondola 1', rackType: 'center_rack_5x3', shelfCount: 6, productModelId: 'gondola_std' },
};
const rack2 = {
  id: 'rack_2',
  type: 'rack',
  geometry: { x: 200, y: 136, width: 36, depth: 24, height: 60, rotation: 90 },
  properties: { productName: 'Center Gondola 2', rackType: 'center_rack_5x3', shelfCount: 6, productModelId: 'gondola_std' },
};
const rack3 = {
  id: 'rack_3',
  type: 'rack',
  geometry: { x: 200, y: 172, width: 36, depth: 24, height: 60, rotation: 90 },
  properties: { productName: 'Center Gondola 3', rackType: 'center_rack_5x3', shelfCount: 6, productModelId: 'gondola_std' },
};
const rack4 = {
  id: 'rack_4',
  type: 'rack',
  geometry: { x: 200, y: 208, width: 36, depth: 24, height: 60, rotation: 90 },
  properties: { productName: 'Center Gondola 4', rackType: 'center_rack_5x3', shelfCount: 6, productModelId: 'gondola_std' },
};

const initialEntities = [rack1, rack2, rack3, rack4];
const selectedIds = new Set(['rack_1', 'rack_2', 'rack_3', 'rack_4']);

// ── TEST 1: COMBINED BOUNDING BOX & SHARED PIVOT ──
console.log('--- TEST 1: Combined Bounding Box & Shared Pivot Calculation ---');
const box = RackGroupTransformEngine.calculateCombinedBoundingBox([rack1, rack2, rack3, rack4]);
console.log('Combined Bounding Box:', box);
assert(box.minX === 188 && box.maxX === 212, 'X span is [188, 212] (depth 24 around center 200)');
assert(box.minY === 82 && box.maxY === 226, 'Y span is [82, 226] (total height 144 = 4 * 36)');

const pivot = RackGroupTransformEngine.calculateGroupPivot([rack1, rack2, rack3, rack4]);
console.log('Calculated Group Pivot:', pivot);
assert(pivot.x === 200, 'Pivot X is centered at 200');
assert(pivot.y === 154, 'Pivot Y is centered at 154 (midpoint between rack 2 and rack 3)');

// ── TEST 2: ROTATE GROUP -90° (COUNTERCLOCKWISE) ──
console.log('\n--- TEST 2: Rotate Group -90° around Shared Pivot ---');
const resNeg90 = RackGroupTransformEngine.rotateGroup(initialEntities, selectedIds, -90);
assert(resNeg90 !== null, 'Transformation result is not null');

const transformedRacksNeg = resNeg90.transformedRacks;
console.log('Transformed Racks (-90°):');
transformedRacksNeg.forEach(r => console.log(`  ${r.id}: pos=(${r.geometry.x}, ${r.geometry.y}), rot=${r.geometry.rotation}°`));

// Check Y alignment: all racks must be on the horizontal line Y = 154
assert(transformedRacksNeg.every(r => Math.abs(r.geometry.y - 154) < 0.01), 'All racks share horizontal line Y = 154');

// Check X positions:
// R1: 146, R2: 182, R3: 218, R4: 254
assert(Math.abs(transformedRacksNeg[0].geometry.x - 146) < 0.01, 'Rack 1 X is 146');
assert(Math.abs(transformedRacksNeg[1].geometry.x - 182) < 0.01, 'Rack 2 X is 182');
assert(Math.abs(transformedRacksNeg[2].geometry.x - 218) < 0.01, 'Rack 3 X is 218');
assert(Math.abs(transformedRacksNeg[3].geometry.x - 254) < 0.01, 'Rack 4 X is 254');

// Check spacing: exactly 36 inches between consecutive racks
assert(Math.abs(transformedRacksNeg[1].geometry.x - transformedRacksNeg[0].geometry.x - 36) < 0.01, 'Spacing R1-R2 is exactly 36"');
assert(Math.abs(transformedRacksNeg[2].geometry.x - transformedRacksNeg[1].geometry.x - 36) < 0.01, 'Spacing R2-R3 is exactly 36"');
assert(Math.abs(transformedRacksNeg[3].geometry.x - transformedRacksNeg[2].geometry.x - 36) < 0.01, 'Spacing R3-R4 is exactly 36"');

// Check rotations: 90 - 90 = 0° (HORIZONTAL)
assert(transformedRacksNeg.every(r => r.geometry.rotation === 0), 'Every rack rotated from 90° to 0° (horizontal)');

// Check metadata preservation
assert(transformedRacksNeg[0].properties.productModelId === 'gondola_std', 'Product model ID preserved');
assert(transformedRacksNeg[0].geometry.width === 36 && transformedRacksNeg[0].geometry.depth === 24, 'Dimensions preserved');

// ── TEST 3: ROTATE GROUP +90° (CLOCKWISE) ──
console.log('\n--- TEST 3: Rotate Group +90° around Shared Pivot ---');
const resPos90 = RackGroupTransformEngine.rotateGroup(initialEntities, selectedIds, 90);
const transformedRacksPos = resPos90.transformedRacks;
console.log('Transformed Racks (+90°):');
transformedRacksPos.forEach(r => console.log(`  ${r.id}: pos=(${r.geometry.x}, ${r.geometry.y}), rot=${r.geometry.rotation}°`));

assert(transformedRacksPos.every(r => Math.abs(r.geometry.y - 154) < 0.01), 'All racks share horizontal line Y = 154');
assert(transformedRacksPos.every(r => r.geometry.rotation === 180), 'Every rack rotated from 90° to 180° (horizontal facing opposite)');
// Spacing: 36 inches
assert(Math.abs(Math.abs(transformedRacksPos[0].geometry.x - transformedRacksPos[1].geometry.x) - 36) < 0.01, 'Distance R1-R2 is 36"');

// ── TEST 4: MOVE GROUP TOGETHER ──
console.log('\n--- TEST 4: Move Selected Group by Delta (dx=50, dy=-30) ---');
const moved = RackGroupTransformEngine.moveGroup(resNeg90.nextEntities, selectedIds, 50, -30);
const movedR1 = moved.find(e => e.id === 'rack_1');
const movedR2 = moved.find(e => e.id === 'rack_2');
assert(movedR1.geometry.x === 196 && movedR1.geometry.y === 124, 'Rack 1 moved from (146, 154) to (196, 124)');
assert(movedR2.geometry.x === 232 && movedR2.geometry.y === 124, 'Rack 2 moved from (182, 154) to (232, 124)');
assert(movedR2.geometry.x - movedR1.geometry.x === 36, 'Relative spacing 36" preserved after drag');

// ── TEST 5: UNDO / REDO SINGLE TRANSACTION ──
console.log('\n--- TEST 5: Undo / Redo as Single Transaction ---');
const history = new HistoryManager(initialEntities);
assert(history.canUndo() === false, 'Initially cannot undo');

// Push transformed state
history.pushState(resNeg90.nextEntities, 'Rotate Group 90°');
assert(history.canUndo() === true, 'Can undo after 1 transformation');

// Undo
const undone = history.undo();
assert(undone !== null, 'Undone state exists');
const undoneR1 = undone.find(e => e.id === 'rack_1');
assert(undoneR1.geometry.x === 200 && undoneR1.geometry.y === 100 && undoneR1.geometry.rotation === 90, 'Undo restores Rack 1 to (200, 100) rot=90°');
assert(history.canRedo() === true, 'Can redo after undo');

// Redo
const redone = history.redo();
assert(redone !== null, 'Redone state exists');
const redoneR1 = redone.find(e => e.id === 'rack_1');
assert(redoneR1.geometry.x === 146 && redoneR1.geometry.y === 154 && redoneR1.geometry.rotation === 0, 'Redo restores Rack 1 to transformed (146, 154) rot=0°');

// ── TEST 6: COLLISION AND BOUNDARY VALIDATION ──
console.log('\n--- TEST 6: Collision and Boundary Validation ---');
// Scenario A: Collision with obstacle rack outside selection
const obstacleRack = {
  id: 'obstacle_rack',
  type: 'rack',
  geometry: { x: 146, y: 154, width: 36, depth: 24, height: 60, rotation: 0 },
  properties: { productName: 'Obstacle Gondola', rackType: 'center_rack_5x3' },
};
const sceneWithObstacle = [...initialEntities, obstacleRack];
const valCollision = RackGroupTransformEngine.validateTransformation(
  transformedRacksNeg,
  sceneWithObstacle,
  selectedIds
);
console.log('Collision validation issues:', valCollision.issues);
assert(valCollision.isValid === false, 'Collision detected when obstacle overlaps transformed rack');
assert(valCollision.issues.some(i => i.includes('collides with')), 'Specific collision message reported');

// Scenario B: Room boundary validation
const roomPolygon = [
  { x: 150, y: 50 },  // Note: minX is 150, but Rack 1 starts at X=128 (extends outside!)
  { x: 400, y: 50 },
  { x: 400, y: 300 },
  { x: 150, y: 300 },
];
const valBoundary = RackGroupTransformEngine.validateTransformation(
  transformedRacksNeg,
  initialEntities,
  selectedIds,
  roomPolygon
);
console.log('Boundary validation issues:', valBoundary.issues);
assert(valBoundary.isValid === false, 'Boundary violation detected when transformed rack extends past wall');
assert(valBoundary.issues.some(i => i.includes('extends outside room boundary')), 'Boundary issue reported');

// Scenario C: Clear room with no collisions
const generousRoom = [
  { x: 0, y: 0 },
  { x: 500, y: 0 },
  { x: 500, y: 500 },
  { x: 0, y: 500 },
];
const valValid = RackGroupTransformEngine.validateTransformation(
  transformedRacksNeg,
  initialEntities,
  selectedIds,
  generousRoom
);
assert(valValid.isValid === true, 'No violations in clean room');

// ── TEST 7: 3D RUN ENGINE INTEGRATION ──
console.log('\n--- TEST 7: 3D Gondola Run Engine Integration ---');
// CenterGondolaEngine detects continuous gondola runs for 3D alignment
const detectedRuns = CenterGondolaEngine.detectRuns(resNeg90.nextEntities);
assert(detectedRuns.length === 1, 'Transformed horizontal racks form 1 unified gondola run in 3D');
assert(detectedRuns[0].racks.length === 4, 'Run contains all 4 racks');
const alignedR1 = detectedRuns[0].alignedPositions.get('rack_1');
const alignedR2 = detectedRuns[0].alignedPositions.get('rack_2');
console.log('3D Aligned Position R1:', alignedR1);
console.log('3D Aligned Position R2:', alignedR2);
assert(Math.abs(alignedR2.x - alignedR1.x - 36) < 0.01, '3D aligned positions match 2D layout with exact 36" spacing');

console.log('\n====================================================');
console.log('ALL 7 TEST SUITES PASSED CLEANLY (100% SUCCESS)');
console.log('====================================================');
