import * as THREE from 'three';
import type { WindowEntity } from '../../types';
import { MaterialPalette3D } from './MaterialPalette3D';

export class Window3DBuilder {
  public static buildWindow(win: WindowEntity, wallThickness = 9): THREE.Group {
    const group = new THREE.Group();
    group.name = `Window_${win.id}`;

    const w = win.geometry.width || 48;
    const h = win.geometry.height && win.geometry.height > 10 ? win.geometry.height : 48;
    const d = wallThickness || 9;
    const sillH = 36; // 3 feet sill height
    const rotRad = ((win.geometry.rotation || 0) * Math.PI) / 180;

    group.position.set(win.geometry.x, sillH, win.geometry.y);
    group.rotation.y = -rotRad;

    const frameWidth = 2.0; // 2 inches wide frame trim
    const frameDepth = d + 0.5;

    // 1. Perimeter Window Frame
    // Left jamb
    const leftJambGeom = new THREE.BoxGeometry(frameWidth, h, frameDepth);
    const leftJamb = new THREE.Mesh(leftJambGeom, MaterialPalette3D.windowFrameMaterial);
    leftJamb.position.set(-w / 2 + frameWidth / 2, h / 2, 0);
    leftJamb.castShadow = true;
    leftJamb.receiveShadow = true;
    group.add(leftJamb);

    // Right jamb
    const rightJambGeom = new THREE.BoxGeometry(frameWidth, h, frameDepth);
    const rightJamb = new THREE.Mesh(rightJambGeom, MaterialPalette3D.windowFrameMaterial);
    rightJamb.position.set(w / 2 - frameWidth / 2, h / 2, 0);
    rightJamb.castShadow = true;
    rightJamb.receiveShadow = true;
    group.add(rightJamb);

    // Bottom sill frame
    const bottomFrameGeom = new THREE.BoxGeometry(w, frameWidth, frameDepth);
    const bottomFrame = new THREE.Mesh(bottomFrameGeom, MaterialPalette3D.windowFrameMaterial);
    bottomFrame.position.set(0, frameWidth / 2, 0);
    bottomFrame.castShadow = true;
    bottomFrame.receiveShadow = true;
    group.add(bottomFrame);

    // Top head frame
    const topFrameGeom = new THREE.BoxGeometry(w, frameWidth, frameDepth);
    const topFrame = new THREE.Mesh(topFrameGeom, MaterialPalette3D.windowFrameMaterial);
    topFrame.position.set(0, h - frameWidth / 2, 0);
    topFrame.castShadow = true;
    topFrame.receiveShadow = true;
    group.add(topFrame);

    // 2. Translucent Glass Pane (Center recessed)
    const glassW = w - frameWidth * 2;
    const glassH = h - frameWidth * 2;
    const glassGeom = new THREE.BoxGeometry(glassW, glassH, 0.5);
    const glassMesh = new THREE.Mesh(glassGeom, MaterialPalette3D.windowGlassMaterial);
    glassMesh.position.set(0, h / 2, 0);
    glassMesh.castShadow = false;
    glassMesh.receiveShadow = true;
    group.add(glassMesh);

    // 3. Central Vertical Mullion Division
    if (w >= 40) {
      const mullionGeom = new THREE.BoxGeometry(1.2, glassH, 1.5);
      const mullion = new THREE.Mesh(mullionGeom, MaterialPalette3D.windowFrameMaterial);
      mullion.position.set(0, h / 2, 0);
      mullion.castShadow = true;
      group.add(mullion);
    }

    // 4. Interior Architectural Sill Ledge
    const sillLedgeW = w + 4; // slight overhang
    const sillLedgeD = frameDepth + 2.5;
    const sillLedgeGeom = new THREE.BoxGeometry(sillLedgeW, 1.2, sillLedgeD);
    const sillLedge = new THREE.Mesh(sillLedgeGeom, MaterialPalette3D.windowSillMaterial);
    sillLedge.position.set(0, -0.6, 0.5);
    sillLedge.castShadow = true;
    sillLedge.receiveShadow = true;
    group.add(sillLedge);

    group.userData = {
      entityId: win.id,
      type: 'window',
      width: w,
      height: h,
    };

    return group;
  }
}
