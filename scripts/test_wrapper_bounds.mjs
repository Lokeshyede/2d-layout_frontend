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

    // Filter environment meshes
    const toRemove = [];
    scene.traverse((obj) => {
        if (obj.name && obj.name.toLowerCase().includes('active_view')) toRemove.push(obj);
        if (obj.isMesh) {
            const b = new THREE.Box3().setFromObject(obj);
            const s = new THREE.Vector3();
            b.getSize(s);
            if (Math.max(s.x, s.y, s.z) > 6.0) toRemove.push(obj);
        }
    });
    for (const r of toRemove) if (r.parent) r.parent.remove(r);
    scene.updateMatrixWorld(true);

    const cleanBox = new THREE.Box3().setFromObject(scene);
    const rawSize = new THREE.Vector3();
    cleanBox.getSize(rawSize);

    const nativeUnitScale = 39.37007874;
    const targetH = 84;
    const nativeH = rawSize.y * nativeUnitScale;
    const uniformRatio = targetH / nativeH;
    const totalUniformScale = uniformRatio * nativeUnitScale;

    // Test both wall-mounted and center modes
    for (const isWallMounted of [true, false]) {
        const clone = SkeletonUtils.clone(scene);
        clone.scale.set(totalUniformScale, totalUniformScale, totalUniformScale);
        clone.updateMatrixWorld(true);

        const wrapper = new THREE.Group();
        const orientGroup = new THREE.Group();
        orientGroup.rotation.y = Math.PI / 2; // RACKS (1).glb rotation
        orientGroup.add(clone);
        wrapper.add(orientGroup);
        wrapper.updateMatrixWorld(true);

        // Explicit alignment pass
        const obox = new THREE.Box3().setFromObject(orientGroup);
        const osize = new THREE.Vector3();
        obox.getSize(osize);
        const ocenter = new THREE.Vector3();
        obox.getCenter(ocenter);

        // Center on X
        orientGroup.position.x = -ocenter.x;
        // Ground on Y
        orientGroup.position.y = -obox.min.y;
        // Z: if wall-mounted, back at Z=0; if center, center on Z=0
        if (isWallMounted) {
            orientGroup.position.z = -obox.min.z;
        } else {
            orientGroup.position.z = -ocenter.z;
        }

        wrapper.updateMatrixWorld(true);
        const fbox = new THREE.Box3().setFromObject(wrapper);
        const fsize = new THREE.Vector3();
        fbox.getSize(fsize);

        console.log(`\n=== isWallMounted: ${isWallMounted} ===`);
        console.log("Wrapper Bounding Box:");
        console.log(`  X: [${fbox.min.x.toFixed(2)} to ${fbox.max.x.toFixed(2)}] (width: ${fsize.x.toFixed(2)}")`);
        console.log(`  Y: [${fbox.min.y.toFixed(2)} to ${fbox.max.y.toFixed(2)}] (height: ${fsize.y.toFixed(2)}")`);
        console.log(`  Z: [${fbox.min.z.toFixed(2)} to ${fbox.max.z.toFixed(2)}] (depth: ${fsize.z.toFixed(2)}")`);

        // Check back panel position
        let backPanel;
        clone.traverse((o) => {
            if (o.name === '3DGeom-7') backPanel = o;
        });
        const bpBox = new THREE.Box3().setFromObject(backPanel);
        console.log(`  BackPanel Z: [${bpBox.min.z.toFixed(2)} to ${bpBox.max.z.toFixed(2)}]`);
    }
});
