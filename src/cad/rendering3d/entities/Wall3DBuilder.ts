import * as THREE from 'three';
import type { WallEntity, CADEntity, DoorEntity, WindowEntity, ShutterEntity, GlassGateEntity } from '../../types';
import { MaterialPalette3D } from './MaterialPalette3D';

export const STANDARD_WALL_HEIGHT = 120; // 10 feet standard store wall height

export interface WallOpeningInterval {
  entityId: string;
  type: 'door' | 'window' | 'shutter' | 'gate' | 'glass_gate';
  startAlongWall: number;
  endAlongWall: number;
  centerAlongWall: number;
  width: number;
  height: number;
  sillHeight?: number;
}

export class Wall3DBuilder {
  /**
   * Builds an exact 3D physical wall with real physical opening cutouts for doors,
   * windows, shutters, and gates.
   */
  public static buildWall(
    wall: WallEntity,
    attachedEntities: CADEntity[] = [],
    wallHeight = STANDARD_WALL_HEIGHT
  ): THREE.Group {
    const wallGroup = new THREE.Group();
    wallGroup.name = `Wall_${wall.id}`;

    const { x1, y1, x2, y2 } = wall.geometry;
    const thickness = wall.properties.thickness || 9;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.hypot(dx, dy);

    if (length < 0.1) return wallGroup;

    const angle2D = Math.atan2(dy, dx);
    const midX = (x1 + x2) / 2;
    const midZ = (y1 + y2) / 2;

    wallGroup.position.set(midX, 0, midZ);
    wallGroup.rotation.y = -angle2D; // Inverted for canvas +Y to Three.js +Z

    // 1. Collect and calculate opening intervals along this wall
    const intervals: WallOpeningInterval[] = [];

    for (const ent of attachedEntities) {
      if (
        ent.type !== 'door' &&
        ent.type !== 'window' &&
        ent.type !== 'shutter' &&
        ent.type !== 'glass_gate'
      ) {
        continue;
      }

      // Check if attached to this wall (or near wall segment)
      const attachedId = (ent as any).properties?.attachedWallId;
      const geom = (ent as any).geometry;
      if (!geom || geom.x === undefined || geom.y === undefined) continue;

      // Project entity position onto wall line
      const t = ((geom.x - x1) * dx + (geom.y - y1) * dy) / (length * length);
      const distAlong = t * length;

      // Calculate perpendicular distance to wall line
      const projX = x1 + (dx / length) * distAlong;
      const projY = y1 + (dy / length) * distAlong;
      const perpDist = Math.hypot(geom.x - projX, geom.y - projY);

      const isExplicitlyAttached = attachedId === wall.id;
      const isCloseToWall = perpDist <= thickness * 1.5 && t >= -0.05 && t <= 1.05;

      if (!isExplicitlyAttached && !isCloseToWall) continue;

      const w = Math.min(geom.width || 36, length);
      let h = 84;
      let sillH: number | undefined = undefined;

      if (ent.type === 'door') {
        const door = ent as DoorEntity;
        h = Math.min(door.geometry.height && door.geometry.height > 20 ? door.geometry.height : 84, wallHeight);
      } else if (ent.type === 'window') {
        const win = ent as WindowEntity;
        h = Math.min(win.geometry.height && win.geometry.height > 10 ? win.geometry.height : 48, wallHeight - 36);
        sillH = 36; // 3 feet sill
      } else if (ent.type === 'shutter') {
        const sh = ent as ShutterEntity;
        h = Math.min(sh.geometry.height && sh.geometry.height > 20 ? sh.geometry.height : 96, wallHeight);
      } else if (ent.type === 'glass_gate') {
        const gg = ent as GlassGateEntity;
        h = Math.min(gg.geometry.height && gg.geometry.height > 20 ? gg.geometry.height : 84, wallHeight);
      }

      const start = Math.max(0, distAlong - w / 2);
      const end = Math.min(length, distAlong + w / 2);

      if (end > start + 1) {
        intervals.push({
          entityId: ent.id,
          type: ent.type as any,
          startAlongWall: start,
          endAlongWall: end,
          centerAlongWall: distAlong,
          width: end - start,
          height: h,
          sillHeight: sillH,
        });
      }
    }

    // Sort intervals along wall
    intervals.sort((a, b) => a.startAlongWall - b.startAlongWall);

    // 2. If no valid openings, create single monolithic solid wall
    if (intervals.length === 0) {
      const geom = new THREE.BoxGeometry(length, wallHeight, thickness);
      const mesh = new THREE.Mesh(geom, MaterialPalette3D.wallMaterial);
      mesh.position.set(0, wallHeight / 2, 0);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData = { entityId: wall.id, type: 'wall' };
      wallGroup.add(mesh);
      return wallGroup;
    }

    // 3. Segmented Wall generation with physical cutouts
    // Origin of local wall space: X = 0 is center of wall length (-length/2 to +length/2)
    let currentCursor = 0;

    for (const iv of intervals) {
      // A. Solid wall segment before opening
      if (iv.startAlongWall > currentCursor + 0.1) {
        const segLen = iv.startAlongWall - currentCursor;
        const segCenterAlong = currentCursor + segLen / 2;
        const localX = segCenterAlong - length / 2;

        const solidGeom = new THREE.BoxGeometry(segLen, wallHeight, thickness);
        const solidMesh = new THREE.Mesh(solidGeom, MaterialPalette3D.wallMaterial);
        solidMesh.position.set(localX, wallHeight / 2, 0);
        solidMesh.castShadow = true;
        solidMesh.receiveShadow = true;
        solidMesh.userData = { entityId: wall.id, type: 'wall_segment' };
        wallGroup.add(solidMesh);
      }

      // B. Opening interval: Lintel above & Sill below (if window)
      const opLen = iv.endAlongWall - iv.startAlongWall;
      const opCenterAlong = (iv.startAlongWall + iv.endAlongWall) / 2;
      const opLocalX = opCenterAlong - length / 2;

      if (iv.type === 'window' && iv.sillHeight !== undefined && iv.sillHeight > 0.5) {
        // Bottom wall beneath window
        const sillGeom = new THREE.BoxGeometry(opLen, iv.sillHeight, thickness);
        const sillMesh = new THREE.Mesh(sillGeom, MaterialPalette3D.wallMaterial);
        sillMesh.position.set(opLocalX, iv.sillHeight / 2, 0);
        sillMesh.castShadow = true;
        sillMesh.receiveShadow = true;
        wallGroup.add(sillMesh);

        // Top lintel wall above window
        const windowTop = iv.sillHeight + iv.height;
        const lintelH = wallHeight - windowTop;
        if (lintelH > 0.5) {
          const lintelGeom = new THREE.BoxGeometry(opLen, lintelH, thickness);
          const lintelMesh = new THREE.Mesh(lintelGeom, MaterialPalette3D.wallMaterial);
          lintelMesh.position.set(opLocalX, windowTop + lintelH / 2, 0);
          lintelMesh.castShadow = true;
          lintelMesh.receiveShadow = true;
          wallGroup.add(lintelMesh);
        }
      } else {
        // Door, Shutter, Gate: Opening goes to floor (Y = 0)
        // Top lintel / header above opening
        const lintelH = wallHeight - iv.height;
        if (lintelH > 0.5) {
          const lintelGeom = new THREE.BoxGeometry(opLen, lintelH, thickness);
          const lintelMesh = new THREE.Mesh(lintelGeom, MaterialPalette3D.wallMaterial);
          lintelMesh.position.set(opLocalX, iv.height + lintelH / 2, 0);
          lintelMesh.castShadow = true;
          lintelMesh.receiveShadow = true;
          wallGroup.add(lintelMesh);
        }
      }

      currentCursor = Math.max(currentCursor, iv.endAlongWall);
    }

    // C. Final solid wall segment after last opening
    if (length > currentCursor + 0.1) {
      const segLen = length - currentCursor;
      const segCenterAlong = currentCursor + segLen / 2;
      const localX = segCenterAlong - length / 2;

      const solidGeom = new THREE.BoxGeometry(segLen, wallHeight, thickness);
      const solidMesh = new THREE.Mesh(solidGeom, MaterialPalette3D.wallMaterial);
      solidMesh.position.set(localX, wallHeight / 2, 0);
      solidMesh.castShadow = true;
      solidMesh.receiveShadow = true;
      solidMesh.userData = { entityId: wall.id, type: 'wall_segment' };
      wallGroup.add(solidMesh);
    }

    wallGroup.userData = { entityId: wall.id, type: 'wall', openingsCount: intervals.length };
    return wallGroup;
  }
}
