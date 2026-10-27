globalThis.self = globalThis;
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import fs from 'fs';

const glbPath = 'backend/uploads/models/RACKS_a9a323ad.glb';
const buf = fs.readFileSync(glbPath);
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

const loader = new GLTFLoader();
loader.parse(ab, '', (gltf) => {
    const scene = gltf.scene;
    scene.updateMatrixWorld(true);

    console.log('=== TEST 1: Current GLBCache Unit Detection on Scene ===');
    let preScanMaxDim = 0;
    scene.traverse((obj) => {
        if (!obj.isMesh) return;
        const box = new THREE.Box3().setFromObject(obj);
        const sz = new THREE.Vector3();
        box.getSize(sz);
        preScanMaxDim = Math.max(preScanMaxDim, sz.x, sz.y, sz.z);
    });

    let currentEstimatedScale = 39.37;
    if (preScanMaxDim > 150) currentEstimatedScale = 1 / 25.4;
    else if (preScanMaxDim > 10) currentEstimatedScale = 1.0;

    const currentAuxThreshold = (6.0 * 39.37) / currentEstimatedScale;

    console.log(`Current preScanMaxDim: ${preScanMaxDim.toFixed(2)}`);
    console.log(`Current estimatedNativeUnitScale: ${currentEstimatedScale} (INCORRECT: thinks it is inches!)`);
    console.log(`Current auxThresholdNative: ${currentAuxThreshold.toFixed(2)}`);

    let currentProductMeshes = 0;
    const currentProductBox = new THREE.Box3();
    scene.traverse((obj) => {
        if (obj.isMesh) {
            const box = new THREE.Box3().setFromObject(obj);
            const sz = new THREE.Vector3();
            box.getSize(sz);
            const maxDim = Math.max(sz.x, sz.y, sz.z);
            if (maxDim <= currentAuxThreshold) {
                currentProductBox.union(box);
                currentProductMeshes++;
            }
        }
    });
    const curPSize = new THREE.Vector3();
    currentProductBox.getSize(curPSize);
    console.log(`Current productMeshCount: ${currentProductMeshes} of 45 (INCORRECT: included all 4 auxiliary meshes!)`);
    console.log(`Current productBox size: [${curPSize.x.toFixed(2)}, ${curPSize.y.toFixed(2)}, ${curPSize.z.toFixed(2)}]`);

    console.log('\n=== TEST 2: Robust Unit Detection & Auxiliary Isolation ===');
    const allMeshes = [];
    scene.traverse((obj) => {
        if (obj.isMesh) {
            const box = new THREE.Box3().setFromObject(obj);
            const sz = new THREE.Vector3();
            box.getSize(sz);
            allMeshes.push({
                obj,
                box,
                size: sz,
                maxDim: Math.max(sz.x, sz.y, sz.z)
            });
        }
    });

    const largest = allMeshes.reduce((acc, m) => Math.max(acc, m.maxDim), 0);
    let robustScale = 39.37007874;
    let robustAuxThreshold = 5.0; // 5 meters

    if (largest > 500) {
        robustScale = 1.0 / 25.4;
        robustAuxThreshold = 5000.0;
    } else {
        const inchCount = allMeshes.filter(m => m.maxDim >= 15 && m.maxDim <= 150).length;
        const meterCount = allMeshes.filter(m => m.maxDim >= 0.5 && m.maxDim <= 3.5).length;
        if (meterCount >= inchCount && meterCount > 0) {
            robustScale = 39.37007874;
            robustAuxThreshold = 5.0;
        } else {
            robustScale = 1.0;
            robustAuxThreshold = 200.0;
        }
    }

    const robustProductBox = new THREE.Box3();
    let robustProductCount = 0;
    const robustAuxMeshes = [];

    allMeshes.forEach(m => {
        if (m.maxDim <= robustAuxThreshold) {
            robustProductBox.union(m.box);
            robustProductCount++;
        } else {
            robustAuxMeshes.push(m);
        }
    });

    const robPSize = new THREE.Vector3();
    robustProductBox.getSize(robPSize);
    console.log(`Robust productMeshCount: ${robustProductCount} of 45`);
    console.log(`Robust auxMeshesCount: ${robustAuxMeshes.length}`);
    console.log(`Robust productBox size: [${robPSize.x.toFixed(3)}, ${robPSize.y.toFixed(3)}, ${robPSize.z.toFixed(3)}] meters`);
    console.log(`Robust productBox size (inches): [${(robPSize.x * robustScale).toFixed(2)}", ${(robPSize.y * robustScale).toFixed(2)}", ${(robPSize.z * robustScale).toFixed(2)}"]`);

    console.log('\n=== TEST 3: Rotation and Scaling Pipeline ===');
    // If rotDegY = 90:
    // Native Z (38.22") becomes unscaledRotWidth
    // Native Y (85.04") becomes unscaledRotHeight
    // Native X (21.23") becomes unscaledRotDepth
    const nativeInchesW = robPSize.z * robustScale; // 38.22
    const nativeInchesH = robPSize.y * robustScale; // 85.04
    const nativeInchesD = robPSize.x * robustScale; // 21.23

    const targetW = 36.0;
    const targetH = 84.0;
    const targetD = 18.0;

    const baseW = 36.0;
    const baseH = 84.0;
    const baseD = 18.0;

    const stage1ScaleX = baseW / nativeInchesW;
    const stage1ScaleY = baseH / nativeInchesH;
    const stage1ScaleZ = baseD / nativeInchesD;

    const stage2ScaleX = targetW / baseW;
    const stage2ScaleY = targetH / baseH;
    const stage2ScaleZ = targetD / baseD;

    console.log(`Stage 1 Scale: X=${stage1ScaleX.toFixed(4)}, Y=${stage1ScaleY.toFixed(4)}, Z=${stage1ScaleZ.toFixed(4)}`);
    console.log(`Stage 2 Scale: X=${stage2ScaleX.toFixed(4)}, Y=${stage2ScaleY.toFixed(4)}, Z=${stage2ScaleZ.toFixed(4)}`);
    console.log(`Final Rendered Dimensions: W=${(nativeInchesW * stage1ScaleX * stage2ScaleX).toFixed(2)}", H=${(nativeInchesH * stage1ScaleY * stage2ScaleY).toFixed(2)}", D=${(nativeInchesD * stage1ScaleZ * stage2ScaleZ).toFixed(2)}"`);
});
