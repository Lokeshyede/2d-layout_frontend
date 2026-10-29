import type { Point2D, RackEntity, WallEntity } from '../types';
import { projectPointOntoLine, calculateWallInwardNormal, buildRoomPolygon } from '../geometry/GeometryMath';
import { RackConnectionEngine } from './RackConnectionEngine';
import { ProductModelRegistry } from '../services/ProductModelRegistry';

export interface RackPlacementTemplate {
  rackType: RackEntity['properties']['rackType'];
  productModelId?: string;
  productName?: string;
  sku?: string;
  width: number;
  depth: number;
  height?: number;
  shelves?: number;
  shelfCount?: number;
  shelfThickness?: number;
  shelfSpacing?: 'auto' | number;
  rotation: number;
  isCustom?: boolean;
  baseWidth?: number;
  baseDepth?: number;
  baseHeight?: number;
  scalingMode?: 'stretch' | 'fit' | string;
}

export interface RackPlacementCalculation {
  x: number;
  y: number;
  rotation: number;
  attachedWallId?: string;
  wallSide?: RackEntity['properties']['wallSide'];
  inwardNormal?: Point2D;
  cornerPosition?: RackEntity['properties']['cornerPosition'];
  isSnapped: boolean;
  snapType: string;
}

export class RackPlacementController {
  /**
   * Evaluates if a touch interaction corresponds to a deliberate single tap
   * (duration < 800ms and total pointer travel < 28px).
   */
  public static isDeliberateTap(elapsedMs: number, totalMovedPx: number): boolean {
    return elapsedMs < 800 && totalMovedPx < 28;
  }

  /**
   * Computes the snapping and placement coordinates for a pending rack template.
   * Prioritizes:
   * 1. Wall snapping for Wall Racks (projection onto nearest wall within 72 inches)
   * 2. Corner snapping for Corner Racks (nearest corner within 72 inches)
   * 3. Adjacent rack snapping for Gondola / Centre / Endcap racks (via RackConnectionEngine)
   * 4. 12-inch grid alignment fallback
   */
  public static calculatePlacement(
    targetPt: Point2D,
    template: RackPlacementTemplate,
    walls: WallEntity[],
    existingRacks: RackEntity[],
    activeRoomPolygon: Point2D[] = []
  ): RackPlacementCalculation {
    const isWallRack =
      template.rackType === 'wall_rack_7x3' ||
      template.rackType === 'wall_rack_7x4' ||
      template.rackType === 'Wall Rack' ||
      template.rackType?.toLowerCase().includes('wall') ||
      template.productName?.toLowerCase().includes('wall');

    const isCornerRack =
      template.rackType === 'corner_rack_2x2x2' ||
      template.rackType === 'Corner Rack' ||
      template.rackType?.toLowerCase().includes('corner') ||
      template.productName?.toLowerCase().includes('corner');

    let x = targetPt.x;
    let y = targetPt.y;
    let rotation = template.rotation || 0;
    let attachedWallId: string | undefined;
    let wallSide: RackEntity['properties']['wallSide'];
    let inwardNormal: Point2D | undefined;
    let cornerPosition: RackEntity['properties']['cornerPosition'];
    let isSnapped = false;
    let snapType = 'Grid';

    if (isWallRack && walls.length > 0) {
      let bestWall: WallEntity | null = null;
      let bestDist = Infinity;
      let bestProj: any = null;

      for (const w of walls) {
        const proj = projectPointOntoLine(
          targetPt,
          { x: w.geometry.x1, y: w.geometry.y1 },
          { x: w.geometry.x2, y: w.geometry.y2 }
        );
        if (proj.distance < bestDist) {
          bestDist = proj.distance;
          bestWall = w;
          bestProj = proj;
        }
      }

      if (bestWall && bestDist <= 72) {
        attachedWallId = bestWall.id;
        const wx1 = bestWall.geometry.x1, wy1 = bestWall.geometry.y1;
        const wx2 = bestWall.geometry.x2, wy2 = bestWall.geometry.y2;
        const wallAngle = Math.atan2(wy2 - wy1, wx2 - wx1) * (180 / Math.PI);
        const wallLen = Math.hypot(wx2 - wx1, wy2 - wy1);

        const roomPoly =
          activeRoomPolygon.length >= 3
            ? activeRoomPolygon
            : buildRoomPolygon(walls);

        const normals = calculateWallInwardNormal(
          { x: wx1, y: wy1 },
          { x: wx2, y: wy2 },
          roomPoly
        );
        inwardNormal = normals.inwardNormal;

        const rackHalfW = (template.width || 36) / 2;
        const clampedT = Math.max(rackHalfW, Math.min(bestProj.distanceAlongLine, wallLen - rackHalfW));

        const wallDir = wallLen > 0 ? { x: (wx2 - wx1) / wallLen, y: (wy2 - wy1) / wallLen } : { x: 1, y: 0 };
        const wallThickness = bestWall.properties?.thickness ?? 9;

        x = wx1 + wallDir.x * clampedT + inwardNormal.x * (wallThickness / 2);
        y = wy1 + wallDir.y * clampedT + inwardNormal.y * (wallThickness / 2);

        rotation = (wallAngle + (template.rotation || 0) + 360) % 360;

        if (Math.abs(inwardNormal.y - 1) < 0.2) wallSide = 'top';
        else if (Math.abs(inwardNormal.y + 1) < 0.2) wallSide = 'bottom';
        else if (Math.abs(inwardNormal.x - 1) < 0.2) wallSide = 'left';
        else if (Math.abs(inwardNormal.x + 1) < 0.2) wallSide = 'right';

        isSnapped = true;
        snapType = 'Wall';
      } else {
        x = Math.round(targetPt.x / 12) * 12;
        y = Math.round(targetPt.y / 12) * 12;
      }
    } else if (isCornerRack && walls.length >= 4) {
      const xs = walls.flatMap(ww => [ww.geometry.x1, ww.geometry.x2]);
      const ys = walls.flatMap(ww => [ww.geometry.y1, ww.geometry.y2]);
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const minY = Math.min(...ys), maxY = Math.max(...ys);
      const corners = [
        { x: minX, y: minY, pos: 'top-left' as const, rot: 0 },
        { x: maxX, y: minY, pos: 'top-right' as const, rot: 90 },
        { x: maxX, y: maxY, pos: 'bottom-right' as const, rot: 180 },
        { x: minX, y: maxY, pos: 'bottom-left' as const, rot: 270 },
      ];
      let bestCorner = corners[0];
      let bestDist = Math.hypot(bestCorner.x - targetPt.x, bestCorner.y - targetPt.y);
      for (const c of corners.slice(1)) {
        const d = Math.hypot(c.x - targetPt.x, c.y - targetPt.y);
        if (d < bestDist) { bestDist = d; bestCorner = c; }
      }

      if (bestDist <= 72) {
        x = bestCorner.x;
        y = bestCorner.y;
        cornerPosition = bestCorner.pos;
        rotation = (bestCorner.rot + (template.rotation || 0)) % 360;
        isSnapped = true;
        snapType = 'Corner';
      } else {
        x = Math.round(targetPt.x / 12) * 12;
        y = Math.round(targetPt.y / 12) * 12;
      }
    } else {
      const dummyRack: RackEntity = {
        id: 'preview',
        type: 'rack',
        geometry: {
          x: targetPt.x,
          y: targetPt.y,
          width: template.width,
          depth: template.depth,
          height: template.height,
          rotation: template.rotation
        },
        properties: {
          rackType: template.rackType,
          productModelId: template.productModelId
        }
      };

      const bestSnap = RackConnectionEngine.findBestSnap(dummyRack, existingRacks, targetPt, template.rotation);
      if (bestSnap && bestSnap.validation.isValid) {
        x = bestSnap.position.x;
        y = bestSnap.position.y;
        rotation = bestSnap.rotation;
        isSnapped = true;
        snapType = 'Adjacent Rack';
      } else {
        x = Math.round(targetPt.x / 12) * 12;
        y = Math.round(targetPt.y / 12) * 12;
      }
    }

    return {
      x,
      y,
      rotation,
      attachedWallId,
      wallSide,
      inwardNormal,
      cornerPosition,
      isSnapped,
      snapType,
    };
  }

  /**
   * Constructs a fully qualified RackEntity from placement calculation and template.
   */
  public static createRackEntity(
    placement: RackPlacementCalculation,
    template: RackPlacementTemplate
  ): RackEntity {
    const matchedProduct = ProductModelRegistry.resolve(template.productModelId, template.rackType);
    const resolvedShelfCount = template.shelfCount || matchedProduct?.shelfCount || 6;
    const resolvedShelfThickness = template.shelfThickness || (matchedProduct as any)?.shelfThickness || 1.0;

    return {
      id: `rack_${Date.now()}`,
      type: 'rack',
      geometry: {
        x: placement.x,
        y: placement.y,
        width: template.width,
        depth: template.depth,
        height: template.height,
        rotation: placement.rotation,
      },
      properties: {
        rackType: template.rackType,
        productModelId: template.productModelId,
        productName: template.productName || matchedProduct?.productName,
        sku: template.sku || matchedProduct?.sku,
        shelves: resolvedShelfCount,
        shelfCount: resolvedShelfCount,
        shelfSpacing: template.shelfSpacing || 'auto',
        shelfThickness: resolvedShelfThickness,
        attachedWallId: placement.attachedWallId,
        wallSide: placement.wallSide,
        inwardNormal: placement.inwardNormal,
        cornerPosition: placement.cornerPosition,
        isCustom: template.isCustom,
        baseWidth: template.baseWidth,
        baseDepth: template.baseDepth,
        baseHeight: template.baseHeight,
        scalingMode: template.scalingMode,
      },
    };
  }
}

