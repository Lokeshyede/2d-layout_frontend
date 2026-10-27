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

  console.log('=== SHELVES IN INNERNODE ===');
  const shelfIndices = [0, 12, 3, 9, 10, 11];
  shelfIndices.forEach((idx) => {
    const s = innerNode.children[idx];
    const worldPos = new THREE.Vector3();
    s.getWorldPosition(worldPos);
    const box = new THREE.Box3().setFromObject(s);
    console.log(`Shelf idx=${idx}: localPos=(${s.position.x.toFixed(2)}, ${s.position.y.toFixed(2)}, ${s.position.z.toFixed(2)}) | worldY=${worldPos.y.toFixed(4)} | boxY=[${box.min.y.toFixed(4)}, ${box.max.y.toFixed(4)}]`);
  });

  console.log('\n=== LEFT UPRIGHT & BRACKETS (child 2) ===');
  const leftUpright = innerNode.children[2];
  leftUpright.children.forEach((c, i) => {
    const worldPos = new THREE.Vector3();
    c.getWorldPosition(worldPos);
    const box = new THREE.Box3().setFromObject(c);
    console.log(`Left child ${i} (${c.name || 'unnamed'}): localPos=(${c.position.x.toFixed(2)}, ${c.position.y.toFixed(2)}, ${c.position.z.toFixed(2)}) | worldY=${worldPos.y.toFixed(4)} | boxY=[${box.min.y.toFixed(4)}, ${box.max.y.toFixed(4)}]`);
  });

  console.log('\n=== RIGHT UPRIGHT & BRACKETS (child 4) ===');
  const rightUpright = innerNode.children[4];
  rightUpright.children.forEach((c, i) => {
    const worldPos = new THREE.Vector3();
    c.getWorldPosition(worldPos);
    const box = new THREE.Box3().setFromObject(c);
    console.log(`Right child ${i} (${c.name || 'unnamed'}): localPos=(${c.position.x.toFixed(2)}, ${c.position.y.toFixed(2)}, ${c.position.z.toFixed(2)}) | worldY=${worldPos.y.toFixed(4)} | boxY=[${box.min.y.toFixed(4)}, ${box.max.y.toFixed(4)}]`);
  });
});
