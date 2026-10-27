import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import fs from 'fs';
import { ShelfPlacementEngine } from '../src/cad/rendering3d/parametric/ShelfPlacementEngine.ts';
import { ParametricRackBuilder } from '../src/cad/rendering3d/parametric/ParametricRackBuilder.ts';

globalThis.self = globalThis;

console.log('============================================================');
console.log('RETAILFIX CAD PHASE 6 — PARAMETRIC RACK VERIFICATION SUITE');
console.log('============================================================\n');

// 1. SHELF PLACEMENT ENGINE TESTS
console.log('--- TEST 1: Usable Vertical Height & Deterministic Spacing ---');
const shelfCounts = [3, 5, 6, 8, 10, 12];
for (const count of shelfCounts) {
  const result = ShelfPlacementEngine.calculatePlacements({
    rackWidth: 36,
    rackDepth: 24,
    rackHeight: 84, // 7 ft
    shelfCount: count,
    shelfThickness: 1.0,
    topClearance: 11.5,
    bottomClearance: 3.15,
  });

  const numGaps = count - 1;
  const expectedUsable = 84 - 11.5 - 3.15; // 69.35
  const expectedSpacing = expectedUsable / numGaps;
  const match = Math.abs(result.effectiveSpacing - expectedSpacing) < 0.01;

  console.log(`[ShelfCount ${count}] Usable: ${result.usableHeight.toFixed(2)}" | Spacing: ${result.effectiveSpacing.toFixed(2)}" | Levels: ${result.placements.length} | Match: ${match ? 'PASS' : 'FAIL'}`);
  if (!match) throw new Error(`Spacing calculation mismatch for shelf count ${count}`);
}

// 2. HEIGHT CHANGE TEST (7' -> 8' rack, 84" -> 96")
console.log('\n--- TEST 2: Height Expansion (7ft vs 8ft) ---');
const result7ft = ShelfPlacementEngine.calculatePlacements({
  rackWidth: 36,
  rackDepth: 24,
  rackHeight: 84,
  shelfCount: 6,
  shelfThickness: 1.0,
});
const result8ft = ShelfPlacementEngine.calculatePlacements({
  rackWidth: 36,
  rackDepth: 24,
  rackHeight: 96,
  shelfCount: 6,
  shelfThickness: 1.0,
});
console.log(`7ft Rack: Usable=${result7ft.usableHeight.toFixed(2)}", Spacing=${result7ft.effectiveSpacing.toFixed(2)}"`);
console.log(`8ft Rack: Usable=${result8ft.usableHeight.toFixed(2)}", Spacing=${result8ft.effectiveSpacing.toFixed(2)}"`);
if (result8ft.effectiveSpacing <= result7ft.effectiveSpacing) {
  throw new Error('8ft rack spacing should be strictly greater than 7ft rack spacing for the same shelf count!');
}
console.log(`Expansion: +${(result8ft.effectiveSpacing - result7ft.effectiveSpacing).toFixed(2)}" per shelf gap (PASS)`);

// 3. GLB HIERARCHY & PHYSICAL THICKNESS COMPENSATION
console.log('\n--- TEST 3: Physical Shelf Thickness Compensation on GLB ---');
const buffer = fs.readFileSync('../backend/uploads/models/racks_1.glb');
const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

const loader = new GLTFLoader();
loader.parse(arrayBuffer, '', (gltf) => {
  const scene = gltf.scene;

  // Test 3A: Thickness 1.0" at 7' (stage2ScaleY = 1.0)
  const res1 = ParametricRackBuilder.configureParametricShelves(scene, {
    targetWidth: 36,
    targetHeight: 84,
    targetDepth: 24,
    baseWidth: 36,
    baseHeight: 84,
    baseDepth: 24,
    shelfCount: 6,
    shelfThickness: 1.0,
    stage2ScaleY: 1.0,
  });

  const rackNode = scene.children[0]?.children?.[2];
  const innerNode = rackNode?.children?.[0];
  // Inspect tier 2 (one of the adjustable upper tiers)
  const tier3A = innerNode?.children?.[3]; // Index 3 is one of RETAILFIX_SHELF_INDICES
  const scaleZ_1 = tier3A ? tier3A.scale.z : 1.0;

  // Test 3B: Thickness 1.5" at 8' (stage2ScaleY = 96/84 = 1.142857)
  const stage2ScaleY_8ft = 96 / 84;
  const res2 = ParametricRackBuilder.configureParametricShelves(scene, {
    targetWidth: 36,
    targetHeight: 96,
    targetDepth: 24,
    baseWidth: 36,
    baseHeight: 84,
    baseDepth: 24,
    shelfCount: 8,
    shelfThickness: 1.5,
    stage2ScaleY: stage2ScaleY_8ft,
  });

  const tier3B = innerNode?.children?.[3];
  const scaleZ_2 = tier3B ? tier3B.scale.z : 1.0;

  // Theoretical ratio: (1.5 / 1.0) / (96 / 84) = 1.5 / 1.142857 = 1.3125
  const ratio = scaleZ_2 / scaleZ_1;
  const expectedRatio = (1.5 / 1.0) / (96 / 84);
  const ratioDiff = Math.abs(ratio - expectedRatio);

  console.log(`Thickness 1.0" (7ft): local shelf.scale.z = ${scaleZ_1.toFixed(5)}`);
  console.log(`Thickness 1.5" (8ft): local shelf.scale.z = ${scaleZ_2.toFixed(5)}`);
  console.log(`Scale ratio: ${ratio.toFixed(5)} | Expected: ${expectedRatio.toFixed(5)} | Diff: ${ratioDiff.toFixed(6)}`);
  if (ratioDiff > 0.001) {
    throw new Error('Shelf thickness compensation ratio does not match theoretical expectation!');
  }
  console.log('Thickness compensation: PASS');

  // 4. TEST 4: CUSTOM RACK (3\'6" × 2\'6" × 7\', 8 shelves)
  console.log('\n--- TEST 4: Custom Rack Parametric Configuration ---');
  const resCustom = ParametricRackBuilder.configureParametricShelves(scene, {
    targetWidth: 42,  // 3'6"
    targetHeight: 84, // 7'0"
    targetDepth: 30,  // 2'6"
    baseWidth: 36,
    baseHeight: 84,
    baseDepth: 24,
    shelfCount: 8,
    shelfThickness: 1.5,
    stage2ScaleY: 1.0,
  });

  console.log(`Custom Rack Applied: ${resCustom.appliedShelfCount} shelves, spacing=${resCustom.effectiveSpacing.toFixed(2)}", thickness=${resCustom.shelfThickness}"`);
  if (resCustom.appliedShelfCount !== 8 || !resCustom.isParametric) {
    throw new Error('Custom rack failed to apply 8 parametric shelves!');
  }
  console.log('Custom rack: PASS');

  // 5. TEST 5: IDEMPOTENCY & DOWN-SCALING RECONCILIATION
  console.log('\n--- TEST 5: Idempotency (8 -> 10 -> 4 shelves) ---');
  ParametricRackBuilder.configureParametricShelves(scene, {
    targetWidth: 36, targetHeight: 84, targetDepth: 24,
    baseWidth: 36, baseHeight: 84, baseDepth: 24,
    shelfCount: 10, shelfThickness: 1.0, stage2ScaleY: 1.0,
  });
  let count10 = innerNode.children.filter(c => c.name.startsWith('ParametricShelf_') || c === innerNode.children[0]).length;
  console.log(`After scale up to 10: ${count10} total tiers`);

  ParametricRackBuilder.configureParametricShelves(scene, {
    targetWidth: 36, targetHeight: 84, targetDepth: 24,
    baseWidth: 36, baseHeight: 84, baseDepth: 24,
    shelfCount: 4, shelfThickness: 1.0, stage2ScaleY: 1.0,
  });
  let count4 = innerNode.children.filter(c => c.name.startsWith('ParametricShelf_') || c === innerNode.children[0]).length;
  console.log(`After scale down to 4: ${count4} total tiers`);

  if (count4 !== 4) {
    throw new Error(`Expected exactly 4 tiers after downscaling, got ${count4}`);
  }
  console.log('Reconciliation & Idempotency: PASS');

  console.log('\n============================================================');
  console.log('ALL PHASE 6 PARAMETRIC RACK TESTS PASSED SUCCESSFULLY!');
  console.log('============================================================');
});
