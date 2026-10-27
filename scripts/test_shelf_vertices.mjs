globalThis.self = globalThis;
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import fs from 'fs';

const glbBuffer = fs.readFileSync(process.argv[2]);
const arrayBuffer = glbBuffer.buffer.slice(glbBuffer.byteOffset, glbBuffer.byteOffset + glbBuffer.byteLength);

const loader = new GLTFLoader();
loader.parse(arrayBuffer, '', (gltf) => {
    const scene = gltf.scene;
    scene.updateMatrixWorld(true);
    
    scene.traverse((obj) => {
        if (obj.isMesh && obj.name === '3DGeom-6') {
            const b = new THREE.Box3().setFromObject(obj);
            console.log(`Shelf 3DGeom-6 Bounds: Min X=${b.min.x.toFixed(3)}, Z=${b.min.z.toFixed(3)} | Max X=${b.max.x.toFixed(3)}, Z=${b.max.z.toFixed(3)}`);
        }
        if (obj.isMesh && obj.name === '3DGeom-2') {
            const b = new THREE.Box3().setFromObject(obj);
            console.log(`Upright 3DGeom-2 Bounds: Min X=${b.min.x.toFixed(3)}, Z=${b.min.z.toFixed(3)} | Max X=${b.max.x.toFixed(3)}, Z=${b.max.z.toFixed(3)}`);
        }
    });
});
