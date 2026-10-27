import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import fs from 'fs';

globalThis.self = globalThis;
const buffer = fs.readFileSync('../backend/uploads/models/racks_1.glb');
const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

const loader = new GLTFLoader();
loader.parse(arrayBuffer, '', (gltf) => {
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);

  const assembly = scene.children[0].children[0];
  const innerNode = assembly.children[2].children[0];
  const leftUpright = innerNode.children[2];
  const rightUpright = innerNode.children[4];

  const lb0 = leftUpright.children[0];
  const rb0 = rightUpright.children[0];
  const s11 = innerNode.children[11];

  // Let's compute world direction vectors
  const forwardLocal = new THREE.Vector3(1, 0, 0); // local X of mesh
  const v_lb = forwardLocal.clone().transformDirection(lb0.matrixWorld);
  const v_rb = forwardLocal.clone().transformDirection(rb0.matrixWorld);

  console.log('Left Bracket forward vector in world:', v_lb);
  console.log('Right Bracket forward vector in world:', v_rb);

  // Also check local Y and Z vectors in world
  const yLocal = new THREE.Vector3(0, 1, 0);
  const zLocal = new THREE.Vector3(0, 0, 1);

  console.log('LB local Y in world:', yLocal.clone().transformDirection(lb0.matrixWorld));
  console.log('LB local Z in world:', zLocal.clone().transformDirection(lb0.matrixWorld));

  console.log('RB local Y in world:', yLocal.clone().transformDirection(rb0.matrixWorld));
  console.log('RB local Z in world:', zLocal.clone().transformDirection(rb0.matrixWorld));
});
