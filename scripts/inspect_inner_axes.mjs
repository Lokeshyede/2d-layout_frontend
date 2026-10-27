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
  const rackNode = assembly.children[2]; // Child 2
  const innerNode = rackNode.children[0];

  console.log('rackNode rotation:', rackNode.rotation);
  console.log('rackNode position:', rackNode.position);
  console.log('innerNode rotation:', innerNode.rotation);
  console.log('innerNode position:', innerNode.position);

  // Check how a point in innerNode transforms to world
  const p1 = new THREE.Vector3(0, 0, 0);
  const p2 = new THREE.Vector3(1, 0, 0);
  const p3 = new THREE.Vector3(0, 1, 0);
  const p4 = new THREE.Vector3(0, 0, 1);

  innerNode.localToWorld(p1);
  innerNode.localToWorld(p2);
  innerNode.localToWorld(p3);
  innerNode.localToWorld(p4);

  console.log('innerNode (0,0,0) -> world:', p1);
  console.log('innerNode (1,0,0) -> world:', p2, 'delta from p1:', p2.clone().sub(p1));
  console.log('innerNode (0,1,0) -> world:', p3, 'delta from p1:', p3.clone().sub(p1));
  console.log('innerNode (0,0,1) -> world:', p4, 'delta from p1:', p4.clone().sub(p1));
});
