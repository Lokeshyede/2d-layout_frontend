import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import fs from 'fs';
import path from 'path';

globalThis.self = globalThis;

function getExactObjectBounds(obj) {
  let min = new THREE.Vector3(Infinity, Infinity, Infinity);
  let max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);

  obj.traverse((child) => {
    if (child.isMesh && child.geometry) {
      const posAttr = child.geometry.attributes.position;
      for (let i = 0; i < posAttr.count; i++) {
        const v = new THREE.Vector3().fromBufferAttribute(posAttr, i);
        v.applyMatrix4(child.matrixWorld);
        min.min(v);
        max.max(v);
      }
    }
  });

  return { min, max, size: max.clone().sub(min) };
}

const filePath = path.resolve('backend/uploads/models/racks_1.glb');
const buffer = fs.readFileSync(filePath);
const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

const loader = new GLTFLoader();
loader.parse(arrayBuffer, '', (gltf) => {
  const uploadedGLB = gltf.scene;

  // Remove aux
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

  const unscaledRotWidth = pSize.z * 39.3701;
  const unscaledRotHeight = pSize.y * 39.3701;
  const unscaledRotDepth = pSize.x * 39.3701;

  const baseW = 36, baseH = 84, baseD = 24;

  let innerNode;
  uploadedGLB.traverse((obj) => {
    if (!innerNode && obj.name === 'Assembly-41' && obj.children[2]?.children?.[0]) {
      innerNode = obj.children[2].children[0];
    }
  });

  const leftUpright = innerNode.children[2];
  const rightUpright = innerNode.children[4];

  // Test across widths: 36" (3'), 42" (3'6"), 48" (4')
  // and depths: 24" (2'), 30" (2'6"), 36" (3')
  const testConfigs = [
    { targetW: 36, targetH: 84, targetD: 24 },
    { targetW: 42, targetH: 84, targetD: 24 },
    { targetW: 48, targetH: 84, targetD: 24 },
    { targetW: 36, targetH: 84, targetD: 30 },
    { targetW: 36, targetH: 84, targetD: 36 },
  ];

  for (const cfg of testConfigs) {
    const modelAnchor = new THREE.Group();
    modelAnchor.rotation.y = (90 * Math.PI) / 180;
    modelAnchor.add(uploadedGLB);

    uploadedGLB.position.z = -pCenter.z;
    uploadedGLB.position.y = -pBox.min.y;
    uploadedGLB.position.x = -pBox.max.x;

    const modelRoot = new THREE.Group();
    modelRoot.add(modelAnchor);

    const stage1ScaleX = baseW / unscaledRotWidth;
    const stage1ScaleY = baseH / unscaledRotHeight;
    const stage1ScaleZ = baseD / unscaledRotDepth;

    const stage2ScaleX = cfg.targetW / baseW;
    const stage2ScaleY = cfg.targetH / baseH;
    const stage2ScaleZ = cfg.targetD / baseD;

    modelRoot.scale.set(
      stage1ScaleX * stage2ScaleX,
      stage1ScaleY * stage2ScaleY,
      stage1ScaleZ * stage2ScaleZ
    );

    const rackInstance = new THREE.Group();
    rackInstance.add(modelRoot);
    rackInstance.updateMatrixWorld(true);

    const rBox = getExactObjectBounds(rackInstance);
    const luBox = getExactObjectBounds(leftUpright);
    const ruBox = getExactObjectBounds(rightUpright);
    const shelf11 = innerNode.children[11];
    const sBox = getExactObjectBounds(shelf11);

    console.log(`\nConfig: W=${cfg.targetW}", H=${cfg.targetH}", D=${cfg.targetD}"`);
    console.log(`  Overall Rack Box Size: W=${(rBox.size.x * 39.3701).toFixed(2)}", H=${(rBox.size.y * 39.3701).toFixed(2)}", D=${(rBox.size.z * 39.3701).toFixed(2)}"`);
    console.log(`  Shelf Width (CAD X): ${(sBox.size.x * 39.3701).toFixed(2)}" [Range: ${(sBox.min.x * 39.3701).toFixed(2)}" to ${(sBox.max.x * 39.3701).toFixed(2)}"]`);
    console.log(`  Left Upright X pos: ${(luBox.min.x * 39.3701).toFixed(2)}" to ${(luBox.max.x * 39.3701).toFixed(2)}"`);
    console.log(`  Right Upright X pos: ${(ruBox.min.x * 39.3701).toFixed(2)}" to ${(ruBox.max.x * 39.3701).toFixed(2)}"`);
    console.log(`  Shelf Depth (CAD Z): ${(sBox.size.z * 39.3701).toFixed(2)}" [Range: ${(sBox.min.z * 39.3701).toFixed(2)}" to ${(sBox.max.z * 39.3701).toFixed(2)}"]`);
  }
});
