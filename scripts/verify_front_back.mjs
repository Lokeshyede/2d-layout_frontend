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

    const box = new THREE.Box3().setFromObject(rackNode);
    const center = new THREE.Vector3();
    box.getCenter(center);

    // Let's find 3DGeom-7 (back panel) and 3DGeom-4 (base shelf)
    let backPanel, shelf;
    rackNode.traverse((o) => {
        if (o.name === '3DGeom-7') backPanel = o;
        if (o.name === '3DGeom-4') shelf = o;
    });

    const bBox = new THREE.Box3().setFromObject(backPanel);
    const sBox = new THREE.Box3().setFromObject(shelf);

    console.log("Native Back Panel X:", bBox.min.x, "to", bBox.max.x);
    console.log("Native Shelf X:", sBox.min.x, "to", sBox.max.x);

    // Native: Back panel is at X = 53.89, Shelf extends forward to X = 53.43
    // In local coords relative to center (cx = 53.70):
    // Back panel: x - cx = +0.19
    // Shelf front: x - cx = -0.27

    // When rotated around Y by -90 deg (-PI/2):
    // newX = oldZ
    // newZ = -oldX
    // For Back panel: newZ = -(+0.19) = -0.19 (at back / negative Z!)
    // For Shelf front: newZ = -(-0.27) = +0.27 (at front / positive Z!)

    console.log("After -90 deg rotation around Y:");
    console.log("Back panel Z is negative (-0.19), Shelf front Z is positive (+0.27)!");
});
