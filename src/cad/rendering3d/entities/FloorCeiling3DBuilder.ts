import * as THREE from 'three';
import type { Point2D } from '../../types';
import { MaterialPalette3D } from './MaterialPalette3D';
import { STANDARD_WALL_HEIGHT } from './Wall3DBuilder';

export class FloorCeiling3DBuilder {
  /**
   * Generates a 3D floor mesh that conforms strictly to the actual room polygon.
   * Handles irregular, angled, slanted, concave, and multi-segmented rooms.
   */
  public static buildFloor(roomPolygon: Point2D[]): THREE.Group {
    const floorGroup = new THREE.Group();
    floorGroup.name = 'StoreFloorGroup';

    if (roomPolygon && roomPolygon.length >= 3) {
      // 1. Polygon Floor for irregular room shapes
      const shape = new THREE.Shape();
      shape.moveTo(roomPolygon[0].x, roomPolygon[0].y);
      for (let i = 1; i < roomPolygon.length; i++) {
        shape.lineTo(roomPolygon[i].x, roomPolygon[i].y);
      }
      shape.closePath();

      const geom = new THREE.ShapeGeometry(shape);
      const floorMesh = new THREE.Mesh(geom, MaterialPalette3D.floorMaterial);
      floorMesh.rotation.x = Math.PI / 2;
      floorMesh.position.set(0, -0.05, 0);
      floorMesh.receiveShadow = true;
      floorGroup.add(floorMesh);

      // DEV-only room footprint polygon (GREEN)
      const devMat = new THREE.MeshBasicMaterial({ color: 0x00ff00, opacity: 0.2, transparent: true, depthWrite: false });
      const devMesh = new THREE.Mesh(geom, devMat);
      devMesh.rotation.x = Math.PI / 2;
      devMesh.position.set(0, 0.1, 0); // Slightly above floor
      devMesh.name = "DEV_ROOM_POLYGON";
      floorGroup.add(devMesh);

      // Add a subtle exterior ground apron around the store building
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const pt of roomPolygon) {
        if (pt.x < minX) minX = pt.x;
        if (pt.x > maxX) maxX = pt.x;
        if (pt.y < minZ) minZ = pt.y;
        if (pt.y > maxZ) maxZ = pt.y;
      }
      const pad = 48; // 4 ft apron
      const apronW = Math.max(120, maxX - minX + pad * 2);
      const apronD = Math.max(120, maxZ - minZ + pad * 2);
      const apronGeom = new THREE.PlaneGeometry(apronW, apronD);
      const apronMat = new THREE.MeshStandardMaterial({
        color: 0x0f172a, // dark slate ground base
        roughness: 0.95,
        metalness: 0.0,
      });
      const apronMesh = new THREE.Mesh(apronGeom, apronMat);
      apronMesh.rotation.x = -Math.PI / 2;
      apronMesh.position.set((minX + maxX) / 2, -0.2, (minZ + maxZ) / 2);
      apronMesh.receiveShadow = true;
      floorGroup.add(apronMesh);

      // Grid helper on apron
      const gridHelper = new THREE.GridHelper(
        Math.max(apronW, apronD),
        Math.round(Math.max(apronW, apronD) / 24),
        0x334155,
        0x1e293b
      );
      gridHelper.position.set((minX + maxX) / 2, -0.15, (minZ + maxZ) / 2);
      floorGroup.add(gridHelper);
    } else {
      // Fallback for empty/unclosed scene
      const w = 240;
      const d = 240;
      const geom = new THREE.PlaneGeometry(w, d);
      const mesh = new THREE.Mesh(geom, MaterialPalette3D.floorMaterial);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(0, -0.05, 0);
      mesh.receiveShadow = true;
      floorGroup.add(mesh);

      const grid = new THREE.GridHelper(w, 10, 0xcbd5e1, 0xe2e8f0);
      grid.position.set(0, 0, 0);
      floorGroup.add(grid);
    }

    return floorGroup;
  }

  /**
   * Generates a 3D ceiling mesh that matches the room polygon at wall height.
   */
  public static buildCeiling(
    roomPolygon: Point2D[],
    ceilingHeight = STANDARD_WALL_HEIGHT
  ): THREE.Group {
    const ceilingGroup = new THREE.Group();
    ceilingGroup.name = 'StoreCeilingGroup';

    if (roomPolygon && roomPolygon.length >= 3) {
      const shape = new THREE.Shape();
      shape.moveTo(roomPolygon[0].x, roomPolygon[0].y);
      for (let i = 1; i < roomPolygon.length; i++) {
        shape.lineTo(roomPolygon[i].x, roomPolygon[i].y);
      }
      shape.closePath();

      const geom = new THREE.ShapeGeometry(shape);
      const ceilingMesh = new THREE.Mesh(geom, MaterialPalette3D.ceilingMaterial);
      ceilingMesh.rotation.x = Math.PI / 2;
      ceilingMesh.position.set(0, ceilingHeight, 0);
      ceilingMesh.receiveShadow = true;
      ceilingMesh.castShadow = true;
      ceilingGroup.add(ceilingMesh);
    }

    return ceilingGroup;
  }
}
