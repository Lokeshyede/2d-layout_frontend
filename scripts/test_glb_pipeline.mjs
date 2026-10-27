global.self = global;
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import fs from 'fs';

const glbBuffer = fs.readFileSync('e:/2d alyout/backend/uploads/models/racks_1.glb');
const arrayBuffer = glbBuffer.buffer.slice(glbBuffer.byteOffset, glbBuffer.byteOffset + glbBuffer.byteLength);

const loader = new GLTFLoader();
loader.parse(arrayBuffer, '', (gltf) => {
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);

  // 1. Traverse and classify meshes
  let totalMeshes = 0;
  let productMeshes = 0;
  const productBox = new THREE.Box3();
  const auxMeshes = [];

  scene.traverse((obj) => {
    if (obj.isMesh) {
      totalMeshes++;
      const m = obj;
      const mBox = new THREE.Box3().setFromObject(m);
      const mSize = new THREE.Vector3();
      mBox.getSize(mSize);
      const maxDim = Math.max(mSize.x, mSize.y, mSize.z);

      // Check if architectural/room shell (> 6 meters in world space)
      if (maxDim > 6.0) {
        auxMeshes.push({ name: m.name, maxDim, size: mSize });
      } else {
        productMeshes++;
        productBox.union(mBox);
      }
    }
  });

  console.log(`Total Meshes: ${totalMeshes}, Product Meshes: ${productMeshes}, Aux Meshes: ${auxMeshes.length}`);
  const prodSizeMeters = new THREE.Vector3();
  productBox.getSize(prodSizeMeters);
  const prodCenterMeters = new THREE.Vector3();
  productBox.getCenter(prodCenterMeters);

  console.log('Product Box (Meters):', {
    min: productBox.min,
    max: productBox.max,
    size: prodSizeMeters,
    center: prodCenterMeters
  });

  const prodSizeInches = prodSizeMeters.clone().multiplyScalar(39.37007874);
  console.log('Product Box (Inches):', prodSizeInches);

  // Native Axis Analysis:
  // In native scene coordinates:
  // Height is Y: ~85.04"
  // Depth is X: ~21.23"
  // Width is Z: ~38.22"
  // Target CAD Orientation requires:
  // Width along X
  // Height along Y
  // Depth along Z (front in +Z, back in -Z or 0)
  //
  // Rotating +90 deg around Y:
  // X_rot = Z  (native Z width becomes CAD X width)
  // Z_rot = -X (native +X back becomes CAD -Z back, native -X front becomes CAD +Z front)
  // Y_rot = Y  (native Y height remains CAD Y height)

  const clone = SkeletonUtils.clone(scene);
  // Hide auxiliary room meshes
  clone.traverse((obj) => {
    if (obj.isMesh) {
      const mBox = new THREE.Box3().setFromObject(obj);
      const mSize = new THREE.Vector3();
      mBox.getSize(mSize);
      if (Math.max(mSize.x, mSize.y, mSize.z) > 6.0) {
        obj.visible = false;
      }
    }
  });

  // Hierarchy:
  // RackInstance
  //   ↓
  // ModelRoot (CAD Position, CAD Rotation, Scale)
  //   ↓
  // ModelAnchor (Correction Rotation + Origin Offset)
  //   ↓
  // UploadedGLB (Original unmodified clone)

  const rackInstance = new THREE.Group();
  rackInstance.name = 'RackInstance';

  const modelRoot = new THREE.Group();
  modelRoot.name = 'ModelRoot';
  rackInstance.add(modelRoot);

  const modelAnchor = new THREE.Group();
  modelAnchor.name = 'ModelAnchor';
  modelRoot.add(modelAnchor);

  // Apply correction rotation: +90 deg around Y
  const corrRotY = Math.PI / 2;
  modelAnchor.rotation.set(0, corrRotY, 0);

  // Place uploadedGLB inside modelAnchor
  modelAnchor.add(clone);
  clone.name = 'UploadedGLB';

  // Measure product in rotated unscaled space
  // We compute the rotated product box mathematically:
  // rotSize.x = prodSizeMeters.z (width)
  // rotSize.y = prodSizeMeters.y (height)
  // rotSize.z = prodSizeMeters.x (depth)
  const unscaledRotWidth = prodSizeMeters.z;   // ~0.9709 m
  const unscaledRotHeight = prodSizeMeters.y;  // ~2.1600 m
  const unscaledRotDepth = prodSizeMeters.x;   // ~0.5391 m

  // Rotated center & min:
  // rotCenter.x = prodCenterMeters.z
  // rotCenter.y = prodCenterMeters.y
  // rotCenter.z = -prodCenterMeters.x
  //
  // rotMin.z (back face) = -productBox.max.x = -53.9685 m
  // rotMax.z (front face) = -productBox.min.x = -53.4294 m

  // Anchor alignment offset on clone (in its local unrotated coordinate space):
  // Since modelAnchor has rotation +90 deg around Y:
  // To shift rotated product so:
  // X is centered at 0: shift native Z by -prodCenterMeters.z
  // Y is at 0 (ground): shift native Y by -productBox.min.y
  // Z back face is at 0: shift native X by -productBox.max.x (which rotates to Z = 0)
  clone.position.x = -productBox.max.x; // for wall-mounted back-face at Z=0
  clone.position.y = -productBox.min.y;
  clone.position.z = -prodCenterMeters.z;

  // Scaling:
  // Base dimensions (inches): 36" W x 84" H x 24" D
  // Target requested CAD dimensions: 36" W x 84" H x 24" D
  const targetW = 36;
  const targetH = 84;
  const targetD = 24;

  const finalScaleX = targetW / unscaledRotWidth;
  const finalScaleY = targetH / unscaledRotHeight;
  const finalScaleZ = targetD / unscaledRotDepth;

  modelRoot.scale.set(finalScaleX, finalScaleY, finalScaleZ);
  rackInstance.updateMatrixWorld(true);

  // Now measure the final rackInstance bounding box!
  const finalBox = new THREE.Box3();
  clone.traverse((obj) => {
    if (obj.isMesh && obj.visible) {
      finalBox.union(new THREE.Box3().setFromObject(obj));
    }
  });

  const finalSize = new THREE.Vector3();
  finalBox.getSize(finalSize);
  console.log('\nFINAL RACK INSTANCE BOUNDS (CAD INCHES):');
  console.log('Size:', {
    width: finalSize.x.toFixed(2),
    height: finalSize.y.toFixed(2),
    depth: finalSize.z.toFixed(2),
  });
  console.log('Min:', {
    x: finalBox.min.x.toFixed(2),
    y: finalBox.min.y.toFixed(2),
    z: finalBox.min.z.toFixed(2),
  });
  console.log('Max:', {
    x: finalBox.max.x.toFixed(2),
    y: finalBox.max.y.toFixed(2),
    z: finalBox.max.z.toFixed(2),
  });
});
