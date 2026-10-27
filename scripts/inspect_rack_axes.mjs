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
    console.log("Assembly:", assembly.name);
    
    // Child 2 is the rack!
    const rackNode = assembly.children[2];
    console.log("Rack Node type:", rackNode.type, "children count:", rackNode.children.length);

    rackNode.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(rackNode);
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);

    console.log("=== RACK NODE BOUNDS (World Space) ===");
    console.log("Min:", box.min);
    console.log("Max:", box.max);
    console.log("Size (X, Y, Z):", size);
    console.log("Center:", center);

    // Let's see dimensions in inches (1 unit in GLTF = 1 meter):
    console.log("\nIf 1 unit = 1 meter (standard glTF):");
    console.log(`X: ${size.x.toFixed(4)} m = ${(size.x * 39.3701).toFixed(2)} inches (${(size.x * 3.28084).toFixed(2)} ft)`);
    console.log(`Y: ${size.y.toFixed(4)} m = ${(size.y * 39.3701).toFixed(2)} inches (${(size.y * 3.28084).toFixed(2)} ft)`);
    console.log(`Z: ${size.z.toFixed(4)} m = ${(size.z * 39.3701).toFixed(2)} inches (${(size.z * 3.28084).toFixed(2)} ft)`);

    // Let's check which axis corresponds to shelf length (width), shelf depth (depth), and rack height:
    // Notice:
    // Y: 0.00 to 2.16 m = 2.16 m = 85.04 inches = 7.08 feet! -> This is clearly HEIGHT (Y-up)!
    // Z: -46.51 to -45.54 = 0.972 m = 38.27 inches = 3.19 feet (~3 feet)! -> This is WIDTH (shelf run)!
    // X: 53.43 to 53.97 = 0.540 m = 21.26 inches = 1.77 feet (~21 inches / 1.75 ft)! -> This is DEPTH (shelf projection)!

    console.log("\n=== RACK GEOMETRY ORIENTATION ===");
    console.log("Height Axis: Y (2.16m = 7 ft)");
    console.log("Width Axis (shelf span): Z (0.97m = ~3 ft)");
    console.log("Depth Axis (shelf depth): X (0.54m = ~21 in)");
});
