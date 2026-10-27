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

  // Inspect the bracket mesh geometry inside child [0]
  const b0 = leftUpright.children[0];
  const b0Mesh = b0.children[0];
  const geom = b0Mesh.geometry;

  console.log('=== BRACKET GEOMETRY VERTICES DUMP ===');
  console.log('Vertex count:', geom.attributes.position.count);
  const posAttr = geom.attributes.position;
  let minLocal = new THREE.Vector3(Infinity, Infinity, Infinity);
  let maxLocal = new THREE.Vector3(-Infinity, -Infinity, -Infinity);

  for (let i = 0; i < posAttr.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(posAttr, i);
    minLocal.min(v);
    maxLocal.max(v);
  }
  console.log('Geometry Bounds (mesh local coords): min=', minLocal, 'max=', maxLocal);

  // Now transform vertices through b0Mesh -> b0 -> leftUpright -> innerNode -> assembly -> scene
  let minWorld = new THREE.Vector3(Infinity, Infinity, Infinity);
  let maxWorld = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  for (let i = 0; i < posAttr.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(posAttr, i);
    v.applyMatrix4(b0Mesh.matrixWorld);
    minWorld.min(v);
    maxWorld.max(v);
  }
  console.log('b0 World Bounds: min=', minWorld, 'max=', maxWorld);
  console.log('b0 World Size in inches:', maxWorld.clone().sub(minWorld).multiplyScalar(39.3701));
  console.log('b0 World Y range (inches):', (minWorld.y * 39.3701).toFixed(3), 'to', (maxWorld.y * 39.3701).toFixed(3));

  // Let's check Shelf 11 (tier 5)
  const s11 = innerNode.children[11];
  const s11Box = new THREE.Box3().setFromObject(s11);
  console.log('\nShelf 11 World Y range (inches):', (s11Box.min.y * 39.3701).toFixed(3), 'to', (s11Box.max.y * 39.3701).toFixed(3));
  console.log('Shelf 11 World X range (depth):', (s11Box.min.x * 39.3701).toFixed(3), 'to', (s11Box.max.x * 39.3701).toFixed(3));
  console.log('b0 World X range (depth):', (minWorld.x * 39.3701).toFixed(3), 'to', (maxWorld.x * 39.3701).toFixed(3));

  console.log('Shelf 11 World Z range (width):', (s11Box.min.z * 39.3701).toFixed(3), 'to', (s11Box.max.z * 39.3701).toFixed(3));
  console.log('b0 World Z range (width):', (minWorld.z * 39.3701).toFixed(3), 'to', (maxWorld.z * 39.3701).toFixed(3));

  // Compare all 5 brackets with all 5 upper shelves in the original GLB!
  console.log('\n=== PAIRWISE MATCH OF ORIGINAL SHELVES AND BRACKETS ===');
  // Shelves:
  // Tier 1: child 12 (Y = 16.47" to 18.32")
  // Tier 2: child 3  (Y = 31.00" to 32.84")
  // Tier 3: child 9  (Y = 45.50" to 47.34")
  // Tier 4: child 10 (Y = 58.41" to 60.25")
  // Tier 5: child 11 (Y = 72.94" to 74.78")

  // Left Upright children:
  // [0]: Y = 65.24" to 81.35"
  // [1]: Y = 7.28" to 26.34"
  // [3]: Y = 50.71" to 66.82"
  // [4]: Y = 21.80" to 40.87"
  // [5]: Y = 37.80" to 53.91"
});
