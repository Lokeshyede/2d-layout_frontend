import * as THREE from 'three';
import type { ColumnEntity, WallEntity } from '../../types';
import { MaterialPalette3D } from './MaterialPalette3D';
import { STANDARD_WALL_HEIGHT } from './Wall3DBuilder';

export class Column3DBuilder {
  public static buildColumn(
    col: ColumnEntity,
    attachedWall?: WallEntity,
    columnHeight = STANDARD_WALL_HEIGHT
  ): THREE.Group {
    const group = new THREE.Group();
    group.name = `Column_${col.id}`;

    const isWallCol = col.properties.columnType === 'wall';
    const w = col.geometry.width || 24; // Dimension along wall
    const d = col.properties.inwardProjection || col.geometry.height || 24; // Projection inward
    const h = columnHeight;

    let rotRad = ((col.geometry.rotation || 0) * Math.PI) / 180;

    // If attached to a wall, follow the wall orientation
    if (isWallCol && attachedWall) {
      const dx = attachedWall.geometry.x2 - attachedWall.geometry.x1;
      const dy = attachedWall.geometry.y2 - attachedWall.geometry.y1;
      const wallAngle = Math.atan2(dy, dx);
      rotRad = wallAngle;
    }

    group.position.set(col.geometry.x, 0, col.geometry.y);
    group.rotation.y = -rotRad;

    // 1. Main Column Shaft
    const shaftGeom = new THREE.BoxGeometry(w, h, d);
    const shaftMesh = new THREE.Mesh(shaftGeom, MaterialPalette3D.columnMaterial);
    shaftMesh.position.set(0, h / 2, 0);
    shaftMesh.castShadow = true;
    shaftMesh.receiveShadow = true;
    group.add(shaftMesh);

    // 2. Architectural Base Plinth (Bottom 4 inches)
    const plinthH = 4.0;
    const plinthGeom = new THREE.BoxGeometry(w + 1.0, plinthH, d + 1.0);
    const plinthMesh = new THREE.Mesh(plinthGeom, MaterialPalette3D.columnAccentMaterial);
    plinthMesh.position.set(0, plinthH / 2, 0);
    plinthMesh.castShadow = true;
    plinthMesh.receiveShadow = true;
    group.add(plinthMesh);

    // 3. Architectural Top Capital Molding (Top 3 inches)
    const capH = 3.0;
    const capGeom = new THREE.BoxGeometry(w + 1.2, capH, d + 1.2);
    const capMesh = new THREE.Mesh(capGeom, MaterialPalette3D.columnAccentMaterial);
    capMesh.position.set(0, h - capH / 2, 0);
    capMesh.castShadow = true;
    group.add(capMesh);

    group.userData = {
      entityId: col.id,
      type: 'column',
      columnType: col.properties.columnType,
      width: w,
      depth: d,
      height: h,
    };

    return group;
  }
}
