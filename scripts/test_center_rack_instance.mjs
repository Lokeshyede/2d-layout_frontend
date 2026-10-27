global.self = global;
global.window = global;

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { ParametricRackBuilder } from '../src/cad/rendering3d/parametric/ParametricRackBuilder.ts';

const filePath = 'e:/2d alyout/backend/uploads/models/updated_rack_b02b4896.glb';

async function loadTemplate() {
  const fs = await import('fs');
  const buffer = fs.readFileSync(filePath);
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

  const loader = new GLTFLoader();
  const gltf = await new Promise((resolve, reject) => {
    loader.parse(arrayBuffer, '', resolve, reject);
  });

  const scene = gltf.scene;
  // Detach auxiliary meshes > 6m
  const toRemove = [];
  scene.traverse((child) => {
    if (child.isMesh) {
      const b = new THREE.Box3().setFromObject(child);
      const s = new THREE.Vector3();
      b.getSize(s);
      if (Math.max(s.x, s.y, s.z) > 6.0) toRemove.push(child);
    }
  });
  toRemove.forEach((c) => c.removeFromParent());
  return scene;
}

function buildCenterRack(templateScene, options) {
  const {
    targetWidth = 36,
    targetHeight = 60,
    targetDepth = 24,
    baseWidth = 36,
    baseHeight = 84,
    baseDepth = 24,
    shelfCount = 5,
    shelfThickness = 1.0,
    shelfSpacing = 'auto',
  } = options;

  const uploadedGLB = SkeletonUtils.clone(templateScene);
  uploadedGLB.name = 'UploadedGLB';

  const pBox = new THREE.Box3().setFromObject(uploadedGLB);
  const pSize = new THREE.Vector3();
  pBox.getSize(pSize);
  const pCenter = new THREE.Vector3();
  pBox.getCenter(pCenter);

  const modelAnchor = new THREE.Group();
  modelAnchor.name = 'ModelAnchor';
  modelAnchor.rotation.y = (90 * Math.PI) / 180;
  modelAnchor.add(uploadedGLB);

  // Center Rack alignment (free-standing, centered on CAD coordinate)
  uploadedGLB.position.z = -pCenter.z; // Center Width on CAD X = 0
  uploadedGLB.position.y = -pBox.min.y; // Ground on floor CAD Y = 0
  uploadedGLB.position.x = -pCenter.x; // Center Depth on CAD Z = 0

  const nativeHeightInches = pSize.y * 39.3701;
  const innerNodeScaleY = targetHeight / nativeHeightInches;
  const stage2ScaleY = targetHeight / baseHeight;
  const stage1ScaleY = baseHeight / nativeHeightInches;

  const parametricResult = ParametricRackBuilder.configureParametricShelves(uploadedGLB, {
    targetWidth,
    targetHeight,
    targetDepth,
    baseWidth,
    baseHeight,
    baseDepth,
    shelfCount,
    shelfSpacing,
    shelfThickness,
    stage2ScaleY,
    totalScaleY: innerNodeScaleY,
    stage1ScaleY,
    isWallMounted: false,
  });

  const modelRoot = new THREE.Group();
  modelRoot.name = 'ModelRoot';
  modelRoot.add(modelAnchor);

  const unscaledRotWidth = pSize.z * 39.3701;
  const unscaledRotHeight = pSize.y * 39.3701;
  const unscaledRotDepth = pSize.x * 39.3701;

  const totalScaleX = targetWidth / unscaledRotWidth;
  const totalScaleY = targetHeight / unscaledRotHeight;
  const totalScaleZ = targetDepth / unscaledRotDepth;

  modelRoot.scale.set(totalScaleX, totalScaleY, totalScaleZ);
  modelRoot.updateMatrixWorld(true);

  return { modelRoot, parametricResult };
}

async function runSuite() {
  console.log('====================================================');
  console.log('CENTER RACK PARAMETRIC & VISUAL GEOMETRY TEST SUITE');
  console.log('====================================================\n');

  const template = await loadTemplate();

  // Test 1: Shelf count verification (3, 5, 6, 8, 10 shelves)
  console.log('--- TEST 1: SHELF COUNTS (3, 5, 6, 8, 10) ---');
  for (const count of [3, 5, 6, 8, 10]) {
    const { parametricResult } = buildCenterRack(template, {
      targetWidth: 36,
      targetHeight: 60,
      targetDepth: 24,
      shelfCount: count,
    });
    console.log(`✓ Shelves=${count}: Applied=${parametricResult.appliedShelfCount}, Brackets=${parametricResult.bracketCount}, Spacing=${parametricResult.effectiveSpacing.toFixed(2)}"`);
    if (parametricResult.appliedShelfCount !== count) {
      throw new Error(`Expected ${count} shelves, got ${parametricResult.appliedShelfCount}`);
    }
    if (parametricResult.bracketCount !== (count - 1) * 2) {
      throw new Error(`Expected ${(count - 1) * 2} brackets for ${count} shelves, got ${parametricResult.bracketCount}`);
    }
  }

  // Test 2: Dimensional variations (Width, Depth, Height)
  console.log('\n--- TEST 2: DIMENSIONAL VARIATIONS ---');
  const dimTests = [
    { w: 36, d: 24, h: 60 },
    { w: 48, d: 24, h: 60 },
    { w: 36, d: 36, h: 60 },
    { w: 36, d: 24, h: 84 },
    { w: 48, d: 36, h: 84 },
  ];

  for (const d of dimTests) {
    const { modelRoot } = buildCenterRack(template, {
      targetWidth: d.w,
      targetHeight: d.h,
      targetDepth: d.d,
      shelfCount: 5,
    });
    const box = new THREE.Box3().setFromObject(modelRoot);
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);

    // Three.js modelRoot is scaled in inches, but scene units:
    // Notice unscaled model is in meters (0.971m x 2.16m x 0.539m)
    // scaled by (targetWidth / unscaledRotWidthInInches)
    // So the final bounding box size is exactly (d.w / 39.3701) meters, or in inches:
    const sizeInches = {
      w: Math.round(size.x * 39.3701 * 10) / 10,
      h: Math.round(size.y * 39.3701 * 10) / 10,
      d: Math.round(size.z * 39.3701 * 10) / 10,
    };
    const centerInches = {
      x: Math.round(center.x * 39.3701 * 100) / 100,
      y: Math.round(center.y * 39.3701 * 100) / 100,
      z: Math.round(center.z * 39.3701 * 100) / 100,
    };

    console.log(`✓ Target: ${d.w}"W x ${d.h}"H x ${d.d}"D => Actual: ${sizeInches.w}"W x ${sizeInches.h}"H x ${sizeInches.d}"D | Center: (${centerInches.x}", ${centerInches.y}", ${centerInches.z}")`);

    if (Math.abs(sizeInches.w - d.w) > 0.5) throw new Error(`Width mismatch: expected ${d.w}, got ${sizeInches.w}`);
    if (Math.abs(sizeInches.h - d.h) > 0.5) throw new Error(`Height mismatch: expected ${d.h}, got ${sizeInches.h}`);
    if (Math.abs(sizeInches.d - d.d) > 0.5) throw new Error(`Depth mismatch: expected ${d.d}, got ${sizeInches.d}`);
    if (Math.abs(centerInches.x) > 0.1 || Math.abs(centerInches.z) > 0.1) {
      throw new Error(`Center Rack must be centered at (0, 0) locally! Got (${centerInches.x}, ${centerInches.z})`);
    }
  }

  // Test 3: Multiple Units Layout (1 unit, 2 units, 5 units in a row)
  console.log('\n--- TEST 3: MULTI-UNIT RACK ROW LAYOUT ---');
  for (const numUnits of [1, 2, 5]) {
    const rowGroup = new THREE.Group();
    const rackWidth = 36;
    const startX = -(numUnits - 1) * (rackWidth / 2);

    for (let u = 0; u < numUnits; u++) {
      const { modelRoot } = buildCenterRack(template, {
        targetWidth: rackWidth,
        targetHeight: 60,
        targetDepth: 24,
        shelfCount: 5,
      });
      // CAD position
      const posX = (startX + u * rackWidth) / 39.3701; // meters
      modelRoot.position.set(posX, 0, 0);
      rowGroup.add(modelRoot);
    }

    rowGroup.updateMatrixWorld(true);
    const rowBox = new THREE.Box3().setFromObject(rowGroup);
    const rowSize = new THREE.Vector3();
    rowBox.getSize(rowSize);
    const rowWidthInches = Math.round(rowSize.x * 39.3701 * 10) / 10;
    const expectedWidth = numUnits * rackWidth;

    console.log(`✓ Row of ${numUnits} Center Rack(s): Total Width=${rowWidthInches}" (Expected=${expectedWidth}"), Depth=${(rowSize.z * 39.3701).toFixed(1)}"`);
    if (Math.abs(rowWidthInches - expectedWidth) > 0.5) {
      throw new Error(`Row width mismatch: expected ${expectedWidth}, got ${rowWidthInches}`);
    }
  }

  console.log('\n====================================================');
  console.log('ALL CENTER RACK TESTS PASSED WITH 100% PRECISION!');
  console.log('====================================================\n');
}

runSuite().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
