import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import fs from 'fs';

globalThis.self = globalThis;

const buffer = fs.readFileSync('../backend/uploads/models/racks_1.glb');
const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

const loader = new GLTFLoader();
loader.parse(arrayBuffer, '', (gltf) => {
  const scene = gltf.scene;
  const assembly = scene.children[0].children[0];
  const rackNode = assembly.children[2];
  const innerNode = rackNode.children[0];
  const shelf3 = innerNode.children[3];

  const modelRoot = new THREE.Group();
  modelRoot.add(scene);

  const baseH = 84;
  const targetH = 96; // 8 feet
  const stage2ScaleY = targetH / baseH; // 1.142857

  // Apply stage 2 scale to modelRoot
  modelRoot.scale.y = stage2ScaleY;

  // Compensate shelf scale.z so thickness is 1.0
  const requestedThickness = 1.0;
  const baseThickness = 1.0;
  shelf3.scale.z = (requestedThickness / baseThickness) / stage2ScaleY;

  modelRoot.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(shelf3);
  const sz = new THREE.Vector3();
  b.getSize(sz);
  console.log('Target height 96", shelf thickness in world Y:', sz.y.toFixed(4));

  // Test 1.5" thickness
  shelf3.scale.z = (1.5 / baseThickness) / stage2ScaleY;
  modelRoot.updateMatrixWorld(true);
  const b2 = new THREE.Box3().setFromObject(shelf3);
  const sz2 = new THREE.Vector3();
  b2.getSize(sz2);
  console.log('Target height 96", requested 1.5" thickness in world Y:', sz2.y.toFixed(4), '(ratio to 1.0:', (sz2.y / sz.y).toFixed(2), ')');
});
