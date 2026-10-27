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

    scene.traverse(o => {
        if (o.isMesh && (o.name === '3DGeom-24' || o.name === '3DGeom-23' || o.name === '3DGeom-5')) {
            const b = new THREE.Box3().setFromObject(o);
            const sz = new THREE.Vector3();
            b.getSize(sz);
            const c = new THREE.Vector3();
            b.getCenter(c);
            console.log(`Mesh '${o.name}':`);
            console.log(`  Min: [${b.min.x.toFixed(3)}, ${b.min.y.toFixed(3)}, ${b.min.z.toFixed(3)}]`);
            console.log(`  Max: [${b.max.x.toFixed(3)}, ${b.max.y.toFixed(3)}, ${b.max.z.toFixed(3)}]`);
            console.log(`  Size: [${sz.x.toFixed(3)}, ${sz.y.toFixed(3)}, ${sz.z.toFixed(3)}]`);
            console.log(`  Center: [${c.x.toFixed(3)}, ${c.y.toFixed(3)}, ${c.z.toFixed(3)}]`);
        }
    });
});
