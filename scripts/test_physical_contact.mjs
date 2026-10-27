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

  // Native Shelf 11
  const s11 = innerNode.children[11];
  const s11Bounds = getExactObjectBounds(s11);

  // Native Left Bracket 0
  const lb0 = leftUpright.children[0];
  const lb0Bounds = getExactObjectBounds(lb0);

  // Native Right Bracket 0
  const rb0 = rightUpright.children[0];
  const rb0Bounds = getExactObjectBounds(rb0);

  console.log('=== NATIVE SHELF 11 AND BRACKET 0 IN UNMODIFIED GLB ===');
  console.log('Shelf 11 local Z:', s11.position.z);
  console.log('Bracket 0 local Z:', lb0.position.z);
  console.log('Delta (bracket Z - shelf Z):', lb0.position.z - s11.position.z);

  console.log('\nVertical (Y) coordinates in World Space (inches):');
  console.log('  Shelf 11: Bottom Y =', (s11Bounds.min.y * 39.3701).toFixed(4), 'Top Y =', (s11Bounds.max.y * 39.3701).toFixed(4));
  console.log('  Left Bracket 0: Bottom Y =', (lb0Bounds.min.y * 39.3701).toFixed(4), 'Top Y =', (lb0Bounds.max.y * 39.3701).toFixed(4));
  console.log('  Right Bracket 0: Bottom Y =', (rb0Bounds.min.y * 39.3701).toFixed(4), 'Top Y =', (rb0Bounds.max.y * 39.3701).toFixed(4));

  console.log('\nDepth (X) coordinates in World Space (inches):');
  console.log('  Shelf 11: Front to Back =', (s11Bounds.min.x * 39.3701).toFixed(2), 'to', (s11Bounds.max.x * 39.3701).toFixed(2));
  console.log('  Left Bracket 0: Front to Back =', (lb0Bounds.min.x * 39.3701).toFixed(2), 'to', (lb0Bounds.max.x * 39.3701).toFixed(2));
  console.log('  Right Bracket 0: Front to Back =', (rb0Bounds.min.x * 39.3701).toFixed(2), 'to', (rb0Bounds.max.x * 39.3701).toFixed(2));

  console.log('\nWidth (Z) coordinates in World Space (inches):');
  console.log('  Shelf 11: Left to Right =', (s11Bounds.min.z * 39.3701).toFixed(2), 'to', (s11Bounds.max.z * 39.3701).toFixed(2));
  console.log('  Left Bracket 0: Left to Right =', (lb0Bounds.min.z * 39.3701).toFixed(2), 'to', (lb0Bounds.max.z * 39.3701).toFixed(2));
  console.log('  Right Bracket 0: Left to Right =', (rb0Bounds.min.z * 39.3701).toFixed(2), 'to', (rb0Bounds.max.z * 39.3701).toFixed(2));
});
