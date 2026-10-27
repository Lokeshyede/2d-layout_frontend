globalThis.self = globalThis;
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import fs from 'fs';

function analyzeGLB(path) {
    if (!fs.existsSync(path)) return;
    const buf = fs.readFileSync(path);
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
                    name: obj.name,
                    size: sz,
                    maxDim: Math.max(sz.x, sz.y, sz.z)
                });
            }
        });

        // Sort descending by maxDim
        meshes.sort((a,b) => b.maxDim - a.maxDim);

        console.log(`\n========================================`);
        console.log(`FILE: ${path}`);
        console.log(`Total Meshes: ${meshes.length}`);
        console.log(`Top 5 Largest Meshes:`);
        for (let i = 0; i < Math.min(5, meshes.length); i++) {
            console.log(`  ${i+1}. maxDim: ${meshes[i].maxDim.toFixed(2)}, size: [${meshes[i].size.x.toFixed(2)}, ${meshes[i].size.y.toFixed(2)}, ${meshes[i].size.z.toFixed(2)}] name: '${meshes[i].name}'`);
        }

        // Determine unit scale from the cluster of functional rack meshes (excluding >5m or >5000mm)
        // Find the median or typical rack component dimension:
        // A rack shelf is ~0.6m to ~1.5m (meters), or ~24" to ~48" (inches), or ~600 to ~1500 (mm).
        // An upright post is ~1.5m to ~2.5m (meters), or ~60" to ~96" (inches), or ~1500 to ~2500 (mm).
        
        // Let's filter out meshes that are obviously room-scale (> 5 meters equivalent):
        // If raw coords > 500: unit is mm. Threshold is 5000 mm.
        // If raw coords <= 500:
        //   Could be inches (uprights ~60-90, room shell > 200).
        //   Could be meters (uprights ~1.5-2.5, room shell > 5.0).
        
        let unit = 'meters';
        let scaleToInches = 39.3701;
        let auxThreshold = 5.0; // in raw units (5 meters)

        // Find the maximum dimension of meshes that are NOT giant shells (>5m if meters, >200 if inches, >5000 if mm)
        const largestMeshDim = meshes[0]?.maxDim || 0;
        if (largestMeshDim > 500) {
            unit = 'mm';
            scaleToInches = 1.0 / 25.4;
            auxThreshold = 5000.0;
        } else {
            // Check if there are meshes in the 30..150 range (inches) vs 0.5..3.0 range (meters)
            const inchLikeMeshes = meshes.filter(m => m.maxDim >= 15 && m.maxDim <= 150);
            const meterLikeMeshes = meshes.filter(m => m.maxDim >= 0.5 && m.maxDim <= 3.5);
            
            // If the majority of functional components are in 0.5..3.5 range, it's meters!
            if (meterLikeMeshes.length > inchLikeMeshes.length) {
                unit = 'meters';
                scaleToInches = 39.3701;
                auxThreshold = 5.0; // 5 meters
            } else {
                unit = 'inches';
                scaleToInches = 1.0;
                auxThreshold = 200.0; // 200 inches (~16.6 feet)
            }
        }

        console.log(`Detected Unit: ${unit}, scaleToInches: ${scaleToInches.toFixed(4)}, auxThreshold: ${auxThreshold}`);

        // Separate product meshes vs auxiliary meshes:
        const productMeshes = meshes.filter(m => m.maxDim <= auxThreshold);
        const auxMeshes = meshes.filter(m => m.maxDim > auxThreshold);

        console.log(`Product Meshes Count: ${productMeshes.length}, Auxiliary Meshes Count: ${auxMeshes.length}`);

        const productBox = new THREE.Box3();
        for (const pm of productMeshes) {
            productBox.expandByObject(pm.mesh);
        }
        const pSize = new THREE.Vector3();
        productBox.getSize(pSize);
        console.log(`Product Box Size in Raw Units: [${pSize.x.toFixed(2)}, ${pSize.y.toFixed(2)}, ${pSize.z.toFixed(2)}]`);
        console.log(`Product Box Size in Inches:    [${(pSize.x * scaleToInches).toFixed(2)}, ${(pSize.y * scaleToInches).toFixed(2)}, ${(pSize.z * scaleToInches).toFixed(2)}]`);
    });
}

analyzeGLB('backend/uploads/models/RACKS_a9a323ad.glb');
analyzeGLB('E:/Downloads/Croner rack.glb');
analyzeGLB('E:/Downloads/center rack.glb');
