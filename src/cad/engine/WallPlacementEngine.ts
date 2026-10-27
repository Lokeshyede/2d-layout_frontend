import type {
  CADEntity,
  WallEntity,
  Point2D,
  WallPlacementData,
  WallPositionAnchor,
  ColumnEntity,
  RackEntity,
} from '../types';
import { formatFeetInches, formatCustomRackLabel } from '../geometry/FeetInches';
import { calculateWallInwardNormal } from '../geometry/GeometryMath';

export interface WallMetrics {
  wall: WallEntity;
  start: Point2D;
  end: Point2D;
  vector: Point2D;
  length: number;
  direction: Point2D;
  angleDeg: number;
  angleRad: number;
}

export interface PlacementExtents {
  startDist: number; // Distance along wall from start to object start
  endDist: number;   // Distance along wall from start to object end
  centerDist: number; // Distance along wall from start to object center
}

export interface WallPlacementCalculationResult {
  isValid: boolean;
  errorMessage?: string;
  warningMessage?: string;
  extents: PlacementExtents;
  centerPoint: Point2D;
  startPoint: Point2D;
  endPoint: Point2D;
  rotation: number;
  inwardNormal: Point2D;
  metrics: WallMetrics;
  wallPlacement: WallPlacementData;
}

export interface WallOption {
  id: string;
  index: number;
  label: string;
  length: number;
  wall: WallEntity;
}

export class WallPlacementEngine {
  /**
   * Supported wall-attached entity types
   */
  public static readonly WALL_ATTACHED_TYPES = new Set([
    'door',
    'window',
    'shutter',
    'gate',
    'glass_gate',
    'column',
    'rack',
  ]);

  /**
   * Checks if an entity is wall-attached
   */
  public static isWallAttachedEntity(entity: CADEntity): boolean {
    if (!this.WALL_ATTACHED_TYPES.has(entity.type)) return false;
    if (entity.type === 'column') {
      const col = entity as ColumnEntity;
      return col.properties.columnType === 'wall';
    }
    if (entity.type === 'rack') {
      const rack = entity as RackEntity;
      const rt = rack.properties.rackType || '';
      return Boolean(
        rt.startsWith('wall_rack') ||
        rt === 'Wall Rack' ||
        rt.toLowerCase().includes('wall') ||
        (rack.properties.productName && rack.properties.productName.toLowerCase().includes('wall')) ||
        Boolean(rack.properties.attachedWallId)
      );
    }
    return true;
  }

  /**
   * Extracts geometric metrics for a given wall
   */
  public static getWallMetrics(wall: WallEntity): WallMetrics {
    const start: Point2D = { x: wall.geometry.x1, y: wall.geometry.y1 };
    const end: Point2D = { x: wall.geometry.x2, y: wall.geometry.y2 };
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);

    const direction: Point2D = length > 0
      ? { x: dx / length, y: dy / length }
      : { x: 1, y: 0 };

    const angleRad = Math.atan2(dy, dx);
    const angleDeg = ((angleRad * 180 / Math.PI) % 360 + 360) % 360;

    return {
      wall,
      start,
      end,
      vector: { x: dx, y: dy },
      length,
      direction,
      angleDeg,
      angleRad,
    };
  }

  /**
   * Formats a list of all CAD walls for dropdowns (e.g. "Wall 1 — 50'-0\"")
   */
  public static getWallOptions(entities: CADEntity[]): WallOption[] {
    const walls = entities.filter((e): e is WallEntity => e.type === 'wall');
    return walls.map((wall, idx) => {
      const metrics = this.getWallMetrics(wall);
      const formatted = formatFeetInches(metrics.length);
      return {
        id: wall.id,
        index: idx + 1,
        label: `Wall ${idx + 1} — ${formatted}`,
        length: metrics.length,
        wall,
      };
    });
  }

  /**
   * Calculates object start, end, and center extents along the wall from the given anchor & offset
   */
  public static calculateExtents(
    wallLength: number,
    offsetInches: number,
    widthInches: number,
    anchor: WallPositionAnchor
  ): PlacementExtents {
    let startDist = 0;
    let endDist = 0;
    let centerDist = 0;

    switch (anchor) {
      case 'start':
        startDist = offsetInches;
        endDist = offsetInches + widthInches;
        centerDist = offsetInches + widthInches / 2;
        break;
      case 'center':
        centerDist = offsetInches;
        startDist = offsetInches - widthInches / 2;
        endDist = offsetInches + widthInches / 2;
        break;
      case 'end':
        endDist = wallLength - offsetInches;
        startDist = wallLength - offsetInches - widthInches;
        centerDist = wallLength - offsetInches - widthInches / 2;
        break;
    }

    return { startDist, endDist, centerDist };
  }

  /**
   * Validates if the tool fits on the wall given its extents
   */
  public static validateFit(
    wallLength: number,
    widthInches: number,
    extents: PlacementExtents,
    offsetInches: number
  ): { isValid: boolean; errorMessage?: string } {
    if (widthInches <= 0) {
      return { isValid: false, errorMessage: 'Object width must be greater than 0.' };
    }
    if (offsetInches < 0) {
      return { isValid: false, errorMessage: 'Distance cannot be negative.' };
    }
    if (widthInches > wallLength + 0.001) {
      return {
        isValid: false,
        errorMessage: `Tool width (${formatFeetInches(widthInches)}) exceeds wall length (${formatFeetInches(wallLength)}).`,
      };
    }
    if (extents.startDist < -0.001 || extents.endDist > wallLength + 0.001) {
      return {
        isValid: false,
        errorMessage: 'Tool does not fit on the selected wall at this position.',
      };
    }
    return { isValid: true };
  }

  /**
   * Checks for physical overlap with other wall-attached entities on the same wall
   */
  public static checkOverlap(
    wall: WallEntity,
    extents: PlacementExtents,
    entityId: string | undefined,
    allEntities: CADEntity[]
  ): { hasOverlap: boolean; warningMessage?: string; conflictingEntity?: CADEntity } {
    const metrics = this.getWallMetrics(wall);

    for (const ent of allEntities) {
      if (ent.id === entityId) continue;
      if (!this.isWallAttachedEntity(ent)) continue;

      const attachedWallId = (ent as any).properties?.attachedWallId;
      if (attachedWallId !== wall.id) continue;

      // Project entity onto wall line to find its occupied interval [obsStart, obsEnd]
      const geom = (ent as any).geometry;
      const obsWidth = geom.width || 24;

      // Check if entity has saved wallPlacement
      let obsStart = 0;
      let obsEnd = 0;
      const wp = (ent as any).properties?.wallPlacement as WallPlacementData | undefined;

      if (wp && wp.wallId === wall.id) {
        const obsExt = this.calculateExtents(metrics.length, wp.offsetInches, wp.widthInches, wp.anchor);
        obsStart = obsExt.startDist;
        obsEnd = obsExt.endDist;
      } else {
        // Derive from geometry
        const t = (geom.x - metrics.start.x) * metrics.direction.x + (geom.y - metrics.start.y) * metrics.direction.y;
        obsStart = t - obsWidth / 2;
        obsEnd = t + obsWidth / 2;
      }

      // Overlap condition: intervals overlap by more than 0.25 inches
      const tolerance = 0.25;
      if (extents.startDist < obsEnd - tolerance && extents.endDist > obsStart + tolerance) {
        const typeLabel = ent.type.replace('_', ' ').toUpperCase();
        return {
          hasOverlap: true,
          warningMessage: `Selected position overlaps an existing ${typeLabel}.`,
          conflictingEntity: ent,
        };
      }
    }

    return { hasOverlap: false };
  }

  /**
   * Comprehensive wall placement calculation
   */
  public static calculatePlacement(params: {
    wall: WallEntity;
    anchor: WallPositionAnchor;
    offsetInches: number;
    widthInches: number;
    heightInches?: number;
    depthInches?: number;
    entityType: string;
    entityId?: string;
    roomPolygon?: Point2D[];
    allEntities?: CADEntity[];
  }): WallPlacementCalculationResult {
    const {
      wall,
      anchor,
      offsetInches,
      widthInches,
      heightInches,
      depthInches,
      entityType,
      entityId,
      roomPolygon = [],
      allEntities = [],
    } = params;

    const metrics = this.getWallMetrics(wall);
    const extents = this.calculateExtents(metrics.length, offsetInches, widthInches, anchor);
    const fitCheck = this.validateFit(metrics.length, widthInches, extents, offsetInches);

    let overlapCheck: { hasOverlap: boolean; warningMessage?: string; conflictingEntity?: CADEntity } = {
      hasOverlap: false,
    };
    if (fitCheck.isValid && allEntities.length > 0) {
      overlapCheck = this.checkOverlap(wall, extents, entityId, allEntities);
    }

    // Coordinates along wall direction
    const startPoint: Point2D = {
      x: metrics.start.x + metrics.direction.x * extents.startDist,
      y: metrics.start.y + metrics.direction.y * extents.startDist,
    };
    const endPoint: Point2D = {
      x: metrics.start.x + metrics.direction.x * extents.endDist,
      y: metrics.start.y + metrics.direction.y * extents.endDist,
    };
    const centerlineCenter: Point2D = {
      x: metrics.start.x + metrics.direction.x * extents.centerDist,
      y: metrics.start.y + metrics.direction.y * extents.centerDist,
    };

    // Calculate room inward normal
    const normals = calculateWallInwardNormal(metrics.start, metrics.end, roomPolygon);
    const inwardNormal = normals.inwardNormal;

    let centerPoint = { ...centerlineCenter };

    const wallThickness = wall.properties?.thickness ?? 9;

    // Column: center is shifted inward into room by depth / 2
    if (entityType === 'column') {
      const depth = depthInches || 24;
      centerPoint.x += inwardNormal.x * (depth / 2);
      centerPoint.y += inwardNormal.y * (depth / 2);
    } else if (entityType === 'rack') {
      // Wall Rack: anchor (x, y) is on the interior wall face (center along width)
      centerPoint.x += inwardNormal.x * (wallThickness / 2);
      centerPoint.y += inwardNormal.y * (wallThickness / 2);
    }

    const wallPlacement: WallPlacementData = {
      wallId: wall.id,
      anchor,
      offsetInches,
      widthInches,
      heightInches,
      depthInches,
      rotation: metrics.angleDeg,
    };

    return {
      isValid: fitCheck.isValid && !overlapCheck.hasOverlap,
      errorMessage: fitCheck.errorMessage,
      warningMessage: overlapCheck.warningMessage,
      extents,
      centerPoint,
      startPoint,
      endPoint,
      rotation: metrics.angleDeg,
      inwardNormal,
      metrics,
      wallPlacement,
    };
  }

  /**
   * Derives wall placement parameters from current world coordinates (e.g. after manual drag)
   */
  public static derivePlacementFromGeometry(
    entity: CADEntity,
    wall: WallEntity,
    activeAnchor: WallPositionAnchor = 'start'
  ): WallPlacementData {
    const metrics = this.getWallMetrics(wall);
    const geom = (entity as any).geometry;
    const widthInches = geom.width || 36;
    const heightInches = geom.height;
    const depthInches = geom.depth || (entity.type === 'column' ? geom.height : undefined);

    // Project center onto wall line
    const t = (geom.x - metrics.start.x) * metrics.direction.x + (geom.y - metrics.start.y) * metrics.direction.y;
    const clampedT = Math.max(widthInches / 2, Math.min(t, metrics.length - widthInches / 2));

    let offsetInches = 0;
    switch (activeAnchor) {
      case 'start':
        offsetInches = Math.max(0, clampedT - widthInches / 2);
        break;
      case 'center':
        offsetInches = clampedT;
        break;
      case 'end':
        offsetInches = Math.max(0, metrics.length - (clampedT + widthInches / 2));
        break;
    }

    return {
      wallId: wall.id,
      anchor: activeAnchor,
      offsetInches: Math.round(offsetInches * 8) / 8, // round to 1/8"
      widthInches,
      heightInches,
      depthInches,
      rotation: metrics.angleDeg,
    };
  }

  /**
   * Applies calculated placement to an existing or new entity
   */
  public static applyPlacementToEntity<T extends CADEntity>(
    entity: T,
    calcResult: WallPlacementCalculationResult
  ): T {
    const updated = { ...entity } as any;
    const geom = { ...updated.geometry };
    const props = { ...(updated.properties || {}) };

    geom.x = calcResult.centerPoint.x;
    geom.y = calcResult.centerPoint.y;
    geom.rotation = calcResult.rotation;
    geom.width = calcResult.wallPlacement.widthInches;

    if (calcResult.wallPlacement.heightInches !== undefined) {
      geom.height = calcResult.wallPlacement.heightInches;
    }
    if (calcResult.wallPlacement.depthInches !== undefined) {
      geom.depth = calcResult.wallPlacement.depthInches;
      if (entity.type === 'column') {
        geom.height = calcResult.wallPlacement.depthInches; // For column, height is depth projection
        props.inwardProjection = calcResult.wallPlacement.depthInches;
      }
    }

    props.attachedWallId = calcResult.wallPlacement.wallId;
    props.wallPlacement = calcResult.wallPlacement;
    props.inwardNormal = calcResult.inwardNormal;
    props.wallThickness = calcResult.metrics.wall.properties?.thickness ?? 9;

    if (entity.type === 'column') {
      props.columnType = 'wall';
    } else if (entity.type === 'rack' && (props.rackType === 'CUSTOM' || props.isCustom)) {
      const h = geom.height || 84;
      const w = geom.width || 36;
      const d = geom.depth || 24;
      props.canonicalWidth = w;
      props.canonicalDepth = d;
      props.canonicalHeight = h;
      props.width = w;
      props.depth = d;
      props.height = h;
      updated.width = w;
      updated.depth = d;
      updated.height = h;
      const lbl = formatCustomRackLabel(h, w, d);
      props.label = `C-RACK ${lbl}`;
      props.productName = `Custom Rack ${lbl}`;
      updated.label = `C-RACK ${lbl}`;
    }

    updated.geometry = geom;
    updated.properties = props;
    return updated as T;
  }

  /**
   * When a wall moves, resizes, or rotates, updates all attached entities to preserve
   * their relative offset and alignment.
   */
  public static updateAttachedEntitiesForWall(
    wall: WallEntity,
    allEntities: CADEntity[],
    roomPolygon: Point2D[] = []
  ): CADEntity[] {
    return allEntities.map((ent) => {
      if (!this.isWallAttachedEntity(ent)) return ent;
      const attachedWallId = (ent as any).properties?.attachedWallId;
      if (attachedWallId !== wall.id) return ent;

      let wp = (ent as any).properties?.wallPlacement as WallPlacementData | undefined;
      if (!wp || wp.wallId !== wall.id) {
        wp = this.derivePlacementFromGeometry(ent, wall, 'start');
      }

      // Re-calculate placement on the updated wall
      const calcResult = this.calculatePlacement({
        wall,
        anchor: wp.anchor,
        offsetInches: wp.offsetInches,
        widthInches: wp.widthInches,
        heightInches: wp.heightInches,
        depthInches: wp.depthInches,
        entityType: ent.type,
        entityId: ent.id,
        roomPolygon,
        allEntities,
      });

      return this.applyPlacementToEntity(ent, calcResult);
    });
  }
}
