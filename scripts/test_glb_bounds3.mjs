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
    
    scene.traverse((obj) => {
        if (obj.isMesh) {
            const b = new THREE.Box3().setFromObject(obj);
            const s = new THREE.Vector3();
            b.getSize(s);
            if (Math.max(s.x, s.y, s.z) <= 6.0) {
                productBox.union(b);
            }
        }
    });
    
    console.log(`Min (m): X=${productBox.min.x.toFixed(3)}, Y=${productBox.min.y.toFixed(3)}, Z=${productBox.min.z.toFixed(3)}`);
    console.log(`Max (m): X=${productBox.max.x.toFixed(3)}, Y=${productBox.max.y.toFixed(3)}, Z=${productBox.max.z.toFixed(3)}`);
});
