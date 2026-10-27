import * as THREE from 'three';
import fs from 'fs';

// --- MOCKS AND FIXTURES ---
// We simulate the CAD room and the Endcap geometry as we know it from the previous audit.
const roomPolygon = [
  { x: 0, y: 0 },
  { x: 50 * 12, y: 0 },
  { x: 50 * 12, y: 30 * 12 },
  { x: 0, y: 30 * 12 }
];

// Product Data
const endcapProduct = {
  productId: 'RF-PRD-0009',
  sku: 'wr-5*3',
  glbUrl: '/uploads/models/RACKS_c5dafbfe.glb',
  width: 18.0,
  height: 60.0,
  depth: 36.0,
  scalingMode: 'fit'
};

const centerRackProduct = {
  productId: 'RF-PRD-0007',
  glbUrl: '/uploads/models/center_rack_258cd0d6.glb',
  width: 36.0,
  height: 60.0,
  depth: 36.0,
};

// 4 Center Rack Bays at X=200, Y=200
const centerRacks = [];
for (let i = 0; i < 4; i++) {
  centerRacks.push({
    id: `cr-${i}`,
    type: 'RECT',
    x: 200 + i * 36,
    y: 200,
    width: 36,
    depth: 36,
    rotation: 0, 
    properties: {
      productModelId: centerRackProduct.productId,
      rackType: 'Center Rack',
      baseWidth: 36,
      baseDepth: 36,
    },
    geometry: { width: 36, depth: 36, height: 60 }
  });
}

function getRunInfo(racks) {
  return {
    racks: racks,
    runDirection: { x: 1, y: 0 },
    firstLeft: { x: racks[0].x - 18, y: racks[0].y },
    lastRight: { x: racks[racks.length-1].x + 18, y: racks[racks.length-1].y }
  };
}

const run = getRunInfo(centerRacks);
const terminalFace = run.lastRight;
const terminalNormal = { x: run.runDirection.x, y: run.runDirection.y };
const connectionLocalPoint = { x: 0, y: 0 };
const targetConnectionNormal = { x: -terminalNormal.x, y: -terminalNormal.y };
const rotationY = Math.atan2(targetConnectionNormal.x, targetConnectionNormal.y);

const rotatedLocalPoint = {
  x: connectionLocalPoint.x * Math.cos(rotationY) + connectionLocalPoint.y * Math.sin(rotationY),
  y: -connectionLocalPoint.x * Math.sin(rotationY) + connectionLocalPoint.y * Math.cos(rotationY)
};

const snapPos = {
  x: terminalFace.x - rotatedLocalPoint.x,
  y: terminalFace.y - rotatedLocalPoint.y
};

console.log("=== ENDCAP RIGHT TERMINAL CONNECTION TEST ===");
console.log("Terminal Face:", terminalFace);
console.log("Target Connection Normal:", targetConnectionNormal);
console.log("Endcap RotationY (deg):", rotationY * 180 / Math.PI);
console.log("Snap Pos (3D Root X/Z):", snapPos);

// GLBCache normalization simulation
let pSize = { x: 84.85, y: 93.04, z: 13.80 };
let pBox = { min: { x: -34.83, y: 0, z: -60.02 }, max: { x: 54.73, y: 8.90, z: -17.68 } };
let pCenter = { x: 9.95, y: 4.45, z: -38.85 };

console.log("\n=== GLB NORMALIZATION TEST ===");
let uploadedGLB = new THREE.Group();
let rotDegY = 90; // Default CAD 90 for Depth=NativeX, Width=NativeZ
uploadedGLB.position.y = -pBox.min.y;
uploadedGLB.position.z = -pCenter.z;
uploadedGLB.position.x = -pBox.max.x;

console.log("Native Back Anchor X:", uploadedGLB.position.x);
console.log("Native Center Anchor Z:", uploadedGLB.position.z);

console.log("\nForensic Audit complete.");
