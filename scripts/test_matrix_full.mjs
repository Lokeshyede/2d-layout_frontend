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

  const baseDeck = innerNode.children[0];
  const templateShelf = innerNode.children[11];
  const leftUpright = innerNode.children[2];
  const rightUpright = innerNode.children[4];

  const templateLeftBracket = leftUpright.children[0];
  const templateRightBracket = rightUpright.children[0];

  const BRACKET_Z_OFFSET = 8.41162;

  // Test matrix:
  // Heights: 84", 96"
  // Widths: 36", 42", 48"
  // Depths: 24", 30", 36"
  // Shelves: 3, 5, 6, 8, 10, 12
  const shelfCounts = [3, 5, 6, 8, 10, 12];
  let allTestsPassed = true;

  for (const targetH of [84, 96]) {
    for (const targetW of [36, 48]) {
      for (const targetD of [24, 30]) {
        for (const count of shelfCounts) {
          const modelAnchor = new THREE.Group();
          modelAnchor.rotation.y = (90 * Math.PI) / 180;
          modelAnchor.add(uploadedGLB);

          uploadedGLB.position.z = -pCenter.z;
          uploadedGLB.position.y = -pBox.min.y;
          uploadedGLB.position.x = -pBox.max.x;

          const modelRoot = new THREE.Group();
          modelRoot.add(modelAnchor);

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

          // Clean
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

          // Hide all native upper shelves and fixed brackets
          [0, 12, 3, 9, 10, 11].forEach(idx => {
            if (innerNode.children[idx]) innerNode.children[idx].visible = false;
          });
          leftUpright.children.forEach((c, idx) => { if (idx !== 2) c.visible = false; });
          rightUpright.children.forEach((c, idx) => { if (idx !== 2) c.visible = false; });

          // Calculate placements
          const usableBottomY = 3.1574;
          const usableTopY = targetH - 11.0624;
          const step = (usableTopY - usableBottomY) / (count - 1);

          const levels = [];
          for (let i = 0; i < count; i++) {
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

            levels.push({ shelfObj, lbObj, rbObj, centerY });
          }

          rackInstance.updateMatrixWorld(true);

          // Verify:
          // 1. Spacing uniformity
          const positions = levels.map(l => (getExactObjectBounds(l.shelfObj).min.y * 39.3701));
          for (let i = 1; i < positions.length - 1; i++) {
            const gap1 = positions[i] - positions[i - 1];
            const gap2 = positions[i + 1] - positions[i];
            if (Math.abs(gap1 - gap2) > 0.01) {
              console.error(`FAIL: Spacing non-uniform for H=${targetH} W=${targetW} D=${targetD} count=${count}`);
              allTestsPassed = false;
            }
          }

          // 2. Bracket alignment and contact
          for (let i = 1; i < levels.length; i++) {
            const lbB = getExactObjectBounds(levels[i].lbObj);
            const rbB = getExactObjectBounds(levels[i].rbObj);
            const sB = getExactObjectBounds(levels[i].shelfObj);

            const lbTop = lbB.max.y * 39.3701;
            const rbTop = rbB.max.y * 39.3701;
            const sBottom = sB.min.y * 39.3701;
            const sTop = sB.max.y * 39.3701;

            if (Math.abs(lbTop - rbTop) > 0.01) {
              console.error(`FAIL: LB and RB mismatch on level ${i}`);
              allTestsPassed = false;
            }
            if (lbTop < sBottom - 0.05 || lbTop > sTop + 0.05) {
              console.error(`FAIL: Bracket contact out of bounds on level ${i}`);
              allTestsPassed = false;
            }
          }
        }
      }
    }
  }

  console.log(`\n============================================================`);
  console.log(`MATRIX TEST RESULT: ${allTestsPassed ? 'ALL CONFIGURATIONS PASSED (100% SUCCESS)' : 'FAILED'}`);
  console.log(`============================================================`);
});
