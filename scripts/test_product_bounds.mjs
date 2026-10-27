import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import fs from 'fs';
import path from 'path';

globalThis.self = globalThis;

const filePath = path.resolve('backend/uploads/models/racks_1.glb');
const buffer = fs.readFileSync(filePath);
const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

const loader = new GLTFLoader();
loader.parse(arrayBuffer, '', (gltf) => {
  const scene = gltf.scene;

  // Remove > 6m
  const toRemove = [];
  scene.traverse((c) => {
    if (c.isMesh) {
      const b = new THREE.Box3().setFromObject(c);
      const s = new THREE.Vector3(); b.getSize(s);
      if (Math.max(s.x, s.y, s.z) > 6.0) toRemove.push(c);
    }
  });
  toRemove.forEach((r) => r.removeFromParent());
  scene.updateMatrixWorld(true);

  const pBox = new THREE.Box3().setFromObject(scene);
  const pSize = new THREE.Vector3(); pBox.getSize(pSize);
  console.log('Product pSize after auxiliary removal (m):', pSize);
  console.log('Product pSize (inches):', pSize.clone().multiplyScalar(39.3701));
  console.log('Product pBox (inches):', {
    min: pBox.min.clone().multiplyScalar(39.3701),
    max: pBox.max.clone().multiplyScalar(39.3701)
  });
});
