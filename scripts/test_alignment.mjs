globalThis.self = globalThis;
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import fs from 'fs';

const glbBuffer = fs.readFileSync('E:/Downloads/RACKS (1).glb');
const arrayBuffer = glbBuffer.buffer.slice(glbBuffer.byteOffset, glbBuffer.byteOffset + glbBuffer.byteLength);

const loader = new GLTFLoader();
loader.parse(arrayBuffer, '', (gltf) => {
    const scene = gltf.scene;
    scene.updateMatrixWorld(true);

    const assembly = scene.children[0].children[0];
    const rackNode = assembly.children[2];

    // Clone rackNode
    const rackClone = SkeletonUtils.clone(rackNode);
    rackClone.updateMatrixWorld(true);

    // Initial bounds of rackClone
    const rawBox = new THREE.Box3().setFromObject(rackClone);
    const rawSize = new THREE.Vector3();
    rawBox.getSize(rawSize);
    console.log("Raw Rack Node Bounds:", rawBox.min, "to", rawBox.max);
    console.log("Raw Rack Node Size:", rawSize);

    // Notice:
    // rawSize.x = 0.539 m (depth)
    // rawSize.y = 2.160 m (height)
    // rawSize.z = 0.971 m (width)

    // Center the geometry around its local origin before applying rotation
    const rawCenter = new THREE.Vector3();
    rawBox.getCenter(rawCenter);

    // We want:
    // - Local X = Product WIDTH (from left upright to right upright)
    // - Local Y = Product HEIGHT (from bottom base to top of uprights)
    // - Local Z = Product DEPTH (from back panel to front shelf edge)
    // In raw rackNode:
    // Width was along Z
    // Height was along Y
    // Depth was along X
    // Back was at +X (53.90), Front was at -X (53.43)

    // Let's create a normalized container group
    const normalizedGroup = new THREE.Group();
    
    // First, offset rackClone so its center is at (0, 0, 0)
    rackClone.position.set(-rawCenter.x, -rawCenter.y, -rawCenter.z);

    const innerPivot = new THREE.Group();
    innerPivot.add(rackClone);

    // Rotate innerPivot around Y by -90 degrees (-PI/2):
    // If we rotate by -PI/2:
    // Old Z (width) -> New X
    // Old X (depth) -> New -Z
    // Since back was at +X, it goes to -Z!
    // Since front was at -X, it goes to +Z!
    innerPivot.rotation.y = -Math.PI / 2;
    innerPivot.updateMatrixWorld(true);

    const rotatedBox = new THREE.Box3().setFromObject(innerPivot);
    const rotatedSize = new THREE.Vector3();
    rotatedBox.getSize(rotatedSize);
    console.log("\nAfter -90 deg rotation around Y:");
    console.log("Rotated Size (X, Y, Z):", rotatedSize);
    console.log("Rotated Bounds Min:", rotatedBox.min);
    console.log("Rotated Bounds Max:", rotatedBox.max);

    // Now:
    // Width is along X: rotatedSize.x = 0.971 m = 38.2 inches!
    // Height is along Y: rotatedSize.y = 2.160 m = 85.0 inches!
    // Depth is along Z: rotatedSize.z = 0.539 m = 21.2 inches!
    // Back panel is at min Z (rotatedBox.min.z)!
    // Front shelf edge is at max Z (rotatedBox.max.z)!
    // Bottom of rack is at min Y (rotatedBox.min.y)!

    // Scale to CAD inches:
    // Uniform scale factor from meters to inches: 39.37007874
    const scaleToInches = 39.37007874;
    innerPivot.scale.set(scaleToInches, scaleToInches, scaleToInches);
    innerPivot.updateMatrixWorld(true);

    const inchBox = new THREE.Box3().setFromObject(innerPivot);
    const inchSize = new THREE.Vector3();
    inchBox.getSize(inchSize);
    console.log("\nAfter Uniform Scale to Inches:");
    console.log(`Width (X): ${inchSize.x.toFixed(2)} inches (~3.2 ft)`);
    console.log(`Height (Y): ${inchSize.y.toFixed(2)} inches (~7.1 ft)`);
    console.log(`Depth (Z): ${inchSize.z.toFixed(2)} inches (~1.8 ft)`);

    // Grounding:
    // To place bottom of rack exactly at Y = 0:
    // Position innerPivot so inchBox.min.y becomes 0!
    // And for wall racks, back edge at Z = 0:
    // Position innerPivot so inchBox.min.z becomes 0!
    // And X is centered:
    innerPivot.position.set(-inchBox.min.x - inchSize.x / 2, -inchBox.min.y, -inchBox.min.z);
    innerPivot.updateMatrixWorld(true);

    const finalBox = new THREE.Box3().setFromObject(innerPivot);
    console.log("\nFinal Grounded & Aligned Bounds in CAD units (inches):");
    console.log("Min:", finalBox.min);
    console.log("Max:", finalBox.max);
});
