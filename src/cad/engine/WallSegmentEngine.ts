import type { Point2D, WallEntity } from '../types';
import {
  distance,
  buildRoomPolygon,
  calculateWallInwardNormal,
} from '../geometry/GeometryMath';

export interface WallSegmentData {
  wall: WallEntity;
  wallId: string;
  start: Point2D;
  end: Point2D;
  length: number;
  direction: Point2D; // Unit vector along wall from start to end
  inwardNormal: Point2D; // Unit normal pointing strictly INTO room interior
  exteriorNormal: Point2D; // Unit normal pointing strictly OUT of room
  angleDeg: number; // Angle of wall direction in degrees [0..360)
  wallThickness: number;
  interiorFaceStart: Point2D; // start point offset to interior wall face
  interiorFaceEnd: Point2D; // end point offset to interior wall face
}

export class WallSegmentEngine {
  /**
   * Processes an array of WallEntity objects and produces authoritative
   * WallSegmentData with validated interior normals against the room polygon.
   */
  public static getAuthoritativeWallSegments(
    walls: WallEntity[],
    explicitRoomPolygon?: Point2D[]
  ): {
    segments: WallSegmentData[];
    roomPolygon: Point2D[];
  } {
    if (!walls || walls.length === 0) {
      return { segments: [], roomPolygon: [] };
    }

    const roomPolygon =
      explicitRoomPolygon && explicitRoomPolygon.length >= 3
        ? explicitRoomPolygon
        : buildRoomPolygon(walls);

    const segments: WallSegmentData[] = [];

    for (const wall of walls) {
      const start = { x: wall.geometry.x1, y: wall.geometry.y1 };
      const end = { x: wall.geometry.x2, y: wall.geometry.y2 };
      const len = distance(start, end);
      if (len < 0.5) continue; // Ignore zero-length or microscopic segments

      const thickness = wall.properties?.thickness ?? 9;
      const normals = calculateWallInwardNormal(start, end, roomPolygon);
      const angleRad = Math.atan2(normals.wallDirection.y, normals.wallDirection.x);
      const angleDeg = ((angleRad * 180) / Math.PI + 360) % 360;

      const halfThick = thickness / 2;
      const interiorFaceStart: Point2D = {
        x: start.x + normals.inwardNormal.x * halfThick,
        y: start.y + normals.inwardNormal.y * halfThick,
      };
      const interiorFaceEnd: Point2D = {
        x: end.x + normals.inwardNormal.x * halfThick,
        y: end.y + normals.inwardNormal.y * halfThick,
      };

      segments.push({
        wall,
        wallId: wall.id,
        start,
        end,
        length: len,
        direction: normals.wallDirection,
        inwardNormal: normals.inwardNormal,
        exteriorNormal: normals.exteriorNormal,
        angleDeg,
        wallThickness: thickness,
        interiorFaceStart,
        interiorFaceEnd,
      });
    }

    return { segments, roomPolygon };
  }

  /**
   * Evaluates world coordinate on the interior wall face for a given distance along the wall.
   */
  public static getInteriorFacePoint(
    seg: WallSegmentData,
    distanceAlongWall: number
  ): Point2D {
    return {
      x: seg.interiorFaceStart.x + seg.direction.x * distanceAlongWall,
      y: seg.interiorFaceStart.y + seg.direction.y * distanceAlongWall,
    };
  }
}
