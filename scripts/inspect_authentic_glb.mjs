import fs from 'fs';
import path from 'path';
global.self = global;
global.window = global;
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const filePath = 'e:/2d alyout/backend/uploads/models/updated_rack_b02b4896.glb';

async function inspect() {
  const buffer = fs.readFileSync(filePath);
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

  const loader = new GLTFLoader();
  const gltf = await new Promise((resolve, reject) => {
    loader.parse(arrayBuffer, '', resolve, reject);
  });

  const scene = gltf.scene;
  let count = 0;
  console.log('--- ALL MESHES IN AUTHENTIC RETAILFIX GLB ---');
  scene.traverse((child) => {
    if (child.isMesh) {
      count++;
      const box = new THREE.Box3().setFromObject(child);
      const size = new THREE.Vector3();
      box.getSize(size);
      const center = new THREE.Vector3();
      box.getCenter(center);
      console.log(`[${count}] "${child.name}" | Parent: "${child.parent?.name}"`);
      console.log(`     Size (in): ${(size.x * 39.3701).toFixed(2)} x ${(size.y * 39.3701).toFixed(2)} x ${(size.z * 39.3701).toFixed(2)} | Center: ${(center.x * 39.3701).toFixed(2)}, ${(center.y * 39.3701).toFixed(2)}, ${(center.z * 39.3701).toFixed(2)} | Mat: ${child.material?.name}`);
    }
  });

  console.log(`Total Meshes: ${count}`);
}

inspect().catch(console.error);
