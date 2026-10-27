import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import fs from 'fs';
import path from 'path';

globalThis.self = globalThis;

async function inspectGLB(filePath) {
  console.log(`\n============================================================`);
  console.log(`INSPECTING GLB: ${filePath}`);
  console.log(`============================================================`);

  const buffer = fs.readFileSync(filePath);
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

  const loader = new GLTFLoader();
  return new Promise((resolve, reject) => {
    loader.parse(arrayBuffer, '', (gltf) => {
      try {
        const scene = gltf.scene;
        scene.updateMatrixWorld(true);

        const entireBox = new THREE.Box3().setFromObject(scene);
        const entireSize = new THREE.Vector3();
        entireBox.getSize(entireSize);
        console.log(`Overall Scene Box:`);
        console.log(`  Min: (${entireBox.min.x.toFixed(4)}, ${entireBox.min.y.toFixed(4)}, ${entireBox.min.z.toFixed(4)})`);
        console.log(`  Max: (${entireBox.max.x.toFixed(4)}, ${entireBox.max.y.toFixed(4)}, ${entireBox.max.z.toFixed(4)})`);
        console.log(`  Size (native): (${entireSize.x.toFixed(4)}, ${entireSize.y.toFixed(4)}, ${entireSize.z.toFixed(4)})`);
        console.log(`  Size (inches if native=m): (${(entireSize.x * 39.3701).toFixed(2)}", ${(entireSize.y * 39.3701).toFixed(2)}", ${(entireSize.z * 39.3701).toFixed(2)}")`);

        console.log(`\n--- COMPLETE SCENE HIERARCHY ---`);
        function printNode(node, depth = 0, index = 0) {
          const indent = '  '.repeat(depth);
          const localPos = node.position;
          const localRot = node.rotation;
          const localScale = node.scale;

          const worldPos = new THREE.Vector3();
          const worldQuat = new THREE.Quaternion();
          const worldScale = new THREE.Vector3();
          node.matrixWorld.decompose(worldPos, worldQuat, worldScale);
          const worldEuler = new THREE.Euler().setFromQuaternion(worldQuat);

          const box = new THREE.Box3().setFromObject(node);
          const size = new THREE.Vector3();
          box.getSize(size);

          let geomInfo = '';
          if (node.isMesh && node.geometry) {
            if (!node.geometry.boundingBox) node.geometry.computeBoundingBox();
            const gBox = node.geometry.boundingBox;
            const gSize = new THREE.Vector3();
            gBox.getSize(gSize);
            geomInfo = `\n${indent}  [GEOMETRY] Box: min=(${gBox.min.x.toFixed(3)}, ${gBox.min.y.toFixed(3)}, ${gBox.min.z.toFixed(3)}) max=(${gBox.max.x.toFixed(3)}, ${gBox.max.y.toFixed(3)}, ${gBox.max.z.toFixed(3)}) size=(${gSize.x.toFixed(3)}, ${gSize.y.toFixed(3)}, ${gSize.z.toFixed(3)}) Mat=${node.material?.name || node.material?.type}`;
          }

          console.log(`${indent}[${index}] "${node.name}" (${node.type})`);
          console.log(`${indent}  LocalPos: (${localPos.x.toFixed(4)}, ${localPos.y.toFixed(4)}, ${localPos.z.toFixed(4)}) RotRad: (${localRot.x.toFixed(4)}, ${localRot.y.toFixed(4)}, ${localRot.z.toFixed(4)}) Scale: (${localScale.x.toFixed(4)}, ${localScale.y.toFixed(4)}, ${localScale.z.toFixed(4)})`);
          console.log(`${indent}  WorldPos: (${worldPos.x.toFixed(4)}, ${worldPos.y.toFixed(4)}, ${worldPos.z.toFixed(4)}) WorldRot: (${worldEuler.x.toFixed(4)}, ${worldEuler.y.toFixed(4)}, ${worldEuler.z.toFixed(4)})`);
          console.log(`${indent}  WorldBounds: Size=(${size.x.toFixed(4)}, ${size.y.toFixed(4)}, ${size.z.toFixed(4)}) [${(size.x*39.3701).toFixed(2)}" x ${(size.y*39.3701).toFixed(2)}" x ${(size.z*39.3701).toFixed(2)}"]`);
          if (geomInfo) console.log(geomInfo);

          node.children.forEach((child, i) => printNode(child, depth + 1, i));
        }

        printNode(scene);

        resolve();
      } catch (err) {
        reject(err);
      }
    }, reject);
  });
}

async function run() {
  const modelsDir = path.resolve('backend/uploads/models');
  await inspectGLB(path.join(modelsDir, 'racks_1.glb'));
  if (fs.existsSync(path.join(modelsDir, 'RACKS.glb'))) {
    await inspectGLB(path.join(modelsDir, 'RACKS.glb'));
  }
}

run().catch(console.error);
