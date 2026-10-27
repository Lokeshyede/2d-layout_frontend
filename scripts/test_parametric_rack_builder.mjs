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

    // Let's test findShelfAndBracketComponents logic:
    let candidateParent = null;

    scene.traverse((obj) => {
        if (candidateParent) return;
        if (obj.userData?.isShelfParent) {
            candidateParent = obj;
            return;
        }
        if (obj.name === 'Assembly-41' && obj.children[2]?.children?.[0]) {
            candidateParent = obj.children[2].children[0];
            return;
        }
    });

    console.log('Candidate Parent found:', candidateParent ? candidateParent.name || 'unnamed Node 5' : 'NONE');
    if (candidateParent) {
        console.log('Candidate Parent children count:', candidateParent.children.length);
        const RETAILFIX_SHELF_INDICES = [0, 12, 3, 9, 10, 11];
        const originalShelves = [];
        for (const idx of RETAILFIX_SHELF_INDICES) {
            if (candidateParent.children[idx]) {
                originalShelves.push({ idx, name: candidateParent.children[idx].name, posZ: candidateParent.children[idx].position.z });
            }
        }
        console.log('Shelves found at indices:', originalShelves);
        const leftUpright = candidateParent.children[2];
        const rightUpright = candidateParent.children[4];
        console.log('Left upright:', leftUpright ? `children=${leftUpright.children.length}` : 'NONE');
        console.log('Right upright:', rightUpright ? `children=${rightUpright.children.length}` : 'NONE');
    }
});
