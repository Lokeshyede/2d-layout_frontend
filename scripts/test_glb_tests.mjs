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

  const productBox = new THREE.Box3();
  scene.traverse((obj) => {
    if (obj.isMesh) {
      const mBox = new THREE.Box3().setFromObject(obj);
      const mSize = new THREE.Vector3();
      mBox.getSize(mSize);
      if (Math.max(mSize.x, mSize.y, mSize.z) <= 6.0) {
        productBox.union(mBox);
      }
    }
  });

  const prodSizeMeters = new THREE.Vector3();
  productBox.getSize(prodSizeMeters);
  const prodCenterMeters = new THREE.Vector3();
  productBox.getCenter(prodCenterMeters);

  const testDimensions = [
    { name: 'Test 1: Base Dimensions (3ft x 7ft x 2ft)', targetW: 36, targetH: 84, targetD: 24 },
    { name: 'Test 2: Requested Width 4ft (4ft x 7ft x 2ft)', targetW: 48, targetH: 84, targetD: 24 },
    { name: 'Test 3: Requested 3ft x 8ft x 2ft-6in', targetW: 36, targetH: 96, targetD: 30 },
  ];

  for (const t of testDimensions) {
    const clone = SkeletonUtils.clone(scene);
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

    const rackInstance = new THREE.Group();
    const modelRoot = new THREE.Group();
    rackInstance.add(modelRoot);

    const modelAnchor = new THREE.Group();
    modelRoot.add(modelAnchor);
    modelAnchor.rotation.set(0, Math.PI / 2, 0);
    modelAnchor.add(clone);

    clone.position.x = -productBox.max.x;
    clone.position.y = -productBox.min.y;
    clone.position.z = -prodCenterMeters.z;

    const unscaledRotWidth = prodSizeMeters.z;
    const unscaledRotHeight = prodSizeMeters.y;
    const unscaledRotDepth = prodSizeMeters.x;

    // Two-stage scaling:
    // Base product: 36 x 84 x 24
    const baseW = 36, baseH = 84, baseD = 24;
    const nativeToBaseScaleX = baseW / unscaledRotWidth;
    const nativeToBaseScaleY = baseH / unscaledRotHeight;
    const nativeToBaseScaleZ = baseD / unscaledRotDepth;

    const baseToRequestedScaleX = t.targetW / baseW;
    const baseToRequestedScaleY = t.targetH / baseH;
    const baseToRequestedScaleZ = t.targetD / baseD;

    const finalScaleX = nativeToBaseScaleX * baseToRequestedScaleX;
    const finalScaleY = nativeToBaseScaleY * baseToRequestedScaleY;
    const finalScaleZ = nativeToBaseScaleZ * baseToRequestedScaleZ;

    modelRoot.scale.set(finalScaleX, finalScaleY, finalScaleZ);
    rackInstance.updateMatrixWorld(true);

    const finalBox = new THREE.Box3();
    clone.traverse((obj) => {
      if (obj.isMesh && obj.visible) {
        finalBox.union(new THREE.Box3().setFromObject(obj));
      }
    });

    const finalSize = new THREE.Vector3();
    finalBox.getSize(finalSize);
    console.log(`\n=== ${t.name} ===`);
    console.log(`Expected Size: W=${t.targetW}", H=${t.targetH}", D=${t.targetD}"`);
    console.log(`Measured Size: W=${finalSize.x.toFixed(2)}", H=${finalSize.y.toFixed(2)}", D=${finalSize.z.toFixed(2)}"`);
    console.log(`Bounds: Min=[${finalBox.min.x.toFixed(2)}, ${finalBox.min.y.toFixed(2)}, ${finalBox.min.z.toFixed(2)}], Max=[${finalBox.max.x.toFixed(2)}, ${finalBox.max.y.toFixed(2)}, ${finalBox.max.z.toFixed(2)}]`);
    console.log(`Stage 1 (nativeToBase): [${nativeToBaseScaleX.toFixed(3)}, ${nativeToBaseScaleY.toFixed(3)}, ${nativeToBaseScaleZ.toFixed(3)}]`);
    console.log(`Stage 2 (baseToReq)   : [${baseToRequestedScaleX.toFixed(3)}, ${baseToRequestedScaleY.toFixed(3)}, ${baseToRequestedScaleZ.toFixed(3)}]`);
  }
});
