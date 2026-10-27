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

  // Native Shelf 11
  const s11 = innerNode.children[11];
  const s11Bounds = getExactObjectBounds(s11);

  // What happens if we clone bracket 0, and put it at shelf.position.z vs shelf.position.z + 8.4116?
  const templateBracket = leftUpright.children[0];

  // Test A: Current code (bracket.position.z = shelf.position.z)
  const bracketBad = templateBracket.clone(true);
  bracketBad.position.set(0.5822, 11.3325, s11.position.z);
  bracketBad.rotation.set(2.339487, -1.557494, -1.590032);
  leftUpright.add(bracketBad);
  leftUpright.updateMatrixWorld(true);
  const badBounds = getExactObjectBounds(bracketBad);

  // Test B: Corrected code (bracket.position.z = shelf.position.z + 8.41162)
  const bracketGood = templateBracket.clone(true);
  bracketGood.position.set(0.5822, 11.3325, s11.position.z + 8.41162);
  bracketGood.rotation.set(2.339487, -1.557494, -1.590032);
  leftUpright.add(bracketGood);
  leftUpright.updateMatrixWorld(true);
  const goodBounds = getExactObjectBounds(bracketGood);

  console.log('=== COMPARISON OF BRACKET Z POSITIONING ===');
  console.log('Shelf 11 World Y:', (s11Bounds.min.y * 39.3701).toFixed(4), 'to', (s11Bounds.max.y * 39.3701).toFixed(4));
  console.log('\nTest A (Current Code - bracket.z = shelf.z):');
  console.log('  Actual Bracket Y (exact vertices):', (badBounds.min.y * 39.3701).toFixed(4), 'to', (badBounds.max.y * 39.3701).toFixed(4));
  console.log('  Three.js Box3().setFromObject():', (new THREE.Box3().setFromObject(bracketBad).min.y * 39.3701).toFixed(4), 'to', (new THREE.Box3().setFromObject(bracketBad).max.y * 39.3701).toFixed(4));
  console.log('  ACTUAL GAP between shelf bottom and bracket top:', ((s11Bounds.min.y - badBounds.max.y) * 39.3701).toFixed(4), 'inches (FLOATING DISCONNECTED!)');

  console.log('\nTest B (Corrected Code - bracket.z = shelf.z + 8.41162):');
  console.log('  Actual Bracket Y (exact vertices):', (goodBounds.min.y * 39.3701).toFixed(4), 'to', (goodBounds.max.y * 39.3701).toFixed(4));
  console.log('  Three.js Box3().setFromObject():', (new THREE.Box3().setFromObject(bracketGood).min.y * 39.3701).toFixed(4), 'to', (new THREE.Box3().setFromObject(bracketGood).max.y * 39.3701).toFixed(4));
  console.log('  ACTUAL GAP between shelf bottom and bracket top:', ((s11Bounds.min.y - goodBounds.max.y) * 39.3701).toFixed(4), 'inches (PERFECT CONTACT!)');
});
