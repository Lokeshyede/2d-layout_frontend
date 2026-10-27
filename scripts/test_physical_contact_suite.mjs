import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import fs from 'fs';
import { ShelfPlacementEngine } from '../src/cad/rendering3d/parametric/ShelfPlacementEngine.ts';

globalThis.self = globalThis;
const buffer = fs.readFileSync('../backend/uploads/models/racks_1.glb');
const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

const loader = new GLTFLoader();
loader.parse(arrayBuffer, '', (gltf) => {
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);

  const assembly = scene.children[0].children[0];
  const innerNode = assembly.children[2].children[0];
  const leftUpright = innerNode.children[2];
  const rightUpright = innerNode.children[4];

  const templateShelf = innerNode.children[11];
  const templateLeftBracket = leftUpright.children[0];
  const templateRightBracket = rightUpright.children[0];

  console.log('=== TEST CONTACT VALIDATION AT THICKNESS 1.0", 1.5", 2.0" ===');
  [1.0, 1.5, 2.0].forEach((thickness) => {
    const placements = ShelfPlacementEngine.calculatePlacements({
      rackWidth: 36, rackDepth: 24, rackHeight: 84, shelfCount: 6, shelfThickness: thickness
    }).placements;

    placements.slice(1).forEach((p) => {
      const shelf = templateShelf.clone(true);
      shelf.position.z = p.y;
      shelf.scale.z = thickness / 1.0;
      innerNode.add(shelf);

      const lb = templateLeftBracket.clone(true);
      lb.position.z = p.y;
      leftUpright.add(lb);

      const rb = templateRightBracket.clone(true);
      rb.position.z = p.y;
      rightUpright.add(rb);

      scene.updateMatrixWorld(true);

      const sBox = new THREE.Box3().setFromObject(shelf);
      const lbBox = new THREE.Box3().setFromObject(lb);
      const rbBox = new THREE.Box3().setFromObject(rb);

      const gapL = (sBox.min.y - lbBox.max.y) * 39.3701;
      const gapR = (sBox.min.y - rbBox.max.y) * 39.3701;

      console.log(`Thickness ${thickness}" Level ${p.tierIndex}: shelfBottomY=${(sBox.min.y * 39.3701).toFixed(3)}" | lbTopY=${(lbBox.max.y * 39.3701).toFixed(3)}" | gapL=${gapL.toFixed(4)}" | gapR=${gapR.toFixed(4)}"`);
      if (Math.abs(gapL) > 0.001 || Math.abs(gapR) > 0.001) {
        throw new Error(`Contact validation failed at thickness ${thickness} tier ${p.tierIndex}`);
      }
    });
  });

  console.log('\nALL CONTACT VALIDATION TESTS PASSED PERFECTLY (GAP = 0.0000")!');
});
