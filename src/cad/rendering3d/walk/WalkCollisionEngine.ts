import * as THREE from 'three';
import type {
  CADEntity,
  Point2D,
  WallEntity,
  RackEntity,
  ColumnEntity,
} from '../../types';
import { isPointInPolygon, projectPointOntoLine } from '../../geometry/GeometryMath';
import {
  DEFAULT_TOTAL_COLLIDER_RADIUS,
  DEFAULT_WALK_EYE_HEIGHT,
  DEFAULT_COLLISION_BUFFER,
} from '../PhysicalScale';
import { getWallRackTransform } from '../../converters/WallAttachmentUtils';

export interface CollisionObstacle {
  id: string;
  type: 'wall' | 'rack' | 'column' | 'opening';
  label?: string;
  /** For line segment obstacles (walls, partitions, closed shutters) */
  p1?: Point2D;
  p2?: Point2D;
  thickness?: number;
  /** For box obstacles (racks, columns): center in 3D ground plane (X, Z) */
  center?: Point2D;
  width?: number; // local X width
  depth?: number; // local Z depth
  rotationY?: number; // rotation in radians around Y
  isWallMounted?: boolean;
}

export interface CollisionHit {
  hit: boolean;
  distance: number;
  penetration: number;
  normal: Point2D; // points from obstacle towards player
  contactPoint: Point2D;
  obstacleId: string;
  obstacleType: string;
}

export class WalkCollisionEngine {
  private obstacles: CollisionObstacle[] = [];
  private roomPolygon: Point2D[] = [];
  private doorOpenings: { p1: Point2D; p2: Point2D; start: number; end: number; wallId: string }[] = [];
  public playerRadius: number;

  constructor(
    entities: CADEntity[],
    roomPolygon: Point2D[],
    racksGroup?: THREE.Group,
    playerRadius: number = DEFAULT_TOTAL_COLLIDER_RADIUS
  ) {
    this.roomPolygon = roomPolygon || [];
    this.playerRadius = playerRadius;
    this.buildObstacles(entities, racksGroup);
  }

  /**
   * Rebuilds collision data cache when CAD changes.
   * Cached once per store load / layout modification.
   */
  public updateCAD(entities: CADEntity[], roomPolygon: Point2D[], racksGroup?: THREE.Group): void {
    this.roomPolygon = roomPolygon || [];
    this.buildObstacles(entities, racksGroup);
  }

  /**
   * Returns cached collision obstacles count and list for diagnostics.
   */
  public getObstacles(): readonly CollisionObstacle[] {
    return this.obstacles;
  }

  public getRoomPolygon(): readonly Point2D[] {
    return this.roomPolygon;
  }

  /**
   * Builds physical 2D obstacles in 3D ground coordinates (3D X = CAD X, 3D Z = CAD Y).
   * Generates lightweight collision proxies matching actual CAD geometry.
   */
  private buildObstacles(entities: CADEntity[], racksGroup?: THREE.Group): void {
    this.obstacles = [];
    this.doorOpenings = [];
    const walls = entities.filter((e) => e.type === 'wall') as WallEntity[];

    // 1. Process Walls with physical opening cutouts (Doors / Windows / Shutters / Gates)
    for (const wall of walls) {
      const { x1, y1, x2, y2 } = wall.geometry;
      const thickness = wall.properties?.thickness || 9;
      const dx = x2 - x1;
      const dy = y2 - y1;
      const wallLen = Math.hypot(dx, dy);

      if (wallLen < 0.1) continue;

      // Collect openings attached to this wall
      const openingsOnWall: { start: number; end: number; type: string }[] = [];

      for (const ent of entities) {
        if (
          ent.type !== 'door' &&
          ent.type !== 'window' &&
          ent.type !== 'shutter' &&
          ent.type !== 'glass_gate'
        ) {
          continue;
        }

        const attachedId = (ent as any).properties?.attachedWallId;
        const geom = (ent as any).geometry;
        if (!geom || geom.x === undefined || geom.y === undefined) continue;

        // Project opening center onto wall line
        const t = ((geom.x - x1) * dx + (geom.y - y1) * dy) / (wallLen * wallLen);
        const distAlong = t * wallLen;
        const projX = x1 + (dx / wallLen) * distAlong;
        const projY = y1 + (dy / wallLen) * distAlong;
        const perpDist = Math.hypot(geom.x - projX, geom.y - projY);

        const isAttached = attachedId === wall.id || (perpDist <= thickness * 1.5 && t >= -0.05 && t <= 1.05);
        if (!isAttached) continue;

        // Determine if opening creates a walkable gap or a solid barrier
        // - Doors & Glass Gates: walkable opening gap
        // - Windows: solid sill beneath window (height ~36") blocks human walker
        // - Shutters: open/entrance shutter creates walkable gap; closed shutter blocks passage
        if (ent.type === 'door' || ent.type === 'glass_gate') {
          const w = Math.min(geom.width || 36, wallLen);
          const start = Math.max(0, distAlong - w / 2);
          const end = Math.min(wallLen, distAlong + w / 2);
          if (end > start + 0.5) {
            openingsOnWall.push({ start, end, type: ent.type });
            this.doorOpenings.push({
              wallId: wall.id,
              p1: { x: x1, y: y1 },
              p2: { x: x2, y: y2 },
              start,
              end,
            });
          }
        } else if (ent.type === 'shutter') {
          const isClosed = Boolean((ent as any).properties?.isClosed);
          if (!isClosed) {
            // Standard retail roll-up shutter entrance (walkable entryway)
            const w = Math.min(geom.width || 72, wallLen);
            const start = Math.max(0, distAlong - w / 2);
            const end = Math.min(wallLen, distAlong + w / 2);
            if (end > start + 0.5) {
              openingsOnWall.push({ start, end, type: 'shutter_open' });
              this.doorOpenings.push({
                wallId: wall.id,
                p1: { x: x1, y: y1 },
                p2: { x: x2, y: y2 },
                start,
                end,
              });
            }
          }
        }
      }

      // Sort intervals along wall
      openingsOnWall.sort((a, b) => a.start - b.start);

      // If no walkable openings, whole wall is one continuous solid collider
      if (openingsOnWall.length === 0) {
        this.obstacles.push({
          id: wall.id,
          type: 'wall',
          label: `Wall ${wall.id.slice(0, 6)}`,
          p1: { x: x1, y: y1 },
          p2: { x: x2, y: y2 },
          thickness,
        });
        continue;
      }

      // Segment wall around opening cutouts
      let cursor = 0;
      let segIdx = 0;

      for (const op of openingsOnWall) {
        if (op.start > cursor + 1.0) {
          const segStartAlong = cursor;
          const segEndAlong = op.start;
          const pStart = {
            x: x1 + (dx / wallLen) * segStartAlong,
            y: y1 + (dy / wallLen) * segStartAlong,
          };
          const pEnd = {
            x: x1 + (dx / wallLen) * segEndAlong,
            y: y1 + (dy / wallLen) * segEndAlong,
          };
          this.obstacles.push({
            id: `${wall.id}_seg_${segIdx++}`,
            type: 'wall',
            label: `Wall Seg ${segIdx}`,
            p1: pStart,
            p2: pEnd,
            thickness,
          });
        }
        cursor = Math.max(cursor, op.end);
      }

      // Final trailing segment after last opening
      if (cursor < wallLen - 1.0) {
        const pStart = {
          x: x1 + (dx / wallLen) * cursor,
          y: y1 + (dy / wallLen) * cursor,
        };
        const pEnd = { x: x2, y: y2 };
        this.obstacles.push({
          id: `${wall.id}_seg_${segIdx++}`,
          type: 'wall',
          label: `Wall Seg ${segIdx}`,
          p1: pStart,
          p2: pEnd,
          thickness,
        });
      }
    }

    // 2. Process Partitions
    const partitions = entities.filter((e) => e.type === 'partition');
    for (const part of partitions) {
      const g = (part as any).geometry;
      if (g && g.x1 !== undefined && g.y1 !== undefined && g.x2 !== undefined && g.y2 !== undefined) {
        this.obstacles.push({
          id: part.id,
          type: 'wall',
          label: `Partition ${part.id.slice(0, 6)}`,
          p1: { x: g.x1, y: g.y1 },
          p2: { x: g.x2, y: g.y2 },
          thickness: (part as any).properties?.thickness || 4,
        });
      }
    }

    // 3. Process Columns (Obstacles respecting actual CAD width, depth, rotation, and projection)
    const columns = entities.filter((e) => e.type === 'column') as ColumnEntity[];
    for (const col of columns) {
      const w = col.geometry.width || 24;
      const d = col.properties?.inwardProjection || col.geometry.height || 24;
      let rotRad = -((col.geometry.rotation || 0) * Math.PI) / 180;

      // If attached to a wall, follow wall orientation
      if (col.properties?.columnType === 'wall' && col.properties.attachedWallId) {
        const attached = walls.find((w) => w.id === col.properties.attachedWallId);
        if (attached) {
          const dx = attached.geometry.x2 - attached.geometry.x1;
          const dy = attached.geometry.y2 - attached.geometry.y1;
          rotRad = -Math.atan2(dy, dx);
        }
      }

      this.obstacles.push({
        id: col.id,
        type: 'column',
        label: `Column ${col.id.slice(0, 6)}`,
        center: { x: col.geometry.x, y: col.geometry.y },
        width: w,
        depth: d,
        rotationY: rotRad,
      });
    }

    // 4. Process Racks (Wall Racks, Center Racks, Corner Racks)
    const racks = entities.filter((e) => e.type === 'rack') as RackEntity[];
    for (const rack of racks) {
      const w = rack.geometry.width || 36;
      const d = rack.geometry.depth || 24;

      const isWallMounted = Boolean(
        rack.properties.rackType === 'wall_rack_7x3' ||
        rack.properties.rackType === 'wall_rack_7x4' ||
        rack.properties.rackType === 'Wall Rack' ||
        rack.properties.rackType === 'Corner Rack' ||
        rack.properties.rackType === 'corner_rack_2x2x2' ||
        (rack.properties.rackType && rack.properties.rackType.toLowerCase().includes('wall')) ||
        Boolean(rack.properties.attachedWallId)
      );

      // Check if rendered in racksGroup to match exact 3D transform
      let posX = rack.geometry.x;
      let posZ = rack.geometry.y;
      let rotY = -((rack.geometry.rotation || 0) * Math.PI) / 180;

      if (racksGroup) {
        const rackObj = racksGroup.children.find((c) => c.userData?.entityId === rack.id);
        if (rackObj) {
          posX = rackObj.position.x;
          posZ = rackObj.position.z;
          rotY = rackObj.rotation.y;
        } else if (isWallMounted) {
          const wall = rack.properties.attachedWallId
            ? walls.find((wl) => wl.id === rack.properties.attachedWallId)
            : undefined;
          const transform = getWallRackTransform({
            rack,
            wall,
            walls,
            roomPolygon: this.roomPolygon,
            renderingEpsilon: 0.08,
          });
          posX = transform.position.x;
          posZ = transform.position.z;
          rotY = transform.rotationY;
        }
      } else if (isWallMounted) {
        const wall = rack.properties.attachedWallId
          ? walls.find((wl) => wl.id === rack.properties.attachedWallId)
          : undefined;
        const transform = getWallRackTransform({
          rack,
          wall,
          walls,
          roomPolygon: this.roomPolygon,
          renderingEpsilon: 0.08,
        });
        posX = transform.position.x;
        posZ = transform.position.z;
        rotY = transform.rotationY;
      }

      this.obstacles.push({
        id: rack.id,
        type: 'rack',
        label: `${rack.properties.rackType || 'Rack'} (${w}x${d})`,
        center: { x: posX, y: posZ },
        width: w,
        depth: d,
        rotationY: rotY,
        isWallMounted,
      });
    }

    // 5. Standalone Closed Shutters or Gates (Obstacles where geometry blocks passage)
    const closedOpenings = entities.filter(
      (e) => (e.type === 'shutter' && (e as any).properties?.isClosed) || e.type === 'gate'
    );
    for (const ent of closedOpenings) {
      const geom = (ent as any).geometry;
      if (geom && geom.x !== undefined && geom.y !== undefined) {
        const w = geom.width || 48;
        const rotRad = ((geom.rotation || 0) * Math.PI) / 180;
        const halfW = w / 2;
        const dx = Math.cos(rotRad) * halfW;
        const dz = Math.sin(rotRad) * halfW;
        this.obstacles.push({
          id: ent.id,
          type: 'opening',
          label: `${ent.type} (Closed)`,
          p1: { x: geom.x - dx, y: geom.y - dz },
          p2: { x: geom.x + dx, y: geom.y + dz },
          thickness: 6,
        });
      }
    }
  }

  /**
   * Tests a point against a line segment obstacle and returns collision hit details.
   * Uses approach direction from currentPos to ensure normal always pushes back to original side.
   */
  public testSegmentCollision(
    currentPos: Point2D,
    candidatePos: Point2D,
    p1: Point2D,
    p2: Point2D,
    halfThickness: number,
    radius: number
  ): CollisionHit {
    const totalDist = halfThickness + radius;
    const proj = projectPointOntoLine(candidatePos, p1, p2);

    if (proj.distance < totalDist) {
      const penetration = totalDist - proj.distance;
      const segDx = p2.x - p1.x;
      const segDy = p2.y - p1.y;
      const segLen = Math.hypot(segDx, segDy) || 1;
      const perpX = -segDy / segLen;
      const perpY = segDx / segLen;

      // Normal points towards currentPos approach side
      const toCurrentX = currentPos.x - proj.point.x;
      const toCurrentY = currentPos.y - proj.point.y;
      const dot = toCurrentX * perpX + toCurrentY * perpY;

      let nx = perpX;
      let ny = perpY;
      if (dot < -1e-5) {
        nx = -perpX;
        ny = -perpY;
      } else if (Math.abs(dot) <= 1e-5 && proj.distance > 1e-4) {
        nx = (candidatePos.x - proj.point.x) / proj.distance;
        ny = (candidatePos.y - proj.point.y) / proj.distance;
      }

      return {
        hit: true,
        distance: proj.distance,
        penetration,
        normal: { x: nx, y: ny },
        contactPoint: proj.point,
        obstacleId: '',
        obstacleType: 'wall',
      };
    }

    return {
      hit: false,
      distance: proj.distance,
      penetration: 0,
      normal: { x: 0, y: 0 },
      contactPoint: proj.point,
      obstacleId: '',
      obstacleType: 'wall',
    };
  }

  /**
   * Tests a point against an oriented box obstacle (rack, column).
   * Determines exact approach face (front, back, left, right) from currentPos trajectory.
   */
  public testBoxCollision(
    currentPos: Point2D,
    candidatePos: Point2D,
    obs: CollisionObstacle,
    radius: number
  ): CollisionHit {
    const cx = obs.center!.x;
    const cz = obs.center!.y;
    const w = obs.width || 36;
    const d = obs.depth || 24;
    const rot = obs.rotationY || 0;

    const cosR = Math.cos(rot);
    const sinR = Math.sin(rot);

    // Rotate start position into local coordinates
    const dxStart = currentPos.x - cx;
    const dzStart = currentPos.y - cz;
    const startX = dxStart * cosR - dzStart * sinR;
    const startZ = dxStart * sinR + dzStart * cosR;

    // Rotate candidate position into local coordinates
    const dxCand = candidatePos.x - cx;
    const dzCand = candidatePos.y - cz;
    const candX = dxCand * cosR - dzCand * sinR;
    const candZ = dxCand * sinR + dzCand * cosR;

    // Local box bounds
    const minX = -w / 2;
    const maxX = w / 2;
    let minZ: number;
    let maxZ: number;

    if (obs.type === 'rack' && obs.isWallMounted) {
      // Wall rack: back face is anchored at local Z = 0, extends forward into room +Z (0 to d)
      minZ = 0;
      maxZ = d;
    } else {
      // Centered rack or column
      minZ = -d / 2;
      maxZ = d / 2;
    }

    const expandedMinX = minX - radius;
    const expandedMaxX = maxX + radius;
    const expandedMinZ = minZ - radius;
    const expandedMaxZ = maxZ + radius;

    // Check if candidate is inside expanded bounding box
    if (
      candX >= expandedMinX &&
      candX <= expandedMaxX &&
      candZ >= expandedMinZ &&
      candZ <= expandedMaxZ
    ) {
      let normLocalX = 0;
      let normLocalZ = 1;
      let penetration = 0;

      // Determine face from start position approach
      if (startZ >= maxZ) {
        // Approached from FRONT face (+Z)
        normLocalX = 0;
        normLocalZ = 1;
        penetration = expandedMaxZ - candZ;
      } else if (startZ <= minZ) {
        // Approached from BACK face (-Z)
        normLocalX = 0;
        normLocalZ = -1;
        penetration = candZ - expandedMinZ;
      } else if (startX >= maxX) {
        // Approached from RIGHT face (+X)
        normLocalX = 1;
        normLocalZ = 0;
        penetration = expandedMaxX - candX;
      } else if (startX <= minX) {
        // Approached from LEFT face (-X)
        normLocalX = -1;
        normLocalZ = 0;
        penetration = candX - expandedMinX;
      } else {
        // Start was already inside or near corner: pick closest face to cand
        const dFront = expandedMaxZ - candZ;
        const dBack = candZ - expandedMinZ;
        const dRight = expandedMaxX - candX;
        const dLeft = candX - expandedMinX;
        const minP = Math.min(dFront, dBack, dRight, dLeft);
        penetration = minP;

        if (minP === dFront) {
          normLocalX = 0;
          normLocalZ = 1;
        } else if (minP === dBack) {
          normLocalX = 0;
          normLocalZ = -1;
        } else if (minP === dRight) {
          normLocalX = 1;
          normLocalZ = 0;
        } else {
          normLocalX = -1;
          normLocalZ = 0;
        }
      }

      // Rotate local normal back to world space
      const worldNormX = normLocalX * cosR + normLocalZ * sinR;
      const worldNormZ = -normLocalX * sinR + normLocalZ * cosR;

      return {
        hit: true,
        distance: 0,
        penetration: Math.max(0, penetration),
        normal: { x: worldNormX, y: worldNormZ },
        contactPoint: { x: cx, y: cz },
        obstacleId: obs.id,
        obstacleType: obs.type,
      };
    }

    return {
      hit: false,
      distance: 0,
      penetration: 0,
      normal: { x: 0, y: 0 },
      contactPoint: { x: cx, y: cz },
      obstacleId: obs.id,
      obstacleType: obs.type,
    };
  }

  /**
   * Resolves collision between current and desired positions using continuous sliding collision.
   *
   * SECTION 17: SLIDING COLLISION
   * When walking diagonally into a wall or obstacle:
   * 1. Finds the contact surface and normal.
   * 2. Separates the player along the normal to remove penetration.
   * 3. Projects remaining movement onto the obstacle tangent:
   *    v_slide = v - (v · n)n
   * 4. Applies remaining movement along the surface so the player slides naturally.
   *
   * @param currentPos Current safe 2D position (3D X, Z)
   * @param desiredPos Target position before collision resolution
   * @param radius Player collider radius (including buffer)
   */
  public resolvePosition(
    currentPos: Point2D,
    desiredPos: Point2D,
    radius: number = this.playerRadius
  ): Point2D {
    const totalDispX = desiredPos.x - currentPos.x;
    const totalDispY = desiredPos.y - currentPos.y;
    const totalDist = Math.hypot(totalDispX, totalDispY);

    // If movement is negligible, do static separation only
    if (totalDist < 1e-4) {
      let staticPos = { ...currentPos };
      for (const obs of this.obstacles) {
        if (obs.type === 'wall' || obs.type === 'opening') {
          const hit = this.testSegmentCollision(
            staticPos,
            staticPos,
            obs.p1!,
            obs.p2!,
            (obs.thickness || 9) / 2,
            radius
          );
          if (hit.hit) {
            staticPos.x += hit.normal.x * hit.penetration;
            staticPos.y += hit.normal.y * hit.penetration;
          }
        } else if (obs.type === 'rack' || obs.type === 'column') {
          const hit = this.testBoxCollision(staticPos, staticPos, obs, radius);
          if (hit.hit) {
            staticPos.x += hit.normal.x * hit.penetration;
            staticPos.y += hit.normal.y * hit.penetration;
          }
        }
      }
      if (this.roomPolygon && this.roomPolygon.length >= 3) {
        staticPos = this.clampInsideRoomPolygon(staticPos, radius);
      }
      return staticPos;
    }

    // Multi-pass slide and collide loop (max 3 iterations)
    let current = { ...currentPos };
    let remainingDisp = { x: totalDispX, y: totalDispY };

    for (let iter = 0; iter < 3; iter++) {
      const stepLen = Math.hypot(remainingDisp.x, remainingDisp.y);
      if (stepLen < 1e-4) break;

      const candidate = {
        x: current.x + remainingDisp.x,
        y: current.y + remainingDisp.y,
      };

      // Find the most severe collision along this candidate step
      let deepestHit: CollisionHit | null = null;

      // 1. Test obstacles
      for (const obs of this.obstacles) {
        let hit: CollisionHit;
        if (obs.type === 'wall' || obs.type === 'opening') {
          hit = this.testSegmentCollision(
            current,
            candidate,
            obs.p1!,
            obs.p2!,
            (obs.thickness || 9) / 2,
            radius
          );
        } else {
          hit = this.testBoxCollision(current, candidate, obs, radius);
        }

        if (hit.hit) {
          if (!deepestHit || hit.penetration > deepestHit.penetration) {
            deepestHit = hit;
          }
        }
      }

      // 2. Test room boundary edges
      if (this.roomPolygon && this.roomPolygon.length >= 3) {
        const polyHit = this.testPolygonBoundaryCollision(candidate, radius);
        if (polyHit.hit) {
          if (!deepestHit || polyHit.penetration > deepestHit.penetration) {
            deepestHit = polyHit;
          }
        }
      }

      if (!deepestHit) {
        // No collision detected: advance full remaining displacement
        current = candidate;
        break;
      }

      // Collision detected!
      // A. Separate candidate from obstacle along collision normal
      current.x = candidate.x + deepestHit.normal.x * deepestHit.penetration;
      current.y = candidate.y + deepestHit.normal.y * deepestHit.penetration;

      // B. Project remaining displacement onto sliding tangent:
      // Remove velocity component pushing into obstacle (v_dot_n < 0)
      const vDotN = remainingDisp.x * deepestHit.normal.x + remainingDisp.y * deepestHit.normal.y;
      if (vDotN < 0) {
        remainingDisp.x -= vDotN * deepestHit.normal.x;
        remainingDisp.y -= vDotN * deepestHit.normal.y;
      } else {
        // Already moving away from obstacle
        break;
      }
    }

    // Final safety clamp strictly inside room polygon
    if (this.roomPolygon && this.roomPolygon.length >= 3) {
      current = this.clampInsideRoomPolygon(current, radius);
    }

    return current;
  }

  /**
   * Checks if a point is within a valid walkable door opening threshold.
   */
  public isInsideWalkableOpening(pt: Point2D): boolean {
    for (const op of this.doorOpenings) {
      const proj = projectPointOntoLine(pt, op.p1, op.p2);
      if (proj.distance <= 18) {
        const dx = op.p2.x - op.p1.x;
        const dy = op.p2.y - op.p1.y;
        const len = Math.hypot(dx, dy) || 1;
        const t = ((pt.x - op.p1.x) * dx + (pt.y - op.p1.y) * dy) / (len * len);
        const distAlong = t * len;
        if (distAlong >= op.start - 2 && distAlong <= op.end + 2) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Tests candidate against all outer edges of the room polygon.
   */
  private testPolygonBoundaryCollision(candidate: Point2D, radius: number): CollisionHit {
    const poly = this.roomPolygon;
    const n = poly.length;
    let maxPenetration = 0;
    let bestHit: CollisionHit = {
      hit: false,
      distance: Infinity,
      penetration: 0,
      normal: { x: 0, y: 0 },
      contactPoint: candidate,
      obstacleId: 'room_boundary',
      obstacleType: 'room_boundary',
    };

    for (let i = 0; i < n; i++) {
      const p1 = poly[i];
      const p2 = poly[(i + 1) % n];
      const proj = projectPointOntoLine(candidate, p1, p2);

      if (proj.distance < radius) {
        if (this.isInsideWalkableOpening(candidate)) {
          continue; // Valid door opening allows passage
        }

        const penetration = radius - proj.distance;
        if (penetration > maxPenetration) {
          maxPenetration = penetration;

          // Normal pointing inward from edge into room
          let nx = 0;
          let ny = 1;
          if (proj.distance > 1e-4) {
            nx = (candidate.x - proj.point.x) / proj.distance;
            ny = (candidate.y - proj.point.y) / proj.distance;
          } else {
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const len = Math.hypot(dx, dy) || 1;
            nx = -dy / len;
            ny = dx / len;
          }

          bestHit = {
            hit: true,
            distance: proj.distance,
            penetration,
            normal: { x: nx, y: ny },
            contactPoint: proj.point,
            obstacleId: `room_edge_${i}`,
            obstacleType: 'room_boundary',
          };
        }
      }
    }

    return bestHit;
  }

  /**
   * Ensures the position stays strictly inside the walkable room polygon.
   * Handles irregular, diagonal, and concave L-shaped rooms.
   */
  public clampInsideRoomPolygon(pos: Point2D, radius: number = this.playerRadius): Point2D {
    const poly = this.roomPolygon;
    if (!poly || poly.length < 3) return pos;

    let adjusted = { ...pos };
    const n = poly.length;

    // Edge clearance check
    for (let i = 0; i < n; i++) {
      const p1 = poly[i];
      const p2 = poly[(i + 1) % n];
      const proj = projectPointOntoLine(adjusted, p1, p2);

      if (proj.distance < radius) {
        if (this.isInsideWalkableOpening(adjusted)) {
          continue; // Valid door opening allows passage
        }

        const penetration = radius - proj.distance;
        if (proj.distance > 1e-4) {
          const nx = (adjusted.x - proj.point.x) / proj.distance;
          const ny = (adjusted.y - proj.point.y) / proj.distance;
          adjusted.x += nx * penetration;
          adjusted.y += ny * penetration;
        }
      }
    }

    // Verify candidate point is strictly inside polygon
    if (!isPointInPolygon(adjusted, poly, false)) {
      if (this.isInsideWalkableOpening(adjusted)) {
        return adjusted; // Standing in door opening threshold
      }

      // Find closest edge and push inwards
      let minDist = Infinity;
      let bestPoint: Point2D = adjusted;
      let bestEdgeIdx = 0;

      for (let i = 0; i < n; i++) {
        const p1 = poly[i];
        const p2 = poly[(i + 1) % n];
        const proj = projectPointOntoLine(adjusted, p1, p2);
        if (proj.distance < minDist) {
          minDist = proj.distance;
          bestPoint = proj.point;
          bestEdgeIdx = i;
        }
      }

      // Push point inwards along perpendicular
      const p1 = poly[bestEdgeIdx];
      const p2 = poly[(bestEdgeIdx + 1) % n];
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const len = Math.hypot(dx, dy) || 1;
      const pushDist = radius * 1.5;

      const test1 = {
        x: bestPoint.x - (dy / len) * pushDist,
        y: bestPoint.y + (dx / len) * pushDist,
      };
      if (isPointInPolygon(test1, poly, false)) {
        adjusted = test1;
      } else {
        const test2 = {
          x: bestPoint.x + (dy / len) * pushDist,
          y: bestPoint.y - (dx / len) * pushDist,
        };
        if (isPointInPolygon(test2, poly, false)) {
          adjusted = test2;
        }
      }
    }

    return adjusted;
  }

  /**
   * SECTION 47: WALK START POSITION ALGORITHM
   * findWalkStartPosition(roomGeometry, obstacles, entities)
   *
   * 1. Get actual room polygon.
   * 2. Generate candidate interior points.
   * 3. Reject points outside room.
   * 4. Reject points inside obstacles.
   * 5. Reject points too close to walls.
   * 6. Reject points too close to racks/columns.
   * 7. Select a safe candidate.
   * 8. Set camera at candidate + eye height.
   *
   * For irregular/concave rooms, does NOT blindly use bounding-box center.
   */
  public findWalkStartPosition(
    entities: CADEntity[],
    preferredPosition?: Point2D,
    preferredYaw?: number
  ): { position: Point2D; initialYawRad: number } {
    const minSafeClearance = this.playerRadius + DEFAULT_COLLISION_BUFFER;

    // Helper: checks if a point is safely inside room and away from all obstacles
    const isSafePoint = (pt: Point2D): boolean => {
      if (this.roomPolygon && this.roomPolygon.length >= 3) {
        if (!isPointInPolygon(pt, this.roomPolygon, false)) return false;
        // Check room boundary clearance
        const polyHit = this.testPolygonBoundaryCollision(pt, minSafeClearance);
        if (polyHit.hit) return false;
      }

      // Check obstacles clearance
      for (const obs of this.obstacles) {
        if (obs.type === 'wall' || obs.type === 'opening') {
          const hit = this.testSegmentCollision(
            pt,
            pt,
            obs.p1!,
            obs.p2!,
            (obs.thickness || 9) / 2,
            minSafeClearance
          );
          if (hit.hit) return false;
        } else if (obs.type === 'rack' || obs.type === 'column') {
          const hit = this.testBoxCollision(pt, pt, obs, minSafeClearance);
          if (hit.hit) return false;
        }
      }
      return true;
    };

    // Candidate 1: Store Entrance (Door / Shutter / Gate) stepped 40" inside facing interior
    const entrance = entities.find(
      (e) => e.type === 'door' || e.type === 'glass_gate' || e.type === 'shutter' || e.type === 'gate'
    );

    if (entrance && (entrance as any).geometry) {
      const geom = (entrance as any).geometry;
      const ex = geom.x;
      const ez = geom.y;
      const rotRad = ((geom.rotation || 0) * Math.PI) / 180;

      // Inward direction candidate: perpendicular to door orientation
      const forwardX = -Math.sin(rotRad);
      const forwardZ = Math.cos(rotRad);
      const stepDist = 42; // 3.5 ft inside door

      const cand1 = { x: ex + forwardX * stepDist, y: ez + forwardZ * stepDist };
      const cand2 = { x: ex - forwardX * stepDist, y: ez - forwardZ * stepDist };

      if (isSafePoint(cand1)) {
        const initialYawRad = Math.atan2(-forwardX, -forwardZ);
        return { position: cand1, initialYawRad };
      }
      if (isSafePoint(cand2)) {
        const initialYawRad = Math.atan2(forwardX, forwardZ);
        return { position: cand2, initialYawRad };
      }
    }

    // Candidate 2: Preferred Position (e.g. Orbit Target preserved from user view)
    if (preferredPosition && isSafePoint(preferredPosition)) {
      return {
        position: preferredPosition,
        initialYawRad: preferredYaw !== undefined ? preferredYaw : 0,
      };
    }

    // Candidate 3: Centroid of Room Polygon
    if (this.roomPolygon && this.roomPolygon.length >= 3) {
      let sumX = 0;
      let sumZ = 0;
      for (const p of this.roomPolygon) {
        sumX += p.x;
        sumZ += p.y;
      }
      const centroid = {
        x: sumX / this.roomPolygon.length,
        y: sumZ / this.roomPolygon.length,
      };

      if (isSafePoint(centroid)) {
        return { position: centroid, initialYawRad: preferredYaw || 0 };
      }

      // Candidate 4: Pole of Inaccessibility / Interior Grid Search
      // In irregular or concave L-shaped rooms, centroid can fall outside the room or inside obstacles.
      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      for (const p of this.roomPolygon) {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minZ = Math.min(minZ, p.y);
        maxZ = Math.max(maxZ, p.y);
      }

      const gridStep = 18; // 18-inch test grid
      let bestCandidate: Point2D | null = null;
      let maxClearance = -Infinity;

      for (let x = minX + gridStep; x < maxX; x += gridStep) {
        for (let z = minZ + gridStep; z < maxZ; z += gridStep) {
          const testPt = { x, y: z };
          if (!isPointInPolygon(testPt, this.roomPolygon, false)) continue;

          // Compute clearance to closest obstacle
          let clearance = Infinity;

          // Room boundary distance
          for (let i = 0; i < this.roomPolygon.length; i++) {
            const p1 = this.roomPolygon[i];
            const p2 = this.roomPolygon[(i + 1) % this.roomPolygon.length];
            const proj = projectPointOntoLine(testPt, p1, p2);
            clearance = Math.min(clearance, proj.distance);
          }

          // Obstacles distance
          for (const obs of this.obstacles) {
            if (obs.type === 'wall' || obs.type === 'opening') {
              const proj = projectPointOntoLine(testPt, obs.p1!, obs.p2!);
              const d = proj.distance - (obs.thickness || 9) / 2;
              clearance = Math.min(clearance, d);
            } else if (obs.type === 'rack' || obs.type === 'column') {
              const hit = this.testBoxCollision(testPt, testPt, obs, 0.1);
              clearance = Math.min(clearance, hit.distance);
            }
          }

          if (clearance > maxClearance) {
            maxClearance = clearance;
            bestCandidate = testPt;
          }
        }
      }

      if (bestCandidate && maxClearance > this.playerRadius * 0.5) {
        return { position: bestCandidate, initialYawRad: preferredYaw || 0 };
      }
    }

    // Fallback: Safe room center
    return { position: { x: 0, y: 0 }, initialYawRad: 0 };
  }

  /**
   * SECTION 37: COLLISION DEBUG VISUALIZATION
   * Generates a 3D visualization group showing:
   * - Wall collision segments (cyan)
   * - Rack collision boxes (emerald)
   * - Column collision boxes (amber)
   * - Room boundary polygon (lime)
   * - Player collider representation (magenta)
   */
  public createDebugVisualization(playerPos?: Point2D): THREE.Group {
    const group = new THREE.Group();
    group.name = 'WalkCollisionDebugGroup';

    const wallMat = new THREE.LineBasicMaterial({ color: 0x06b6d4, linewidth: 2 }); // cyan
    const rackMat = new THREE.LineBasicMaterial({ color: 0x10b981, linewidth: 2 }); // emerald
    const colMat = new THREE.LineBasicMaterial({ color: 0xf59e0b, linewidth: 2 });  // amber
    const polyMat = new THREE.LineBasicMaterial({ color: 0x84cc16, linewidth: 3 }); // lime
    const playerMat = new THREE.LineBasicMaterial({ color: 0xec4899, linewidth: 3 }); // pink/magenta

    // 1. Wall Obstacle lines
    for (const obs of this.obstacles) {
      if (obs.type === 'wall' || obs.type === 'opening') {
        const p1 = obs.p1!;
        const p2 = obs.p2!;
        const pts = [
          new THREE.Vector3(p1.x, 4, p1.y),
          new THREE.Vector3(p2.x, 4, p2.y),
        ];
        const geom = new THREE.BufferGeometry().setFromPoints(pts);
        group.add(new THREE.Line(geom, wallMat));
      } else if (obs.type === 'rack' || obs.type === 'column') {
        // Wireframe box proxy
        const w = obs.width || 36;
        const d = obs.depth || 24;
        const h = obs.type === 'rack' ? 84 : 120;
        const boxGeom = new THREE.BoxGeometry(w, h, d);
        const edgesGeom = new THREE.EdgesGeometry(boxGeom);
        const wire = new THREE.LineSegments(edgesGeom, obs.type === 'rack' ? rackMat : colMat);

        const rot = obs.rotationY || 0;
        wire.rotation.y = rot;

        if (obs.type === 'rack' && obs.isWallMounted) {
          // Wall rack offset: local Z center is at +d/2
          const cosR = Math.cos(rot);
          const sinR = Math.sin(rot);
          wire.position.set(
            obs.center!.x + (d / 2) * sinR,
            h / 2,
            obs.center!.y + (d / 2) * cosR
          );
        } else {
          wire.position.set(obs.center!.x, h / 2, obs.center!.y);
        }

        group.add(wire);
      }
    }

    // 2. Room Walkable Boundary Polygon
    if (this.roomPolygon && this.roomPolygon.length >= 3) {
      const polyPts = this.roomPolygon.map((p) => new THREE.Vector3(p.x, 2, p.y));
      polyPts.push(polyPts[0].clone()); // Close loop
      const polyGeom = new THREE.BufferGeometry().setFromPoints(polyPts);
      group.add(new THREE.Line(polyGeom, polyMat));
    }

    // 3. Player Collider (Human Body Cylinder approximation)
    const playerRadius = this.playerRadius;
    const playerHeight = DEFAULT_WALK_EYE_HEIGHT;
    const playerGeom = new THREE.CylinderGeometry(playerRadius, playerRadius, playerHeight, 16);
    const playerEdges = new THREE.EdgesGeometry(playerGeom);
    const playerMesh = new THREE.LineSegments(playerEdges, playerMat);
    playerMesh.name = 'PlayerColliderDebugMesh';
    const px = playerPos?.x || 0;
    const pz = playerPos?.y || 0;
    playerMesh.position.set(px, playerHeight / 2, pz);
    group.add(playerMesh);

    return group;
  }

  /**
   * Updates position of the player collider debug mesh during walk mode.
   */
  public updatePlayerDebugPosition(group: THREE.Group, playerPos: Point2D): void {
    const mesh = group.getObjectByName('PlayerColliderDebugMesh');
    if (mesh) {
      mesh.position.x = playerPos.x;
      mesh.position.z = playerPos.y;
    }
  }
}
