import * as THREE from 'three';
import type { GlassGateEntity } from '../../types';
import { MaterialPalette3D } from './MaterialPalette3D';

export class GlassGate3DBuilder {
  public static buildGlassGate(gate: GlassGateEntity): THREE.Group {
    const group = new THREE.Group();
    group.name = `GlassGate_${gate.id}`;

    const w = gate.geometry.width || 72;
    const h = gate.geometry.height && gate.geometry.height > 20 ? gate.geometry.height : 48; // Standard 48" entrance turnstile/gate height
    const rotRad = ((gate.geometry.rotation || 0) * Math.PI) / 180;

    group.position.set(gate.geometry.x, 0, gate.geometry.y);
    group.rotation.y = -rotRad;

    const stanchionRadius = 3.5;
    const stanchionHeight = Math.max(h, 42);

    // 1. Left Stanchion / Pivot Pedestal
    const leftStanchionGroup = this.createPedestal(stanchionRadius, stanchionHeight);
    leftStanchionGroup.position.set(-w / 2 + stanchionRadius + 1, 0, 0);
    group.add(leftStanchionGroup);

    // 2. Right Stanchion / Pivot Pedestal
    const rightStanchionGroup = this.createPedestal(stanchionRadius, stanchionHeight);
    rightStanchionGroup.position.set(w / 2 - stanchionRadius - 1, 0, 0);
    group.add(rightStanchionGroup);

    // 3. Central Frameless Tempered Glass Swing Leaves (Double Leaf Gate)
    const availableWidth = w - (stanchionRadius * 2 + 2) * 2;
    const leafWidth = Math.max(12, availableWidth / 2 - 1.5);
    const leafHeight = stanchionHeight - 6;
    const leafThickness = 0.75; // Heavy 3/4" commercial tempered glass

    // Left Glass Leaf (attached to left stanchion, slightly open 10° for realism)
    const leftLeafGroup = new THREE.Group();
    leftLeafGroup.position.set(-w / 2 + stanchionRadius * 2 + 2, 0, 0);
    leftLeafGroup.rotation.y = 0.15;

    const leafGeom = new THREE.BoxGeometry(leafWidth, leafHeight, leafThickness);
    const leftLeafMesh = new THREE.Mesh(leafGeom, MaterialPalette3D.glassGateLeafMaterial);
    leftLeafMesh.position.set(leafWidth / 2, leafHeight / 2 + 3, 0);
    leftLeafMesh.receiveShadow = true;
    leftLeafGroup.add(leftLeafMesh);

    // Tubular stainless steel push bar
    const barGeom = new THREE.CylinderGeometry(0.6, 0.6, leafWidth * 0.75, 16);
    const barMesh = new THREE.Mesh(barGeom, MaterialPalette3D.glassGateStanchionMaterial);
    barMesh.rotation.z = Math.PI / 2;
    barMesh.position.set(leafWidth / 2, leafHeight * 0.65, leafThickness / 2 + 0.8);
    barMesh.castShadow = true;
    leftLeafGroup.add(barMesh);

    group.add(leftLeafGroup);

    // Right Glass Leaf (attached to right stanchion, slightly open -10°)
    const rightLeafGroup = new THREE.Group();
    rightLeafGroup.position.set(w / 2 - stanchionRadius * 2 - 2, 0, 0);
    rightLeafGroup.rotation.y = -0.15;

    const rightLeafMesh = new THREE.Mesh(leafGeom, MaterialPalette3D.glassGateLeafMaterial);
    rightLeafMesh.position.set(-leafWidth / 2, leafHeight / 2 + 3, 0);
    rightLeafMesh.receiveShadow = true;
    rightLeafGroup.add(rightLeafMesh);

    const rightBarMesh = new THREE.Mesh(barGeom, MaterialPalette3D.glassGateStanchionMaterial);
    rightBarMesh.rotation.z = Math.PI / 2;
    rightBarMesh.position.set(-leafWidth / 2, leafHeight * 0.65, leafThickness / 2 + 0.8);
    rightBarMesh.castShadow = true;
    rightLeafGroup.add(rightBarMesh);

    group.add(rightLeafGroup);

    group.userData = {
      entityId: gate.id,
      type: 'glass_gate',
      width: w,
      height: h,
    };

    return group;
  }

  private static createPedestal(radius: number, height: number): THREE.Group {
    const group = new THREE.Group();

    // Cylindrical Column
    const colGeom = new THREE.CylinderGeometry(radius, radius, height, 24);
    const colMesh = new THREE.Mesh(colGeom, MaterialPalette3D.glassGateStanchionMaterial);
    colMesh.position.set(0, height / 2, 0);
    colMesh.castShadow = true;
    colMesh.receiveShadow = true;
    group.add(colMesh);

    // Base Mounting Flange
    const baseGeom = new THREE.CylinderGeometry(radius + 1.2, radius + 1.2, 1.0, 24);
    const baseMesh = new THREE.Mesh(baseGeom, MaterialPalette3D.glassGateStanchionMaterial);
    baseMesh.position.set(0, 0.5, 0);
    baseMesh.castShadow = true;
    group.add(baseMesh);

    // Top Cap with LED access indicator ring
    const capGeom = new THREE.CylinderGeometry(radius + 0.2, radius + 0.2, 1.5, 24);
    const capMesh = new THREE.Mesh(capGeom, MaterialPalette3D.glassGateStanchionMaterial);
    capMesh.position.set(0, height + 0.75, 0);
    group.add(capMesh);

    const ledGeom = new THREE.CylinderGeometry(radius * 0.6, radius * 0.6, 0.4, 24);
    const ledMesh = new THREE.Mesh(ledGeom, MaterialPalette3D.glassGateLedMaterial);
    ledMesh.position.set(0, height + 1.6, 0);
    group.add(ledMesh);

    return group;
  }
}
