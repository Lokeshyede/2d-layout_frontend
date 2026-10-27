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
    
    const productBox = new THREE.Box3();
    let productMeshCount = 0;
    
    scene.traverse((obj) => {
        if (obj.isMesh) {
            const b = new THREE.Box3().setFromObject(obj);
            const s = new THREE.Vector3();
            b.getSize(s);
            if (Math.max(s.x, s.y, s.z) <= 6.0) {
                productBox.union(b);
                productMeshCount++;
            }
        }
    });
    
    const size = new THREE.Vector3();
    productBox.getSize(size);
    console.log(`Product Meshes: ${productMeshCount}`);
    console.log(`Product Size (m): X=${size.x.toFixed(3)}, Y=${size.y.toFixed(3)}, Z=${size.z.toFixed(3)}`);
    console.log(`Product Size (in): X=${(size.x*39.3701).toFixed(2)}, Y=${(size.y*39.3701).toFixed(2)}, Z=${(size.z*39.3701).toFixed(2)}`);
});
