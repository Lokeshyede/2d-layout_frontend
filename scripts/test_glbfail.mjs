globalThis.self = globalThis;
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import fs from 'fs';

const glbBuffer = fs.readFileSync('../backend/uploads/models/RACKS_a9a323ad.glb');
const arrayBuffer = glbBuffer.buffer.slice(glbBuffer.byteOffset, glbBuffer.byteOffset + glbBuffer.byteLength);

const loader = new GLTFLoader();
loader.parse(arrayBuffer, '', (gltf) => {
    const scene = gltf.scene;
    scene.updateMatrixWorld(true);

    let totalMeshCount = 0;
    const meshDetails = [];
    scene.traverse((obj) => {
        if (obj.isMesh) {
            totalMeshCount++;
            const m = obj;
            const box = new THREE.Box3().setFromObject(m);
            const sz = new THREE.Vector3();
            box.getSize(sz);
            meshDetails.push({
                name: m.name,
                parentName: m.parent?.name,
                materialName: Array.isArray(m.material) ? m.material.map(x=>x.name) : m.material?.name,
                size: sz,
                maxDim: Math.max(sz.x, sz.y, sz.z)
            });
        }
    });

    console.log("Total meshes in scene:", totalMeshCount);
    console.log("\nMeshes with maxDim > 5.0 meters:");
    for (const md of meshDetails) {
        if (md.maxDim > 5.0) {
            console.log(`  Mesh: '${md.name}', parent: '${md.parentName}', mat: '${md.materialName}', maxDim: ${md.maxDim.toFixed(2)}m, size: [${md.size.x.toFixed(2)}, ${md.size.y.toFixed(2)}, ${md.size.z.toFixed(2)}]`);
        }
    }

    console.log("\nMeshes with maxDim <= 5.0 meters (Count: " + meshDetails.filter(x=>x.maxDim <= 5.0).length + "):");

    // Now test what analyzeSceneProductBounds does:
    let preScanMaxDim = 0;
    scene.traverse((obj) => {
        if (!obj.isMesh) return;
        const box = new THREE.Box3().setFromObject(obj);
        const sz = new THREE.Vector3();
        box.getSize(sz);
        preScanMaxDim = Math.max(preScanMaxDim, sz.x, sz.y, sz.z);
    });
    console.log("\npreScanMaxDim:", preScanMaxDim);

    let estimatedNativeUnitScale = 39.37;
    if (preScanMaxDim > 150) {
        estimatedNativeUnitScale = 1 / 25.4;
    } else if (preScanMaxDim > 10) {
        estimatedNativeUnitScale = 1.0;
    }
    console.log("estimatedNativeUnitScale:", estimatedNativeUnitScale);

    const AUX_THRESHOLD_INCHES = 6.0 * 39.37;
    const auxThresholdNative = AUX_THRESHOLD_INCHES / estimatedNativeUnitScale;
    console.log("auxThresholdNative:", auxThresholdNative);

    const productBox = new THREE.Box3();
    let productMeshCount = 0;
    scene.traverse((obj) => {
        if (obj.isMesh) {
            const m = obj;
            const mBox = new THREE.Box3().setFromObject(m);
            const mSize = new THREE.Vector3();
            mBox.getSize(mSize);
            const maxMeshDim = Math.max(mSize.x, mSize.y, mSize.z);
            if (maxMeshDim <= auxThresholdNative) {
                productBox.union(mBox);
                productMeshCount++;
            }
        }
    });

    const pSize = new THREE.Vector3();
    productBox.getSize(pSize);
    console.log("\nproductMeshCount:", productMeshCount);
    console.log("productBox Min:", productBox.min);
    console.log("productBox Max:", productBox.max);
    console.log("productBox Size:", pSize);

    // Now test detachment:
    const auxiliaryMeshes = [];
    scene.traverse((child) => {
        if (child.isMesh) {
            const m = child;
            const mBox = new THREE.Box3().setFromObject(m);
            const mSize = new THREE.Vector3();
            mBox.getSize(mSize);
            const maxDim = Math.max(mSize.x, mSize.y, mSize.z);
            const name = (m.name || child.parent?.name || '').toLowerCase();
            const matName = m.material ? (Array.isArray(m.material) ? m.material.map(mat => mat.name || '').join(' ') : (m.material.name || '')) : '';
            const isArchShell = /room|floor|ceiling|wall|building|terrain|environment/i.test(name + ' ' + matName);
            if (maxDim > auxThresholdNative && isArchShell) {
                auxiliaryMeshes.push(child);
            }
        }
    });
    console.log("\nAuxiliary meshes identified for removal:", auxiliaryMeshes.length);
    for (const a of auxiliaryMeshes) {
        console.log(`  Removed: '${a.name}', parent: '${a.parent?.name}', mat: '${a.material?.name}'`);
    }
});
