globalThis.self = globalThis;
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import fs from 'fs';

function testShelfAxis(path, label) {
    if (!fs.existsSync(path)) return;
    const buf = fs.readFileSync(path);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const loader = new GLTFLoader();
    loader.parse(ab, '', (gltf) => {
        const scene = gltf.scene;
        scene.updateMatrixWorld(true);

        let zSpanCount = 0;
        let xSpanCount = 0;

        scene.traverse(obj => {
            if (obj.isMesh) {
                const box = new THREE.Box3().setFromObject(obj);
                const sz = new THREE.Vector3();
                box.getSize(sz);
                // A shelf or deck component has thickness along Y and spans horizontally:
                // max dimension between 0.3m and 3.0m, height/thickness < 0.15m
                const maxHoriz = Math.max(sz.x, sz.z);
                const minHoriz = Math.min(sz.x, sz.z);
                if (maxHoriz >= 0.4 && maxHoriz <= 3.5 && sz.y <= 0.15 && maxHoriz > minHoriz * 1.2) {
                    if (sz.z > sz.x) {
                        zSpanCount++;
                    } else if (sz.x > sz.z) {
                        xSpanCount++;
                    }
                }
            }
        });

        console.log(`[${label}] Shelves with Z > X: ${zSpanCount} | Shelves with X > Z: ${xSpanCount}`);
        const primaryWidthAxis = zSpanCount >= xSpanCount ? 'Z' : 'X';
        console.log(`  -> Primary Shelf Width Axis: ${primaryWidthAxis}`);
    });
}

testShelfAxis('backend/uploads/models/center_rack_43898c26.glb', 'Center Rack');
testShelfAxis('backend/uploads/models/RACKS_a9a323ad.glb', 'Wall Rack');
testShelfAxis('backend/uploads/models/Croner_rack_8a46ed65.glb', 'Corner Rack');
testShelfAxis('backend/uploads/models/endcap_7d6c5784.glb', 'Endcap Rack');
