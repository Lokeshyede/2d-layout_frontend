import * as THREE from 'three';
import type { ShutterEntity } from '../../types';
import { MaterialPalette3D } from './MaterialPalette3D';

export class Shutter3DBuilder {
  public static buildShutter(shutter: ShutterEntity, wallThickness = 9): THREE.Group {
    const group = new THREE.Group();
    group.name = `Shutter_${shutter.id}`;

    const w = shutter.geometry.width || 96;
    const h = shutter.geometry.height && shutter.geometry.height > 20 ? shutter.geometry.height : 96;
    const d = wallThickness || 9;
    const rotRad = ((shutter.geometry.rotation || 0) * Math.PI) / 180;

    group.position.set(shutter.geometry.x, 0, shutter.geometry.y);
    group.rotation.y = -rotRad;

    const guideWidth = 3.0; // 3 inches wide side guide channels
    const guideDepth = d + 2.0;

    // 1. Left Vertical Guide Rail
    const leftGuideGeom = new THREE.BoxGeometry(guideWidth, h, guideDepth);
    const leftGuide = new THREE.Mesh(leftGuideGeom, MaterialPalette3D.shutterHousingMaterial);
    leftGuide.position.set(-w / 2 + guideWidth / 2, h / 2, 0);
    leftGuide.castShadow = true;
    leftGuide.receiveShadow = true;
    group.add(leftGuide);

    // 2. Right Vertical Guide Rail
    const rightGuideGeom = new THREE.BoxGeometry(guideWidth, h, guideDepth);
    const rightGuide = new THREE.Mesh(rightGuideGeom, MaterialPalette3D.shutterHousingMaterial);
    rightGuide.position.set(w / 2 - guideWidth / 2, h / 2, 0);
    rightGuide.castShadow = true;
    rightGuide.receiveShadow = true;
    group.add(rightGuide);

    // 3. Top Rolling Shutter Canister / Housing Hood Box
    const hoodBoxHeight = 12;
    const hoodBoxDepth = d + 6;
    const hoodGeom = new THREE.BoxGeometry(w + 4, hoodBoxHeight, hoodBoxDepth);
    const hoodMesh = new THREE.Mesh(hoodGeom, MaterialPalette3D.shutterHousingMaterial);
    hoodMesh.position.set(0, h - hoodBoxHeight / 2, 0);
    hoodMesh.castShadow = true;
    hoodMesh.receiveShadow = true;
    group.add(hoodMesh);

    // 4. Shutter Slat Curtain
    // Modern retail display: shutter rolled up partially (e.g. top 40% closed, bottom 60% open for store entrance)
    const curtainH = h * 0.45; // top 45% showing corrugated slats
    const curtainW = w - guideWidth * 2;
    const curtainTopY = h - hoodBoxHeight;
    const curtainBottomY = curtainTopY - curtainH;

    // Slat backing panel
    const curtainGeom = new THREE.BoxGeometry(curtainW, curtainH, 1.2);
    const curtainMesh = new THREE.Mesh(curtainGeom, MaterialPalette3D.shutterCurtainMaterial);
    curtainMesh.position.set(0, curtainBottomY + curtainH / 2, 0);
    curtainMesh.castShadow = true;
    curtainMesh.receiveShadow = true;
    group.add(curtainMesh);

    // Individual horizontal slat ridges for realistic corrugated texture
    const numSlats = 8;
    const slatH = curtainH / numSlats;
    for (let i = 0; i < numSlats; i++) {
      const slatGeom = new THREE.BoxGeometry(curtainW - 0.5, slatH * 0.45, 1.6);
      const slatMesh = new THREE.Mesh(slatGeom, MaterialPalette3D.shutterCurtainMaterial);
      slatMesh.position.set(0, curtainBottomY + (i + 0.5) * slatH, 0);
      slatMesh.castShadow = true;
      group.add(slatMesh);
    }

    // 5. Heavy Bottom Lock Rail Bar
    const lockBarGeom = new THREE.BoxGeometry(curtainW, 2.5, 2.5);
    const lockBar = new THREE.Mesh(lockBarGeom, MaterialPalette3D.shutterLockBarMaterial);
    lockBar.position.set(0, curtainBottomY + 1.25, 0);
    lockBar.castShadow = true;
    group.add(lockBar);

    group.userData = {
      entityId: shutter.id,
      type: 'shutter',
      width: w,
      height: h,
    };

    return group;
  }
}
