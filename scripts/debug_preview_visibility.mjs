import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import fs from 'fs';
import path from 'path';
import { ParametricRackBuilder } from '../src/cad/rendering3d/parametric/ParametricRackBuilder.ts';

globalThis.self = globalThis;

const filePath = path.resolve('backend/uploads/models/racks_1.glb');
const buffer = fs.readFileSync(filePath);
const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

const loader = new GLTFLoader();
loader.parse(arrayBuffer, '', (gltf) => {
  const uploadedGLB = gltf.scene;

  // Detach aux
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

  console.log('Running ParametricRackBuilder.configureParametricShelves with shelfCount=6...');
  const res = ParametricRackBuilder.configureParametricShelves(uploadedGLB, {
    targetWidth: 48,
    targetHeight: 84,
    targetDepth: 24,
    baseWidth: 48,
    baseHeight: 84,
    baseDepth: 24,
    shelfCount: 6,
    shelfThickness: 1.0,
    totalScaleY: 0.98778,
    stage2ScaleY: 1.0,
    isWallMounted: true,
  });

  console.log('Parametric build result:', {
    appliedShelfCount: res.appliedShelfCount,
    shelfLevelsCount: res.shelfLevels.length,
    bracketCount: res.bracketCount,
    isParametric: res.isParametric,
  });

  res.shelfLevels.forEach((l, idx) => {
    console.log(`Level ${idx}: name="${l.shelf?.name}" visible=${l.shelf?.visible} Y=${l.y} LB="${l.leftBracket?.name}" LB.vis=${l.leftBracket?.visible} RB="${l.rightBracket?.name}" RB.vis=${l.rightBracket?.visible}`);
  });

  let visibleMeshes = 0;
  uploadedGLB.traverse((c) => {
    if (c.isMesh && c.visible) {
      visibleMeshes++;
      console.log(`  Visible Mesh: "${c.name}" parent="${c.parent?.name}" pos=(${c.position.x.toFixed(2)}, ${c.position.y.toFixed(2)}, ${c.position.z.toFixed(2)}) parentPos=(${c.parent?.position.x.toFixed(2)}, ${c.parent?.position.y.toFixed(2)}, ${c.parent?.position.z.toFixed(2)})`);
    }
  });
  console.log(`Total visible meshes in uploadedGLB: ${visibleMeshes}`);
});
