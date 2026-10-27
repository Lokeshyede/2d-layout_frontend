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

    const box = new THREE.Box3().setFromObject(scene);
    const sz = new THREE.Vector3();
    box.getSize(sz);
    const center = new THREE.Vector3();
    box.getCenter(center);

    console.log('Center Rack Raw Bounding Box:');
    console.log('  Min:', [box.min.x.toFixed(4), box.min.y.toFixed(4), box.min.z.toFixed(4)]);
    console.log('  Max:', [box.max.x.toFixed(4), box.max.y.toFixed(4), box.max.z.toFixed(4)]);
    console.log('  Size (meters):', [sz.x.toFixed(4), sz.y.toFixed(4), sz.z.toFixed(4)]);
    console.log('  Size (inches):', [(sz.x * 39.3701).toFixed(2), (sz.y * 39.3701).toFixed(2), (sz.z * 39.3701).toFixed(2)]);
    console.log('  Center:', [center.x.toFixed(4), center.y.toFixed(4), center.z.toFixed(4)]);

    // Check meshes
    const meshes = [];
    scene.traverse(o => {
        if (o.isMesh) {
            const mbox = new THREE.Box3().setFromObject(o);
            const msz = new THREE.Vector3();
            mbox.getSize(msz);
            meshes.push({ name: o.name, sz: msz, maxDim: Math.max(msz.x, msz.y, msz.z), pos: o.position, rot: o.rotation, scale: o.scale });
        }
    });
    console.log('Total Meshes:', meshes.length);
    meshes.sort((a,b) => b.maxDim - a.maxDim);
    console.log('Top 10 Meshes:');
    meshes.slice(0, 10).forEach((m, idx) => console.log(`  ${idx+1}. ${m.name} size: [${m.sz.x.toFixed(2)}, ${m.sz.y.toFixed(2)}, ${m.sz.z.toFixed(2)}] maxDim: ${m.maxDim.toFixed(2)}`));

    // Specifically identify the shelves:
    // A shelf extends across rack width.
    console.log('\nExamining Shelves in Center Rack:');
    const shelfMeshes = meshes.filter(m => m.maxDim >= 0.8 && m.sz.y < 0.1);
    shelfMeshes.forEach(s => {
        console.log(`  Shelf '${s.name}': X span=${(s.sz.x*39.37).toFixed(1)}", Y thick=${(s.sz.y*39.37).toFixed(1)}", Z span=${(s.sz.z*39.37).toFixed(1)}"`);
    });

    // Uprights:
    console.log('\nExamining Uprights in Center Rack:');
    const uprightMeshes = meshes.filter(m => m.sz.y > 1.0);
    uprightMeshes.forEach(u => {
        console.log(`  Upright '${u.name}': X=${(u.sz.x*39.37).toFixed(1)}", Y height=${(u.sz.y*39.37).toFixed(1)}", Z=${(u.sz.z*39.37).toFixed(1)}"`);
    });
});
