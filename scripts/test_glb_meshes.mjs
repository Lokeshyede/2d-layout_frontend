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
    
    console.log("=== ALL VALID PRODUCT MESHES ===");
    let productMeshCount = 0;
    
    scene.traverse((obj) => {
        if (obj.isMesh) {
            const b = new THREE.Box3().setFromObject(obj);
            const s = new THREE.Vector3();
            b.getSize(s);
            if (Math.max(s.x, s.y, s.z) <= 6.0) {
                const matName = Array.isArray(obj.material) ? obj.material.map(m=>m.name).join(', ') : obj.material?.name;
                console.log(`Mesh ${productMeshCount++}: name="${obj.name}", mat="${matName}", size=(${s.x.toFixed(3)}, ${s.y.toFixed(3)}, ${s.z.toFixed(3)})`);
            }
        }
    });
});
