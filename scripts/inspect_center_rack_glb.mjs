import fs from 'fs';
import path from 'path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const modelsDir = 'e:/2d alyout/backend/uploads/models';

async function inspect(filename) {
  const filePath = path.join(modelsDir, filename);
  console.log(`\n======================================================`);
  console.log(`INSPECTING: ${filename} (${fs.statSync(filePath).size} bytes)`);
  console.log(`======================================================`);

  const buffer = fs.readFileSync(filePath);
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

  const loader = new GLTFLoader();
  const gltf = await new Promise((resolve, reject) => {
    loader.parse(arrayBuffer, '', resolve, reject);
  });

  const scene = gltf.scene;
  let meshCount = 0;
  const meshes = [];

  scene.traverse((child) => {
    if (child.isMesh) {
      meshCount++;
      const box = new THREE.Box3().setFromObject(child);
      const size = new THREE.Vector3();
      box.getSize(size);
      const center = new THREE.Vector3();
      box.getCenter(center);
      meshes.push({
        name: child.name,
        parent: child.parent?.name,
        sizeInches: {
          x: Math.round(size.x * 39.3701 * 10) / 10,
          y: Math.round(size.y * 39.3701 * 10) / 10,
          z: Math.round(size.z * 39.3701 * 10) / 10,
        },
        centerInches: {
          x: Math.round(center.x * 39.3701 * 10) / 10,
          y: Math.round(center.y * 39.3701 * 10) / 10,
          z: Math.round(center.z * 39.3701 * 10) / 10,
        },
        material: child.material?.name || '<no-mat>',
      });
    }
  });

  const overallBox = new THREE.Box3().setFromObject(scene);
  const overallSize = new THREE.Vector3();
  overallBox.getSize(overallSize);
  console.log(`Total Meshes: ${meshCount}`);
  console.log(`Overall Bounds (inches): X=${(overallSize.x * 39.3701).toFixed(2)}, Y=${(overallSize.y * 39.3701).toFixed(2)}, Z=${(overallSize.z * 39.3701).toFixed(2)}`);

  console.log('\nTop 20 Meshes by Volume:');
  meshes.sort((a, b) => (b.sizeInches.x * b.sizeInches.y * b.sizeInches.z) - (a.sizeInches.x * a.sizeInches.y * a.sizeInches.z));
  for (let i = 0; i < Math.min(25, meshes.length); i++) {
    const m = meshes[i];
    console.log(`  [${i + 1}] "${m.name}" (parent: "${m.parent}")`);
    console.log(`       Size: ${m.sizeInches.x} x ${m.sizeInches.y} x ${m.sizeInches.z} | Center: ${m.centerInches.x}, ${m.centerInches.y}, ${m.centerInches.z} | Mat: ${m.material}`);
  }
}

async function main() {
  await inspect('center_rack_cb38b059.glb');
  await inspect('racks_1.glb');
}

main().catch(console.error);
