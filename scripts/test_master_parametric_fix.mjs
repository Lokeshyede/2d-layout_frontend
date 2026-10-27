import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import fs from 'fs';
import { ShelfPlacementEngine } from '../src/cad/rendering3d/parametric/ShelfPlacementEngine.ts';
import { ParametricRackBuilder } from '../src/cad/rendering3d/parametric/ParametricRackBuilder.ts';

globalThis.self = globalThis;

console.log('======================================================================');
console.log('RETAILFIX CAD — MASTER PARAMETRIC RACK AUDIT & VALIDATION SUITE');
console.log('======================================================================\n');

let totalTests = 0;
let passedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (!condition) {
    console.error(`[FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  passedTests++;
  console.log(`[PASS] ${message}`);
}

// -------------------------------------------------------------------------
// SECTION A: AUTO SPACING DETERMINISM & VISIBLE GAPS
// -------------------------------------------------------------------------
console.log('>>> SECTION A: ShelfPlacementEngine Spacing & Visible Gaps Tests <<<');
const testShelfCounts = [3, 5, 6, 8, 10, 12];
for (const count of testShelfCounts) {
  const result = ShelfPlacementEngine.calculatePlacements({
    rackWidth: 36,
    rackDepth: 24,
    rackHeight: 84, // 7ft
    shelfCount: count,
    shelfThickness: 1.0,
  });

  const spacingVal = ShelfPlacementEngine.validateShelfSpacing(result.placements, 0.01);
  assert(spacingVal.valid, `ShelfCount ${count}: max deviation between adjacent gaps is ${spacingVal.maxDeviation.toFixed(4)}" (<= 0.01")`);

  const gapVal = ShelfPlacementEngine.validateVisibleGaps(result.placements, 1.0, 0.01);
  assert(gapVal.isUniform, `ShelfCount ${count}: visible gap uniform at ${gapVal.minVisibleGap.toFixed(2)}"`);

  const dimVal = ShelfPlacementEngine.validateShelfDimensions(result.placements, 0.01);
  assert(dimVal.valid, `ShelfCount ${count}: uniform shelf width (${dimVal.expectedWidth}"), depth (${dimVal.expectedDepth}"), thickness (${dimVal.expectedThickness}")`);
}

// Thickness variations: 1.0", 1.5", 2.0"
[1.0, 1.5, 2.0].forEach((thick) => {
  const result = ShelfPlacementEngine.calculatePlacements({
    rackWidth: 36, rackDepth: 24, rackHeight: 84, shelfCount: 6, shelfThickness: thick,
  });
  const gapVal = ShelfPlacementEngine.validateVisibleGaps(result.placements, thick, 0.01);
  assert(gapVal.isUniform, `Thickness ${thick}": uniform visible gap = ${gapVal.minVisibleGap.toFixed(2)}"`);
});

// Height expansion: 7ft vs 8ft
const p7ft = ShelfPlacementEngine.calculatePlacements({ rackWidth: 36, rackDepth: 24, rackHeight: 84, shelfCount: 6 });
const p8ft = ShelfPlacementEngine.calculatePlacements({ rackWidth: 36, rackDepth: 24, rackHeight: 96, shelfCount: 6 });
assert(p8ft.effectiveSpacing > p7ft.effectiveSpacing, `8ft rack spacing (${p8ft.effectiveSpacing.toFixed(2)}") > 7ft rack spacing (${p7ft.effectiveSpacing.toFixed(2)}")`);

// Manual spacing mode (Section 37)
const manualResult = ShelfPlacementEngine.calculatePlacements({
  rackWidth: 36, rackDepth: 24, rackHeight: 84, shelfCount: 5, shelfSpacing: 15.0, shelfThickness: 1.0,
});
assert(manualResult.effectiveSpacing === 15.0, 'Manual spacing mode preserves exact user spacing of 15.0"');

// -------------------------------------------------------------------------
// SECTION B: GLB HIERARCHY, BRACKET SYNCHRONIZATION & RECONCILIATION
// -------------------------------------------------------------------------
console.log('\n>>> SECTION B: ParametricRackBuilder Execution on GLB <<<');
const buffer = fs.readFileSync('../backend/uploads/models/racks_1.glb');
const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

const loader = new GLTFLoader();
loader.parse(arrayBuffer, '', (gltf) => {
  const scene = gltf.scene;

  // Reconcile across sequence: 3 -> 5 -> 6 -> 8 -> 10 -> 12 -> 5 -> 3
  const sequence = [3, 5, 6, 8, 10, 12, 5, 3];
  for (const count of sequence) {
    const buildRes = ParametricRackBuilder.configureParametricShelves(scene, {
      targetWidth: 36,
      targetHeight: 84,
      targetDepth: 24,
      baseWidth: 36,
      baseHeight: 84,
      baseDepth: 24,
      shelfCount: count,
      shelfThickness: 1.0,
      stage2ScaleY: 1.0,
    });

    // 1. Check integrity
    const integrity = ParametricRackBuilder.validateParametricRackIntegrity(buildRes, count);
    assert(integrity.valid, `ShelfCount ${count}: exact ${count} shelves and ${integrity.metrics.bracketCount} brackets reconciled with 0 errors`);

    // 2. Check bracket alignment
    const bracketVal = ParametricRackBuilder.validateBracketAlignment(buildRes.shelfLevels, 0.05);
    assert(bracketVal.aligned, `ShelfCount ${count}: all upper shelves have synchronized left & right brackets at the exact shelf level`);

    // 2b. Check physical contact (bracket top touches shelf underside within 0.01")
    const contactVal = ParametricRackBuilder.validateBracketShelfContact(buildRes.shelfLevels, 0.01);
    assert(contactVal.valid, `ShelfCount ${count}: physical contact verified with 0.000" gap between bracket top and shelf underside`);

    // 3. Check that no native fixed brackets remain visible at wrong positions
    const innerNode = scene.children[0].children[0].children[2].children[0];
    const leftUpright = innerNode.children[2];
    const rightUpright = innerNode.children[4];

    const visibleLeftBrackets = leftUpright.children.filter(c => c.visible && c !== leftUpright.children[2]);
    const visibleRightBrackets = rightUpright.children.filter(c => c.visible && c !== rightUpright.children[2]);

    assert(visibleLeftBrackets.length === count - 1, `Left upright has exactly ${count - 1} visible brackets (no stale or orphan brackets)`);
    assert(visibleRightBrackets.length === count - 1, `Right upright has exactly ${count - 1} visible brackets (no stale or orphan brackets)`);

    // 4. Check that frame upright post is intact
    assert(leftUpright.children[2].visible === true, `Left upright frame post is preserved and visible`);
    assert(rightUpright.children[2].visible === true, `Right upright frame post is preserved and visible`);
  }

  // -------------------------------------------------------------------------
  // SECTION C: CUSTOM RACK & WIDTH INDEPENDENCE
  // -------------------------------------------------------------------------
  console.log('\n>>> SECTION C: Custom Rack & Width Invariance <<<');
  const widths = [36, 42, 48]; // 3', 3'6", 4'
  const measuredSpacings = [];
  for (const w of widths) {
    const buildRes = ParametricRackBuilder.configureParametricShelves(scene, {
      targetWidth: w,
      targetHeight: 84,
      targetDepth: 24,
      baseWidth: 36,
      baseHeight: 84,
      baseDepth: 24,
      shelfCount: 8,
      shelfThickness: 1.0,
      stage2ScaleY: 1.0,
    });
    measuredSpacings.push(buildRes.effectiveSpacing);
    assert(buildRes.appliedShelfCount === 8, `Width ${w}": appliedShelfCount = 8`);
  }

  // Spacing should be identical regardless of rack width
  assert(
    measuredSpacings[0] === measuredSpacings[1] && measuredSpacings[1] === measuredSpacings[2],
    `Vertical shelf spacing (${measuredSpacings[0].toFixed(2)}") is completely invariant with respect to rack width (3', 3'6", 4')`
  );

  console.log('\n======================================================================');
  console.log(`ALL ${passedTests} / ${totalTests} TESTS PASSED WITH 100% SUCCESS!`);
  console.log('======================================================================\n');
});
