import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import fs from 'fs';
import path from 'path';

globalThis.self = globalThis;

// Import GLBCache and ParametricRackBuilder
// Since they are typescript files, we can simulate GLBCache's exact scaling logic in this script:
const filePath = path.resolve('backend/uploads/models/racks_1.glb');
const buffer = fs.readFileSync(filePath);
const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

const loader = new GLTFLoader();
loader.parse(arrayBuffer, '', (gltf) => {
  const uploadedGLB = gltf.scene;

  // Let's inspect the bounding box of unscaled GLB
  const pBox = new THREE.Box3().setFromObject(uploadedGLB);
  const pSize = new THREE.Vector3(); pBox.getSize(pSize);
  console.log('Native pSize:', pSize);
  console.log('Native pSize in inches:', pSize.clone().multiplyScalar(39.3701));

  // In GLBCache.ts:
  // With correctionRotation {x: 0, y: 90, z: 0}:
  // unscaledRotWidth = pSize.z;
  // unscaledRotHeight = pSize.y;
  // unscaledRotDepth = pSize.x;
  const unscaledRotWidth = pSize.z * 39.3701;
  const unscaledRotHeight = pSize.y * 39.3701;
  const unscaledRotDepth = pSize.x * 39.3701;

  console.log(`unscaledRot (inches): W=${unscaledRotWidth.toFixed(2)}", H=${unscaledRotHeight.toFixed(2)}", D=${unscaledRotDepth.toFixed(2)}"`);

  // Target dimensions: 36" W x 84" H x 24" D (Base: 36 x 84 x 24)
  const baseW = 36, baseH = 84, baseD = 24;
  const targetW = 36, targetH = 84, targetD = 24;

  const stage1ScaleX = baseW / (pSize.z * 39.3701);
  const stage1ScaleY = baseH / (pSize.y * 39.3701);
  const stage1ScaleZ = baseD / (pSize.x * 39.3701);

  console.log(`stage1Scale: X=${stage1ScaleX.toFixed(5)}, Y=${stage1ScaleY.toFixed(5)}, Z=${stage1ScaleZ.toFixed(5)}`);

  // Check what stage1ScaleY is: 84 / 85.039 = 0.98778!
});
