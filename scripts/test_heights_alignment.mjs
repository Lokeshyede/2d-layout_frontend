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

  const modelAnchor = new THREE.Group();
  modelAnchor.rotation.y = (90 * Math.PI) / 180;
  modelAnchor.add(uploadedGLB);

  uploadedGLB.position.z = -pCenter.z;
  uploadedGLB.position.y = -pBox.min.y;
  uploadedGLB.position.x = -pBox.max.x;

  const modelRoot = new THREE.Group();
  modelRoot.add(modelAnchor);

  // Test across heights: 84" (7') and 96" (8')
  for (const targetH of [84, 96]) {
    console.log(`\n============================================================`);
    console.log(`TESTING RACK HEIGHT: ${targetH}"`);
    console.log(`============================================================`);

    const baseW = 36, baseH = 84, baseD = 24;
    const targetW = 36, targetD = 24;

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

    let innerNode;
    uploadedGLB.traverse((obj) => {
      if (!innerNode && obj.name === 'Assembly-41' && obj.children[2]?.children?.[0]) {
        innerNode = obj.children[2].children[0];
      }
    });

    const leftUpright = innerNode.children[2];
    const rightUpright = innerNode.children[4];

    // Let's test a shelf at target Y = 40.0"
    const targetY = 40.0;
    const localZ = targetY / totalScaleY;

    const shelf = innerNode.children[11].clone(true);
    shelf.position.z = localZ;
    shelf.position.y = 4.96;
    innerNode.add(shelf);

    const templateLeftBracket = leftUpright.children[0];
    const lb = templateLeftBracket.clone(true);
    lb.position.set(0.5822, 11.3325, localZ + 8.41162);
    lb.rotation.set(2.339487, -1.557494, -1.590032);
    leftUpright.add(lb);

    const templateRightBracket = rightUpright.children[0];
    const rb = templateRightBracket.clone(true);
    rb.position.set(0.5822, 11.3325, localZ + 8.41162);
    rb.rotation.set(2.339487, -1.557494, -1.590032);
    rightUpright.add(rb);

    rackInstance.updateMatrixWorld(true);

    const sBounds = getExactObjectBounds(shelf);
    const lbBounds = getExactObjectBounds(lb);
    const rbBounds = getExactObjectBounds(rb);

    console.log(`Target Y: ${targetY}"`);
    console.log(`Shelf World Y: min = ${(sBounds.min.y * 39.3701).toFixed(4)}", max = ${(sBounds.max.y * 39.3701).toFixed(4)}"`);
    console.log(`Left Bracket World Y: min = ${(lbBounds.min.y * 39.3701).toFixed(4)}", max = ${(lbBounds.max.y * 39.3701).toFixed(4)}"`);
    console.log(`Right Bracket World Y: min = ${(rbBounds.min.y * 39.3701).toFixed(4)}", max = ${(rbBounds.max.y * 39.3701).toFixed(4)}"`);

    const gapLeft = (sBounds.min.y - lbBounds.max.y) * 39.3701;
    const gapRight = (sBounds.min.y - rbBounds.max.y) * 39.3701;
    console.log(`Shelf bottom to Left Bracket top gap: ${gapLeft.toFixed(4)}" (contact tolerance <= 0.05")`);
    console.log(`Shelf bottom to Right Bracket top gap: ${gapRight.toFixed(4)}"`);

    // Clean up
    shelf.removeFromParent();
    lb.removeFromParent();
    rb.removeFromParent();
  }
});
