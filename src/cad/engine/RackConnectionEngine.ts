import type { Point2D, RackEntity } from '../types';
import { distance, rotatePoint, degreesToRadians, doPolygonsOverlap } from '../geometry/GeometryMath';

export type ConnectionFaceType = 'WALL_RACK' | 'CENTER_RACK' | 'ENDCAP' | 'CORNER_RACK' | 'CUSTOM_RACK';

export interface RackConnectionPoint {
  rackEntityId: string;
  type: ConnectionFaceType;
  position: Point2D;
  normal: Point2D;
  tangent: Point2D;
  connectionWidth: number;
  connectionDepth: number;
  compatibleTypes: ConnectionFaceType[];
  terminalName?: string;
}

export interface ConnectionValidationResult {
  isValid: boolean;
  gap: number;
  overlap: number;
  angleMismatch: number;
  normalMismatch: number;
}

export class RackConnectionEngine {
  public static readonly EPSILON = 0.01;
  public static readonly SNAP_RADIUS = 6.0;

  public static getRackTypeEnum(rack: RackEntity): ConnectionFaceType {
    const type = rack.properties.rackType?.toLowerCase() || '';
    const name = rack.properties.productName?.toLowerCase() || '';
    
    if (type.includes('endcap') || type.includes('end cap') || name.includes('endcap') || name.includes('end cap')) {
      return 'ENDCAP';
    }
    if (type.includes('corner') || name.includes('corner')) {
      return 'CORNER_RACK';
    }
    if (type.includes('wall') || name.includes('wall')) {
      return 'WALL_RACK';
    }
    if (type.includes('center') || type.includes('gondola') || name.includes('center') || name.includes('gondola')) {
      return 'CENTER_RACK';
    }
    return 'CUSTOM_RACK';
  }

  public static getRackFootprint(rack: RackEntity): Point2D[] {
    const geom = rack.geometry;
    const w = geom.width || 36;
    const d = geom.depth || 24;
    const cx = geom.x;
    const cy = geom.y;
    const rotRad = degreesToRadians(geom.rotation || 0);

    const type = this.getRackTypeEnum(rack);
    if (type === 'CORNER_RACK') {
      // Assuming L-shape footprint for corner rack. 
      // A standard 2x2 corner rack has legs of length w and d. 
      // If it's a simple bounding box in current data, we still return its points.
      // We'll use the bounding box for now but we can refine to L-shape if needed.
    }
    
    const localCorners = [
      { x: -w / 2, y: -d / 2 },
      { x: w / 2, y: -d / 2 },
      { x: w / 2, y: d / 2 },
      { x: -w / 2, y: d / 2 },
    ];

    return localCorners.map(pt => rotatePoint({ x: cx + pt.x, y: cy + pt.y }, { x: cx, y: cy }, rotRad));
  }

  public static getConnectionFaces(rack: RackEntity): RackConnectionPoint[] {
    const faces: RackConnectionPoint[] = [];
    const type = this.getRackTypeEnum(rack);
    const geom = rack.geometry;
    const w = geom.width || 36;
    const d = geom.depth || 24;
    const cx = geom.x;
    const cy = geom.y;
    const rotRad = degreesToRadians(geom.rotation || 0);

    const cos = Math.cos(rotRad);
    const sin = Math.sin(rotRad);

    const localToWorld = (lx: number, ly: number): Point2D => ({
      x: cx + lx * cos - ly * sin,
      y: cy + lx * sin + ly * cos
    });

    const localVectorToWorld = (vx: number, vy: number): Point2D => ({
      x: vx * cos - vy * sin,
      y: vx * sin + vy * cos
    });

    if (type === 'CENTER_RACK' || type === 'WALL_RACK') {
      // Left terminal
      faces.push({
        rackEntityId: rack.id,
        type: type,
        position: localToWorld(-w / 2, 0),
        normal: localVectorToWorld(-1, 0),
        tangent: localVectorToWorld(0, 1),
        connectionWidth: d,
        connectionDepth: w,
        compatibleTypes: type === 'CENTER_RACK' ? ['CENTER_RACK', 'ENDCAP'] : ['WALL_RACK', 'CORNER_RACK'],
        terminalName: 'LEFT_TERMINAL'
      });
      // Right terminal
      faces.push({
        rackEntityId: rack.id,
        type: type,
        position: localToWorld(w / 2, 0),
        normal: localVectorToWorld(1, 0),
        tangent: localVectorToWorld(0, 1),
        connectionWidth: d,
        connectionDepth: w,
        compatibleTypes: type === 'CENTER_RACK' ? ['CENTER_RACK', 'ENDCAP'] : ['WALL_RACK', 'CORNER_RACK'],
        terminalName: 'RIGHT_TERMINAL'
      });
    } else if (type === 'ENDCAP') {
      // Endcap connection face is at local (0,0) with normal pointing in -Y (inward to Center rack)
      // Display/front is +Y. Connection points OUT of the endcap towards the center rack.
      // So if back is at Y=0, and front is +Y, connection normal should be -Y.
      faces.push({
        rackEntityId: rack.id,
        type: type,
        position: localToWorld(0, 0),
        normal: localVectorToWorld(0, -1),
        tangent: localVectorToWorld(1, 0),
        connectionWidth: w,
        connectionDepth: d,
        compatibleTypes: ['CENTER_RACK'],
        terminalName: 'BACK_FACE'
      });
    } else if (type === 'CORNER_RACK') {
      // Legs of corner rack
      faces.push({
        rackEntityId: rack.id,
        type: type,
        position: localToWorld(-w / 2, d / 2 - 12), // approximate leg A end
        normal: localVectorToWorld(-1, 0),
        tangent: localVectorToWorld(0, 1),
        connectionWidth: d,
        connectionDepth: w,
        compatibleTypes: ['WALL_RACK'],
        terminalName: 'LEG_A'
      });
      faces.push({
        rackEntityId: rack.id,
        type: type,
        position: localToWorld(w / 2 - 12, -d / 2), // approximate leg B end
        normal: localVectorToWorld(0, -1),
        tangent: localVectorToWorld(1, 0),
        connectionWidth: w,
        connectionDepth: d,
        compatibleTypes: ['WALL_RACK'],
        terminalName: 'LEG_B'
      });
    }

    return faces;
  }

  public static findBestSnap(
    draggingRack: RackEntity,
    allRacks: RackEntity[],
    rawWorldPos: Point2D,
    rawRotation: number
  ): { position: Point2D; rotation: number; validation: ConnectionValidationResult; targetId: string } | null {
    // Temporary rack for footprint and faces at current drag pos
    const tempRack: RackEntity = {
      ...draggingRack,
      geometry: {
        ...draggingRack.geometry,
        x: rawWorldPos.x,
        y: rawWorldPos.y,
        rotation: rawRotation
      }
    };

    const dragFaces = this.getConnectionFaces(tempRack);
    if (dragFaces.length === 0) return null;

    let bestDist = this.SNAP_RADIUS;
    let bestSnap: { position: Point2D; rotation: number; validation: ConnectionValidationResult; targetId: string } | null = null;

    for (const rack of allRacks) {
      if (rack.id === draggingRack.id) continue;

      const targetFaces = this.getConnectionFaces(rack);
      for (const targetFace of targetFaces) {
        for (const dragFace of dragFaces) {
          if (!dragFace.compatibleTypes.includes(targetFace.type) && !targetFace.compatibleTypes.includes(dragFace.type)) {
            continue;
          }

          const dist = distance(dragFace.position, targetFace.position);
          if (dist < bestDist) {
            // Need to align dragFace normal to oppose targetFace normal
            const targetNormalAng = Math.atan2(targetFace.normal.y, targetFace.normal.x);
            const dragNormalAng = Math.atan2(dragFace.normal.y, dragFace.normal.x);
            
            // We want dragNormal = -targetNormal => angle mismatch should be 0 after rotation
            // newRot = currentRot + (targetNormalAng + PI - dragNormalAng)
            let rotDiff = (targetNormalAng + Math.PI) - dragNormalAng;
            // Normalize rotDiff to [-PI, PI]
            rotDiff = Math.atan2(Math.sin(rotDiff), Math.cos(rotDiff));

            const newRotRad = degreesToRadians(rawRotation) + rotDiff;
            const newRotDeg = (newRotRad * 180 / Math.PI) % 360;

            // Recalculate temp rack with new rotation to find exact anchor offset
            const alignedTempRack: RackEntity = {
              ...draggingRack,
              geometry: {
                ...draggingRack.geometry,
                x: rawWorldPos.x,
                y: rawWorldPos.y,
                rotation: newRotDeg
              }
            };

            // Find the new position of the drag face after rotation
            const alignedDragFaces = this.getConnectionFaces(alignedTempRack);
            const alignedDragFace = alignedDragFaces.find(f => f.terminalName === dragFace.terminalName)!;

            // Offset the center so that alignedDragFace.position == targetFace.position
            const dx = targetFace.position.x - alignedDragFace.position.x;
            const dy = targetFace.position.y - alignedDragFace.position.y;

            const finalPos = { x: rawWorldPos.x + dx, y: rawWorldPos.y + dy };

            // Validate
            const finalRack: RackEntity = {
              ...draggingRack,
              geometry: {
                ...draggingRack.geometry,
                x: finalPos.x,
                y: finalPos.y,
                rotation: newRotDeg
              }
            };
            
            const validation = this.validateConnection(finalRack, rack, alignedDragFace, targetFace);

            if (validation.isValid) {
              bestDist = dist;
              bestSnap = {
                position: finalPos,
                rotation: newRotDeg,
                validation,
                targetId: targetFace.rackEntityId
              };
            }
          }
        }
      }
    }

    return bestSnap;
  }

  public static validateConnection(
    rackA: RackEntity,
    rackB: RackEntity,
    faceA?: RackConnectionPoint,
    faceB?: RackConnectionPoint
  ): ConnectionValidationResult {
    const overlap = doPolygonsOverlap(this.getRackFootprint(rackA), this.getRackFootprint(rackB), -this.EPSILON) ? 1 : 0;
    
    // In a full implementation, intersection depth would be mathematically derived from SAT.
    // For now, if overlap is detected with an epsilon inset, we consider it overlapping.
    const gap = 0; 
    let angleMismatch = 0;
    let normalMismatch = 0;

    if (faceA && faceB) {
      const dot = faceA.normal.x * faceB.normal.x + faceA.normal.y * faceB.normal.y;
      normalMismatch = Math.abs(dot + 1.0); // Should be -1 for perfect opposition
    }

    return {
      isValid: overlap <= this.EPSILON && gap <= this.EPSILON && normalMismatch <= 0.05,
      gap,
      overlap,
      angleMismatch,
      normalMismatch
    };
  }
}
