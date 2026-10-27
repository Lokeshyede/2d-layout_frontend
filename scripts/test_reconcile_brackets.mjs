import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import fs from 'fs';

globalThis.self = globalThis;
const buffer = fs.readFileSync('../backend/uploads/models/racks_1.glb');
const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

const loader = new GLTFLoader();
loader.parse(arrayBuffer, '', (gltf) => {
  const scene = gltf.scene;

  const assembly = scene.children[0].children[0];
  const innerNode = assembly.children[2].children[0];
  const leftUpright = innerNode.children[2];
  const rightUpright = innerNode.children[4];

  // Original shelves
  const shelfIndices = [0, 12, 3, 9, 10, 11];
  const originalShelves = shelfIndices.map(idx => innerNode.children[idx]).filter(Boolean);
  originalShelves.sort((a, b) => a.position.z - b.position.z);

  // Original brackets (standard template: idx 0 has clean standard rotation)
  const bracketIndices = [0, 1, 3, 4, 5];
  const originalLeftBrackets = bracketIndices.map(idx => leftUpright.children[idx]).filter(Boolean);
  const originalRightBrackets = bracketIndices.map(idx => rightUpright.children[idx]).filter(Boolean);

  const templateShelf = originalShelves[Math.min(2, originalShelves.length - 1)];
  const templateLeftBracket = leftUpright.children[0];
  const templateRightBracket = rightUpright.children[0];

  const BRACKET_Z_OFFSET = 81.349243 - 72.938; // 8.411243

  function buildLevels(shelfCount, rackHeight = 84) {
    // 1. Clean previous generated
    const toRemShelf = innerNode.children.filter(c => c.name.startsWith('ParametricShelf_'));
    toRemShelf.forEach(c => c.removeFromParent());
    const toRemLB = leftUpright.children.filter(c => c.name.startsWith('ParametricBracket_'));
    toRemLB.forEach(c => c.removeFromParent());
    const toRemRB = rightUpright.children.filter(c => c.name.startsWith('ParametricBracket_'));
    toRemRB.forEach(c => c.removeFromParent());

    // 2. Hide all originals
    originalShelves.forEach(s => s.visible = false);
    originalLeftBrackets.forEach(b => b.visible = false);
    originalRightBrackets.forEach(b => b.visible = false);

    // 3. Compute equal spacing
    const bottomBoundary = 3.157;
    const topBoundary = rackHeight - 11.5;
    const usableHeight = topBoundary - bottomBoundary;
    const step = usableHeight / (shelfCount - 1);

    const levels = [];

    for (let i = 0; i < shelfCount; i++) {
      const y = bottomBoundary + i * step;
      const shelfZ = y; // stage2ScaleY = 1.0

      // A. Shelf
      let shelfObj;
      if (i < originalShelves.length) {
        shelfObj = originalShelves[i];
        shelfObj.visible = true;
        shelfObj.position.z = shelfZ;
      } else {
        shelfObj = templateShelf.clone(true);
        shelfObj.name = `ParametricShelf_${i + 1}`;
        shelfObj.visible = true;
        shelfObj.position.z = shelfZ;
        innerNode.add(shelfObj);
      }

      // B. Brackets (for upper shelves i > 0)
      let lbObj, rbObj;
      if (i > 0) {
        const bracketZ = shelfZ + BRACKET_Z_OFFSET;
        const bIdx = i - 1;

        if (bIdx < originalLeftBrackets.length) {
          lbObj = originalLeftBrackets[bIdx];
          lbObj.visible = true;
          lbObj.position.z = bracketZ;
          lbObj.rotation.set(2.339487, -1.557494, -1.590032);
        } else {
          lbObj = templateLeftBracket.clone(true);
          lbObj.name = `ParametricBracket_L_${i + 1}`;
          lbObj.visible = true;
          lbObj.position.z = bracketZ;
          leftUpright.add(lbObj);
        }

        if (bIdx < originalRightBrackets.length) {
          rbObj = originalRightBrackets[bIdx];
          rbObj.visible = true;
          rbObj.position.z = bracketZ;
          rbObj.rotation.set(2.339487, -1.557494, -1.590032);
        } else {
          rbObj = templateRightBracket.clone(true);
          rbObj.name = `ParametricBracket_R_${i + 1}`;
          rbObj.visible = true;
          rbObj.position.z = bracketZ;
          rightUpright.add(rbObj);
        }
      }

      levels.push({ levelIndex: i, y, shelf: shelfObj, leftBracket: lbObj, rightBracket: rbObj });
    }

    return levels;
  }

  // TEST SEQUENCES: 3 -> 6 -> 8 -> 10 -> 5 -> 3
  console.log('=== TEST RECONCILIATION SEQUENCE ===');
  [3, 6, 8, 10, 5, 3].forEach((cnt) => {
    const levels = buildLevels(cnt);
    const visibleShelves = innerNode.children.filter(c => (originalShelves.includes(c) || c.name.startsWith('ParametricShelf_')) && c.visible);
    const visibleLB = leftUpright.children.filter(c => (originalLeftBrackets.includes(c) || c.name.startsWith('ParametricBracket_')) && c.visible);
    const visibleRB = rightUpright.children.filter(c => (originalRightBrackets.includes(c) || c.name.startsWith('ParametricBracket_')) && c.visible);

    console.log(`ShelfCount ${cnt}: visibleShelves=${visibleShelves.length}, visibleLeftBrackets=${visibleLB.length}, visibleRightBrackets=${visibleRB.length} | Levels generated: ${levels.length}`);
    if (visibleShelves.length !== cnt) throw new Error(`Mismatch in visible shelves for count ${cnt}`);
    if (visibleLB.length !== cnt - 1) throw new Error(`Mismatch in visible left brackets for count ${cnt}`);
    if (visibleRB.length !== cnt - 1) throw new Error(`Mismatch in visible right brackets for count ${cnt}`);
  });

  console.log('\nALL RECONCILIATION TESTS PASSED PERFECTLY!');
});
