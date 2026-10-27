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
    
    // Remove children that are not the rack
    // Children 3, 4, 5, 6 are room planes
    // Children 0, 1 are dummy/view
    const toRemove = [];
    for (let i = 0; i < assembly.children.length; i++) {
        if (i !== 2) {
            toRemove.push(assembly.children[i]);
        }
    }
    for (const obj of toRemove) {
        assembly.remove(obj);
    }

    scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(scene);
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);

    console.log("=== SCENE WITH ONLY RACK ===");
    console.log("Bounds Min:", box.min);
    console.log("Bounds Max:", box.max);
    console.log("Size in Meters:", size);
    console.log("Size in Inches:", new THREE.Vector3(size.x * 39.3701, size.y * 39.3701, size.z * 39.3701));
    console.log("Center in Meters:", center);

    // Now let's see:
    // Width is Z (0.971 m = 38.2 in)
    // Height is Y (2.160 m = 85.0 in)
    // Depth is X (0.539 m = 21.2 in)
    // If we want Width along X and Depth along Z:
    // We rotate scene around Y by -90 deg!
    const wrapper = new THREE.Group();
    // Move scene so its center is at (0, 0, 0)
    scene.position.set(-center.x, -center.y, -center.z);
    
    const pivot = new THREE.Group();
    pivot.add(scene);
    pivot.rotation.y = -Math.PI / 2;
    pivot.updateMatrixWorld(true);

    const rotBox = new THREE.Box3().setFromObject(pivot);
    const rotSize = new THREE.Vector3();
    rotBox.getSize(rotSize);

    console.log("\n=== ROTATED BY -90 DEG (Width along X, Depth along Z) ===");
    console.log("Rotated Size in Meters:", rotSize);
    console.log("Rotated Size in Inches:", new THREE.Vector3(rotSize.x * 39.3701, rotSize.y * 39.3701, rotSize.z * 39.3701));
    console.log("Rotated Min:", rotBox.min);
    console.log("Rotated Max:", rotBox.max);

    // Notice:
    // rotSize.x = 0.9709 m (38.2 inches WIDTH!)
    // rotSize.y = 2.1600 m (85.0 inches HEIGHT!)
    // rotSize.z = 0.5391 m (21.2 inches DEPTH!)
    // And rotBox.min.z is the back panel!
    // rotBox.max.z is the front of the shelves!
    // rotBox.min.y is the floor!
});
