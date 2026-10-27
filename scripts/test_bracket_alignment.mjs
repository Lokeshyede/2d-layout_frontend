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

  // Template bracket: child 0 of leftUpright and child 0 of rightUpright
  const templateLeftBracket = leftUpright.children[0];
  const templateRightBracket = rightUpright.children[0];

  // Test across multiple target heights (e.g. 20", 35", 50", 65", 80")
  const testHeights = [20, 35, 50, 65, 80];
  console.log('=== TEST BRACKET ALIGNMENT WITH SHELF AT ARBITRARY HEIGHTS ===');

  testHeights.forEach((targetZ) => {
    // Clone shelf
    const shelf = innerNode.children[11].clone(true);
    shelf.position.z = targetZ;
    innerNode.add(shelf);

    // Clone left bracket
    const lb = templateLeftBracket.clone(true);
    lb.position.z = targetZ + (81.349243 - 72.938); // Delta = 8.411243
    leftUpright.add(lb);

    // Clone right bracket
    const rb = templateRightBracket.clone(true);
    rb.position.z = targetZ + (81.349243 - 72.938);
    rightUpright.add(rb);

    scene.updateMatrixWorld(true);

    const sBox = new THREE.Box3().setFromObject(shelf);
    const lbBox = new THREE.Box3().setFromObject(lb);
    const rbBox = new THREE.Box3().setFromObject(rb);

    const sCenterY = (sBox.min.y + sBox.max.y) / 2;
    const lbCenterY = (lbBox.min.y + lbBox.max.y) / 2;
    const rbCenterY = (rbBox.min.y + rbBox.max.y) / 2;

    const diffLeft = (sCenterY - lbCenterY) * 39.3701; // convert meters to inches
    const diffRight = (sCenterY - rbCenterY) * 39.3701;

    console.log(`Target Z=${targetZ}": shelfCenterY=${(sCenterY * 39.3701).toFixed(3)}" | lbCenterY=${(lbCenterY * 39.3701).toFixed(3)}" (diff=${diffLeft.toFixed(3)}") | rbCenterY=${(rbCenterY * 39.3701).toFixed(3)}" (diff=${diffRight.toFixed(3)}")`);
  });
});
