import * as THREE from 'three';
import type { CADEntity } from '../../types';
import { MaterialPalette3D } from './MaterialPalette3D';

export class Gate3DBuilder {
  public static buildGate(gate: CADEntity): THREE.Group {
    const group = new THREE.Group();
    group.name = `Gate_${gate.id}`;

    const geom = (gate as any).geometry || {};
    const w = geom.width || 48;
    const h = geom.height && geom.height > 20 ? geom.height : 72;
    const rotRad = ((geom.rotation || 0) * Math.PI) / 180;

    group.position.set(geom.x || 0, 0, geom.y || 0);
    group.rotation.y = -rotRad;

    const postSize = 3.0; // 3x3 inches structural steel posts

    // 1. Left Post
    const leftPostGeom = new THREE.BoxGeometry(postSize, h, postSize);
    const leftPost = new THREE.Mesh(leftPostGeom, MaterialPalette3D.gateFrameMaterial);
    leftPost.position.set(-w / 2 + postSize / 2, h / 2, 0);
    leftPost.castShadow = true;
    leftPost.receiveShadow = true;
    group.add(leftPost);

    // 2. Right Post
    const rightPostGeom = new THREE.BoxGeometry(postSize, h, postSize);
    const rightPost = new THREE.Mesh(rightPostGeom, MaterialPalette3D.gateFrameMaterial);
    rightPost.position.set(w / 2 - postSize / 2, h / 2, 0);
    rightPost.castShadow = true;
    rightPost.receiveShadow = true;
    group.add(rightPost);

    // 3. Horizontal Frame Rails (Top & Bottom)
    const railW = w - postSize * 2;
    const topRailGeom = new THREE.BoxGeometry(railW, 2.0, 2.0);
    const topRail = new THREE.Mesh(topRailGeom, MaterialPalette3D.gateFrameMaterial);
    topRail.position.set(0, h - 2, 0);
    topRail.castShadow = true;
    group.add(topRail);

    const bottomRailGeom = new THREE.BoxGeometry(railW, 2.0, 2.0);
    const bottomRail = new THREE.Mesh(bottomRailGeom, MaterialPalette3D.gateFrameMaterial);
    bottomRail.position.set(0, 4, 0);
    bottomRail.castShadow = true;
    group.add(bottomRail);

    // 4. Vertical Security Grille Bars
    const numBars = Math.max(3, Math.floor(railW / 6));
    const barSpacing = railW / (numBars + 1);
    const barHeight = h - 8;
    const barGeom = new THREE.CylinderGeometry(0.5, 0.5, barHeight, 12);

    for (let i = 1; i <= numBars; i++) {
      const barX = -railW / 2 + i * barSpacing;
      const barMesh = new THREE.Mesh(barGeom, MaterialPalette3D.gateBarsMaterial);
      barMesh.position.set(barX, h / 2, 0);
      barMesh.castShadow = true;
      group.add(barMesh);
    }

    // 5. Center Hasp / Handle Plate
    const latchGeom = new THREE.BoxGeometry(3.0, 4.0, 2.5);
    const latch = new THREE.Mesh(latchGeom, MaterialPalette3D.gateFrameMaterial);
    latch.position.set(0, h / 2, 0);
    latch.castShadow = true;
    group.add(latch);

    group.userData = {
      entityId: gate.id,
      type: 'gate',
      width: w,
      height: h,
    };

    return group;
  }
}
