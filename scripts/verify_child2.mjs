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

    let rackMeshCount = 0;
    rackNode.traverse((obj) => {
        if (obj.isMesh) rackMeshCount++;
    });

    console.log(`Total meshes under Child 2: ${rackMeshCount}`);
    
    // Check if any other child has rack meshes
    for (let i = 0; i < assembly.children.length; i++) {
        if (i !== 2) {
            const other = assembly.children[i];
            let otherMeshCount = 0;
            other.traverse((obj) => {
                if (obj.isMesh) otherMeshCount++;
            });
            console.log(`Child ${i} (${other.name}): ${otherMeshCount} meshes`);
        }
    }
});
