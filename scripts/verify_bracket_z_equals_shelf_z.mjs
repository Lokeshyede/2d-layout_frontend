import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import fs from 'fs';

globalThis.self = globalThis;
const buffer = fs.readFileSync('../backend/uploads/models/racks_1.glb');
const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

const loader = new GLTFLoader();
loader.parse(arrayBuffer, '', (gltf) => {
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);

  const assembly = scene.children[0].children[0];
  const innerNode = assembly.children[2].children[0];
  const leftUpright = innerNode.children[2];
  const rightUpright = innerNode.children[4];

  const templateShelf = innerNode.children[11];
  const templateLeftBracket = leftUpright.children[0];
  const templateRightBracket = rightUpright.children[0];

  const testZLevels = [15, 30, 45, 60, 72.938];

  console.log('=== TEST SETTING BRACKET Z = SHELF Z ===');
  testZLevels.forEach((z) => {
    const shelf = templateShelf.clone(true);
    shelf.position.z = z;
    innerNode.add(shelf);

    const lb = templateLeftBracket.clone(true);
    lb.position.z = z;
    leftUpright.add(lb);

    const rb = templateRightBracket.clone(true);
    rb.position.z = z;
    rightUpright.add(rb);

    scene.updateMatrixWorld(true);

    const sBox = new THREE.Box3().setFromObject(shelf);
    const lbBox = new THREE.Box3().setFromObject(lb);
    const rbBox = new THREE.Box3().setFromObject(rb);

    const gapLeftInches = (sBox.min.y - lbBox.max.y) * 39.3701;
    const gapRightInches = (sBox.min.y - rbBox.max.y) * 39.3701;

    console.log(`Level Z=${z}": shelfBottomY=${(sBox.min.y * 39.3701).toFixed(3)}" | lbTopY=${(lbBox.max.y * 39.3701).toFixed(3)}" (gap=${gapLeftInches.toFixed(4)}") | rbTopY=${(rbBox.max.y * 39.3701).toFixed(3)}" (gap=${gapRightInches.toFixed(4)}")`);
  });
});
