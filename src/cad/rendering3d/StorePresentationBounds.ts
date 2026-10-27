import * as THREE from 'three';
import type { CADEntity, Point2D } from '../types';
import { STANDARD_WALL_HEIGHT } from './entities/Wall3DBuilder';

export interface StorePresentationMetrics {
  bounds: THREE.Box3;
  center: THREE.Vector3;
  target: THREE.Vector3;
  size: THREE.Vector3;
  isConcave: boolean;
  frontVector: THREE.Vector3;
  sideVector: THREE.Vector3;
}

/**
 * Checks whether a 2D point is inside a polygon using ray-casting.
 */
export function isPointInPolygon2D(pt: { x: number; y: number }, polygon: Point2D[]): boolean {
  if (!polygon || polygon.length < 3) return true;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    const intersect = (yi > pt.y) !== (yj > pt.y) && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * For irregular or concave rooms where the bounding box center may fall outside the room footprint,
 * computes a valid presentation center strictly located inside the room polygon.
 */
export function computeValidStoreCenter(
  bounds: THREE.Box3,
  roomPolygon: Point2D[]
): { center: THREE.Vector3; isConcave: boolean } {
  const center = new THREE.Vector3();
  bounds.getCenter(center);

  if (!roomPolygon || roomPolygon.length < 3) {
    return { center, isConcave: false };
  }

  // Check if roomPolygon covers the overall store bounds.
  // If the polygon spans less than 85% of the store bounding dimensions,
  // the store has multiple rooms/partitions, so bounds center is authoritative.
  let polyMinX = Infinity, polyMaxX = -Infinity;
  let polyMinZ = Infinity, polyMaxZ = -Infinity;
  for (const p of roomPolygon) {
    if (p.x < polyMinX) polyMinX = p.x;
    if (p.x > polyMaxX) polyMaxX = p.x;
    if (p.y < polyMinZ) polyMinZ = p.y;
    if (p.y > polyMaxZ) polyMaxZ = p.y;
  }

  const boundsSpanX = bounds.max.x - bounds.min.x;
  const boundsSpanZ = bounds.max.z - bounds.min.z;
  const polySpanX = polyMaxX - polyMinX;
  const polySpanZ = polyMaxZ - polyMinZ;

  if (boundsSpanX > 0 && polySpanX < boundsSpanX * 0.85) {
    return { center, isConcave: false };
  }
  if (boundsSpanZ > 0 && polySpanZ < boundsSpanZ * 0.85) {
    return { center, isConcave: false };
  }

  // Check if bounding box center is inside room polygon
  const isInside = isPointInPolygon2D({ x: center.x, y: center.z }, roomPolygon);
  if (isInside) {
    return { center, isConcave: false };
  }

  // Point is outside (concave or irregular room). Find an internal presentation point.
  // Sample a grid across the bounding box and pick the point inside the polygon closest to center.
  const minX = bounds.min.x;
  const maxX = bounds.max.x;
  const minZ = bounds.min.z;
  const maxZ = bounds.max.z;

  const steps = 15;
  const stepX = (maxX - minX) / steps;
  const stepZ = (maxZ - minZ) / steps;

  let bestPoint: THREE.Vector3 = center.clone();
  let minDistanceSq = Infinity;

  for (let i = 1; i < steps; i++) {
    for (let j = 1; j < steps; j++) {
      const px = minX + i * stepX;
      const pz = minZ + j * stepZ;
      if (isPointInPolygon2D({ x: px, y: pz }, roomPolygon)) {
        const dSq = (px - center.x) ** 2 + (pz - center.z) ** 2;
        if (dSq < minDistanceSq) {
          minDistanceSq = dSq;
          bestPoint = new THREE.Vector3(px, center.y, pz);
        }
      }
    }
  }

  return { center: bestPoint, isConcave: true };
}

/**
 * Determines the primary front orientation of the store.
 * If entrance openings (door, shutter, glass gate) are present, derives the front from their location.
 * Otherwise defaults to looking from the front (+Z towards -Z) which corresponds to standard CAD canvas orientation.
 */
export function determineStoreFrontVector(
  entities: CADEntity[],
  bounds: THREE.Box3,
  _center?: THREE.Vector3
): { frontVector: THREE.Vector3; sideVector: THREE.Vector3 } {
  // Check for entrance openings
  const entranceEntities = entities.filter(
    (e) => e.type === 'shutter' || e.type === 'door' || e.type === 'glass_gate' || e.type === 'gate'
  );

  let bestFrontDir = new THREE.Vector3(0, 0, 1); // default from +Z looking into -Z

  if (entranceEntities.length > 0) {
    // Average entrance location
    let sumX = 0, sumZ = 0, count = 0;
    for (const ent of entranceEntities) {
      const g = (ent as any).geometry;
      if (g && typeof g.x === 'number' && typeof g.y === 'number') {
        sumX += g.x;
        sumZ += g.y;
        count++;
      }
    }

    if (count > 0) {
      const avgEntX = sumX / count;
      const avgEntZ = sumZ / count;

      // Determine which boundary the entrance is closest to
      const distToMinX = Math.abs(avgEntX - bounds.min.x);
      const distToMaxX = Math.abs(avgEntX - bounds.max.x);
      const distToMinZ = Math.abs(avgEntZ - bounds.min.z);
      const distToMaxZ = Math.abs(avgEntZ - bounds.max.z);

      const minDist = Math.min(distToMinX, distToMaxX, distToMinZ, distToMaxZ);
      if (minDist === distToMaxZ) {
        // Entrance at bottom wall: front vector is +Z
        bestFrontDir = new THREE.Vector3(0, 0, 1);
      } else if (minDist === distToMinZ) {
        // Entrance at top wall: front vector is -Z
        bestFrontDir = new THREE.Vector3(0, 0, -1);
      } else if (minDist === distToMinX) {
        // Entrance at left wall: front vector is -X
        bestFrontDir = new THREE.Vector3(-1, 0, 0);
      } else {
        // Entrance at right wall: front vector is +X
        bestFrontDir = new THREE.Vector3(1, 0, 0);
      }
    }
  }

  // Side vector is perpendicular to front vector in the horizontal XZ plane
  const sideVector = new THREE.Vector3(-bestFrontDir.z, 0, bestFrontDir.x).normalize();

  return { frontVector: bestFrontDir, sideVector };
}

/**
 * Computes authoritative store presentation bounds, center, target, and orientation vectors.
 * Strictly includes genuine store architecture (walls, columns, openings, partitions, racks, room polygon).
 * Strictly excludes debug helpers, environment planes, ground apron, ceiling mesh, lights.
 */
export function calculateStorePresentationMetrics(
  groups: {
    wallsGroup?: THREE.Object3D;
    columnsGroup?: THREE.Object3D;
    openingsGroup?: THREE.Object3D;
    partitionsGroup?: THREE.Object3D;
    racksGroup?: THREE.Object3D;
  },
  roomPolygon: Point2D[],
  entities: CADEntity[],
  wallHeight = STANDARD_WALL_HEIGHT
): StorePresentationMetrics {
  const bounds = new THREE.Box3();

  // 1. Encompass room polygon boundaries on floor (Y = 0) and ceiling (Y = wallHeight)
  if (roomPolygon && roomPolygon.length >= 3) {
    for (const pt of roomPolygon) {
      bounds.expandByPoint(new THREE.Vector3(pt.x, 0, pt.y));
      bounds.expandByPoint(new THREE.Vector3(pt.x, wallHeight, pt.y));
    }
  }

  // 2. Encompass visible geometry in physical store architecture groups
  const presentationGroups = [
    groups.wallsGroup,
    groups.columnsGroup,
    groups.openingsGroup,
    groups.partitionsGroup,
    groups.racksGroup,
  ];

  for (const grp of presentationGroups) {
    if (!grp) continue;
    grp.updateMatrixWorld(true);
    grp.traverse((child) => {
      if ((child as THREE.Mesh).isMesh && child.visible) {
        const name = (child.name || '').toLowerCase();
        if (name.includes('debug') || name.includes('helper') || name.includes('plane') || name.includes('grid')) {
          return;
        }
        const b = new THREE.Box3().setFromObject(child);
        if (!b.isEmpty()) {
          bounds.union(b);
        }
      }
    });
  }

  // Fallback for empty scene
  if (bounds.isEmpty()) {
    bounds.set(new THREE.Vector3(0, 0, 0), new THREE.Vector3(120, wallHeight, 240));
  }

  const rawCenter = new THREE.Vector3();
  bounds.getCenter(rawCenter);
  const size = new THREE.Vector3();
  bounds.getSize(size);

  // Compute valid presentation center (handles concave / irregular rooms)
  const { center, isConcave } = computeValidStoreCenter(bounds, roomPolygon);

  // Target for perspective views: horizontal center, fixture/display mid-level (~40-45" off ground)
  const targetY = Math.min(Math.max(size.y * 0.35, 20), 45);
  const target = new THREE.Vector3(center.x, targetY, center.z);

  // Determine front & side viewing vectors
  const { frontVector, sideVector } = determineStoreFrontVector(entities, bounds, center);

  return {
    bounds,
    center,
    target,
    size,
    isConcave,
    frontVector,
    sideVector,
  };
}
