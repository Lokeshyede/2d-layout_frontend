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
  scene.updateMatrixWorld(true);

  const assembly = scene.children[0].children[0];
  const innerNode = assembly.children[2].children[0];
  const leftUpright = innerNode.children[2];
  const rightUpright = innerNode.children[4];

  console.log('=== NATIVE SHELVES IN INNER NODE ===');
  const shelfIndices = [0, 12, 3, 9, 10, 11];
  shelfIndices.forEach((idx, tier) => {
    const s = innerNode.children[idx];
    const sBox = new THREE.Box3().setFromObject(s);
    const sSize = new THREE.Vector3(); sBox.getSize(sSize);
    console.log(`Tier ${tier} (child [${idx}]):`);
    console.log(`  LocalPos: (${s.position.x.toFixed(4)}, ${s.position.y.toFixed(4)}, ${s.position.z.toFixed(4)})`);
    console.log(`  LocalRot: (${s.rotation.x.toFixed(4)}, ${s.rotation.y.toFixed(4)}, ${s.rotation.z.toFixed(4)})`);
    console.log(`  LocalScale: (${s.scale.x.toFixed(4)}, ${s.scale.y.toFixed(4)}, ${s.scale.z.toFixed(4)})`);
    console.log(`  WorldBox: min=(${sBox.min.x.toFixed(4)}, ${sBox.min.y.toFixed(4)}, ${sBox.min.z.toFixed(4)}) max=(${sBox.max.x.toFixed(4)}, ${sBox.max.y.toFixed(4)}, ${sBox.max.z.toFixed(4)})`);
    console.log(`  WorldSize: (${sSize.x.toFixed(4)}, ${sSize.y.toFixed(4)}, ${sSize.z.toFixed(4)}) [${(sSize.x*39.3701).toFixed(2)}" x ${(sSize.y*39.3701).toFixed(2)}" x ${(sSize.z*39.3701).toFixed(2)}"]`);
    console.log(`  Bottom Y (m): ${sBox.min.y.toFixed(4)} (in: ${(sBox.min.y*39.3701).toFixed(3)}") Top Y (m): ${sBox.max.y.toFixed(4)} (in: ${(sBox.max.y*39.3701).toFixed(3)}")`);
  });

  console.log('\n=== NATIVE LEFT UPRIGHT CHILDREN ===');
  leftUpright.children.forEach((c, idx) => {
    const cBox = new THREE.Box3().setFromObject(c);
    const cSize = new THREE.Vector3(); cBox.getSize(cSize);
    console.log(`LeftUpright child [${idx}]:`);
    console.log(`  LocalPos: (${c.position.x.toFixed(4)}, ${c.position.y.toFixed(4)}, ${c.position.z.toFixed(4)})`);
    console.log(`  LocalRot: (${c.rotation.x.toFixed(4)}, ${c.rotation.y.toFixed(4)}, ${c.rotation.z.toFixed(4)})`);
    console.log(`  WorldBox: min=(${cBox.min.x.toFixed(4)}, ${cBox.min.y.toFixed(4)}, ${cBox.min.z.toFixed(4)}) max=(${cBox.max.x.toFixed(4)}, ${cBox.max.y.toFixed(4)}, ${cBox.max.z.toFixed(4)})`);
    console.log(`  WorldSize: (${cSize.x.toFixed(4)}, ${cSize.y.toFixed(4)}, ${cSize.z.toFixed(4)}) [${(cSize.x*39.3701).toFixed(2)}" x ${(cSize.y*39.3701).toFixed(2)}" x ${(cSize.z*39.3701).toFixed(2)}"]`);
    console.log(`  Top Y (m): ${cBox.max.y.toFixed(4)} (in: ${(cBox.max.y*39.3701).toFixed(3)}") Bottom Y (m): ${cBox.min.y.toFixed(4)} (in: ${(cBox.min.y*39.3701).toFixed(3)}")`);
  });

  console.log('\n=== NATIVE RIGHT UPRIGHT CHILDREN ===');
  rightUpright.children.forEach((c, idx) => {
    const cBox = new THREE.Box3().setFromObject(c);
    const cSize = new THREE.Vector3(); cBox.getSize(cSize);
    console.log(`RightUpright child [${idx}]:`);
    console.log(`  LocalPos: (${c.position.x.toFixed(4)}, ${c.position.y.toFixed(4)}, ${c.position.z.toFixed(4)})`);
    console.log(`  LocalRot: (${c.rotation.x.toFixed(4)}, ${c.rotation.y.toFixed(4)}, ${c.rotation.z.toFixed(4)})`);
    console.log(`  WorldBox: min=(${cBox.min.x.toFixed(4)}, ${cBox.min.y.toFixed(4)}, ${cBox.min.z.toFixed(4)}) max=(${cBox.max.x.toFixed(4)}, ${cBox.max.y.toFixed(4)}, ${cBox.max.z.toFixed(4)})`);
    console.log(`  WorldSize: (${cSize.x.toFixed(4)}, ${cSize.y.toFixed(4)}, ${cSize.z.toFixed(4)}) [${(cSize.x*39.3701).toFixed(2)}" x ${(cSize.y*39.3701).toFixed(2)}" x ${(cSize.z*39.3701).toFixed(2)}"]`);
  });
});
