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

  console.log('leftUpright pos:', leftUpright.position, 'rot:', leftUpright.rotation, 'scale:', leftUpright.scale);
  console.log('rightUpright pos:', rightUpright.position, 'rot:', rightUpright.rotation, 'scale:', rightUpright.scale);

  // Compare shelf 11 box and bracket 0 box in world coordinates
  const s11 = innerNode.children[11];
  const b0_left = leftUpright.children[0];
  const b0_right = rightUpright.children[0];

  const b_s11 = new THREE.Box3().setFromObject(s11);
  const b_b0l = new THREE.Box3().setFromObject(b0_left);
  const b_b0r = new THREE.Box3().setFromObject(b0_right);

  console.log('Shelf 11 Box: min=', b_s11.min, 'max=', b_s11.max);
  console.log('Left Bracket 0 Box: min=', b_b0l.min, 'max=', b_b0l.max);
  console.log('Right Bracket 0 Box: min=', b_b0r.min, 'max=', b_b0r.max);

  // Print all 5 brackets vs 5 upper shelves
  const shelfPairs = [
    { shelf: innerNode.children[12], name: 'Shelf 12 (16.47)' },
    { shelf: innerNode.children[3],  name: 'Shelf 3 (31.00)' },
    { shelf: innerNode.children[9],  name: 'Shelf 9 (45.50)' },
    { shelf: innerNode.children[10], name: 'Shelf 10 (58.41)' },
    { shelf: innerNode.children[11], name: 'Shelf 11 (72.94)' },
  ];

  console.log('\n--- SHELF BOX Y vs BRACKET BOX Y ---');
  shelfPairs.forEach((sp) => {
    const sBox = new THREE.Box3().setFromObject(sp.shelf);
    console.log(`${sp.name}: Y range = [${sBox.min.y.toFixed(4)}, ${sBox.max.y.toFixed(4)}]`);
  });

  console.log('\n--- LEFT BRACKET BOX Y ---');
  [1, 4, 5, 3, 0].forEach((bIdx) => {
    const b = leftUpright.children[bIdx];
    const bBox = new THREE.Box3().setFromObject(b);
    console.log(`Bracket idx ${bIdx} (local Z=${b.position.z.toFixed(2)}): Y range = [${bBox.min.y.toFixed(4)}, ${bBox.max.y.toFixed(4)}]`);
  });
});
