globalThis.self = globalThis;
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import fs from 'fs';

const glbBuffer = fs.readFileSync('E:/Downloads/RACKS (1).glb');
const arrayBuffer = glbBuffer.buffer.slice(glbBuffer.byteOffset, glbBuffer.byteOffset + glbBuffer.byteLength);

const loader = new GLTFLoader();
loader.parse(arrayBuffer, '', (gltf) => {
    const scene = gltf.scene;
    scene.updateMatrixWorld(true);

    const assembly = scene.children[0].children[0];
    const rackNode = assembly.children[2];

    console.log("=== RACK CHILD MESHES ===");
    rackNode.traverse((obj) => {
        if (obj.isMesh) {
            const b = new THREE.Box3().setFromObject(obj);
            const s = new THREE.Vector3();
            b.getSize(s);
            console.log(`Mesh: name="${obj.name}", size=(${s.x.toFixed(3)}, ${s.y.toFixed(3)}, ${s.z.toFixed(3)}), X=[${b.min.x.toFixed(3)} to ${b.max.x.toFixed(3)}], Z=[${b.min.z.toFixed(3)} to ${b.max.z.toFixed(3)}]`);
        }
    });
});
