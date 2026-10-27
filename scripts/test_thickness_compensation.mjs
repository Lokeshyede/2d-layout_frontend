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
  const unscaledRotHeight = pSize.y * 39.3701;
  const stage1ScaleY = baseH / unscaledRotHeight;

  let innerNode;
  uploadedGLB.traverse((obj) => {
    if (!innerNode && obj.name === 'Assembly-41' && obj.children[2]?.children?.[0]) {
      innerNode = obj.children[2].children[0];
    }
  });

  const templateShelf = innerNode.children[11];

  for (const targetH of [84, 96]) {
    for (const reqThickness of [1.0, 1.5, 2.0]) {
      const modelAnchor = new THREE.Group();
      modelAnchor.rotation.y = (90 * Math.PI) / 180;
      modelAnchor.add(uploadedGLB);

      uploadedGLB.position.z = -pCenter.z;
      uploadedGLB.position.y = -pBox.min.y;
      uploadedGLB.position.x = -pBox.max.x;

      const modelRoot = new THREE.Group();
      modelRoot.add(modelAnchor);

      const stage2ScaleY = targetH / baseH;
      const totalScaleY = stage1ScaleY * stage2ScaleY;
      modelRoot.scale.set(1.0, totalScaleY, 1.0);

      const rackInstance = new THREE.Group();
      rackInstance.add(modelRoot);

      const localZ = 40.0 / totalScaleY;
      const shelf = templateShelf.clone(true);
      shelf.position.z = localZ;
      shelf.position.y = 4.96;

      // Compensate thickness
      // In native shelf, the tray plate (3DGeom-39) is 1.0" thick. The ticket molding extends slightly.
      shelf.scale.z = (reqThickness / 1.0) / totalScaleY;
      innerNode.add(shelf);

      rackInstance.updateMatrixWorld(true);

      // Measure tray plate mesh thickness
      const trayMesh = shelf.children[0].children[0];
      const trayBounds = getExactObjectBounds(trayMesh);
      const measuredThickness = (trayBounds.max.y - trayBounds.min.y) * 39.3701;

      console.log(`Rack H=${targetH}", Requested Thickness=${reqThickness}" -> Measured World Plate Thickness = ${measuredThickness.toFixed(4)}" (Error: ${Math.abs(measuredThickness - reqThickness).toFixed(4)}")`);

      shelf.removeFromParent();
    }
  }
});
