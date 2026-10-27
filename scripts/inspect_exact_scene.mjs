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
    
    console.log("=== ROOT CHILDREN ===");
    for (let i = 0; i < scene.children.length; i++) {
        const c = scene.children[i];
        const b = new THREE.Box3().setFromObject(c);
        const s = new THREE.Vector3();
        b.getSize(s);
        console.log(`Child ${i}: name="${c.name}", type=${c.type}, size=(${s.x.toFixed(2)}, ${s.y.toFixed(2)}, ${s.z.toFixed(2)}) min=(${b.min.x.toFixed(2)}, ${b.min.y.toFixed(2)}, ${b.min.z.toFixed(2)}) max=(${b.max.x.toFixed(2)}, ${b.max.y.toFixed(2)}, ${b.max.z.toFixed(2)})`);
    }

    const assembly = scene.children[0];
    console.log("\n=== ASSEMBLY-41 CHILDREN ===");
    for (let i = 0; i < assembly.children.length; i++) {
        const c = assembly.children[i];
        const b = new THREE.Box3().setFromObject(c);
        const s = new THREE.Vector3();
        b.getSize(s);
        console.log(`  Child ${i}: name="${c.name}", type=${c.type}, children=${c.children.length}, size=(${s.x.toFixed(2)}, ${s.y.toFixed(2)}, ${s.z.toFixed(2)}) min=(${b.min.x.toFixed(2)}, ${b.min.y.toFixed(2)}, ${b.min.z.toFixed(2)}) max=(${b.max.x.toFixed(2)}, ${b.max.y.toFixed(2)}, ${b.max.z.toFixed(2)})`);
    }

    console.log("\n=== ALL MESHES IN SCENE ===");
    let meshIdx = 0;
    scene.traverse((obj) => {
        if (obj.isMesh) {
            const b = new THREE.Box3().setFromObject(obj);
            const s = new THREE.Vector3();
            b.getSize(s);
            const matName = Array.isArray(obj.material) ? obj.material.map(m=>m.name).join(', ') : obj.material?.name;
            console.log(`Mesh ${meshIdx++}: name="${obj.name}", parent="${obj.parent?.name}", mat="${matName}", size=(${s.x.toFixed(3)}, ${s.y.toFixed(3)}, ${s.z.toFixed(3)}), pos=(${b.min.x.toFixed(2)}, ${b.min.y.toFixed(2)}, ${b.min.z.toFixed(2)})`);
        }
    });
});
