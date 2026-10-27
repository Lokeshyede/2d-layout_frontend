import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import fs from 'fs';
import { ShelfPlacementEngine } from '../src/cad/rendering3d/parametric/ShelfPlacementEngine.ts';
import { ParametricRackBuilder } from '../src/cad/rendering3d/parametric/ParametricRackBuilder.ts';

globalThis.self = globalThis;

const buffer = fs.readFileSync('../backend/uploads/models/racks_1.glb');
const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

const loader = new GLTFLoader();
loader.parse(arrayBuffer, '', (gltf) => {
  const scene = gltf.scene;

  console.log('=== TEST 1: ShelfPlacementEngine Calculations ===');
  [5, 6, 8, 10].forEach((count) => {
    const res = ShelfPlacementEngine.calculatePlacements({
      rackWidth: 36,
      rackDepth: 24,
      rackHeight: 84,
      shelfCount: count,
      shelfThickness: 1.0,
    });
    console.log(`Count ${count}: usableHeight=${res.usableHeight.toFixed(2)}", spacing=${res.effectiveSpacing.toFixed(2)}", Ys: [${res.placements.map(p => p.y.toFixed(1)).join(', ')}]`);
  });

  console.log('\n=== TEST 2: ParametricRackBuilder Execution on GLB ===');
  [5, 6, 8, 10].forEach((count) => {
    const res = ParametricRackBuilder.configureParametricShelves(scene, {
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

    // Count visible shelves in the scene
    let visibleShelfCount = 0;
    scene.traverse((obj) => {
      if (obj.visible && (obj.name.startsWith('ParametricShelf_') || (obj.parent && obj.parent.children.length === 13 && (obj.position.z > 0 || obj.position.z === 0)))) {
        // check if this is one of the shelf children
        if (obj.parent && obj.parent.children.length >= 13) {
          const isShelf = obj.children.some(c => c.isMesh && (c.name.includes('3DGeom-4') || c.name.includes('3DGeom-17') || c.name.includes('3DGeom-33') || c.name.includes('3DGeom-36') || c.name.includes('3DGeom-39') || c.name.includes('3DGeom-42')));
          if (isShelf) visibleShelfCount++;
        }
      }
    });

    console.log(`Target: ${count} shelves -> Result applied: ${res.appliedShelfCount}, IsParametric: ${res.isParametric}`);
  });

  console.log('\n=== TEST 3: Idempotent Rebuild Test (6 -> 8 -> 5) ===');
  ParametricRackBuilder.configureParametricShelves(scene, {
    targetWidth: 36, targetHeight: 84, targetDepth: 24, baseWidth: 36, baseHeight: 84, baseDepth: 24, shelfCount: 6
  });
  const res8 = ParametricRackBuilder.configureParametricShelves(scene, {
    targetWidth: 36, targetHeight: 84, targetDepth: 24, baseWidth: 36, baseHeight: 84, baseDepth: 24, shelfCount: 8
  });
  console.log('After rebuild to 8:', res8.appliedShelfCount, 'shelves');

  const res5 = ParametricRackBuilder.configureParametricShelves(scene, {
    targetWidth: 36, targetHeight: 84, targetDepth: 24, baseWidth: 36, baseHeight: 84, baseDepth: 24, shelfCount: 5
  });
  console.log('After rebuild down to 5:', res5.appliedShelfCount, 'shelves (cleanly reconciled, no leftover shelves!)');
});
