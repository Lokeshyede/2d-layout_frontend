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

    // Let's inspect every single mesh in world space
    const meshStats = [];
    scene.traverse((obj) => {
        if (obj.isMesh) {
            const m = obj;
            const box = new THREE.Box3().setFromObject(m);
            const sz = new THREE.Vector3();
            box.getSize(sz);
            meshStats.push({
                mesh: m,
                name: m.name,
                parentName: m.parent?.name,
                box,
                size: sz,
                maxDim: Math.max(sz.x, sz.y, sz.z)
            });
        }
    });

    console.log("Total meshes:", meshStats.length);
    // Sort meshes by maxDim
    meshStats.sort((a,b) => b.maxDim - a.maxDim);
    console.log("Top 6 largest meshes:");
    for (let i = 0; i < Math.min(6, meshStats.length); i++) {
        const ms = meshStats[i];
        console.log(`  ${i+1}. name='${ms.name}', parent='${ms.parentName}', maxDim=${ms.maxDim.toFixed(2)}, size=[${ms.size.x.toFixed(2)}, ${ms.size.y.toFixed(2)}, ${ms.size.z.toFixed(2)}]`);
    }

    console.log("\nSmallest 5 meshes:");
    for (let i = meshStats.length - 5; i < meshStats.length; i++) {
        const ms = meshStats[i];
        console.log(`  ${i+1}. name='${ms.name}', parent='${ms.parentName}', maxDim=${ms.maxDim.toFixed(2)}, size=[${ms.size.x.toFixed(2)}, ${ms.size.y.toFixed(2)}, ${ms.size.z.toFixed(2)}]`);
    }

    // Notice:
    // Meshes 1..4 in largest meshes are:
    // 3DGeom-1 (28.31m)
    // 3DGeom-3 (27.56m)
    // 3DGeom-2 (26.80m)
    // mesh_44  (11.01m)
    // Then Mesh 5 (Mesh 6/18 - upright post) is: 2.16m!
    // The GAP between 11.01m/28.31m and 2.16m is ENORMOUS!
    // Any retail store rack is at most 3 meters (10 feet) tall and 1.5 meters wide!
    // Anything > 5.0 meters (16 feet) is a building/room shell!
});
