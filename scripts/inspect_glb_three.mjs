import * as THREE from 'three';
import fs from 'fs';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

// A tiny polyfill for GLTFLoader in Node
const window = {
  URL: {
    createObjectURL: () => '',
    revokeObjectURL: () => {}
  }
};
global.window = window;

const data = fs.readFileSync('E:/2d alyout/backend/uploads/models/RACKS_c5dafbfe.glb');
const buffer = new Uint8Array(data).buffer;

const loader = new GLTFLoader();
loader.parse(buffer, '', (gltf) => {
    const scene = gltf.scene;
    scene.updateMatrixWorld(true);
    
    const box = new THREE.Box3().setFromObject(scene);
    console.log("Native Dimensions (after node transforms):");
    console.log(`Min: X=${box.min.x.toFixed(3)}, Y=${box.min.y.toFixed(3)}, Z=${box.min.z.toFixed(3)}`);
    console.log(`Max: X=${box.max.x.toFixed(3)}, Y=${box.max.y.toFixed(3)}, Z=${box.max.z.toFixed(3)}`);
    console.log(`Span: X=${(box.max.x - box.min.x).toFixed(3)} meters / ${((box.max.x - box.min.x)*39.3701).toFixed(1)} inches`);
    console.log(`Span: Y=${(box.max.y - box.min.y).toFixed(3)} meters / ${((box.max.y - box.min.y)*39.3701).toFixed(1)} inches`);
    console.log(`Span: Z=${(box.max.z - box.min.z).toFixed(3)} meters / ${((box.max.z - box.min.z)*39.3701).toFixed(1)} inches`);
    
    // Count objects
    let meshes = 0;
    let groups = 0;
    scene.traverse((node) => {
        if (node.isMesh) meshes++;
        if (node.isGroup) groups++;
    });
    console.log(`Meshes: ${meshes}, Groups: ${groups}`);
    
}, (err) => {
    console.error(err);
});
