import { calculateWallInwardNormal, projectPointOntoLine } from '../geometry/GeometryMath';
import type { RackEntity, WallEntity, Point2D } from '../types';

export interface WallRackTransformParams {
  rack: RackEntity;
  wall?: WallEntity;
  walls?: WallEntity[];
  roomPolygon?: Point2D[];
  renderingEpsilon?: number; // Small rendering clearance (default 0.08") to eliminate z-fighting
}

export interface WallRackTransformResult {
  position: { x: number; y: number; z: number };
  rotationY: number;
  interiorNormal: { x: number; y: number };
  wallThickness: number;
  attachmentOffset: number;
  debugInfo: {
    centerlinePoint: { x: number; y: number; z: number };
    interiorFacePoint: { x: number; y: number; z: number };
    forwardVector: { x: number; y: number; z: number };
    wallThickness: number;
    rackWidth: number;
    rackDepth: number;
    rackHeight: number;
  };
}

/**
 * Computes the exact 3D transform for a rack so its physical BACK FACE aligns
 * precisely with the INTERIOR FACE of the wall, projecting full depth into the room.
 *
 * Prevents the rack and back panel from penetrating inside the wall.
 */
export function getWallRackTransform(params: WallRackTransformParams): WallRackTransformResult {
  const { rack, wall, walls, roomPolygon } = params;
  const epsilon = params.renderingEpsilon ?? 0.08;

  const isCenterRack = Boolean(
    rack.properties.rackType === 'center_rack_5x3' ||
    rack.properties.rackType === 'Center Rack' ||
    rack.properties.rackType === 'Center Gondola' ||
    (rack.properties.rackType && rack.properties.rackType.toLowerCase().includes('center')) ||
    (rack.properties.rackType && rack.properties.rackType.toLowerCase().includes('gondola')) ||
    (rack.properties.productName && rack.properties.productName.toLowerCase().includes('center'))
  );

  const isWallMounted = !isCenterRack && Boolean(
    rack.properties.rackType === 'wall_rack_7x3' ||
    rack.properties.rackType === 'wall_rack_7x4' ||
    rack.properties.rackType === 'Wall Rack' ||
    rack.properties.rackType === 'Corner Rack' ||
    rack.properties.rackType === 'corner_rack_2x2x2' ||
    (rack.properties.rackType && rack.properties.rackType.toLowerCase().includes('wall')) ||
    (rack.properties.productName && rack.properties.productName.toLowerCase().includes('wall')) ||
    Boolean(rack.properties.attachedWallId)
  );

  const rackX = rack.geometry.x;
  const rackZ = rack.geometry.y; // 2D CAD Y maps to 3D Z
  const rw = rack.geometry.width || 36;
  const rd = rack.geometry.depth || 24;
  const rh = rack.geometry.height || 84;

  if (!isWallMounted) {
    // Floor-standing center / gondola rack: centered on CAD coordinate
    const rotRad = ((rack.geometry.rotation || 0) * Math.PI) / 180;
    const rotY = -rotRad;
    return {
      position: { x: rackX, y: 0, z: rackZ },
      rotationY: rotY,
      interiorNormal: { x: 0, y: 0 },
      wallThickness: 0,
      attachmentOffset: 0,
      debugInfo: {
        centerlinePoint: { x: rackX, y: 0, z: rackZ },
        interiorFacePoint: { x: rackX, y: 0, z: rackZ },
        forwardVector: { x: Math.sin(rotY), y: 0, z: Math.cos(rotY) },
        wallThickness: 0,
        rackWidth: rw,
        rackDepth: rd,
        rackHeight: rh,
      },
    };
  }

  // 1. Resolve attached wall (by ID or find closest wall segment)
  let resolvedWall = wall;
  if (!resolvedWall && walls && walls.length > 0) {
    let minD = Infinity;
    for (const w of walls) {
      const proj = projectPointOntoLine(
        { x: rackX, y: rackZ },
        { x: w.geometry.x1, y: w.geometry.y1 },
        { x: w.geometry.x2, y: w.geometry.y2 }
      );
      if (proj.distance < minD) {
        minD = proj.distance;
        resolvedWall = w;
      }
    }
  }

  // 2. Project rack position onto wall centerline
  let centerlineX = rackX;
  let centerlineZ = rackZ;
  if (resolvedWall) {
    const proj = projectPointOntoLine(
      { x: rackX, y: rackZ },
      { x: resolvedWall.geometry.x1, y: resolvedWall.geometry.y1 },
      { x: resolvedWall.geometry.x2, y: resolvedWall.geometry.y2 }
    );
    centerlineX = proj.point.x;
    centerlineZ = proj.point.y;
  }

  // 3. Determine unit interior normal vector (pointing into the room polygon)
  let nx = 0;
  let ny = 0;

  if (resolvedWall && roomPolygon && roomPolygon.length >= 3) {
    const normals = calculateWallInwardNormal(
      { x: resolvedWall.geometry.x1, y: resolvedWall.geometry.y1 },
      { x: resolvedWall.geometry.x2, y: resolvedWall.geometry.y2 },
      roomPolygon
    );
    nx = normals.inwardNormal.x;
    ny = normals.inwardNormal.y;
  } else if (rack.properties.inwardNormal) {
    nx = rack.properties.inwardNormal.x;
    ny = rack.properties.inwardNormal.y;
    const len = Math.hypot(nx, ny);
    if (len > 1e-4) {
      nx /= len;
      ny /= len;
    }
  } else if (resolvedWall) {
    const dx = resolvedWall.geometry.x2 - resolvedWall.geometry.x1;
    const dy = resolvedWall.geometry.y2 - resolvedWall.geometry.y1;
    const len = Math.hypot(dx, dy);
    if (len > 1e-4) {
      nx = -dy / len;
      ny = dx / len;
    }
  } else {
    // Fallback from rack.geometry.rotation
    const rotRad = ((rack.geometry.rotation || 0) * Math.PI) / 180;
    nx = -Math.sin(rotRad);
    ny = Math.cos(rotRad);
  }

  // 4. Wall thickness & interior face offset
  const wallThickness = resolvedWall?.properties?.thickness || 9;
  const attachmentOffset = wallThickness / 2 + epsilon;

  // 5. Compute interior face attachment point (3D: X=CAD_x, Y=0, Z=CAD_y)
  const interiorX = centerlineX + nx * attachmentOffset;
  const interiorZ = centerlineZ + ny * attachmentOffset;

  // 6. Compute rotation around Y so rack model's forward direction (+Z) aligns with interior normal
  const rotY = Math.atan2(nx, ny);

  return {
    position: {
      x: interiorX,
      y: 0,
      z: interiorZ,
    },
    rotationY: rotY,
    interiorNormal: { x: nx, y: ny },
    wallThickness,
    attachmentOffset,
    debugInfo: {
      centerlinePoint: { x: centerlineX, y: 0, z: centerlineZ },
      interiorFacePoint: { x: interiorX, y: 0, z: interiorZ },
      forwardVector: { x: nx, y: 0, z: ny },
      wallThickness,
      rackWidth: rw,
      rackDepth: rd,
      rackHeight: rh,
    },
  };
}
