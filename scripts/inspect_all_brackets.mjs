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

  console.log('=== LEFT BRACKETS DETAILED ===');
  [0, 1, 3, 4, 5].forEach((idx) => {
    const b = leftUpright.children[idx];
    const box = new THREE.Box3().setFromObject(b);
    console.log(`Left Bracket ${idx}: pos=(${b.position.x.toFixed(2)}, ${b.position.y.toFixed(2)}, ${b.position.z.toFixed(2)}) rot=(${b.rotation.x.toFixed(2)}, ${b.rotation.y.toFixed(2)}, ${b.rotation.z.toFixed(2)}) worldY=[${box.min.y.toFixed(4)}, ${box.max.y.toFixed(4)}] worldCenterY=${((box.min.y + box.max.y)/2).toFixed(4)}`);
  });

  console.log('\n=== RIGHT BRACKETS DETAILED ===');
  [0, 1, 3, 4, 5].forEach((idx) => {
    const b = rightUpright.children[idx];
    const box = new THREE.Box3().setFromObject(b);
    console.log(`Right Bracket ${idx}: pos=(${b.position.x.toFixed(2)}, ${b.position.y.toFixed(2)}, ${b.position.z.toFixed(2)}) rot=(${b.rotation.x.toFixed(2)}, ${b.rotation.y.toFixed(2)}, ${b.rotation.z.toFixed(2)}) worldY=[${box.min.y.toFixed(4)}, ${box.max.y.toFixed(4)}] worldCenterY=${((box.min.y + box.max.y)/2).toFixed(4)}`);
  });

  console.log('\n=== UPPER SHELVES WORLD Y ===');
  [12, 3, 9, 10, 11].forEach((idx) => {
    const s = innerNode.children[idx];
    const box = new THREE.Box3().setFromObject(s);
    console.log(`Shelf ${idx} (local Z=${s.position.z.toFixed(2)}): worldY=[${box.min.y.toFixed(4)}, ${box.max.y.toFixed(4)}] worldCenterY=${((box.min.y + box.max.y)/2).toFixed(4)}`);
  });
});
