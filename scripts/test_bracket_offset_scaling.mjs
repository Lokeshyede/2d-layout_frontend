import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import fs from 'fs';
import path from 'path';

globalThis.self = globalThis;

function getExactObjectBounds(obj) {
  let min = new THREE.Vector3(Infinity, Infinity, Infinity);
  let max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);

  obj.traverse((child) => {
    if (child.isMesh && child.geometry && child.visible) {
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

  // Detach aux meshes > 6m
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

  const baseW = 36, baseH = 84, baseD = 24;
  const unscaledRotWidth = pSize.z * 39.3701;
  const unscaledRotHeight = pSize.y * 39.3701;
  const unscaledRotDepth = pSize.x * 39.3701;

  const stage1ScaleX = baseW / unscaledRotWidth;
  const stage1ScaleY = baseH / unscaledRotHeight;
  const stage1ScaleZ = baseD / unscaledRotDepth;

  let innerNode;
  uploadedGLB.traverse((obj) => {
    if (!innerNode && obj.name === 'Assembly-41' && obj.children[2]?.children?.[0]) {
      innerNode = obj.children[2].children[0];
    }
  });

  const templateShelf = innerNode.children[11];
  const leftUpright = innerNode.children[2];
  const templateLeftBracket = leftUpright.children[0];

  for (const targetH of [84, 96, 60]) {
    console.log(`\n--- TESTING targetH = ${targetH}" ---`);
    const modelAnchor = new THREE.Group();
    modelAnchor.rotation.y = (90 * Math.PI) / 180;
    modelAnchor.add(uploadedGLB);

    uploadedGLB.position.z = -pCenter.z;
    uploadedGLB.position.y = -pBox.min.y;
    uploadedGLB.position.x = -pBox.max.x;

    const modelRoot = new THREE.Group();
    modelRoot.add(modelAnchor);

    const stage2ScaleY = targetH / baseH;
    const totalScaleY = stage1ScaleY * stage2ScaleY;

    modelRoot.scale.set(stage1ScaleX, totalScaleY, stage1ScaleZ);
    const rackInstance = new THREE.Group();
    rackInstance.add(modelRoot);

    const targetShelfY = targetH * 0.5; // halfway up the rack
    const localZ = targetShelfY / totalScaleY;

    // Shelf
    const shelf = templateShelf.clone(true);
    shelf.position.z = localZ;
    shelf.position.y = 4.96;
    innerNode.add(shelf);

    // Option 1: localZ + 8.41162 (constant in native GLB units)
    const lb1 = templateLeftBracket.clone(true);
    lb1.position.set(0.5822, 11.3325, localZ + 8.41162);
    lb1.rotation.set(2.339487, -1.557494, -1.590032);
    leftUpright.add(lb1);

    rackInstance.updateMatrixWorld(true);

    const sBounds = getExactObjectBounds(shelf);
    const lb1Bounds = getExactObjectBounds(lb1);

    const sBottom = sBounds.min.y * 39.3701;
    const sTop = sBounds.max.y * 39.3701;
    const lb1Top = lb1Bounds.max.y * 39.3701;

    console.log(`Shelf World Y: ${sBottom.toFixed(3)}" to ${sTop.toFixed(3)}" (H = ${(sTop - sBottom).toFixed(3)}")`);
    console.log(`Bracket 1 Top Y: ${lb1Top.toFixed(3)}" (delta to shelf bottom: ${(lb1Top - sBottom).toFixed(3)}")`);

    shelf.removeFromParent();
    lb1.removeFromParent();
  }
});
