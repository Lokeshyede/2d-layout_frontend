global.self = global;
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import fs from 'fs';

const glbBuffer = fs.readFileSync('e:/2d alyout/backend/uploads/models/racks_1.glb');
const arrayBuffer = glbBuffer.buffer.slice(glbBuffer.byteOffset, glbBuffer.byteOffset + glbBuffer.byteLength);

const loader = new GLTFLoader();
loader.parse(
  arrayBuffer,
  '',
  (gltf) => {
    console.log('GLTF loaded successfully!');
    console.log('Scene children count:', gltf.scene.children.length);
    let totalMeshes = 0;
    gltf.scene.traverse((obj) => {
      if (obj.isMesh) totalMeshes++;
    });
    console.log('Total meshes found:', totalMeshes);
  },
  (err) => {
    console.error('Error loading GLTF:', err);
  }
);
