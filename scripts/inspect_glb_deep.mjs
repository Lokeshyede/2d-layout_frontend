import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import fs from 'fs';

globalThis.self = globalThis;
const buffer = fs.readFileSync('../backend/uploads/models/racks_1.glb');
const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

const loader = new GLTFLoader();
loader.parse(arrayBuffer, '', (gltf) => {
  const scene = gltf.scene;

  console.log('=== GLB SCENE GRAPH DUMP ===');
  function dump(node, depth = 0, index = 0) {
    const indent = '  '.repeat(depth);
    const box = new THREE.Box3().setFromObject(node);
    const size = new THREE.Vector3();
    box.getSize(size);
    const min = box.min;
    const max = box.max;
    const pos = node.position;
    const rot = node.rotation;
    const scl = node.scale;
    const meshInfo = node.isMesh ? ` [MESH mat=${node.material?.name || 'def'}]` : '';
    console.log(indent + '[' + index + '] ' + (node.name || 'unnamed') + ' (' + node.type + ')' + meshInfo +
      ' localPos=(' + pos.x.toFixed(2) + ', ' + pos.y.toFixed(2) + ', ' + pos.z.toFixed(2) + ')' +
      ' bounds=(' + size.x.toFixed(2) + ' x ' + size.y.toFixed(2) + ' x ' + size.z.toFixed(2) + ')' +
      ' boxMin=(' + min.x.toFixed(2) + ', ' + min.y.toFixed(2) + ', ' + min.z.toFixed(2) + ')' +
      ' boxMax=(' + max.x.toFixed(2) + ', ' + max.y.toFixed(2) + ', ' + max.z.toFixed(2) + ')');

    node.children.forEach((child, i) => dump(child, depth + 1, i));
  }

  dump(scene);
});
