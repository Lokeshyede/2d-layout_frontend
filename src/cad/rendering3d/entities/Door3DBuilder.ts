import * as THREE from 'three';
import type { DoorEntity } from '../../types';
import { MaterialPalette3D } from './MaterialPalette3D';

export class Door3DBuilder {
  public static buildDoor(door: DoorEntity, wallThickness = 9): THREE.Group {
    const group = new THREE.Group();
    group.name = `Door_${door.id}`;

    const w = door.geometry.width || 36;
    const h = door.geometry.height && door.geometry.height > 20 ? door.geometry.height : 84;
    const d = wallThickness || 9;
    const rotRad = ((door.geometry.rotation || 0) * Math.PI) / 180;

    group.position.set(door.geometry.x, 0, door.geometry.y);
    group.rotation.y = -rotRad;

    const frameWidth = 2; // 2 inches wide frame trim
    const frameDepth = d + 0.5; // slight reveal past wall plaster

    // 1. Door Frame - Left Jamb
    const leftJambGeom = new THREE.BoxGeometry(frameWidth, h, frameDepth);
    const leftJamb = new THREE.Mesh(leftJambGeom, MaterialPalette3D.doorFrameMaterial);
    leftJamb.position.set(-w / 2 + frameWidth / 2, h / 2, 0);
    leftJamb.castShadow = true;
    leftJamb.receiveShadow = true;
    group.add(leftJamb);

    // 2. Door Frame - Right Jamb
    const rightJambGeom = new THREE.BoxGeometry(frameWidth, h, frameDepth);
    const rightJamb = new THREE.Mesh(rightJambGeom, MaterialPalette3D.doorFrameMaterial);
    rightJamb.position.set(w / 2 - frameWidth / 2, h / 2, 0);
    rightJamb.castShadow = true;
    rightJamb.receiveShadow = true;
    group.add(rightJamb);

    // 3. Door Frame - Top Header Jamb
    const headerGeom = new THREE.BoxGeometry(w, frameWidth, frameDepth);
    const header = new THREE.Mesh(headerGeom, MaterialPalette3D.doorFrameMaterial);
    header.position.set(0, h - frameWidth / 2, 0);
    header.castShadow = true;
    header.receiveShadow = true;
    group.add(header);

    // 4. Door Leaf / Panel (Clean modern commercial architectural door panel)
    const leafWidth = w - frameWidth * 2;
    const leafHeight = h - frameWidth;
    const leafThickness = 1.75; // standard commercial 1-3/4" door

    // Pivot group at hinge side
    const isLeftHinged = door.properties.flipSide !== 'right';
    const hingeX = isLeftHinged ? -w / 2 + frameWidth : w / 2 - frameWidth;

    const leafPivot = new THREE.Group();
    leafPivot.position.set(hingeX, 0, 0);

    // Slight ajar angle (15 degrees) so the door is physically readable
    const ajarRad = isLeftHinged ? 0.25 : -0.25;
    leafPivot.rotation.y = ajarRad;

    const leafGeom = new THREE.BoxGeometry(leafWidth, leafHeight, leafThickness);
    const leafMesh = new THREE.Mesh(leafGeom, MaterialPalette3D.doorLeafMaterial);
    // Offset center from hinge
    leafMesh.position.set(isLeftHinged ? leafWidth / 2 : -leafWidth / 2, leafHeight / 2, 0);
    leafMesh.castShadow = true;
    leafMesh.receiveShadow = true;
    leafPivot.add(leafMesh);

    // 5. Door Hardware (Brushed Stainless Steel Commercial Lever Handle at 38" height)
    const handleY = 38;
    const handleDistFromEdge = 2.5;
    const handleLocalX = isLeftHinged ? leafWidth - handleDistFromEdge : -(leafWidth - handleDistFromEdge);

    const rosetteGeom = new THREE.CylinderGeometry(1.2, 1.2, 0.25, 16);
    const rosette = new THREE.Mesh(rosetteGeom, MaterialPalette3D.metalHardwareMaterial);
    rosette.rotation.x = Math.PI / 2;
    rosette.position.set(handleLocalX, handleY, leafThickness / 2 + 0.12);
    leafPivot.add(rosette);

    const leverGeom = new THREE.BoxGeometry(isLeftHinged ? -4.5 : 4.5, 0.6, 0.6);
    const lever = new THREE.Mesh(leverGeom, MaterialPalette3D.metalHardwareMaterial);
    lever.position.set(isLeftHinged ? handleLocalX - 2.25 : handleLocalX + 2.25, handleY, leafThickness / 2 + 1.2);
    lever.castShadow = true;
    leafPivot.add(lever);

    group.add(leafPivot);

    group.userData = {
      entityId: door.id,
      type: 'door',
      width: w,
      height: h,
    };

    return group;
  }
}
