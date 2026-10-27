import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import fs from 'fs';
import path from 'path';

globalThis.self = globalThis;

function getExactObjectBounds(obj) {
  let min = new THREE.Vector3(Infinity, Infinity, Infinity);
  let max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);

  obj.traverse((child) => {
    if (child.isMesh && child.geometry) {
      const posAttr = child.geometry.attributes.position;
      for (let i = 0; i < posAttr.count; i++) {
        const v = new THREE.Vector3().fromBufferAttribute(posAttr, i);
        v.applyMatrix4(child.matrixWorld);
        min.min(v);
        max.max(v);
      }
    }
  });

  return { min, max, size: max.clone().sub(min) };
}

const filePath = path.resolve('backend/uploads/models/racks_1.glb');
const buffer = fs.readFileSync(filePath);
const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

const loader = new GLTFLoader();
loader.parse(arrayBuffer, '', (gltf) => {
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);

  const assembly = scene.children[0].children[0];
  const innerNode = assembly.children[2].children[0];
  const leftUpright = innerNode.children[2];
  const rightUpright = innerNode.children[4];

  // Map each upper shelf to its corresponding bracket in the native GLB
  // Shelves:
  // child [12] -> Tier 1 (Y ~ 16.5")
  // child [3]  -> Tier 2 (Y ~ 31.0")
  // child [9]  -> Tier 3 (Y ~ 45.5")
  // child [10] -> Tier 4 (Y ~ 58.4")
  // child [11] -> Tier 5 (Y ~ 72.9")
  const shelfIndices = [12, 3, 9, 10, 11];

  // Upright children: [0], [1], [3], [4], [5]
  console.log('=== MATCHING BRACKETS TO SHELVES BY EXACT VERTICES ===');

  shelfIndices.forEach((sIdx, tier) => {
    const shelf = innerNode.children[sIdx];
    const sBounds = getExactObjectBounds(shelf);
    const sMinY = sBounds.min.y * 39.3701;
    const sMaxY = sBounds.max.y * 39.3701;

    console.log(`\n------------------------------------------------------------`);
    console.log(`SHELF Tier ${tier + 1} (child [${sIdx}]): Y = ${sMinY.toFixed(3)}" to ${sMaxY.toFixed(3)}" (H = ${(sMaxY - sMinY).toFixed(3)}")`);
    console.log(`  LocalPos: (${shelf.position.x.toFixed(4)}, ${shelf.position.y.toFixed(4)}, ${shelf.position.z.toFixed(4)})`);
    console.log(`  Depth (X): ${(sBounds.min.x*39.3701).toFixed(2)}" to ${(sBounds.max.x*39.3701).toFixed(2)}" (D = ${((sBounds.max.x - sBounds.min.x)*39.3701).toFixed(2)}")`);

    // Find the left upright child that matches this shelf height
    leftUpright.children.forEach((c, cIdx) => {
      const bBounds = getExactObjectBounds(c);
      const bMinY = bBounds.min.y * 39.3701;
      const bMaxY = bBounds.max.y * 39.3701;

      // Check if bracket top is close to shelf bottom
      const gap = Math.abs(bMaxY - sMinY);
      if (gap < 3.0 || (bMaxY >= sMinY - 1.0 && bMinY <= sMaxY)) {
        console.log(`  -> MATCHED LeftUpright child [${cIdx}]:`);
        console.log(`     Bracket Y: ${bMinY.toFixed(3)}" to ${bMaxY.toFixed(3)}" (H = ${(bMaxY - bMinY).toFixed(3)}")`);
        console.log(`     Shelf bottom vs Bracket top: ShelfMinY=${sMinY.toFixed(3)}", BracketMaxY=${bMaxY.toFixed(3)}", Gap=${(sMinY - bMaxY).toFixed(4)}"`);
        console.log(`     Bracket LocalPos: (${c.position.x.toFixed(4)}, ${c.position.y.toFixed(4)}, ${c.position.z.toFixed(4)})`);
        console.log(`     Bracket LocalRot: (${c.rotation.x.toFixed(4)}, ${c.rotation.y.toFixed(4)}, ${c.rotation.z.toFixed(4)})`);
        console.log(`     Bracket LocalScale: (${c.scale.x.toFixed(4)}, ${c.scale.y.toFixed(4)}, ${c.scale.z.toFixed(4)})`);
        console.log(`     Bracket Depth (X): ${(bBounds.min.x*39.3701).toFixed(2)}" to ${(bBounds.max.x*39.3701).toFixed(2)}"`);
        console.log(`     Bracket Width (Z): ${(bBounds.min.z*39.3701).toFixed(2)}" to ${(bBounds.max.z*39.3701).toFixed(2)}"`);
      }
    });

    rightUpright.children.forEach((c, cIdx) => {
      const bBounds = getExactObjectBounds(c);
      const bMinY = bBounds.min.y * 39.3701;
      const bMaxY = bBounds.max.y * 39.3701;

      const gap = Math.abs(bMaxY - sMinY);
      if (gap < 3.0 || (bMaxY >= sMinY - 1.0 && bMinY <= sMaxY)) {
        console.log(`  -> MATCHED RightUpright child [${cIdx}]:`);
        console.log(`     Bracket Y: ${bMinY.toFixed(3)}" to ${bMaxY.toFixed(3)}"`);
        console.log(`     Shelf bottom vs Bracket top Gap: ${(sMinY - bMaxY).toFixed(4)}"`);
        console.log(`     Bracket LocalPos: (${c.position.x.toFixed(4)}, ${c.position.y.toFixed(4)}, ${c.position.z.toFixed(4)})`);
        console.log(`     Bracket LocalRot: (${c.rotation.x.toFixed(4)}, ${c.rotation.y.toFixed(4)}, ${c.rotation.z.toFixed(4)})`);
        console.log(`     Bracket LocalScale: (${c.scale.x.toFixed(4)}, ${c.scale.y.toFixed(4)}, ${c.scale.z.toFixed(4)})`);
      }
    });
  });
});
