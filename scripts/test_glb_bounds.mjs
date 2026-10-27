import * as THREE from 'three';
import fs from 'fs';
import { loadGLTF } from './test_utils.mjs';

async function main() {
  const glbPath = process.argv[2];
  const scene = await loadGLTF(glbPath);
  scene.updateMatrixWorld(true);
  const productBox = new THREE.Box3();
  let productMeshCount = 0;
  
  scene.traverse((obj) => {
    if (obj.isMesh) {
      const mBox = new THREE.Box3().setFromObject(obj);
      const mSize = new THREE.Vector3();
      mBox.getSize(mSize);
      if (Math.max(mSize.x, mSize.y, mSize.z) <= 6.0) {
        productBox.union(mBox);
        productMeshCount++;
      }
    }
  });
  
  const size = new THREE.Vector3();
  productBox.getSize(size);
  console.log(`Product Meshes: ${productMeshCount}`);
  console.log(`Product Size (m): X=${size.x.toFixed(3)}, Y=${size.y.toFixed(3)}, Z=${size.z.toFixed(3)}`);
  console.log(`Product Size (in): X=${(size.x*39.3701).toFixed(2)}, Y=${(size.y*39.3701).toFixed(2)}, Z=${(size.z*39.3701).toFixed(2)}`);
}

main();
