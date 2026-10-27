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

  // Inspect each child in leftUpright
  console.log('=== LEFT UPRIGHT CHILDREN INSPECTION ===');
  leftUpright.children.forEach((c, idx) => {
    const mesh = c.children[0];
    const gBox = mesh?.geometry?.boundingBox;
    console.log(`[${idx}] name="${c.name}" pos=(${c.position.x.toFixed(3)}, ${c.position.y.toFixed(3)}, ${c.position.z.toFixed(3)}) rot=(${c.rotation.x.toFixed(3)}, ${c.rotation.y.toFixed(3)}, ${c.rotation.z.toFixed(3)})`);
    if (gBox) {
      const gSize = new THREE.Vector3(); gBox.getSize(gSize);
      console.log(`     GeomBox size: (${gSize.x.toFixed(3)}, ${gSize.y.toFixed(3)}, ${gSize.z.toFixed(3)})`);
    }
  });
});
