import type { CADEntity, DimensionItem, Point2D, RackEntity, WallEntity } from '../types';
import { WallSegmentEngine, type WallSegmentData } from './WallSegmentEngine';
import { formatFeetInches } from '../geometry/FeetInches';
import { distance } from '../geometry/GeometryMath';

const MIN_REMAINING_INCHES = 6;
const WALL_DEPTH = 24;
const CORNER_SIDE = 24;

interface Interval {
  start: number;
  end: number;
}

export class RemainingSpaceEngine {
  /**
   * Computes authoritative remaining-space DimensionItems for all usable wall runs.
   * Renders only when gap >= 6".
   */
  public static calculateRemainingSpace(
    walls: WallEntity[],
    allEntities: CADEntity[],
    explicitRoomPolygon?: Point2D[]
  ): DimensionItem[] {
    const { segments } = WallSegmentEngine.getAuthoritativeWallSegments(walls, explicitRoomPolygon);
    const dimensions: DimensionItem[] = [];

    const racks = allEntities.filter((e): e is RackEntity => e.type === 'rack');
    const cornerRacks = racks.filter(
      (r) =>
        r.properties.rackType === 'corner_rack_2x2x2' ||
        r.properties.rackType === 'Corner Rack' ||
        (r.properties.productName && r.properties.productName.toLowerCase().includes('corner'))
    );
    const wallRacks = racks.filter(
      (r) =>
        r.properties.rackType?.startsWith('wall_rack') ||
        r.properties.rackType === 'Wall Rack' ||
        (r.properties.rackType && r.properties.rackType.toLowerCase().includes('wall')) ||
        (r.properties.productName && r.properties.productName.toLowerCase().includes('wall')) ||
        Boolean(r.properties.attachedWallId)
    );

    for (const seg of segments) {
      // 1. Find obstacle intervals along this wall
      const obstacleIntervals: Interval[] = [];

      // Corner rack deductions at start or end of this wall
      for (const cr of cornerRacks) {
        const crPt = { x: cr.geometry.x, y: cr.geometry.y };
        if (distance(crPt, seg.start) < 4.0) {
          obstacleIntervals.push({ start: 0, end: CORNER_SIDE });
        }
        if (distance(crPt, seg.end) < 4.0) {
          obstacleIntervals.push({ start: Math.max(0, seg.length - CORNER_SIDE), end: seg.length });
        }
      }

      // Other wall-attached obstacles: doors, windows, shutters, gates, wall columns
      for (const ent of allEntities) {
        if (
          ent.type === 'door' ||
          ent.type === 'window' ||
          ent.type === 'shutter' ||
          ent.type === 'gate' ||
          ent.type === 'glass_gate' ||
          (ent.type === 'column' && (ent as any).properties?.columnType === 'wall')
        ) {
          const attachedWallId = (ent as any).properties?.attachedWallId;
          const geom = (ent as any).geometry;
          const entW = geom.width || 36;

          let isMatch = attachedWallId === seg.wallId;
          if (!isMatch) {
            // Check distance from wall centerline
            const entPt = { x: geom.x, y: geom.y };
            const t =
              (entPt.x - seg.start.x) * seg.direction.x +
              (entPt.y - seg.start.y) * seg.direction.y;
            if (t >= -entW && t <= seg.length + entW) {
              const projX = seg.start.x + seg.direction.x * t;
              const projY = seg.start.y + seg.direction.y * t;
              if (Math.hypot(entPt.x - projX, entPt.y - projY) < seg.wallThickness + 6) {
                isMatch = true;
              }
            }
          }

          if (isMatch) {
            const entPt = { x: geom.x, y: geom.y };
            const t =
              (entPt.x - seg.start.x) * seg.direction.x +
              (entPt.y - seg.start.y) * seg.direction.y;
            const obsStart = Math.max(0, t - entW / 2);
            const obsEnd = Math.min(seg.length, t + entW / 2);
            if (obsEnd > obsStart) {
              obstacleIntervals.push({ start: obsStart, end: obsEnd });
            }
          }
        }
      }

      // 2. Subtract obstacles from [0, seg.length] to find usable intervals
      let usable: Interval[] = [{ start: 0, end: seg.length }];
      for (const obs of obstacleIntervals) {
        usable = this.subtractInterval(usable, obs.start, obs.end);
      }
      usable = usable.filter((iv) => iv.end - iv.start >= MIN_REMAINING_INCHES);

      // 3. For each usable interval, find wall racks located within it
      for (const interval of usable) {
        // Find wall racks positioned along this segment
        const racksInInterval: Array<{ rack: RackEntity; start: number; end: number }> = [];

        for (const wr of wallRacks) {
          const attachedId = wr.properties.attachedWallId;
          const rw = wr.geometry.width || 36;
          const rx = wr.geometry.x;
          const ry = wr.geometry.y;

          let t = 0;
          let isAttached = attachedId === seg.wallId;

          if (!isAttached) {
            // Projection test
            t =
              (rx - seg.interiorFaceStart.x) * seg.direction.x +
              (ry - seg.interiorFaceStart.y) * seg.direction.y;
            if (t >= interval.start - rw && t <= interval.end + rw) {
              const projX = seg.interiorFaceStart.x + seg.direction.x * t;
              const projY = seg.interiorFaceStart.y + seg.direction.y * t;
              if (Math.hypot(rx - projX, ry - projY) < 12) {
                isAttached = true;
              }
            }
          } else {
            t =
              (rx - seg.interiorFaceStart.x) * seg.direction.x +
              (ry - seg.interiorFaceStart.y) * seg.direction.y;
          }

          if (isAttached) {
            const rStart = t - rw / 2;
            const rEnd = t + rw / 2;
            // Overlaps interval
            if (rEnd > interval.start + 0.1 && rStart < interval.end - 0.1) {
              racksInInterval.push({
                rack: wr,
                start: Math.max(interval.start, rStart),
                end: Math.min(interval.end, rEnd),
              });
            }
          }
        }

        racksInInterval.sort((a, b) => a.start - b.start);

        // 4. Calculate gaps
        let cursor = interval.start;

        for (const placed of racksInInterval) {
          const gap = placed.start - cursor;
          if (gap >= MIN_REMAINING_INCHES) {
            const dim = this.createRemainingDimension(seg, cursor, placed.start);
            if (dim) dimensions.push(dim);
          }
          cursor = Math.max(cursor, placed.end);
        }

        // Gap after last rack
        const trailingGap = interval.end - cursor;
        if (trailingGap >= MIN_REMAINING_INCHES) {
          const dim = this.createRemainingDimension(seg, cursor, interval.end);
          if (dim) dimensions.push(dim);
        }
      }
    }

    return dimensions;
  }

  private static subtractInterval(available: Interval[], bStart: number, bEnd: number): Interval[] {
    const result: Interval[] = [];
    for (const a of available) {
      if (bEnd <= a.start || bStart >= a.end) {
        result.push(a);
        continue;
      }
      if (a.start < bStart) result.push({ start: a.start, end: bStart });
      if (bEnd < a.end) result.push({ start: bEnd, end: a.end });
    }
    return result;
  }

  private static createRemainingDimension(
    seg: WallSegmentData,
    startOffset: number,
    endOffset: number
  ): DimensionItem | null {
    const length = endOffset - startOffset;
    if (length < MIN_REMAINING_INCHES) return null;

    const midT = (startOffset + endOffset) / 2;
    const INWARD_OFFSET = WALL_DEPTH + 14;

    const sp1 = WallSegmentEngine.getInteriorFacePoint(seg, startOffset);
    const sp2 = WallSegmentEngine.getInteriorFacePoint(seg, endOffset);
    const midPoint = WallSegmentEngine.getInteriorFacePoint(seg, midT);

    const labelPoint: Point2D = {
      x: midPoint.x + seg.inwardNormal.x * INWARD_OFFSET,
      y: midPoint.y + seg.inwardNormal.y * INWARD_OFFSET,
    };

    const isH = Math.abs(seg.direction.y) < 0.05;
    const isV = Math.abs(seg.direction.x) < 0.05;
    const orientation: 'horizontal' | 'vertical' | 'aligned' = isH
      ? 'horizontal'
      : isV
      ? 'vertical'
      : 'aligned';

    const formatted = formatFeetInches(length);
    const displayText = `${formatted}\nREMAINING`;
    const bw = Math.max(formatted.length * 6.5, 42);

    return {
      id: `rem_dim_${seg.wallId}_${Math.round(startOffset)}_${Math.round(endOffset)}`,
      startPoint: sp1,
      endPoint: sp2,
      value: Math.round(length * 10) / 10,
      formattedValue: displayText,
      orientation,
      lane: 0,
      priority: 3,
      offsetDistance: INWARD_OFFSET,
      type: 'remaining_space',
      classification: 'REMAINING_SPACE',
      labelPoint,
      boundingBox: {
        minX: labelPoint.x - bw / 2,
        maxX: labelPoint.x + bw / 2,
        minY: labelPoint.y - 12,
        maxY: labelPoint.y + 12,
      },
    };
  }
}
