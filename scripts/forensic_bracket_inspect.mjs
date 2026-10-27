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

  // Native Shelf 11 (highest shelf in original model)
  const s11 = innerNode.children[11];
  // Native Left Bracket 0 (the bracket under Shelf 11)
  const lb0 = leftUpright.children[0];
  // Native Right Bracket 0 (the bracket under Shelf 11)
  const rb0 = rightUpright.children[0];

  console.log('=== NATIVE WORLD POSITIONS & BOXES (SHELF 11 & ITS BRACKETS) ===');
  const s11BoxWorld = new THREE.Box3().setFromObject(s11);
  const lb0BoxWorld = new THREE.Box3().setFromObject(lb0);
  const rb0BoxWorld = new THREE.Box3().setFromObject(rb0);

  console.log('Shelf 11 World Box: min=', s11BoxWorld.min, 'max=', s11BoxWorld.max);
  console.log('Left Bracket 0 World Box: min=', lb0BoxWorld.min, 'max=', lb0BoxWorld.max);
  console.log('Right Bracket 0 World Box: min=', rb0BoxWorld.min, 'max=', rb0BoxWorld.max);

  const sSize = new THREE.Vector3(); s11BoxWorld.getSize(sSize);
  const lbSize = new THREE.Vector3(); lb0BoxWorld.getSize(lbSize);
  const rbSize = new THREE.Vector3(); rb0BoxWorld.getSize(rbSize);

  console.log('Shelf 11 Size (meters):', sSize, 'inches:', sSize.clone().multiplyScalar(39.3701));
  console.log('Left Bracket Size (meters):', lbSize, 'inches:', lbSize.clone().multiplyScalar(39.3701));
  console.log('Right Bracket Size (meters):', rbSize, 'inches:', rbSize.clone().multiplyScalar(39.3701));

  console.log('\n=== RELATIVE OFFSETS IN WORLD SPACE ===');
  console.log('Shelf 11 bottom Y:', s11BoxWorld.min.y, 'top Y:', s11BoxWorld.max.y);
  console.log('Left Bracket top Y:', lb0BoxWorld.max.y, 'bottom Y:', lb0BoxWorld.min.y);
  console.log('Right Bracket top Y:', rb0BoxWorld.max.y, 'bottom Y:', rb0BoxWorld.min.y);
  console.log('Left Bracket top vs Shelf bottom delta (inches):', (lb0BoxWorld.max.y - s11BoxWorld.min.y) * 39.3701);
  console.log('Right Bracket top vs Shelf bottom delta (inches):', (rb0BoxWorld.max.y - s11BoxWorld.min.y) * 39.3701);

  console.log('\nShelf 11 depth range (X):', s11BoxWorld.min.x, 'to', s11BoxWorld.max.x);
  console.log('Left Bracket depth range (X):', lb0BoxWorld.min.x, 'to', lb0BoxWorld.max.x);
  console.log('Right Bracket depth range (X):', rb0BoxWorld.min.x, 'to', rb0BoxWorld.max.x);

  console.log('\nShelf 11 width range (Z):', s11BoxWorld.min.z, 'to', s11BoxWorld.max.z);
  console.log('Left Bracket width range (Z):', lb0BoxWorld.min.z, 'to', lb0BoxWorld.max.z);
  console.log('Right Bracket width range (Z):', rb0BoxWorld.min.z, 'to', rb0BoxWorld.max.z);

  console.log('\n=== BRACKET MESH GEOMETRY & LOCAL PIVOT ===');
  const lbMesh = lb0.children[0];
  const rbMesh = rb0.children[0];

  console.log('lbMesh geometry bounds:', lbMesh.geometry.boundingBox);
  console.log('lb0 local transform: pos=', lb0.position, 'rot=', lb0.rotation, 'scale=', lb0.scale);
  console.log('rb0 local transform: pos=', rb0.position, 'rot=', rb0.rotation, 'scale=', rb0.scale);
});
