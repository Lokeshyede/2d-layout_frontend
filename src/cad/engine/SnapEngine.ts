import type { Point2D, CADEntity, SnapResult } from '../types';
import { distance, midpoint, projectPointOntoLine, snapAngleOrtho } from '../geometry/GeometryMath';

export interface SnapConfig {
  gridSnap: boolean;
  gridSize: number;
  endpointSnap: boolean;
  midpointSnap: boolean;
  wallSnap: boolean;
  orthoMode: boolean;
  snapThresholdPixels: number;
}

export class SnapEngine {
  public config: SnapConfig = {
    gridSnap: true,
    gridSize: 12,
    endpointSnap: true,
    midpointSnap: true,
    wallSnap: true,
    orthoMode: false,
    snapThresholdPixels: 15,
  };

  public findSnapPoint(
    rawWorldPos: Point2D,
    entities: CADEntity[],
    zoom: number,
    baseStartPoint?: Point2D | null
  ): SnapResult {
    let candidatePos = { ...rawWorldPos };

    if (this.config.orthoMode && baseStartPoint) {
      candidatePos = snapAngleOrtho(baseStartPoint, rawWorldPos);
    }

    const snapDistanceThreshold = this.config.snapThresholdPixels / zoom;

    let bestSnap: SnapResult | null = null;
    let minDistance = snapDistanceThreshold;

    for (const ent of entities) {
      if (ent.type === 'wall' || ent.type === 'partition') {
        const geom = ent.geometry as { x1: number; y1: number; x2: number; y2: number };
        const p1: Point2D = { x: geom.x1, y: geom.y1 };
        const p2: Point2D = { x: geom.x2, y: geom.y2 };

        if (this.config.endpointSnap) {
          const d1 = distance(candidatePos, p1);
          if (d1 < minDistance) {
            minDistance = d1;
            bestSnap = {
              point: p1,
              type: 'endpoint',
              targetEntityId: ent.id,
            };
          }

          const d2 = distance(candidatePos, p2);
          if (d2 < minDistance) {
            minDistance = d2;
            bestSnap = {
              point: p2,
              type: 'endpoint',
              targetEntityId: ent.id,
            };
          }
        }

        if (this.config.midpointSnap) {
          const mid = midpoint(p1, p2);
          const dMid = distance(candidatePos, mid);
          if (dMid < minDistance) {
            minDistance = dMid;
            bestSnap = {
              point: mid,
              type: 'midpoint',
              targetEntityId: ent.id,
            };
          }
        }

        if (this.config.wallSnap && !bestSnap) {
          const proj = projectPointOntoLine(candidatePos, p1, p2);
          if (proj.distance < snapDistanceThreshold && proj.t > 0.01 && proj.t < 0.99) {
            bestSnap = {
              point: proj.point,
              type: 'wall',
              targetEntityId: ent.id,
            };
          }
        }
      } else if (ent.type === 'column' || ent.type === 'rack') {
        const geom = ent.geometry as { x: number; y: number; width: number; height?: number; depth?: number; rotation?: number };
        const cx = geom.x;
        const cy = geom.y;
        const w = geom.width || (ent.type === 'rack' ? 36 : 24);
        const d = geom.depth || (ent.type === 'column' ? ((ent as any).properties?.inwardProjection || 24) : 24);
        const rotRad = ((geom.rotation || 0) * Math.PI) / 180;
        const cos = Math.cos(rotRad);
        const sin = Math.sin(rotRad);

        if (this.config.endpointSnap) {
          const localCorners = [
            { x: -w / 2, y: -d / 2 },
            { x: w / 2, y: -d / 2 },
            { x: w / 2, y: d / 2 },
            { x: -w / 2, y: d / 2 },
          ];
          const corners: Point2D[] = localCorners.map((lc) => ({
            x: cx + lc.x * cos - lc.y * sin,
            y: cy + lc.x * sin + lc.y * cos,
          }));
          for (const corner of corners) {
            const dCorner = distance(candidatePos, corner);
            if (dCorner < minDistance) {
              minDistance = dCorner;
              bestSnap = {
                point: corner,
                type: 'endpoint',
                targetEntityId: ent.id,
              };
            }
          }
        }
      }
    }

    if (bestSnap) {
      return bestSnap;
    }

    if (this.config.gridSnap) {
      const gs = this.config.gridSize;
      const gridX = Math.round(candidatePos.x / gs) * gs;
      const gridY = Math.round(candidatePos.y / gs) * gs;
      const dGrid = distance(candidatePos, { x: gridX, y: gridY });

      if (dGrid <= snapDistanceThreshold * 1.5) {
        return {
          point: { x: gridX, y: gridY },
          type: 'grid',
        };
      }
    }

    return {
      point: candidatePos,
      type: 'grid',
    };
  }
}
