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

  // Inspect Left Bracket 0 (child 0 of leftUpright)
  const lb0 = leftUpright.children[0];
  console.log('lb0 type:', lb0.type, 'name:', lb0.name);
  console.log('lb0 position:', lb0.position);
  console.log('lb0 rotation:', lb0.rotation);
  console.log('lb0 scale:', lb0.scale);
  console.log('lb0 children count:', lb0.children.length);
  if (lb0.children[0]) {
    const mesh = lb0.children[0];
    console.log('mesh name:', mesh.name, 'geom type:', mesh.geometry.type);
    console.log('geom vertex count:', mesh.geometry.attributes.position.count);
    const box = new THREE.Box3().setFromObject(lb0);
    console.log('lb0 world bounds:', box.min, 'to', box.max);
  }

  // Inspect Left Upright Post (child 2 of leftUpright)
  const lup = leftUpright.children[2];
  const lupBox = new THREE.Box3().setFromObject(lup);
  console.log('Upright Post world bounds:', lupBox.min, 'to', lupBox.max);

  // Compare Shelf 11 (highest shelf) in world space
  const s11 = innerNode.children[11];
  const s11Box = new THREE.Box3().setFromObject(s11);
  console.log('Shelf 11 world bounds:', s11Box.min, 'to', s11Box.max);

  // Measure bracket relative to shelf 11
  const lb0Box = new THREE.Box3().setFromObject(lb0);
  const rb0 = rightUpright.children[0];
  const rb0Box = new THREE.Box3().setFromObject(rb0);

  console.log('--- RELATIVE OFFSETS AT SHELF 11 ---');
  console.log('Shelf 11: X=[', s11Box.min.x.toFixed(4), s11Box.max.x.toFixed(4), '] Y=[', s11Box.min.y.toFixed(4), s11Box.max.y.toFixed(4), '] Z=[', s11Box.min.z.toFixed(4), s11Box.max.z.toFixed(4), ']');
  console.log('Left Bracket: X=[', lb0Box.min.x.toFixed(4), lb0Box.max.x.toFixed(4), '] Y=[', lb0Box.min.y.toFixed(4), lb0Box.max.y.toFixed(4), '] Z=[', lb0Box.min.z.toFixed(4), lb0Box.max.z.toFixed(4), ']');
  console.log('Right Bracket: X=[', rb0Box.min.x.toFixed(4), rb0Box.max.x.toFixed(4), '] Y=[', rb0Box.min.y.toFixed(4), rb0Box.max.y.toFixed(4), '] Z=[', rb0Box.min.z.toFixed(4), rb0Box.max.z.toFixed(4), ']');
});
