import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import fs from 'fs';
import path from 'path';

globalThis.self = globalThis;

function getExactObjectBounds(obj) {
  let min = new THREE.Vector3(Infinity, Infinity, Infinity);
  let max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  let count = 0;

  obj.traverse((child) => {
    if (child.isMesh && child.geometry && child.visible) {
      const posAttr = child.geometry.attributes.position;
      for (let i = 0; i < posAttr.count; i++) {
        const v = new THREE.Vector3().fromBufferAttribute(posAttr, i);
        v.applyMatrix4(child.matrixWorld);
        min.min(v);
        max.max(v);
        count++;
      }
    }
  });

  return { min, max, size: max.clone().sub(min), vertexCount: count };
}

const filePath = path.resolve('../backend/uploads/models/racks_1.glb');
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

  let innerNode;
  uploadedGLB.traverse((obj) => {
    if (!innerNode && obj.name === 'Assembly-41' && obj.children[2]?.children?.[0]) {
      innerNode = obj.children[2].children[0];
    }
  });

  const pBox = new THREE.Box3().setFromObject(uploadedGLB);
  const pCenter = new THREE.Vector3(); pBox.getCenter(pCenter);
  const pSize = new THREE.Vector3(); pBox.getSize(pSize);

  const baseW = 36, baseH = 84, baseD = 24;
  const targetW = 36, targetH = 84, targetD = 24;

  const unscaledRotWidth = pSize.z;
  const unscaledRotHeight = pSize.y;
  const unscaledRotDepth = pSize.x;

  const stage1ScaleX = baseW / unscaledRotWidth;
  const stage1ScaleY = baseH / unscaledRotHeight;
  const stage1ScaleZ = baseD / unscaledRotDepth;

  const stage2ScaleX = targetW / baseW;
  const stage2ScaleY = targetH / baseH;
  const stage2ScaleZ = targetD / baseD;

  const modelAnchor = new THREE.Group();
  modelAnchor.rotation.y = (90 * Math.PI) / 180;
  modelAnchor.add(uploadedGLB);

  uploadedGLB.position.z = -pCenter.z;
  uploadedGLB.position.y = -pBox.min.y;
  uploadedGLB.position.x = -pBox.max.x;

  const modelRoot = new THREE.Group();
  modelRoot.add(modelAnchor);
  modelRoot.scale.set(
    stage1ScaleX * stage2ScaleX,
    stage1ScaleY * stage2ScaleY,
    stage1ScaleZ * stage2ScaleZ
  );

  // Here is the key:
  // Assembly-41 scale is 0.0254
  // modelRoot scale.y is stage1ScaleY * stage2ScaleY = (84 / 2.16) * 1.0 = 38.8888
  // Total scale from innerNode local Z to CAD world Y is:
  // innerNodeScaleY = 0.0254 * (84 / 2.16) = 0.0254 * (84 / (85.0394 * 0.0254)) = 84 / 85.0394 = 0.98777
  const nativeHInches = unscaledRotHeight * 39.37007874; // ~85.0394
  const innerNodeScaleY = (targetH / nativeHInches); // = (84 / 85.0394) = 0.98777

  console.log(`unscaledRotHeight (m): ${unscaledRotHeight}`);
  console.log(`nativeHInches: ${nativeHInches}`);
  console.log(`innerNodeScaleY: ${innerNodeScaleY}`);
  console.log(`Old totalScaleY was: ${stage1ScaleY * stage2ScaleY} (39x too large!)`);

  const shelfIndices = [0, 12, 3, 9, 10, 11];
  const originalShelves = shelfIndices.map(i => innerNode.children[i]).filter(Boolean);
  originalShelves.sort((a, b) => a.position.z - b.position.z);
  const templateShelf = originalShelves[originalShelves.length - 1];
  const leftUpright = innerNode.children[2];
  const rightUpright = innerNode.children[4];
  const templateLeftBracket = leftUpright.children[0];
  const templateRightBracket = rightUpright.children[0];

  // Test 6 shelves
  const shelfCount = 6;
  const usableBottomY = 3.1574;
  const usableTopY = 72.9376;
  const step = (usableTopY - usableBottomY) / (shelfCount - 1);

  // Hide fixed native brackets and shelves
  originalShelves.forEach(s => s.visible = false);
  leftUpright.children.forEach((c, idx) => { if (idx !== 2) c.visible = false; });
  rightUpright.children.forEach((c, idx) => { if (idx !== 2) c.visible = false; });

  const generatedShelves = [];
  const generatedBrackets = [];

  for (let i = 0; i < shelfCount; i++) {
    const worldY = usableBottomY + i * step;
    const localZ = worldY / innerNodeScaleY;

    let shelfObj;
    if (i === 0) {
      shelfObj = originalShelves[0];
      shelfObj.visible = true;
      shelfObj.position.z = localZ;
    } else {
      shelfObj = templateShelf.clone(true);
      shelfObj.name = `ParametricShelf_${i + 1}`;
      shelfObj.visible = true;
      shelfObj.position.z = localZ;
      shelfObj.scale.z = 1.0 / innerNodeScaleY;
      innerNode.add(shelfObj);
    }
    generatedShelves.push({ index: i, worldTargetY: worldY, localZ, shelfObj });

    if (i > 0) {
      const bLeft = templateLeftBracket.clone(true);
      bLeft.name = `ParametricBracket_L_${i + 1}`;
      bLeft.visible = true;
      bLeft.position.z = localZ + 8.41162;
      bLeft.position.y = 11.3325;
      bLeft.position.x = 0.5822;
      bLeft.rotation.set(2.339487, -1.557494, -1.590032);
      leftUpright.add(bLeft);

      const bRight = templateRightBracket.clone(true);
      bRight.name = `ParametricBracket_R_${i + 1}`;
      bRight.visible = true;
      bRight.position.z = localZ + 8.41162;
      bRight.position.y = 11.3325;
      bRight.position.x = 0.5822;
      bRight.rotation.set(2.339487, -1.557494, -1.590032);
      rightUpright.add(bRight);

      generatedBrackets.push(bLeft, bRight);
    }
  }

  modelRoot.updateMatrixWorld(true);

  console.log(`\n--- Verification of 6 Parametric Shelves & Brackets in World Space ---`);
  for (const s of generatedShelves) {
    const bounds = getExactObjectBounds(s.shelfObj);
    console.log(`Shelf ${s.index + 1}: Target Y = ${s.worldTargetY.toFixed(2)}", World Bounds Y = [${bounds.min.y.toFixed(2)}", ${bounds.max.y.toFixed(2)}"], Mid Y = ${((bounds.min.y + bounds.max.y) / 2).toFixed(2)}"`);
  }

  console.log(`\n--- Verification of Bracket Physical Contact ---`);
  for (let i = 1; i < shelfCount; i++) {
    const s = generatedShelves[i];
    const sBounds = getExactObjectBounds(s.shelfObj);
    const bL = generatedBrackets[(i - 1) * 2];
    const bR = generatedBrackets[(i - 1) * 2 + 1];
    const bLBounds = getExactObjectBounds(bL);
    const bRBounds = getExactObjectBounds(bR);

    const contactGapL = Math.abs(sBounds.min.y - bLBounds.max.y);
    const contactGapR = Math.abs(sBounds.min.y - bRBounds.max.y);

    console.log(`Tier ${i + 1}: Shelf Bottom Y = ${sBounds.min.y.toFixed(4)}", Left Bracket Top Y = ${bLBounds.max.y.toFixed(4)}" (Gap: ${contactGapL.toFixed(4)}"), Right Bracket Top Y = ${bRBounds.max.y.toFixed(4)}" (Gap: ${contactGapR.toFixed(4)}")`);
  }
});
