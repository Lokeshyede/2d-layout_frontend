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
  const rightUpright = innerNode.children[4];

  const s11 = innerNode.children[11];
  const lb0 = leftUpright.children[0];
  const rb0 = rightUpright.children[0];

  const sBox = new THREE.Box3().setFromObject(s11);
  const lbBox = new THREE.Box3().setFromObject(lb0);

  console.log('Original Shelf 11: bottomY =', sBox.min.y);
  console.log('Original Left Bracket 0: topY =', lbBox.max.y, 'bottomY =', lbBox.min.y);
  const excessHeightMeters = lbBox.max.y - sBox.min.y;
  const excessHeightInches = excessHeightMeters * 39.37007874;
  console.log(`Excess height = ${excessHeightMeters.toFixed(4)}m = ${excessHeightInches.toFixed(4)} inches!`);

  // If we shift lb0.position.z by -excessHeightInches:
  lb0.position.z -= excessHeightInches;
  rb0.position.z -= excessHeightInches;

  scene.updateMatrixWorld(true);

  const sBoxNew = new THREE.Box3().setFromObject(s11);
  const lbBoxNew = new THREE.Box3().setFromObject(lb0);
  const rbBoxNew = new THREE.Box3().setFromObject(rb0);

  console.log('\n--- AFTER ALIGNING BRACKET TOP TO SHELF BOTTOM ---');
  console.log('Shelf 11 bottomY =', sBoxNew.min.y.toFixed(4));
  console.log('Left Bracket topY =', lbBoxNew.max.y.toFixed(4), 'bottomY =', lbBoxNew.min.y.toFixed(4));
  console.log('Right Bracket topY =', rbBoxNew.max.y.toFixed(4), 'bottomY =', rbBoxNew.min.y.toFixed(4));
  console.log('Shelf Bottom vs Left Bracket Top gap =', ((sBoxNew.min.y - lbBoxNew.max.y) * 39.3701).toFixed(4), 'inches');
  console.log('Shelf Bottom vs Right Bracket Top gap =', ((sBoxNew.min.y - rbBoxNew.max.y) * 39.3701).toFixed(4), 'inches');
});
