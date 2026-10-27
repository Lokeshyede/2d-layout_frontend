import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import fs from 'fs';
import path from 'path';

globalThis.self = globalThis;

// Simulate exact GLBCache hierarchy
const filePath = path.resolve('backend/uploads/models/racks_1.glb');
const buffer = fs.readFileSync(filePath);
const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

const loader = new GLTFLoader();
loader.parse(arrayBuffer, '', (gltf) => {
  const uploadedGLB = gltf.scene;

  // Remove auxiliary meshes > 6m
  const toRemove = [];
  uploadedGLB.traverse((c) => {
    if (c.isMesh) {
      const b = new THREE.Box3().setFromObject(c);
      const s = new THREE.Vector3(); b.getSize(s);
      if (Math.max(s.x, s.y, s.z) > 6.0) toRemove.push(c);
    }
  });
  toRemove.forEach((r) => r.removeFromParent());
  uploadedGLB.updateMatrixWorld(true);

  const pBox = new THREE.Box3().setFromObject(uploadedGLB);
  const pCenter = new THREE.Vector3(); pBox.getCenter(pCenter);
  const pSize = new THREE.Vector3(); pBox.getSize(pSize);

  // ModelAnchor
  const modelAnchor = new THREE.Group();
  modelAnchor.rotation.y = (90 * Math.PI) / 180;
  modelAnchor.add(uploadedGLB);

  // Offset
  uploadedGLB.position.z = -pCenter.z;
  uploadedGLB.position.y = -pBox.min.y;
  uploadedGLB.position.x = -pBox.max.x;

  // ModelRoot
  const modelRoot = new THREE.Group();
  modelRoot.add(modelAnchor);

  const baseW = 36, baseH = 84, baseD = 24;
  const targetW = 36, targetH = 84, targetD = 24;

  const unscaledRotWidth = pSize.z * 39.3701;
  const unscaledRotHeight = pSize.y * 39.3701;
  const unscaledRotDepth = pSize.x * 39.3701;

  const stage1ScaleX = baseW / unscaledRotWidth;
  const stage1ScaleY = baseH / unscaledRotHeight;
  const stage1ScaleZ = baseD / unscaledRotDepth;

  const stage2ScaleX = targetW / baseW;
  const stage2ScaleY = targetH / baseH;
  const stage2ScaleZ = targetD / baseD;

  const totalScaleY = stage1ScaleY * stage2ScaleY;
  modelRoot.scale.set(
    stage1ScaleX * stage2ScaleX,
    totalScaleY,
    stage1ScaleZ * stage2ScaleZ
  );

  const rackInstance = new THREE.Group();
  rackInstance.add(modelRoot);
  rackInstance.updateMatrixWorld(true);

  // Find candidate shelf parent
  let shelfParent;
  uploadedGLB.traverse((obj) => {
    if (!shelfParent && obj.name === 'Assembly-41' && obj.children[2]?.children?.[0]) {
      shelfParent = obj.children[2].children[0];
    }
  });

  const shelf = shelfParent.children[11]; // Shelf 11
  console.log('--- TEST A: localZ = 72.9376 (unmodified native) ---');
  shelf.position.z = 72.9376;
  rackInstance.updateMatrixWorld(true);
  const boxA = new THREE.Box3().setFromObject(shelf);
  console.log('World Box Y (m):', boxA.min.y, 'to', boxA.max.y);
  console.log('World Box Y (inches):', (boxA.min.y * 39.3701).toFixed(4), 'to', (boxA.max.y * 39.3701).toFixed(4));

  console.log('\n--- TEST B: localZ = placement.y / stage2ScaleY (current builder code) with placement.y = 72.9376 ---');
  shelf.position.z = 72.9376 / stage2ScaleY;
  rackInstance.updateMatrixWorld(true);
  const boxB = new THREE.Box3().setFromObject(shelf);
  console.log('World Box Y (inches):', (boxB.min.y * 39.3701).toFixed(4), 'to', (boxB.max.y * 39.3701).toFixed(4));

  console.log('\n--- TEST C: localZ = placement.y / totalScaleY with placement.y = 72.9376 ---');
  shelf.position.z = 72.9376 / totalScaleY;
  rackInstance.updateMatrixWorld(true);
  const boxC = new THREE.Box3().setFromObject(shelf);
  console.log('World Box Y (inches):', (boxC.min.y * 39.3701).toFixed(4), 'to', (boxC.max.y * 39.3701).toFixed(4));
});
