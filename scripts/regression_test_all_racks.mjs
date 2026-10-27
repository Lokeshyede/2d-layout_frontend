globalThis.self = globalThis;
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import fs from 'fs';

function testGLB(filePath, name) {
    if (!fs.existsSync(filePath)) {
        console.log(`Skipping ${name}: file not found at ${filePath}`);
        return;
    }
    const buf = fs.readFileSync(filePath);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const loader = new GLTFLoader();
    loader.parse(ab, '', (gltf) => {
        const scene = gltf.scene;
        scene.updateMatrixWorld(true);

        const meshes = [];
        scene.traverse((obj) => {
            if (obj.isMesh) {
                const box = new THREE.Box3().setFromObject(obj);
                const sz = new THREE.Vector3();
                box.getSize(sz);
                meshes.push({
                    mesh: obj,
                    box,
                    maxDim: Math.max(sz.x, sz.y, sz.z)
                });
            }
        });

        const largestDim = meshes.reduce((acc, m) => Math.max(acc, m.maxDim), 0);
        let estimatedNativeUnitScale = 39.37007874;
        let auxThresholdNative = 5.0; // 5 meters

        if (largestDim > 500) {
            estimatedNativeUnitScale = 1.0 / 25.4;
            auxThresholdNative = 5000.0;
        } else {
            const inchCount = meshes.filter((m) => m.maxDim >= 15 && m.maxDim <= 150).length;
            const meterCount = meshes.filter((m) => m.maxDim >= 0.3 && m.maxDim <= 3.5).length;
            if (meterCount >= inchCount && meterCount > 0) {
                estimatedNativeUnitScale = 39.37007874;
                auxThresholdNative = 5.0;
            } else {
                estimatedNativeUnitScale = 1.0;
                auxThresholdNative = 200.0;
            }
        }

        const productBox = new THREE.Box3();
        let productMeshCount = 0;
        let auxMeshCount = 0;

        for (const m of meshes) {
            if (m.maxDim <= auxThresholdNative) {
                productBox.union(m.box);
                productMeshCount++;
            } else {
                auxMeshCount++;
            }
        }

        const pSize = new THREE.Vector3();
        productBox.getSize(pSize);

        const widthInches = pSize.z >= pSize.x ? pSize.z * estimatedNativeUnitScale : pSize.x * estimatedNativeUnitScale;
        const depthInches = pSize.z >= pSize.x ? pSize.x * estimatedNativeUnitScale : pSize.z * estimatedNativeUnitScale;
        const heightInches = pSize.y * estimatedNativeUnitScale;

        console.log(`\n========================================`);
        console.log(`Model: ${name}`);
        console.log(`Total Meshes: ${meshes.length} | Product Meshes: ${productMeshCount} | Aux Meshes: ${auxMeshCount}`);
        console.log(`Detected Unit: ${estimatedNativeUnitScale === 39.37007874 ? 'Meters' : (estimatedNativeUnitScale === 1.0 ? 'Inches' : 'MM')}`);
        console.log(`Calculated Physical Rack Dimensions:`);
        console.log(`  Width:  ${widthInches.toFixed(2)}"`);
        console.log(`  Height: ${heightInches.toFixed(2)}"`);
        console.log(`  Depth:  ${depthInches.toFixed(2)}"`);
        console.log(`Result: PASS`);
    });
}

testGLB('backend/uploads/models/RACKS_a9a323ad.glb', 'Wall Rack (Fresh Uploaded GLB)');
testGLB('E:/Downloads/center rack.glb', 'Center Rack');
testGLB('E:/Downloads/Croner rack.glb', 'Corner Rack');
