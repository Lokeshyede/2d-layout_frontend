import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import fs from 'fs';

const loader = new GLTFLoader();
loader.parse(
  fs.readFileSync('../backend/uploads/models/Croner_rack_8fafc7f2.glb').buffer,
  '',
  (gltf) => {
    const scene = gltf.scene;
    scene.updateMatrixWorld(true);
    
    // Scale it to inches (since native box is massive, we assume mm or some raw CAD unit)
    const rawBox = new THREE.Box3().setFromObject(scene);
    const rawSize = rawBox.getSize(new THREE.Vector3());
    // target native dimensions: X=32.52", Y=84.89", Z=37.21"
    const scaleFactor = 32.52 / rawSize.x;
    scene.scale.set(scaleFactor, scaleFactor, scaleFactor);
    scene.updateMatrixWorld(true);

    const box = new THREE.Box3();
    scene.traverse(c => {
      if(['3','4','11','12','13','29'].some(id => c.name.includes('3DGeom-'+id))) {
        c.updateMatrixWorld(true);
        box.union(new THREE.Box3().setFromObject(c));
      }
    });

    const fullBox = new THREE.Box3().setFromObject(scene);
    
    // Corner anchor from metadata
    const cornerAnchor = new THREE.Vector3(427.33, 0, -766.05);
    // apply scale to corner anchor
    cornerAnchor.multiplyScalar(scaleFactor);

    console.log('Corner Anchor (Scaled):', cornerAnchor);
    console.log('Shelf Box Min (Scaled):', box.min);
    console.log('Shelf Box Max (Scaled):', box.max);
    
    console.log('Distance from Anchor to Shelf X Min:', Math.abs(cornerAnchor.x - box.min.x));
    console.log('Distance from Anchor to Shelf X Max:', Math.abs(cornerAnchor.x - box.max.x));
    
    console.log('Distance from Anchor to Shelf Z Min:', Math.abs(cornerAnchor.z - box.min.z));
    console.log('Distance from Anchor to Shelf Z Max:', Math.abs(cornerAnchor.z - box.max.z));

  },
  (err) => console.error(err)
);
