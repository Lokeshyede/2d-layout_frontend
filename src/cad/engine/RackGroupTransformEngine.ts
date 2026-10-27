import type { CADEntity, RackEntity, WallEntity, Point2D, BoundingBox2D } from '../types';
import {
  degreesToRadians,
  isPolygonInsidePolygon,
  doPolygonsOverlap,
  segmentsIntersectStrict,
} from '../geometry/GeometryMath';
import { RackConnectionEngine } from './RackConnectionEngine';

export interface GroupTransformResult {
  nextEntities: CADEntity[];
  pivot: Point2D;
  transformedRacks: RackEntity[];
  boundingBox: BoundingBox2D;
}

export interface GroupValidationResult {
  isValid: boolean;
  issues: string[];
  collidingRackIds: string[];
}

export class RackGroupTransformEngine {
  /**
   * Calculates the combined bounding box of all given racks using their true rotated footprints.
   */
  public static calculateCombinedBoundingBox(racks: RackEntity[]): BoundingBox2D {
    if (racks.length === 0) {
      return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
    }

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const rack of racks) {
      const footprint = RackConnectionEngine.getRackFootprint(rack);
      for (const pt of footprint) {
        if (pt.x < minX) minX = pt.x;
        if (pt.x > maxX) maxX = pt.x;
        if (pt.y < minY) minY = pt.y;
        if (pt.y > maxY) maxY = pt.y;
      }
    }

    return { minX, maxX, minY, maxY };
  }

  /**
   * Calculates the shared group pivot (geometric center of the combined bounding box).
   */
  public static calculateGroupPivot(racks: RackEntity[]): Point2D {
    const box = this.calculateCombinedBoundingBox(racks);
    return {
      x: Math.round(((box.minX + box.maxX) / 2) * 100) / 100,
      y: Math.round(((box.minY + box.maxY) / 2) * 100) / 100,
    };
  }

  /**
   * Transforms selected entities as a rigid group rotated around the shared pivot by angleDeg.
   * Updates each rack's position (x, y) via 2D rotation matrix around the shared pivot.
   * Updates each rack's rotation by angleDeg.
   * Preserves all dimensions, properties, and metadata.
   */
  public static rotateGroup(
    allEntities: CADEntity[],
    selectedIds: Set<string>,
    angleDeg: number,
    pivot?: Point2D
  ): GroupTransformResult | null {
    const selectedRacks = allEntities.filter(
      (e): e is RackEntity => selectedIds.has(e.id) && e.type === 'rack'
    );
    if (selectedRacks.length === 0) return null;

    const groupPivot = pivot || this.calculateGroupPivot(selectedRacks);
    const box = this.calculateCombinedBoundingBox(selectedRacks);

    const rad = degreesToRadians(angleDeg);
    const cosA = Math.cos(rad);
    const sinA = Math.sin(rad);

    const transformedRacks: RackEntity[] = [];

    const nextEntities = allEntities.map((ent): CADEntity => {
      if (!selectedIds.has(ent.id)) return ent;

      if (ent.type !== 'rack') {
        const geom = ent.geometry as any;
        if (typeof geom?.x === 'number' && typeof geom?.y === 'number') {
          const dx = geom.x - groupPivot.x;
          const dy = geom.y - groupPivot.y;
          const newX = Math.round((groupPivot.x + (dx * cosA - dy * sinA)) * 100) / 100;
          const newY = Math.round((groupPivot.y + (dx * sinA + dy * cosA)) * 100) / 100;
          const curRot = geom.rotation || 0;
          const newRot = Math.round(((((curRot + angleDeg) % 360) + 360) % 360) * 100) / 100;
          return {
            ...ent,
            geometry: {
              ...geom,
              x: newX,
              y: newY,
              rotation: newRot,
            },
          };
        }
        return ent;
      }

      const r = ent as RackEntity;
      const dx = r.geometry.x - groupPivot.x;
      const dy = r.geometry.y - groupPivot.y;
      const newX = Math.round((groupPivot.x + (dx * cosA - dy * sinA)) * 100) / 100;
      const newY = Math.round((groupPivot.y + (dx * sinA + dy * cosA)) * 100) / 100;

      const curRot = r.geometry.rotation || 0;
      const newRot = Math.round(((((curRot + angleDeg) % 360) + 360) % 360) * 100) / 100;

      const updatedRack: RackEntity = {
        ...r,
        geometry: {
          ...r.geometry,
          x: newX,
          y: newY,
          rotation: newRot,
        },
      };

      transformedRacks.push(updatedRack);
      return updatedRack;
    });

    return {
      nextEntities,
      pivot: groupPivot,
      transformedRacks,
      boundingBox: box,
    };
  }

  /**
   * Rotates each selected rack in place around its own center by angleDeg.
   */
  public static rotateInPlace(
    allEntities: CADEntity[],
    selectedIds: Set<string>,
    angleDeg: number
  ): GroupTransformResult | null {
    const selectedRacks = allEntities.filter(
      (e): e is RackEntity => selectedIds.has(e.id) && e.type === 'rack'
    );
    if (selectedRacks.length === 0) return null;

    const groupPivot = this.calculateGroupPivot(selectedRacks);
    const box = this.calculateCombinedBoundingBox(selectedRacks);
    const transformedRacks: RackEntity[] = [];

    const nextEntities = allEntities.map((ent): CADEntity => {
      if (!selectedIds.has(ent.id)) return ent;
      if (ent.type !== 'rack') return ent;

      const r = ent as RackEntity;
      const curRot = r.geometry.rotation || 0;
      const newRot = Math.round(((((curRot + angleDeg) % 360) + 360) % 360) * 100) / 100;

      const updatedRack: RackEntity = {
        ...r,
        geometry: {
          ...r.geometry,
          rotation: newRot,
        },
      };

      transformedRacks.push(updatedRack);
      return updatedRack;
    });

    return {
      nextEntities,
      pivot: groupPivot,
      transformedRacks,
      boundingBox: box,
    };
  }

  /**
   * Moves all selected entities together by delta (dx, dy).
   */
  public static moveGroup(
    allEntities: CADEntity[],
    selectedIds: Set<string>,
    dx: number,
    dy: number
  ): CADEntity[] {
    return allEntities.map((ent): CADEntity => {
      if (!selectedIds.has(ent.id)) return ent;
      const geom = ent.geometry as any;
      if (typeof geom?.x === 'number' && typeof geom?.y === 'number') {
        return {
          ...ent,
          geometry: {
            ...geom,
            x: Math.round((geom.x + dx) * 100) / 100,
            y: Math.round((geom.y + dy) * 100) / 100,
          },
        };
      }
      return ent;
    });
  }

  /**
   * Validates transformed candidate racks against:
   * 1. Other racks in scene (outside selection)
   * 2. Room boundaries (roomPolygon)
   * 3. Walls (strict line intersection)
   */
  public static validateTransformation(
    transformedRacks: RackEntity[],
    allEntities: CADEntity[],
    selectedIds: Set<string>,
    roomPolygon?: Point2D[]
  ): GroupValidationResult {
    const issues: string[] = [];
    const collidingRackIds = new Set<string>();

    const otherRacks = allEntities.filter(
      (e): e is RackEntity => e.type === 'rack' && !selectedIds.has(e.id)
    );
    const walls = allEntities.filter(
      (e): e is WallEntity => e.type === 'wall'
    );

    // 1. Collision against other racks
    for (const rotated of transformedRacks) {
      const rFoot = RackConnectionEngine.getRackFootprint(rotated);
      for (const other of otherRacks) {
        const oFoot = RackConnectionEngine.getRackFootprint(other);
        if (doPolygonsOverlap(rFoot, oFoot, -RackConnectionEngine.EPSILON)) {
          const rName = rotated.properties.productName || rotated.id.slice(-6);
          const oName = other.properties.productName || other.id.slice(-6);
          issues.push(`Rack "${rName}" collides with "${oName}"`);
          collidingRackIds.add(rotated.id);
        }
      }
    }

    // 2. Room boundary containment
    if (roomPolygon && roomPolygon.length >= 3) {
      for (const rotated of transformedRacks) {
        const rFoot = RackConnectionEngine.getRackFootprint(rotated);
        const inside = isPolygonInsidePolygon(rFoot, roomPolygon);
        if (!inside) {
          const rName = rotated.properties.productName || rotated.id.slice(-6);
          issues.push(`Rack "${rName}" extends outside room boundary`);
          collidingRackIds.add(rotated.id);
        }
      }
    }

    // 3. Wall collisions
    for (const rotated of transformedRacks) {
      const rFoot = RackConnectionEngine.getRackFootprint(rotated);
      for (const wall of walls) {
        const wp1 = { x: wall.geometry.x1, y: wall.geometry.y1 };
        const wp2 = { x: wall.geometry.x2, y: wall.geometry.y2 };
        for (let i = 0; i < rFoot.length; i++) {
          const fp1 = rFoot[i];
          const fp2 = rFoot[(i + 1) % rFoot.length];
          if (segmentsIntersectStrict(fp1, fp2, wp1, wp2)) {
            const rName = rotated.properties.productName || rotated.id.slice(-6);
            issues.push(`Rack "${rName}" intersects wall`);
            collidingRackIds.add(rotated.id);
            break;
          }
        }
      }
    }

    return {
      isValid: issues.length === 0,
      issues,
      collidingRackIds: Array.from(collidingRackIds),
    };
  }
}
