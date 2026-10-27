globalThis.self = globalThis;
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import fs from 'fs';

const path = 'backend/uploads/models/center_rack_43898c26.glb';
const buf = fs.readFileSync(path);
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

const loader = new GLTFLoader();
loader.parse(ab, '', (gltf) => {
    const scene = gltf.scene;
    scene.updateMatrixWorld(true);

    const meshes = [];
    scene.traverse(o => {
        if (o.isMesh) {
            const b = new THREE.Box3().setFromObject(o);
            const sz = new THREE.Vector3();
            b.getSize(sz);
            const c = new THREE.Vector3();
            b.getCenter(c);
            meshes.push({
                name: o.name,
                min: [b.min.x, b.min.y, b.min.z],
                max: [b.max.x, b.max.y, b.max.z],
                sz: [sz.x, sz.y, sz.z],
                c: [c.x, c.y, c.z],
                mat: o.material?.name || 'none'
            });
        }
    });

    console.log(`Inspecting all ${meshes.length} meshes:`);
    meshes.forEach((m, idx) => {
        console.log(`[#${idx.toString().padStart(2, '0')}] ${m.name.padEnd(12)} | Mat: ${m.mat.padEnd(16)} | Size: [${m.sz.map(v=>(v*39.37).toFixed(1)).join('", ')}"] | Center: [${m.c.map(v=>(v*39.37).toFixed(1)).join('", ')}"]`);
    });
});
