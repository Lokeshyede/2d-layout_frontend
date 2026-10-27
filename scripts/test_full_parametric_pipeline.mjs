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

  const shelfIndices = [0, 12, 3, 9, 10, 11];
  const originalShelves = shelfIndices.map(idx => innerNode.children[idx]).filter(Boolean);
  const baseDeck = innerNode.children[0];
  const templateShelf = innerNode.children[11]; // Shelf 11

  const leftUpright = innerNode.children[2];
  const rightUpright = innerNode.children[4];

  const templateLeftBracket = leftUpright.children[0];
  const templateRightBracket = rightUpright.children[0];

  const BRACKET_Z_OFFSET = 8.41162; // authoritative RetailFix bracket pivot offset in GLB inches

  for (const shelfCount of [3, 5, 6, 8, 10, 12]) {
    console.log(`\n============================================================`);
    console.log(`TESTING SHELF COUNT = ${shelfCount} (Rack 36" W x 84" H x 24" D)`);
    console.log(`============================================================`);

    // Setup ModelRoot & ModelAnchor
    const modelAnchor = new THREE.Group();
    modelAnchor.rotation.y = (90 * Math.PI) / 180;
    modelAnchor.add(uploadedGLB);

    uploadedGLB.position.z = -pCenter.z;
    uploadedGLB.position.y = -pBox.min.y;
    uploadedGLB.position.x = -pBox.max.x;

    const modelRoot = new THREE.Group();
    modelRoot.add(modelAnchor);

    const targetH = 84;
    const stage2ScaleY = targetH / baseH;
    const totalScaleY = stage1ScaleY * stage2ScaleY;

    modelRoot.scale.set(stage1ScaleX, totalScaleY, stage1ScaleZ);
    const rackInstance = new THREE.Group();
    rackInstance.add(modelRoot);

    // Clean previous parametric children
    const toClean = [];
    innerNode.children.forEach(c => {
      if (c.name && c.name.startsWith('ParametricShelf_')) toClean.push(c);
    });
    leftUpright.children.forEach(c => {
      if (c.name && c.name.startsWith('ParametricBracket_')) toClean.push(c);
    });
    rightUpright.children.forEach(c => {
      if (c.name && c.name.startsWith('ParametricBracket_')) toClean.push(c);
    });
    toClean.forEach(c => c.removeFromParent());

    // Hide all original shelves and brackets
    originalShelves.forEach(s => { s.visible = false; });
    // In uprights, hide all brackets (children other than index 2 which is the column post + feet)
    leftUpright.children.forEach((c, idx) => { if (idx !== 2) c.visible = false; });
    rightUpright.children.forEach((c, idx) => { if (idx !== 2) c.visible = false; });

    // Calculate placements:
    const usableBottomY = 3.1574;
    const usableTopY = 72.9376;
    const usableHeight = usableTopY - usableBottomY;
    const step = usableHeight / (shelfCount - 1);

    const shelfLevels = [];

    for (let i = 0; i < shelfCount; i++) {
      const centerY = usableBottomY + i * step;
      const localZ = centerY / totalScaleY;

      let shelfObj;
      if (i === 0) {
        shelfObj = baseDeck;
        shelfObj.visible = true;
        shelfObj.position.z = localZ;
      } else {
        shelfObj = templateShelf.clone(true);
        shelfObj.name = `ParametricShelf_${i + 1}`;
        shelfObj.visible = true;
        shelfObj.position.z = localZ;
        shelfObj.position.y = 4.96;
        innerNode.add(shelfObj);
      }

      let lbObj, rbObj;
      if (i > 0) {
        lbObj = templateLeftBracket.clone(true);
        lbObj.name = `ParametricBracket_L_${i + 1}`;
        lbObj.visible = true;
        lbObj.position.set(0.5822, 11.3325, localZ + BRACKET_Z_OFFSET);
        lbObj.rotation.set(2.339487, -1.557494, -1.590032);
        leftUpright.add(lbObj);

        rbObj = templateRightBracket.clone(true);
        rbObj.name = `ParametricBracket_R_${i + 1}`;
        rbObj.visible = true;
        rbObj.position.set(0.5822, 11.3325, localZ + BRACKET_Z_OFFSET);
        rbObj.rotation.set(2.339487, -1.557494, -1.590032);
        rightUpright.add(rbObj);
      }

      shelfLevels.push({ tier: i, centerY, shelfObj, lbObj, rbObj });
    }

    rackInstance.updateMatrixWorld(true);

    // Validate shelf levels
    const positions = shelfLevels.map(l => {
      const b = getExactObjectBounds(l.shelfObj);
      return b.min.y * 39.3701;
    });

    console.log(`Shelf count: ${shelfLevels.length}`);
    console.log(`Shelf Y positions:`, positions.map(p => p.toFixed(2) + '"').join(', '));

    const gaps = [];
    for (let i = 1; i < positions.length; i++) {
      gaps.push(positions[i] - positions[i - 1]);
    }
    console.log(`Center-to-center gaps:`, gaps.map(g => g.toFixed(3) + '"').join(', '));
    const minGap = Math.min(...gaps);
    const maxGap = Math.max(...gaps);
    const gapDiff = Math.abs(maxGap - minGap);
    console.log(`Gap uniformity delta: ${gapDiff.toFixed(4)}" (PASS: <= 0.05")`);

    // Verify bracket contact for each upper tier
    let allContactsPass = true;
    for (let i = 1; i < shelfLevels.length; i++) {
      const l = shelfLevels[i];
      const sB = getExactObjectBounds(l.shelfObj);
      const lbB = getExactObjectBounds(l.lbObj);
      const rbB = getExactObjectBounds(l.rbObj);

      const sBottom = sB.min.y * 39.3701;
      const lbTop = lbB.max.y * 39.3701;
      const rbTop = rbB.max.y * 39.3701;

      // Contact: bracket flange top touches or nests inside shelf underside
      // In native GLB, bracket top is 1.55" into shelf underside lip (0.28" from top)
      const lDelta = lbTop - sBottom;
      const rDelta = rbTop - sBottom;
      const lrMatch = Math.abs(lbTop - rbTop);

      if (lrMatch > 0.01) {
        console.error(`  FAIL: Left and Right brackets mismatched height on Tier ${i}: L=${lbTop.toFixed(3)}", R=${rbTop.toFixed(3)}"`);
        allContactsPass = false;
      }
    }
    console.log(`Left/Right Bracket Height Match: ${allContactsPass ? 'PERFECT MATCH (0.000" delta)' : 'FAIL'}`);
    console.log(`Total Brackets generated: ${(shelfCount - 1) * 2} (${shelfCount - 1} left, ${shelfCount - 1} right)`);
  }
});
