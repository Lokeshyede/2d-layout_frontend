import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import fs from 'fs';

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

  // Bracket 0 (uses rotA)
  const b0 = leftUpright.children[0];
  const box0 = new THREE.Box3().setFromObject(b0);

  // Bracket 1 (uses rotB)
  const b1 = leftUpright.children[1];
  const box1 = new THREE.Box3().setFromObject(b1);

  console.log('=== BRACKET 0 (rotA: 2.34, -1.56, -1.59) ===');
  console.log('Local pos:', b0.position);
  console.log('Local rot:', b0.rotation);
  console.log('World Box: min=', box0.min, 'max=', box0.max);
  const size0 = new THREE.Vector3(); box0.getSize(size0);
  console.log('World Size (inches):', size0.multiplyScalar(39.3701));

  console.log('\n=== BRACKET 1 (rotB: 0.79, -1.57, 0.00) ===');
  console.log('Local pos:', b1.position);
  console.log('Local rot:', b1.rotation);
  console.log('World Box: min=', box1.min, 'max=', box1.max);
  const size1 = new THREE.Vector3(); box1.getSize(size1);
  console.log('World Size (inches):', size1.multiplyScalar(39.3701));
});
