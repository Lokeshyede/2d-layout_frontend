globalThis.self = globalThis;
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import fs from 'fs';

const glbPath = 'backend/uploads/models/center_rack_43898c26.glb';
const buf = fs.readFileSync(glbPath);
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

const loader = new GLTFLoader();
loader.parse(ab, '', (gltf) => {
    const scene = gltf.scene;
    scene.updateMatrixWorld(true);

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
        if (obj.children && obj.children.length >= 10) {
            const hasBaseDeck = obj.children[0] && obj.children[0].position.z !== undefined;
            if (hasBaseDeck && obj.children[2]?.children && obj.children[2].children.length >= 5) {
                candidateParent = obj;
            }
        }
    });

    console.log('Parametric candidate parent for Center Rack:', candidateParent ? candidateParent.name || 'Found' : 'NULL (Native Preserved)');
});
