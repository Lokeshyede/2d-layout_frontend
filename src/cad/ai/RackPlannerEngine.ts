/**
 * RackPlannerEngine.ts  v3
 *
 * RETAILFIX CAD -- Professional AI Rack Layout Engine
 *
 * Core rules:
 *  - Zero gap between adjacent racks in the same run: cursor += rackWidth (no padding)
 *  - 7×3 priority: maximize 7×3 racks first, then 7×4 in remaining space
 *  - Corner racks deduct from usable wall length before wall racks are placed
 *  - Wall racks offset inward from wall face by WALL_DEPTH/2
 *  - Remaining wall space shown as DimensionItem (type='remaining_space')
 *  - Aisle dimensions shown between gondola rows (type='aisle')
 *  - Existing manual racks/objects are protected (locked as static blockers)
 *  - AI-placed racks tracked separately in placedAABBs
 *
 * Height x Width notation:
 *   Wall Rack 7x3  = Height 7ft,  Width 3ft (36" along wall, 24" deep)
 *   Wall Rack 7x4  = Height 7ft,  Width 4ft (48" along wall, 24" deep)
 *   Center Rack 5x3 = Height 5ft, Width 3ft (36" footprint, 24" deep)
 *   Endcap 5x3     = Height 5ft,  Width 3ft (36", 24" deep)
 *   Corner Rack 2x2x2 = 24" x 24" L-shape
 */

import type {
  CADEntity,
  WallEntity,
  ColumnEntity,
  DoorEntity,
  WindowEntity,
  RackEntity,
  ShutterEntity,
  GateEntity,
  GlassGateEntity,
  PartitionEntity,
  DimensionItem,
  Point2D,
} from '../types';
import { ProductModelRegistry } from '../services/ProductModelRegistry';
import { formatFeetInches } from '../geometry/FeetInches';
import {
  buildRoomPolygon,
  calculateWallInwardNormal,
  isPointInPolygon,
  isPolygonInsidePolygon,
  doPolygonsOverlap,
  isCorner90Degrees,
  segmentsIntersectStrict,
  getPolygonScanIntervals,
} from '../geometry/GeometryMath';
import { RackConnectionEngine } from '../engine/RackConnectionEngine';

// ─── Public types ──────────────────────────────────────────────────────────────

export type PlanningStrategy =
  | 'balanced'
  | 'max_wall'
  | 'max_floor'
  | 'spacious';

export interface RackPlannerOptions {
  roomShapeMode?: 'AUTO' | 'MANUAL';
  includeWallRacks: boolean;
  includeCenterRacks: boolean;
  includeEndcaps: boolean;
  includeCornerRacks: boolean;
  /** Minimum aisle between center racks and wall racks (inches) – default 48 (4') */
  minAisleInches: number;
  /** Clearance around doors/windows/columns (not used between racks) – default 12 */
  wallClearanceInches: number;
  strategy: PlanningStrategy;
}

export const DEFAULT_PLANNER_OPTIONS: RackPlannerOptions = {
  includeWallRacks: true,
  includeCenterRacks: true,
  includeEndcaps: true,
  includeCornerRacks: true,
  minAisleInches: 48,
  wallClearanceInches: 12,
  strategy: 'balanced',
};

export interface WallRunInfo {
  side: 'top' | 'bottom' | 'left' | 'right';
  wallRack7x3Count: number;
  wallRack7x4Count: number;
  cornerRackCount: number;
  remainingInches: number;
}

export interface AisleInfo {
  widthInches: number;
  label: string;
}

export interface RackPlannerStats {
  wallRack7x3Count: number;
  wallRack7x4Count: number;
  centerRackCount: number;
  endcapCount: number;
  cornerRackCount: number;
  totalRacks: number;
  wallUtilizationPct: number;
  floorUtilizationPct: number;
  minAisleInches: number;
  wallRuns: WallRunInfo[];
  aisles: AisleInfo[];
}

export interface RackPlannerResult {
  racks: RackEntity[];
  /** Remaining-space + aisle dimension items shown during preview – violet style */
  aiDimensions: DimensionItem[];
  stats: RackPlannerStats;
  message?: string;
}

// ─── Internal geometry ─────────────────────────────────────────────────────────

/** Axis-aligned bounding box in world/inch coords */
interface AABB { minX: number; minY: number; maxX: number; maxY: number; }


interface WallSegmentManual {
  wallId: string;
  x1: number; y1: number; x2: number; y2: number;
  length: number;
  direction: Point2D;
  normal: Point2D;
  angleDeg: number;
  wallThickness: number;
}

interface WallSegment {
  wallId: string;
  side: 'top' | 'bottom' | 'left' | 'right';
  x1: number; y1: number; x2: number; y2: number;
  length: number;
  isHorizontal: boolean;
}

/** 1-D usable interval along a wall (in inches from wall start) */
interface WallInterval { start: number; end: number; }

// ─── Rack constants ─────────────────────────────────────────────────────────────

const W3  = 36;   // wall rack 7x3 width along wall
const W4  = 48;   // wall rack 7x4 width along wall
const WALL_DEPTH = 24;   // all wall racks depth into room
const CENTER_W   = 36;   // center rack 5x3 width (along gondola)
const CENTER_D   = 24;   // center rack depth (perpendicular to gondola)
const ENDCAP_W   = 36;
const ENDCAP_D   = 24;
const CORNER_SIDE = 24;  // each wing of corner L

// Minimum remaining space to bother labeling (inches)
const MIN_REMAINING_LABEL = 6;
// Minimum aisle to bother labeling
const MIN_AISLE_LABEL = 12;

function makeId(): string {
  return `ai_r_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

// ─── Engine class ───────────────────────────────────────────────────────────────

export class RackPlannerEngine {
  private entities: CADEntity[];
  private opts: RackPlannerOptions;

  // Parsed
  private walls: WallEntity[] = [];
  private segments: WallSegment[] = [];
  private manualSegments: WallSegmentManual[] = [];
  private manualRoomPolygon: Point2D[] = [];

  private roomBounds: AABB = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  private roomCX = 0; private roomCY = 0;
  /** Static obstacle AABBs from manual objects (with clearance) — never modified after parseGeometry */
  private blockers: AABB[] = [];
  /** AI-placed rack AABBs — grows as we place racks */
  private placedAABBs: AABB[] = [];

  constructor(entities: CADEntity[], opts: RackPlannerOptions) {
    this.entities = entities;
    this.opts = opts;
  }

  // ───────────────────────────────────────────────────────────────────────
  // Public entry point
  // ───────────────────────────────────────────────────────────────────────

  public plan(): RackPlannerResult {
    return this.run();
  }

  public run(): RackPlannerResult {
    const activeProducts = ProductModelRegistry.getActive();
    if (activeProducts.length === 0) {
      return this.empty('No active rack products available. Please ask Admin to upload and activate a rack model first.');
    }

    if (this.opts.roomShapeMode === 'MANUAL') {
      return this.runManual();
    }
    this.parseGeometry();

    if (this.walls.length < 2) {
      return this.empty('No valid room geometry. Draw at least two walls first.');
    }

    const racks: RackEntity[] = [];
    const aiDimensions: DimensionItem[] = [];
    const wallRuns: WallRunInfo[] = [];
    const aisles: AisleInfo[] = [];

    // 1 -- Corner racks (claim corners before wall runs)
    const cornerByWallSide = new Map<string, number>(); // side -> corner deduction (inches)
    if (this.opts.includeCornerRacks) {
      const { racks: cr, cornerDedMap } = this.planCornerRacks();
      racks.push(...cr);
      for (const r of cr) this.placedAABBs.push(this.rackAABB(r));
      cornerDedMap.forEach((v, k) => cornerByWallSide.set(k, v));
    }

    // 2 -- Wall rack runs
    if (this.opts.includeWallRacks) {
      const { racks: wr, dims, runs } = this.planWallRuns(cornerByWallSide);
      racks.push(...wr);
      aiDimensions.push(...dims);
      wallRuns.push(...runs);
      for (const r of wr) this.placedAABBs.push(this.rackAABB(r));
    }

    // 3 -- Center racks + endcaps
    if (this.opts.includeCenterRacks || this.opts.includeEndcaps) {
      const { centerRacks, endcaps, aisleItems, aisleInfos } = this.planCenterRacks();
      if (this.opts.includeCenterRacks) {
        racks.push(...centerRacks);
        for (const r of centerRacks) this.placedAABBs.push(this.rackAABB(r));
      }
      if (this.opts.includeEndcaps) {
        racks.push(...endcaps);
        for (const r of endcaps) this.placedAABBs.push(this.rackAABB(r));
      }
      aiDimensions.push(...aisleItems);
      aisles.push(...aisleInfos);
    }

    if (racks.length === 0) {
      return this.empty('No valid rack layout could be generated for the current dimensions and clearance settings.');
    }

    // AI POST-PROCESSING: Snap using the unified connection engine to guarantee exact contact without overlaps
    for (let i = 0; i < racks.length; i++) {
      const rack = racks[i];
      const otherRacks = racks.filter(r => r.id !== rack.id);
      const snap = RackConnectionEngine.findBestSnap(rack, otherRacks, { x: rack.geometry.x, y: rack.geometry.y }, rack.geometry.rotation || 0);
      if (snap && snap.validation.isValid) {
        rack.geometry.x = snap.position.x;
        rack.geometry.y = snap.position.y;
        rack.geometry.rotation = snap.rotation;
      }
    }

    return { racks, aiDimensions, stats: this.buildStats(racks, wallRuns, aisles) };
  }

  // ───────────────────────────────────────────────────────────────────────
  // Geometry Parsing
  // ───────────────────────────────────────────────────────────────────────

  
  // ───────────────────────────────────────────────────────────────────────
  // MANUAL MODE LOGIC
  // ───────────────────────────────────────────────────────────────────────

  private runManual(): RackPlannerResult {
    this.parseGeometryManual();

    if (this.walls.length < 2) {
      return this.empty('No valid room geometry. Draw at least two walls first.');
    }

    const racks: RackEntity[] = [];
    const aiDimensions: DimensionItem[] = [];
    const wallRuns: WallRunInfo[] = [];
    const aisles: AisleInfo[] = [];

    // 1. Corner Racks
    const cornerDedMap = new Map<string, number>();
    if (this.opts.includeCornerRacks) {
      const { racks: cr, cornerDedMap: cMap } = this.planCornerRacksManual();
      racks.push(...cr);
      for (const r of cr) this.placedAABBs.push(this.rackAABB(r));
      cMap.forEach((v, k) => cornerDedMap.set(k, v));
    }

    // 2. Wall Runs
    if (this.opts.includeWallRacks) {
      const { racks: wr, dims, runs } = this.planWallRunsManual(cornerDedMap);
      racks.push(...wr);
      aiDimensions.push(...dims);
      wallRuns.push(...runs);
      for (const r of wr) this.placedAABBs.push(this.rackAABB(r));
    }

    // 3. Center Racks
    if (this.opts.includeCenterRacks || this.opts.includeEndcaps) {
      const { centerRacks, endcaps, aisleItems, aisleInfos } = this.planCenterRacksManual();
      if (this.opts.includeCenterRacks) {
        racks.push(...centerRacks);
        for (const r of centerRacks) this.placedAABBs.push(this.rackAABB(r));
      }
      if (this.opts.includeEndcaps) {
        racks.push(...endcaps);
        for (const r of endcaps) this.placedAABBs.push(this.rackAABB(r));
      }
      aiDimensions.push(...aisleItems);
      aisles.push(...aisleInfos);
    }

    if (racks.length === 0) {
      return this.empty('No valid rack layout could be generated for the current manual room geometry.');
    }

    // AI POST-PROCESSING: Snap using the unified connection engine
    for (let i = 0; i < racks.length; i++) {
      const rack = racks[i];
      const otherRacks = racks.filter(r => r.id !== rack.id);
      const snap = RackConnectionEngine.findBestSnap(rack, otherRacks, { x: rack.geometry.x, y: rack.geometry.y }, rack.geometry.rotation || 0);
      if (snap && snap.validation.isValid) {
        rack.geometry.x = snap.position.x;
        rack.geometry.y = snap.position.y;
        rack.geometry.rotation = snap.rotation;
      }
    }

    return { racks, aiDimensions, stats: this.buildStats(racks, wallRuns, aisles) };
  }

  private parseGeometryManual() {
    this.walls = this.entities.filter((e): e is WallEntity => e.type === 'wall');
    if (this.walls.length === 0) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const w of this.walls) {
      minX = Math.min(minX, w.geometry.x1, w.geometry.x2);
      minY = Math.min(minY, w.geometry.y1, w.geometry.y2);
      maxX = Math.max(maxX, w.geometry.x1, w.geometry.x2);
      maxY = Math.max(maxY, w.geometry.y1, w.geometry.y2);
    }
    this.roomBounds = { minX, minY, maxX, maxY };
    this.roomCX = (minX + maxX) / 2;
    this.roomCY = (minY + maxY) / 2;

    this.manualSegments = [];
    this.manualRoomPolygon = [];

    // Parse obstacles like manual mode
    this.blockers = [];
    const cl = this.opts.wallClearanceInches;

    for (const e of this.entities) {
      switch (e.type) {
        case 'door': {
          const d = e as DoorEntity;
          this.blockers.push(this.expand(this.centeredAABB(d.geometry.x, d.geometry.y, d.geometry.width, d.geometry.width), cl));
          break;
        }
        case 'window': {
          const wn = e as WindowEntity;
          this.blockers.push(this.expand(this.centeredAABB(wn.geometry.x, wn.geometry.y, wn.geometry.width, wn.geometry.width), cl));
          break;
        }
        case 'shutter': {
          const s = e as ShutterEntity;
          this.blockers.push(this.expand(this.centeredAABB(s.geometry.x, s.geometry.y, s.geometry.width, s.geometry.width), cl));
          break;
        }
        case 'gate': {
          const g = e as GateEntity;
          this.blockers.push(this.expand(this.centeredAABB(g.geometry.x, g.geometry.y, g.geometry.width, g.geometry.width), cl));
          break;
        }
        case 'glass_gate': {
          const g = e as GlassGateEntity;
          this.blockers.push(this.expand(this.centeredAABB(g.geometry.x, g.geometry.y, g.geometry.width, g.geometry.width), cl));
          break;
        }
        case 'column': {
          const c = e as ColumnEntity;
          this.blockers.push(this.expand(this.centeredAABB(c.geometry.x, c.geometry.y, c.geometry.width, c.geometry.height), cl));
          break;
        }
        case 'rack': {
          // Manual racks → static blockers (protected, AI must work around them)
          this.blockers.push(this.rackAABB(e as RackEntity));
          break;
        }
        case 'partition': {
          const p = e as PartitionEntity;
          this.blockers.push({
            minX: Math.min(p.geometry.x1, p.geometry.x2) - cl,
            minY: Math.min(p.geometry.y1, p.geometry.y2) - cl,
            maxX: Math.max(p.geometry.x1, p.geometry.x2) + cl,
            maxY: Math.max(p.geometry.y1, p.geometry.y2) + cl,
          });
          break;
        }
      }
    }

    // Build closed room polygon from actual manual walls
    this.manualRoomPolygon = buildRoomPolygon(this.walls);

    // Build wall segments with robust geometry-first inward normals
    for (const w of this.walls) {
      const p1 = { x: w.geometry.x1, y: w.geometry.y1 };
      const p2 = { x: w.geometry.x2, y: w.geometry.y2 };
      const length = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      if (length < 1) continue;

      const normals = calculateWallInwardNormal(p1, p2, this.manualRoomPolygon);
      const angleDeg = (Math.atan2(normals.wallDirection.y, normals.wallDirection.x) * 180) / Math.PI;

      this.manualSegments.push({
        wallId: w.id,
        x1: p1.x,
        y1: p1.y,
        x2: p2.x,
        y2: p2.y,
        length,
        direction: normals.wallDirection,
        normal: normals.inwardNormal, // ALWAYS points into the room polygon!
        angleDeg,
        wallThickness: w.properties?.thickness || 9,
      });
    }

    // Fill original segments for stats to not crash
    this.segments = this.manualSegments.map((s) => ({
      wallId: s.wallId,
      side: 'top',
      x1: s.x1,
      y1: s.y1,
      x2: s.x2,
      y2: s.y2,
      length: s.length,
      isHorizontal: true,
    }));
  }

  private planCornerRacksManual(): { racks: RackEntity[]; cornerDedMap: Map<string, number> } {
    const racks: RackEntity[] = [];
    const cornerDedMap = new Map<string, number>();

    for (let i = 0; i < this.manualSegments.length; i++) {
      for (let j = i + 1; j < this.manualSegments.length; j++) {
        const w1 = this.manualSegments[i];
        const w2 = this.manualSegments[j];

        // Check if connected within CAD tolerance
        const p1 = [
          { pt: { x: w1.x1, y: w1.y1 }, isStart: true },
          { pt: { x: w1.x2, y: w1.y2 }, isStart: false },
        ];
        const p2 = [
          { pt: { x: w2.x1, y: w2.y1 }, isStart: true },
          { pt: { x: w2.x2, y: w2.y2 }, isStart: false },
        ];

        let connected = false;
        let intersectPt: Point2D | null = null;
        let w1Start = false,
          w2Start = false;

        for (const pt1 of p1) {
          for (const pt2 of p2) {
            if (Math.hypot(pt1.pt.x - pt2.pt.x, pt1.pt.y - pt2.pt.y) < 3.0) {
              connected = true;
              intersectPt = { x: (pt1.pt.x + pt2.pt.x) / 2, y: (pt1.pt.y + pt2.pt.y) / 2 };
              w1Start = pt1.isStart;
              w2Start = pt2.isStart;
              break;
            }
          }
          if (connected) break;
        }

        if (connected && intersectPt) {
          // Unit vectors along both walls pointing AWAY from the intersection vertex
          const v1 = w1Start ? w1.direction : { x: -w1.direction.x, y: -w1.direction.y };
          const v2 = w2Start ? w2.direction : { x: -w2.direction.x, y: -w2.direction.y };

          // STRICT 90-DEGREE RULE: Corner Rack CRN 2x2 is allowed ONLY at a true 90° corner (tol = 0.5°)
          if (!isCorner90Degrees(v1, v2, 0.5)) {
            // Non-90° corner: do NOT deduct corner setback from usable wall runs!
            continue;
          }

          // Test if corner opens into the room interior
          const testPt = {
            x: intersectPt.x + (v1.x + v2.x) * (CORNER_SIDE / 2),
            y: intersectPt.y + (v1.y + v2.y) * (CORNER_SIDE / 2),
          };
          if (!isPointInPolygon(testPt, this.manualRoomPolygon, false)) {
            continue;
          }

          // Generate corner rack footprint polygon
          const s = CORNER_SIDE;
          const cornerPoly: Point2D[] = [
            intersectPt,
            { x: intersectPt.x + v1.x * s, y: intersectPt.y + v1.y * s },
            { x: intersectPt.x + (v1.x + v2.x) * s, y: intersectPt.y + (v1.y + v2.y) * s },
            { x: intersectPt.x + v2.x * s, y: intersectPt.y + v2.y * s },
          ];

          if (!isPolygonInsidePolygon(cornerPoly, this.manualRoomPolygon)) {
            continue;
          }

          let blockerCollision = false;
          for (const b of this.blockers) {
            const bPoly = [
              { x: b.minX, y: b.minY },
              { x: b.maxX, y: b.minY },
              { x: b.maxX, y: b.maxY },
              { x: b.minX, y: b.maxY },
            ];
            if (doPolygonsOverlap(cornerPoly, bPoly, 0.5)) {
              blockerCollision = true;
              break;
            }
          }
          if (blockerCollision) continue;

          const rot = (Math.atan2(v1.y, v1.x) * 180) / Math.PI;
          const model = ProductModelRegistry.resolve(undefined, 'corner_rack_2x2x2');
          if (!model || !model.active) {
            // Skip placing corner racks if no active corner model exists in DB
            continue;
          }
          const rack: RackEntity = {
            id: makeId(),
            type: 'rack',
            geometry: {
              x: intersectPt.x,
              y: intersectPt.y,
              width: model.width || CORNER_SIDE,
              depth: model.depth || CORNER_SIDE,
              height: model.height || 84,
              rotation: rot,
            },
            properties: {
              rackType: model.productType || 'Corner Rack',
              productModelId: model.productId,
              productName: model.productName,
              sku: model.sku,
              shelves: model.shelfCount || 2,
              shelfCount: model.shelfCount || 2,
              isAIGenerated: true,
            },
          };

          racks.push(rack);
          cornerDedMap.set(`${w1.wallId}_${w1Start ? 'start' : 'end'}`, CORNER_SIDE);
          cornerDedMap.set(`${w2.wallId}_${w2Start ? 'start' : 'end'}`, CORNER_SIDE);
        }
      }
    }

    return { racks, cornerDedMap };
  }

  private projectToWallManual(b: AABB, seg: WallSegmentManual, cl: number): WallInterval | null {
    const depth = WALL_DEPTH + cl + 6;
    const wallCenter = { x: (seg.x1 + seg.x2) / 2, y: (seg.y1 + seg.y2) / 2 };

    const bCenter = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
    const bRadiusX = (b.maxX - b.minX) / 2;
    const bRadiusY = (b.maxY - b.minY) / 2;
    const bRadius = Math.max(bRadiusX, bRadiusY);

    const vecToBlock = { x: bCenter.x - wallCenter.x, y: bCenter.y - wallCenter.y };
    const distNormal = Math.abs(vecToBlock.x * seg.normal.x + vecToBlock.y * seg.normal.y);

    if (distNormal > depth + bRadius) return null;

    const p1 = { x: b.minX - seg.x1, y: b.minY - seg.y1 };
    const p2 = { x: b.maxX - seg.x1, y: b.minY - seg.y1 };
    const p3 = { x: b.maxX - seg.x1, y: b.maxY - seg.y1 };
    const p4 = { x: b.minX - seg.x1, y: b.maxY - seg.y1 };

    const projs = [p1, p2, p3, p4].map((p) => p.x * seg.direction.x + p.y * seg.direction.y);
    const minP = Math.min(...projs);
    const maxP = Math.max(...projs);

    const s = Math.max(minP, 0);
    const e = Math.min(maxP, seg.length);

    if (e <= s) return null;
    return { start: s - cl, end: e + cl };
  }

  private usableIntervalsManual(
    seg: WallSegmentManual,
    cornerDedMap: Map<string, number>
  ): WallInterval[] {
    const cl = this.opts.wallClearanceInches;
    let intervals: WallInterval[] = [{ start: 0, end: seg.length }];

    if (cornerDedMap.has(`${seg.wallId}_start`))
      intervals = this.subtractInterval(intervals, 0, CORNER_SIDE);
    if (cornerDedMap.has(`${seg.wallId}_end`))
      intervals = this.subtractInterval(intervals, seg.length - CORNER_SIDE, seg.length);

    for (const b of this.blockers) {
      const iv = this.projectToWallManual(b, seg, cl);
      if (iv) intervals = this.subtractInterval(intervals, iv.start, iv.end);
    }
    return intervals.filter((iv) => iv.end - iv.start >= W3);
  }

  /**
   * Generates the 4-vertex world footprint polygon for a Wall Rack.
   * Anchor is on the wall face (at depth = 0).
   * Depth extends along inwardNormal into the room.
   */
  private getWallRackFootprint(rack: RackEntity, seg?: WallSegmentManual): Point2D[] {
    const rw = rack.geometry.width || 36;
    const rd = rack.geometry.depth || WALL_DEPTH;
    const anchor = { x: rack.geometry.x, y: rack.geometry.y };

    let dir: Point2D;
    let inward: Point2D;

    if (seg) {
      dir = seg.direction;
      inward = seg.normal;
    } else {
      const rotRad = ((rack.geometry.rotation || 0) * Math.PI) / 180;
      dir = { x: Math.cos(rotRad), y: Math.sin(rotRad) };
      inward = rack.properties.inwardNormal || { x: -dir.y, y: dir.x };
    }

    const tl = { x: anchor.x - dir.x * (rw / 2), y: anchor.y - dir.y * (rw / 2) };
    const tr = { x: anchor.x + dir.x * (rw / 2), y: anchor.y + dir.y * (rw / 2) };
    const br = { x: tr.x + inward.x * rd, y: tr.y + inward.y * rd };
    const bl = { x: tl.x + inward.x * rd, y: tl.y + inward.y * rd };

    return [tl, tr, br, bl];
  }

  /**
   * Strict geometric validation for every Wall Rack before accepting it:
   * 1. Footprint polygon must be inside manual room polygon.
   * 2. Rack must not cross any room wall.
   * 3. Rack must not overlap protected objects (blockers).
   * 4. Rack must not overlap another rack.
   */
  private validateWallRackManual(
    rack: RackEntity,
    seg: WallSegmentManual,
    placedFootprints: Point2D[][]
  ): boolean {
    const fp = this.getWallRackFootprint(rack, seg);

    // 1. Complete rack footprint polygon must be inside manual room polygon
    if (!isPolygonInsidePolygon(fp, this.manualRoomPolygon)) {
      return false;
    }

    // 2. Interior 3 edges (TR-BR, BR-BL, BL-TL) must not intersect any room wall
    const interiorEdges = [
      { p1: fp[1], p2: fp[2] },
      { p1: fp[2], p2: fp[3] },
      { p1: fp[3], p2: fp[0] },
    ];
    for (const ie of interiorEdges) {
      for (const w of this.walls) {
        const wp1 = { x: w.geometry.x1, y: w.geometry.y1 };
        const wp2 = { x: w.geometry.x2, y: w.geometry.y2 };
        if (segmentsIntersectStrict(ie.p1, ie.p2, wp1, wp2)) {
          return false;
        }
      }
    }

    // 3. Confirm rack does not overlap protected objects (blockers)
    for (const b of this.blockers) {
      const bPoly = [
        { x: b.minX, y: b.minY },
        { x: b.maxX, y: b.minY },
        { x: b.maxX, y: b.maxY },
        { x: b.minX, y: b.maxY },
      ];
      if (doPolygonsOverlap(fp, bPoly, 0.5)) {
        return false;
      }
    }

    // 4. Confirm rack does not overlap another rack
    for (const otherFp of placedFootprints) {
      if (doPolygonsOverlap(fp, otherFp, -0.1)) {
        return false;
      }
    }

    return true;
  }

  private planWallRunsManual(cornerDedMap: Map<string, number>): {
    racks: RackEntity[];
    dims: DimensionItem[];
    runs: WallRunInfo[];
  } {
    const racks: RackEntity[] = [];
    const dims: DimensionItem[] = [];
    const runs: WallRunInfo[] = [];
    const placedFootprints: Point2D[][] = [];

    for (const seg of this.manualSegments) {
      const intervals = this.usableIntervalsManual(seg, cornerDedMap);
      const runInfo: WallRunInfo = {
        side: 'top',
        wallRack7x3Count: 0,
        wallRack7x4Count: 0,
        cornerRackCount: 0,
        remainingInches: 0,
      };

      for (const interval of intervals) {
        const available = interval.end - interval.start;
        if (available < W3) {
          if (available >= MIN_REMAINING_LABEL) {
            runInfo.remainingInches += available;
            const dim = this.makeRemainingDimManual(seg, interval.start, interval.end);
            if (dim) dims.push(dim);
          }
          continue;
        }

        // Priority Rule: Fill available space with 7×3 Racks
        const num3 = Math.floor(available / W3);

        const combo: ('wall_rack_7x3' | 'wall_rack_7x4')[] = [];
        for (let i = 0; i < num3; i++) combo.push('wall_rack_7x3');

        let cursor = interval.start;
        for (const rackType of combo) {
          const rw = rackType === 'wall_rack_7x4' ? W4 : W3;
          let placed = false;

          while (cursor + rw <= interval.end) {
            const rack = this.buildWallRackManual(seg, cursor, rackType, rw);
            if (this.validateWallRackManual(rack, seg, placedFootprints)) {
              racks.push(rack);
              const fp = this.getWallRackFootprint(rack, seg);
              placedFootprints.push(fp);
              const box = this.rackAABB(rack);
              if (box) this.placedAABBs.push(box);
              cursor += rw; // ZERO GAP: adjacent racks touch
              if (rackType === 'wall_rack_7x3') runInfo.wallRack7x3Count++;
              else runInfo.wallRack7x4Count++;
              placed = true;
              break;
            } else {
              // If near a slanted corner boundary, step forward by 6 inches
              cursor += 6;
            }
          }

          if (!placed) {
            break;
          }
        }

        const remaining = interval.end - cursor;
        if (remaining >= MIN_REMAINING_LABEL) {
          runInfo.remainingInches += remaining;
          const dim = this.makeRemainingDimManual(seg, cursor, interval.end);
          if (dim) dims.push(dim);
        }
      }
      runs.push(runInfo);
    }
    return { racks, dims, runs };
  }

  private buildWallRackManual(
    seg: WallSegmentManual,
    offsetAlongWall: number,
    rackType: 'wall_rack_7x3' | 'wall_rack_7x4',
    rw: number
  ): RackEntity {
    const t = offsetAlongWall + rw / 2;
    const wallThick = seg.wallThickness || 9;
    // The rack geometry anchor (x,y) is EXACTLY on the interior wall face.
    // Center along wall, offset by wallThickness / 2 along inward normal
    const wallFaceX = seg.x1 + seg.direction.x * t + seg.normal.x * (wallThick / 2);
    const wallFaceY = seg.y1 + seg.direction.y * t + seg.normal.y * (wallThick / 2);
    const model = ProductModelRegistry.resolve(undefined, rackType);
    const activeProducts = ProductModelRegistry.getActive();
    const resolvedModel = model || activeProducts.find(p => p.productType?.toLowerCase().includes('wall') || p.category?.toLowerCase().includes('wall')) || activeProducts[0];
    return {
      id: makeId(),
      type: 'rack',
      geometry: {
        x: wallFaceX,
        y: wallFaceY,
        width: rw,
        depth: resolvedModel?.depth || WALL_DEPTH,
        height: resolvedModel?.height || 84,
        rotation: seg.angleDeg,
      },
      properties: {
        rackType: resolvedModel?.productType || 'Wall Rack',
        productModelId: resolvedModel?.productId,
        productName: resolvedModel?.productName,
        sku: resolvedModel?.sku,
        shelves: resolvedModel?.shelfCount || 4,
        shelfCount: resolvedModel?.shelfCount || 4,
        shelfSpacing: 'auto',
        shelfThickness: (resolvedModel as any)?.shelfThickness || 1.0,
        attachedWallId: seg.wallId,
        positionAlongWall: t,
        inwardNormal: seg.normal, // Stored inward normal vector pointing into room
        wallThickness: wallThick,
        isAIGenerated: true,
      },
    };
  }

  private makeRemainingDimManual(
    seg: WallSegmentManual,
    startOffset: number,
    endOffset: number
  ): DimensionItem | null {
    const length = endOffset - startOffset;
    if (length < MIN_REMAINING_LABEL) return null;
    const wallThick = seg.wallThickness || 9;
    const INWARD_OFFSET = (wallThick / 2) + WALL_DEPTH + 12;
    const midT = (startOffset + endOffset) / 2;
    const wallX = seg.x1 + seg.direction.x * midT;
    const wallY = seg.y1 + seg.direction.y * midT;
    const labelPoint = {
      x: wallX + seg.normal.x * INWARD_OFFSET,
      y: wallY + seg.normal.y * INWARD_OFFSET,
    };
    const sp1 = {
      x: seg.x1 + seg.direction.x * startOffset,
      y: seg.y1 + seg.direction.y * startOffset,
    };
    const sp2 = {
      x: seg.x1 + seg.direction.x * endOffset,
      y: seg.y1 + seg.direction.y * endOffset,
    };
    const formatted = formatFeetInches(length);
    const displayText = `${formatted}\nREMAINING`;
    const bw = Math.max(formatted.length * 6, 36);

    return {
      id: `ai_rem_${makeId()}`,
      startPoint: sp1,
      endPoint: sp2,
      value: length,
      formattedValue: displayText,
      orientation: 'aligned',
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

  private getCenterRackFootprint(rack: RackEntity): Point2D[] {
    const cx = rack.geometry.x;
    const cy = rack.geometry.y;
    const w = rack.geometry.width || 36;
    const d = rack.geometry.depth || 24;
    const rotRad = ((rack.geometry.rotation || 0) * Math.PI) / 180;
    const cos = Math.cos(rotRad);
    const sin = Math.sin(rotRad);

    const toW = (lx: number, ly: number) => ({
      x: cx + lx * cos - ly * sin,
      y: cy + lx * sin + ly * cos,
    });

    return [
      toW(-w / 2, -d / 2),
      toW(w / 2, -d / 2),
      toW(w / 2, d / 2),
      toW(-w / 2, d / 2),
    ];
  }

  private planCenterRacksManual(): {
    centerRacks: RackEntity[];
    endcaps: RackEntity[];
    aisleItems: DimensionItem[];
    aisleInfos: AisleInfo[];
  } {
    const centerRacks: RackEntity[] = [];
    const endcaps: RackEntity[] = [];
    const aisleItems: DimensionItem[] = [];
    const aisleInfos: AisleInfo[] = [];

    if (!this.manualRoomPolygon || this.manualRoomPolygon.length < 3) {
      return { centerRacks, endcaps, aisleItems, aisleInfos };
    }

    const activeProducts = ProductModelRegistry.getActive();
    const centerModel = ProductModelRegistry.resolve(undefined, 'center_rack_5x3') ||
      activeProducts.find(p => p.productType?.toLowerCase().includes('center') || p.category?.toLowerCase().includes('center'));
    const centerW = centerModel?.width || CENTER_W;
    const centerD = centerModel?.depth || CENTER_D;

    const aisle = this.opts.minAisleInches;
    const { minX, minY, maxX, maxY } = this.roomBounds;
    const maxWallThick = this.walls.reduce((m, w) => Math.max(m, w.properties?.thickness || 9), 9);
    const halfThick = maxWallThick / 2;
    const inset = (this.opts.includeWallRacks ? WALL_DEPTH : 0) + halfThick + aisle;

    const innerMinY = minY + inset;
    const innerMaxY = maxY - inset;

    if (innerMaxY - innerMinY < centerD) {
      return { centerRacks, endcaps, aisleItems, aisleInfos };
    }

    const rowSpacing = centerD + aisle;
    let rowY = innerMinY + centerD / 2;
    let prevRowMaxY: number | null = null;
    let prevRowCenterY: number | null = null;

    while (rowY + centerD / 2 <= innerMaxY) {
      // Find interior scan intervals at rowY
      const rawIntervals = getPolygonScanIntervals(this.manualRoomPolygon, rowY);
      let rackPlacedInRow = false;
      let lastPlacedCenterX = -Infinity;

      for (const intv of rawIntervals) {
        const usableMinX = intv.minX + inset;
        const usableMaxX = intv.maxX - inset;

        if (usableMaxX - usableMinX < centerW) continue;

        let rx = usableMinX + centerW / 2;
        while (rx + centerW / 2 <= usableMaxX) {
          const rack = this.makeCenterRack(rx, rowY, 'center_rack_5x3', centerW, centerD, 0);
          const fp = this.getCenterRackFootprint(rack);

          if (isPolygonInsidePolygon(fp, this.manualRoomPolygon)) {
            const box: AABB = {
              minX: rx - centerW / 2,
              maxX: rx + centerW / 2,
              minY: rowY - centerD / 2,
              maxY: rowY + centerD / 2,
            };

            // Check against static blockers and placed racks
            if (!this.hasAnyCollision(box)) {
              centerRacks.push(rack);
              this.placedAABBs.push(box);
              lastPlacedCenterX = rx;
              rackPlacedInRow = true;
            }
          }
          rx += centerW;
        }

        // Endcap at end of row
        if (this.opts.includeEndcaps && lastPlacedCenterX > -Infinity) {
          const ex = lastPlacedCenterX + centerW / 2 + ENDCAP_W / 2;
          if (ex + ENDCAP_W / 2 <= usableMaxX) {
            const endcap = this.makeCenterRack(ex, rowY, 'endcap_5x3', ENDCAP_W, ENDCAP_D, 0);
            const efp = this.getCenterRackFootprint(endcap);
            if (isPolygonInsidePolygon(efp, this.manualRoomPolygon)) {
              const eb: AABB = {
                minX: ex - ENDCAP_W / 2,
                maxX: ex + ENDCAP_W / 2,
                minY: rowY - ENDCAP_D / 2,
                maxY: rowY + ENDCAP_D / 2,
              };
              if (!this.hasAnyCollision(eb)) {
                endcaps.push(endcap);
                this.placedAABBs.push(eb);
              }
            }
          }
        }
      }

      // Aisle dimension between this row and previous row
      if (rackPlacedInRow && prevRowMaxY !== null && prevRowCenterY !== null) {
        const aisleTop = prevRowMaxY;
        const aisleBot = rowY - CENTER_D / 2;
        const aisleWidth = aisleBot - aisleTop;
        if (aisleWidth >= MIN_AISLE_LABEL) {
          const midX = (minX + maxX) / 2;
          const aisleItem = this.makeAisleDim(
            { x: midX, y: aisleTop },
            { x: midX, y: aisleBot },
            'vertical',
            aisleWidth
          );
          if (aisleItem && isPointInPolygon(aisleItem.labelPoint, this.manualRoomPolygon, false)) {
            aisleItems.push(aisleItem);
          }
          aisleInfos.push({ widthInches: aisleWidth, label: formatFeetInches(aisleWidth) });
        }
      }

      if (rackPlacedInRow) {
        prevRowMaxY = rowY + CENTER_D / 2;
        prevRowCenterY = rowY;
      }
      rowY += rowSpacing;
    }

    return { centerRacks, endcaps, aisleItems, aisleInfos };
  }


  private parseGeometry() {
    this.walls = this.entities.filter((e): e is WallEntity => e.type === 'wall');
    if (this.walls.length === 0) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const w of this.walls) {
      minX = Math.min(minX, w.geometry.x1, w.geometry.x2);
      minY = Math.min(minY, w.geometry.y1, w.geometry.y2);
      maxX = Math.max(maxX, w.geometry.x1, w.geometry.x2);
      maxY = Math.max(maxY, w.geometry.y1, w.geometry.y2);
    }
    this.roomBounds = { minX, minY, maxX, maxY };
    this.roomCX = (minX + maxX) / 2;
    this.roomCY = (minY + maxY) / 2;

    this.segments = [];
    for (const w of this.walls) {
      const dx = Math.abs(w.geometry.x2 - w.geometry.x1);
      const dy = Math.abs(w.geometry.y2 - w.geometry.y1);
      const isH = dx > dy;
      const len = Math.hypot(w.geometry.x2 - w.geometry.x1, w.geometry.y2 - w.geometry.y1);
      const midX = (w.geometry.x1 + w.geometry.x2) / 2;
      const midY = (w.geometry.y1 + w.geometry.y2) / 2;

      let side: 'top' | 'bottom' | 'left' | 'right';
      if (isH) { side = midY <= this.roomCY ? 'top' : 'bottom'; }
      else { side = midX <= this.roomCX ? 'left' : 'right'; }

      let x1 = w.geometry.x1, y1 = w.geometry.y1;
      let x2 = w.geometry.x2, y2 = w.geometry.y2;
      if (isH && x1 > x2) { [x1, x2] = [x2, x1]; [y1, y2] = [y2, y1]; }
      if (!isH && y1 > y2) { [x1, x2] = [x2, x1]; [y1, y2] = [y2, y1]; }

      this.segments.push({ wallId: w.id, side, x1, y1, x2, y2, length: len, isHorizontal: isH });
    }

    // Build obstacle AABBs — only from manual objects (NOT AI-placed racks)
    this.blockers = [];
    const cl = this.opts.wallClearanceInches;

    for (const e of this.entities) {
      switch (e.type) {
        case 'door': {
          const d = e as DoorEntity;
          // Project door width along wall with clearance; depth = wall thickness + clearance
          this.blockers.push(this.expand(this.centeredAABB(d.geometry.x, d.geometry.y, d.geometry.width, d.geometry.width), cl));
          break;
        }
        case 'window': {
          const wn = e as WindowEntity;
          this.blockers.push(this.expand(this.centeredAABB(wn.geometry.x, wn.geometry.y, wn.geometry.width, wn.geometry.width), cl));
          break;
        }
        case 'shutter': {
          const s = e as ShutterEntity;
          this.blockers.push(this.expand(this.centeredAABB(s.geometry.x, s.geometry.y, s.geometry.width, s.geometry.width), cl));
          break;
        }
        case 'gate': {
          const g = e as GateEntity;
          this.blockers.push(this.expand(this.centeredAABB(g.geometry.x, g.geometry.y, g.geometry.width, g.geometry.width), cl));
          break;
        }
        case 'glass_gate': {
          const g = e as GlassGateEntity;
          this.blockers.push(this.expand(this.centeredAABB(g.geometry.x, g.geometry.y, g.geometry.width, g.geometry.width), cl));
          break;
        }
        case 'column': {
          const c = e as ColumnEntity;
          this.blockers.push(this.expand(this.centeredAABB(c.geometry.x, c.geometry.y, c.geometry.width, c.geometry.height), cl));
          break;
        }
        case 'rack': {
          // Manual racks → static blockers (protected, AI must work around them)
          this.blockers.push(this.rackAABB(e as RackEntity));
          break;
        }
        case 'partition': {
          const p = e as PartitionEntity;
          this.blockers.push({
            minX: Math.min(p.geometry.x1, p.geometry.x2) - cl,
            minY: Math.min(p.geometry.y1, p.geometry.y2) - cl,
            maxX: Math.max(p.geometry.x1, p.geometry.x2) + cl,
            maxY: Math.max(p.geometry.y1, p.geometry.y2) + cl,
          });
          break;
        }
      }
    }
  }

  // ───────────────────────────────────────────────────────────────────────
  // AABB helpers
  // ───────────────────────────────────────────────────────────────────────

  private centeredAABB(cx: number, cy: number, w: number, h: number): AABB {
    return { minX: cx - w / 2, minY: cy - h / 2, maxX: cx + w / 2, maxY: cy + h / 2 };
  }
  private expand(box: AABB, pad: number): AABB {
    return { minX: box.minX - pad, minY: box.minY - pad, maxX: box.maxX + pad, maxY: box.maxY + pad };
  }
  private overlaps(a: AABB, b: AABB): boolean {
    return !(a.maxX <= b.minX || a.minX >= b.maxX || a.maxY <= b.minY || a.minY >= b.maxY);
  }
  private inRoom(box: AABB): boolean {
    const rb = this.roomBounds;
    return box.minX >= rb.minX - 1 && box.maxX <= rb.maxX + 1 && box.minY >= rb.minY - 1 && box.maxY <= rb.maxY + 1;
  }
  private hasStaticCollision(box: AABB): boolean {
    return this.blockers.some(b => this.overlaps(box, b));
  }
  /** Check collision against both static obstacles and AI-placed racks */
  private hasAnyCollision(box: AABB): boolean {
    if (this.hasStaticCollision(box)) return true;
    return this.placedAABBs.some(p => this.overlaps(box, p));
  }

  private rackAABB(rack: RackEntity): AABB {
    const rt = rack.properties.rackType;
    if (rt === 'corner_rack_2x2x2' || rt === 'Corner Rack') {
      return this.cornerAABB(rack.geometry.x, rack.geometry.y, rack.properties.cornerPosition);
    }
    const w = rack.geometry.width, d = rack.geometry.depth;
    const rot = rack.geometry.rotation || 0;
    const rotRad = (rot * Math.PI) / 180;
    const cosA = Math.abs(Math.cos(rotRad)), sinA = Math.abs(Math.sin(rotRad));
    const hw = (w * cosA + d * sinA) / 2, hh = (w * sinA + d * cosA) / 2;
    return { minX: rack.geometry.x - hw, minY: rack.geometry.y - hh, maxX: rack.geometry.x + hw, maxY: rack.geometry.y + hh };
  }

  private cornerAABB(ax: number, ay: number, pos: RackEntity['properties']['cornerPosition']): AABB {
    const s = CORNER_SIDE;
    switch (pos) {
      case 'top-left':     return { minX: ax, maxX: ax + s, minY: ay, maxY: ay + s };
      case 'top-right':    return { minX: ax - s, maxX: ax, minY: ay, maxY: ay + s };
      case 'bottom-left':  return { minX: ax, maxX: ax + s, minY: ay - s, maxY: ay };
      case 'bottom-right': return { minX: ax - s, maxX: ax, minY: ay - s, maxY: ay };
      default:             return { minX: ax, maxX: ax + s, minY: ay, maxY: ay + s };
    }
  }

  // ───────────────────────────────────────────────────────────────────────
  // Corner Rack Planning
  // ───────────────────────────────────────────────────────────────────────

  private planCornerRacks(): { racks: RackEntity[]; cornerDedMap: Map<string, number> } {
    const racks: RackEntity[] = [];
    const cornerDedMap = new Map<string, number>();

    const { minX, minY, maxX, maxY } = this.roomBounds;
    const corners: Array<{ ax: number; ay: number; pos: RackEntity['properties']['cornerPosition'] }> = [
      { ax: minX, ay: minY, pos: 'top-left' },
      { ax: maxX, ay: minY, pos: 'top-right' },
      { ax: minX, ay: maxY, pos: 'bottom-left' },
      { ax: maxX, ay: maxY, pos: 'bottom-right' },
    ];

    for (const corner of corners) {
      if (!this.hasWallNearCorner(corner.ax, corner.ay)) continue;
      const cBox = this.cornerAABB(corner.ax, corner.ay, corner.pos);
      if (this.hasAnyCollision(cBox) || !this.inRoom(cBox)) continue;

      const rotMap: Record<string, number> = { 'top-left': 0, 'top-right': 90, 'bottom-right': 180, 'bottom-left': 270 };
      const model = ProductModelRegistry.resolve(undefined, 'corner_rack_2x2x2');
      if (!model || !model.active) {
        continue;
      }
      const rack: RackEntity = {
        id: makeId(), type: 'rack',
        geometry: { x: corner.ax, y: corner.ay, width: model.width || CORNER_SIDE, depth: model.depth || CORNER_SIDE, height: model.height || 24, rotation: rotMap[corner.pos!] || 0 },
        properties: {
          rackType: model.productType || 'Corner Rack',
          productModelId: model.productId,
          productName: model.productName,
          sku: model.sku,
          cornerPosition: corner.pos,
          shelves: model.shelfCount || 2,
          shelfCount: model.shelfCount || 2,
          isAIGenerated: true,
        },
      };
      racks.push(rack);
      this.placedAABBs.push(cBox);
      cornerDedMap.set(`corner_${corner.pos}`, CORNER_SIDE);
    }

    return { racks, cornerDedMap };
  }

  private hasWallNearCorner(ax: number, ay: number): boolean {
    const threshold = 48;
    let hasH = false, hasV = false;
    for (const seg of this.segments) {
      if (seg.isHorizontal) {
        if (ax >= seg.x1 - threshold && ax <= seg.x2 + threshold && Math.abs((seg.y1 + seg.y2) / 2 - ay) < threshold) hasH = true;
      } else {
        if (ay >= seg.y1 - threshold && ay <= seg.y2 + threshold && Math.abs((seg.x1 + seg.x2) / 2 - ax) < threshold) hasV = true;
      }
    }
    return hasH && hasV;
  }

  // ───────────────────────────────────────────────────────────────────────
  // Wall Rack Run Planning
  // ───────────────────────────────────────────────────────────────────────

  private planWallRuns(cornerDedMap: Map<string, number>): {
    racks: RackEntity[];
    dims: DimensionItem[];
    runs: WallRunInfo[];
  } {
    const racks: RackEntity[] = [];
    const dims: DimensionItem[] = [];
    const runs: WallRunInfo[] = [];

    for (const seg of this.segments) {
      const intervals = this.usableIntervals(seg, cornerDedMap);

      const runInfo: WallRunInfo = {
        side: seg.side,
        wallRack7x3Count: 0,
        wallRack7x4Count: 0,
        cornerRackCount: 0,
        remainingInches: 0,
      };

      // Count corner racks on this side
      if (seg.isHorizontal) {
        const isTop = (seg.y1 + seg.y2) / 2 <= this.roomCY;
        const leftKey = isTop ? 'corner_top-left' : 'corner_bottom-left';
        const rightKey = isTop ? 'corner_top-right' : 'corner_bottom-right';
        if (cornerDedMap.has(leftKey)) runInfo.cornerRackCount++;
        if (cornerDedMap.has(rightKey)) runInfo.cornerRackCount++;
      } else {
        const isLeft = (seg.x1 + seg.x2) / 2 <= this.roomCX;
        const topKey = isLeft ? 'corner_top-left' : 'corner_top-right';
        const botKey = isLeft ? 'corner_bottom-left' : 'corner_bottom-right';
        if (cornerDedMap.has(topKey)) runInfo.cornerRackCount++;
        if (cornerDedMap.has(botKey)) runInfo.cornerRackCount++;
      }

      for (const interval of intervals) {
        const available = interval.end - interval.start;
        if (available < W3) {
          if (available >= MIN_REMAINING_LABEL) {
            runInfo.remainingInches += available;
            // Generate remaining-space dim for this small gap
            const dim = this.makeRemainingDim(seg, interval.start, interval.end);
            if (dim) dims.push(dim);
          }
          continue;
        }

        // PRIORITY RULE: Fill available space with 7×3 Racks
        const num3 = Math.floor(available / W3);

        const combo: ('wall_rack_7x3' | 'wall_rack_7x4')[] = [];
        for (let i = 0; i < num3; i++) combo.push('wall_rack_7x3');

        // Place racks at cursor — ZERO GAP
        let cursor = interval.start;
        for (const rackType of combo) {
          const rw = rackType === 'wall_rack_7x4' ? W4 : W3;
          const rack = this.buildWallRack(seg, cursor, rackType, rw);
          racks.push(rack);
          const box = this.wallRackAABB(seg, cursor, rw);
          if (box) this.placedAABBs.push(box);
          cursor += rw;  // <<< ZERO GAP: cursor advances by exact rack width only
          if (rackType === 'wall_rack_7x3') runInfo.wallRack7x3Count++;
          else runInfo.wallRack7x4Count++;
        }

        // Remaining space after racks in this interval
        const remaining = interval.end - cursor;
        if (remaining >= MIN_REMAINING_LABEL) {
          runInfo.remainingInches += remaining;
          // Generate remaining-space DimensionItem
          const dim = this.makeRemainingDim(seg, cursor, interval.end);
          if (dim) dims.push(dim);
        }
      }

      runs.push(runInfo);
    }

    return { racks, dims, runs };
  }

  // ─── Compute usable 1-D intervals on a wall ─────────────────────────────

  private usableIntervals(seg: WallSegment, cornerDedMap: Map<string, number>): WallInterval[] {
    const cl = this.opts.wallClearanceInches;
    let intervals: WallInterval[] = [{ start: 0, end: seg.length }];

    // Subtract corner deductions at wall ends
    if (seg.isHorizontal) {
      const isTop = (seg.y1 + seg.y2) / 2 <= this.roomCY;
      if (isTop) {
        if (cornerDedMap.has('corner_top-left'))  intervals = this.subtractInterval(intervals, 0, CORNER_SIDE);
        if (cornerDedMap.has('corner_top-right')) intervals = this.subtractInterval(intervals, seg.length - CORNER_SIDE, seg.length);
      } else {
        if (cornerDedMap.has('corner_bottom-left'))  intervals = this.subtractInterval(intervals, 0, CORNER_SIDE);
        if (cornerDedMap.has('corner_bottom-right')) intervals = this.subtractInterval(intervals, seg.length - CORNER_SIDE, seg.length);
      }
    } else {
      const isLeft = (seg.x1 + seg.x2) / 2 <= this.roomCX;
      if (isLeft) {
        if (cornerDedMap.has('corner_top-left'))    intervals = this.subtractInterval(intervals, 0, CORNER_SIDE);
        if (cornerDedMap.has('corner_bottom-left')) intervals = this.subtractInterval(intervals, seg.length - CORNER_SIDE, seg.length);
      } else {
        if (cornerDedMap.has('corner_top-right'))    intervals = this.subtractInterval(intervals, 0, CORNER_SIDE);
        if (cornerDedMap.has('corner_bottom-right')) intervals = this.subtractInterval(intervals, seg.length - CORNER_SIDE, seg.length);
      }
    }

    // Subtract all blocker projections onto this wall
    for (const b of this.blockers) {
      const iv = this.projectToWall(b, seg, cl);
      if (iv) intervals = this.subtractInterval(intervals, iv.start, iv.end);
    }

    // Filter too-small intervals
    return intervals.filter(iv => iv.end - iv.start >= W3);
  }

  private subtractInterval(available: WallInterval[], bStart: number, bEnd: number): WallInterval[] {
    const result: WallInterval[] = [];
    for (const a of available) {
      if (bEnd <= a.start || bStart >= a.end) { result.push(a); continue; }
      if (a.start < bStart) result.push({ start: a.start, end: bStart });
      if (bEnd < a.end) result.push({ start: bEnd, end: a.end });
    }
    return result;
  }

  private projectToWall(b: AABB, seg: WallSegment, cl: number): WallInterval | null {
    // Use WALL_DEPTH + clearance as projection depth to detect objects that could block wall rack placement
    const depth = WALL_DEPTH + cl + 6;
    if (seg.isHorizontal) {
      const wallY = (seg.y1 + seg.y2) / 2;
      // Check if the blocker is within WALL_DEPTH + clearance of this wall face
      if (b.maxY < wallY - depth || b.minY > wallY + depth) return null;
      const s = Math.max(b.minX - seg.x1, 0);
      const e = Math.min(b.maxX - seg.x1, seg.length);
      if (e <= s) return null;
      return { start: s - cl, end: e + cl };
    } else {
      const wallX = (seg.x1 + seg.x2) / 2;
      if (b.maxX < wallX - depth || b.minX > wallX + depth) return null;
      const s = Math.max(b.minY - seg.y1, 0);
      const e = Math.min(b.maxY - seg.y1, seg.length);
      if (e <= s) return null;
      return { start: s - cl, end: e + cl };
    }
  }

  // ─── Wall rack placement helpers ────────────────────────────────────────

  /**
   * Build the AABB for a wall rack placed at offsetAlongWall.
   * The AABB spans from wall face inward by WALL_DEPTH.
   */
  private wallRackAABB(seg: WallSegment, offsetAlongWall: number, rw: number): AABB | null {
    const wallPos = this.wallOffsetToWorld(seg, offsetAlongWall);
    if (!wallPos) return null;
    const wallEndPos = this.wallOffsetToWorld(seg, offsetAlongWall + rw);
    if (!wallEndPos) return null;

    if (seg.isHorizontal) {
      const wallY = (seg.y1 + seg.y2) / 2;
      const inY = seg.side === 'top' ? 1 : -1;
      const minX = Math.min(wallPos.x, wallEndPos.x);
      const maxX = Math.max(wallPos.x, wallEndPos.x);
      const wallFace = wallY;
      const wallBack = wallY + inY * WALL_DEPTH;
      return {
        minX, maxX,
        minY: Math.min(wallFace, wallBack),
        maxY: Math.max(wallFace, wallBack),
      };
    } else {
      const wallX = (seg.x1 + seg.x2) / 2;
      const inX = seg.side === 'left' ? 1 : -1;
      const minY = Math.min(wallPos.y, wallEndPos.y);
      const maxY = Math.max(wallPos.y, wallEndPos.y);
      const wallFace = wallX;
      const wallBack = wallX + inX * WALL_DEPTH;
      return {
        minX: Math.min(wallFace, wallBack),
        maxX: Math.max(wallFace, wallBack),
        minY, maxY,
      };
    }
  }

  private wallOffsetToWorld(seg: WallSegment, offset: number): Point2D | null {
    if (offset < -1 || offset > seg.length + 1) return null;
    const t = seg.length > 0 ? Math.min(Math.max(offset / seg.length, 0), 1) : 0;
    return { x: seg.x1 + t * (seg.x2 - seg.x1), y: seg.y1 + t * (seg.y2 - seg.y1) };
  }

  /**
   * Build a RackEntity for a wall rack.
   * Center is placed at wall face + WALL_DEPTH/2 inward.
   */
  private buildWallRack(
    seg: WallSegment, offsetAlongWall: number,
    rackType: 'wall_rack_7x3' | 'wall_rack_7x4', rw: number
  ): RackEntity {
    // Center position along wall
    const wallCenterPos = this.wallOffsetToWorld(seg, offsetAlongWall + rw / 2)!;
    const wall = this.walls.find((w) => w.id === seg.wallId);
    const wallThick = wall?.properties?.thickness || 9;
    const halfThick = wallThick / 2;

    const inNormal: Point2D =
      seg.side === 'top'
        ? { x: 0, y: 1 }
        : seg.side === 'bottom'
        ? { x: 0, y: -1 }
        : seg.side === 'left'
        ? { x: 1, y: 0 }
        : { x: -1, y: 0 };

    // Anchor (cx, cy) is EXACTLY on the interior wall face
    const cx = wallCenterPos.x + inNormal.x * halfThick;
    const cy = wallCenterPos.y + inNormal.y * halfThick;
    
    // Rotation must strictly follow the host wall vector to preserve orientation for top/bottom/left/right walls
    const rotation = (Math.atan2(seg.y2 - seg.y1, seg.x2 - seg.x1) * 180) / Math.PI;
    const model = ProductModelRegistry.resolve(undefined, rackType);
    const activeProducts = ProductModelRegistry.getActive();
    const resolvedModel = model || activeProducts.find(p => p.productType?.toLowerCase().includes('wall') || p.category?.toLowerCase().includes('wall')) || activeProducts[0];

    return {
      id: makeId(), type: 'rack',
      geometry: { x: cx, y: cy, width: rw, depth: resolvedModel?.depth || 24, height: resolvedModel?.height || 84, rotation },
      properties: {
        rackType: resolvedModel?.productType || 'Wall Rack',
        productModelId: resolvedModel?.productId,
        productName: resolvedModel?.productName,
        sku: resolvedModel?.sku,
        shelves: resolvedModel?.shelfCount || 4,
        shelfCount: resolvedModel?.shelfCount || 4,
        shelfSpacing: 'auto',
        shelfThickness: (resolvedModel as any)?.shelfThickness || 1.0,
        attachedWallId: seg.wallId,
        wallSide: seg.side,
        positionAlongWall: offsetAlongWall + rw / 2,
        inwardNormal: inNormal,
        wallThickness: wallThick,
        isAIGenerated: true,
      },
    };
  }

  // ─── Remaining space DimensionItem ─────────────────────────────────────

  /**
   * Create a DimensionItem for the remaining wall space after a rack run.
   * Dimensions are placed INSIDE the room (toward room center) so they
   * appear as remaining-space labels on the interior wall face.
   */
  private makeRemainingDim(seg: WallSegment, startOffset: number, endOffset: number): DimensionItem | null {
    const length = endOffset - startOffset;
    if (length < MIN_REMAINING_LABEL) return null;

    const p1 = this.wallOffsetToWorld(seg, startOffset);
    const p2 = this.wallOffsetToWorld(seg, endOffset);
    if (!p1 || !p2) return null;

    // Place label slightly inside room from wall face
    const INWARD_OFFSET = WALL_DEPTH + 12; // inches inside from wall face

    let orientation: 'horizontal' | 'vertical';
    let labelPoint: Point2D;
    let sp1: Point2D;
    let sp2: Point2D;

    if (seg.isHorizontal) {
      orientation = 'horizontal';
      const wallY = (seg.y1 + seg.y2) / 2;
      const inY = seg.side === 'top' ? 1 : -1;
      const labelY = wallY + inY * INWARD_OFFSET;
      const midX = (p1.x + p2.x) / 2;
      labelPoint = { x: midX, y: labelY };
      // Extension line endpoints align with wall face
      sp1 = { x: p1.x, y: wallY };
      sp2 = { x: p2.x, y: wallY };
    } else {
      orientation = 'vertical';
      const wallX = (seg.x1 + seg.x2) / 2;
      const inX = seg.side === 'left' ? 1 : -1;
      const labelX = wallX + inX * INWARD_OFFSET;
      const midY = (p1.y + p2.y) / 2;
      labelPoint = { x: labelX, y: midY };
      sp1 = { x: wallX, y: p1.y };
      sp2 = { x: wallX, y: p2.y };
    }

    const formatted = formatFeetInches(length);
    const displayText = `${formatted}\nREMAINING`;
    const bw = Math.max(formatted.length * 6, 36);

    return {
      id: `ai_rem_${makeId()}`,
      startPoint: sp1,
      endPoint: sp2,
      value: length,
      formattedValue: displayText,
      orientation,
      lane: 0,
      priority: 3,
      offsetDistance: INWARD_OFFSET * (seg.side === 'top' || seg.side === 'left' ? 1 : -1),
      type: 'remaining_space',
      labelPoint,
      boundingBox: {
        minX: labelPoint.x - bw / 2, maxX: labelPoint.x + bw / 2,
        minY: labelPoint.y - 12, maxY: labelPoint.y + 12,
      },
    };
  }

  // ───────────────────────────────────────────────────────────────────────
  // Center Rack / Gondola Planning
  // ───────────────────────────────────────────────────────────────────────

  private planCenterRacks(): {
    centerRacks: RackEntity[];
    endcaps: RackEntity[];
    aisleItems: DimensionItem[];
    aisleInfos: AisleInfo[];
  } {
    const centerRacks: RackEntity[] = [];
    const endcaps: RackEntity[] = [];
    const aisleItems: DimensionItem[] = [];
    const aisleInfos: AisleInfo[] = [];

    const activeProducts = ProductModelRegistry.getActive();
    const centerModel = ProductModelRegistry.resolve(undefined, 'center_rack_5x3') ||
      activeProducts.find(p => p.productType?.toLowerCase().includes('center') || p.category?.toLowerCase().includes('center'));
    const centerW = centerModel?.width || CENTER_W;
    const centerD = centerModel?.depth || CENTER_D;

    const aisle = this.opts.minAisleInches;
    const { minX, minY, maxX, maxY } = this.roomBounds;
    const maxWallThick = this.walls.reduce((m, w) => Math.max(m, w.properties?.thickness || 9), 9);
    const halfThick = maxWallThick / 2;

    // Inner floor area — inset by wall depth + aisle from each wall
    const inset = (this.opts.includeWallRacks ? WALL_DEPTH : 0) + halfThick + aisle;
    const innerMinX = minX + inset;
    const innerMaxX = maxX - inset;
    const innerMinY = minY + inset;
    const innerMaxY = maxY - inset;

    if (innerMaxX - innerMinX < centerW || innerMaxY - innerMinY < centerD) {
      return { centerRacks, endcaps, aisleItems, aisleInfos };
    }

    const roomW = maxX - minX;
    const roomH = maxY - minY;
    // Horizontal gondola rows when room is wider than tall
    const useHorizRows = roomW >= roomH;
    const rowSpacing = centerD + aisle;

    if (useHorizRows) {
      // ─── Horizontal gondola rows ──────────────────────────────────────
      const rowYPositions: number[] = [];
      let rowY = innerMinY + centerD / 2;
      while (rowY + centerD / 2 <= innerMaxY) {
        rowYPositions.push(rowY);
        rowY += rowSpacing;
      }

      let prevRowMaxY: number | null = null;

      for (const rY of rowYPositions) {
        let rx = innerMinX + centerW / 2;
        let lastCX = -Infinity;
        let rackPlacedInRow = false;

        while (rx + centerW / 2 <= innerMaxX) {
          const box: AABB = {
            minX: rx - centerW / 2, maxX: rx + centerW / 2,
            minY: rY - centerD / 2, maxY: rY + centerD / 2,
          };
          // Check with aisle buffer on all sides (not against already-placed in same row)
          const aisledBox: AABB = {
            minX: box.minX - 1, maxX: box.maxX + 1,
            minY: box.minY - aisle / 2, maxY: box.maxY + aisle / 2,
          };
          if (!this.hasStaticCollision(box) && this.inRoom(box) && !this.hasStaticCollision(aisledBox)) {
            centerRacks.push(this.makeCenterRack(rx, rY, 'center_rack_5x3', centerW, centerD, 0));
            this.placedAABBs.push(box);
            lastCX = rx;
            rackPlacedInRow = true;
          }
          rx += centerW;
        }

        // Endcap at end of row
        if (this.opts.includeEndcaps && lastCX > -Infinity) {
          const ex = lastCX + centerW / 2 + ENDCAP_W / 2;
          if (ex + ENDCAP_W / 2 <= innerMaxX) {
            const eb: AABB = {
              minX: ex - ENDCAP_W / 2, maxX: ex + ENDCAP_W / 2,
              minY: rY - ENDCAP_D / 2, maxY: rY + ENDCAP_D / 2,
            };
            if (!this.hasStaticCollision(eb) && this.inRoom(eb)) {
              endcaps.push(this.makeCenterRack(ex, rY, 'endcap_5x3', ENDCAP_W, ENDCAP_D, 0));
              this.placedAABBs.push(eb);
            }
          }
        }

        // Aisle dimension between this row and previous row
        if (rackPlacedInRow && prevRowMaxY !== null) {
          const aisleTop = prevRowMaxY;
          const aisleBot = rY - centerD / 2;
          const aisleWidth = aisleBot - aisleTop;
          if (aisleWidth >= MIN_AISLE_LABEL) {
            const aisleItem = this.makeAisleDim(
              { x: (innerMinX + innerMaxX) / 2, y: aisleTop },
              { x: (innerMinX + innerMaxX) / 2, y: aisleBot },
              'vertical',
              aisleWidth
            );
            if (aisleItem) aisleItems.push(aisleItem);
            aisleInfos.push({ widthInches: aisleWidth, label: formatFeetInches(aisleWidth) });
          }
        }
        if (rackPlacedInRow) {
          prevRowMaxY = rY + centerD / 2;
        }
      }

    } else {
      // ─── Vertical gondola columns ──────────────────────────────────────
      const colXPositions: number[] = [];
      let colX = innerMinX + centerD / 2;
      while (colX + centerD / 2 <= innerMaxX) {
        colXPositions.push(colX);
        colX += centerD + aisle;
      }

      let prevColMaxX: number | null = null;

      for (const cX of colXPositions) {
        let ry = innerMinY + centerW / 2;
        let lastCY = -Infinity;
        let rackPlacedInCol = false;

        while (ry + centerW / 2 <= innerMaxY) {
          const box: AABB = {
            minX: cX - centerD / 2, maxX: cX + centerD / 2,
            minY: ry - centerW / 2, maxY: ry + centerW / 2,
          };
          const aisledBox: AABB = {
            minX: box.minX - aisle / 2, maxX: box.maxX + aisle / 2,
            minY: box.minY - 1, maxY: box.maxY + 1,
          };
          if (!this.hasStaticCollision(box) && this.inRoom(box) && !this.hasStaticCollision(aisledBox)) {
            centerRacks.push(this.makeCenterRack(cX, ry, 'center_rack_5x3', centerW, centerD, 90));
            this.placedAABBs.push(box);
            lastCY = ry;
            rackPlacedInCol = true;
          }
          ry += centerW;
        }

        // Endcap at end of column
        if (this.opts.includeEndcaps && lastCY > -Infinity) {
          const ey = lastCY + centerW / 2 + ENDCAP_D / 2;
          if (ey + ENDCAP_D / 2 <= innerMaxY) {
            const eb: AABB = {
              minX: cX - ENDCAP_D / 2, maxX: cX + ENDCAP_D / 2,
              minY: ey - ENDCAP_W / 2, maxY: ey + ENDCAP_W / 2,
            };
            if (!this.hasStaticCollision(eb) && this.inRoom(eb)) {
              endcaps.push(this.makeCenterRack(cX, ey, 'endcap_5x3', ENDCAP_W, ENDCAP_D, 90));
              this.placedAABBs.push(eb);
            }
          }
        }

        // Aisle dimension between this column and previous column
        if (rackPlacedInCol && prevColMaxX !== null) {
          const aisleLeft = prevColMaxX;
          const aisleRight = cX - CENTER_D / 2;
          const aisleWidth = aisleRight - aisleLeft;
          if (aisleWidth >= MIN_AISLE_LABEL) {
            const aisleItem = this.makeAisleDim(
              { x: aisleLeft, y: (innerMinY + innerMaxY) / 2 },
              { x: aisleRight, y: (innerMinY + innerMaxY) / 2 },
              'horizontal',
              aisleWidth
            );
            if (aisleItem) aisleItems.push(aisleItem);
            aisleInfos.push({ widthInches: aisleWidth, label: formatFeetInches(aisleWidth) });
          }
        }
        if (rackPlacedInCol) {
          prevColMaxX = cX + CENTER_D / 2;
        }
      }
    }

    return { centerRacks, endcaps, aisleItems, aisleInfos };
  }

  private makeCenterRack(cx: number, cy: number, type: 'center_rack_5x3' | 'endcap_5x3', w: number, d: number, rot: number): RackEntity {
    const model = ProductModelRegistry.resolve(undefined, type);
    return {
      id: makeId(), type: 'rack',
      geometry: {
        x: cx,
        y: cy,
        width: model?.width || w,
        depth: model?.depth || d,
        height: model?.height || 60,
        rotation: rot,
      },
      properties: {
        rackType: model?.productType || (type === 'endcap_5x3' ? 'End Cap' : 'Center Rack'),
        productModelId: model?.productId,
        productName: model?.productName,
        sku: model?.sku,
        shelves: model?.shelfCount || 3,
        shelfCount: model?.shelfCount || 3,
        shelfSpacing: 'auto',
        shelfThickness: (model as any)?.shelfThickness || 1.0,
        isAIGenerated: true,
      },
    };
  }

  // ─── Aisle DimensionItem ─────────────────────────────────────────────

  /**
   * Create a DimensionItem for an aisle between gondola rows/columns.
   * Placed INSIDE the room at the center of the aisle.
   */
  private makeAisleDim(
    p1: Point2D,
    p2: Point2D,
    orientation: 'horizontal' | 'vertical',
    widthInches: number
  ): DimensionItem | null {
    if (widthInches < MIN_AISLE_LABEL) return null;

    const formatted = formatFeetInches(widthInches);
    const displayText = `${formatted}\nAISLE`;

    let labelPoint: Point2D;
    if (orientation === 'vertical') {
      labelPoint = { x: p1.x + 28, y: (p1.y + p2.y) / 2 };
    } else {
      labelPoint = { x: (p1.x + p2.x) / 2, y: p1.y - 20 };
    }

    const bw = Math.max(formatted.length * 6, 40);

    return {
      id: `ai_aisle_${makeId()}`,
      startPoint: p1,
      endPoint: p2,
      value: widthInches,
      formattedValue: displayText,
      orientation,
      lane: 0,
      priority: 2,
      offsetDistance: 24,
      type: 'aisle',
      labelPoint,
      boundingBox: {
        minX: labelPoint.x - bw / 2, maxX: labelPoint.x + bw / 2,
        minY: labelPoint.y - 12, maxY: labelPoint.y + 12,
      },
    };
  }

  // ───────────────────────────────────────────────────────────────────────
  // Stats & empty result
  // ───────────────────────────────────────────────────────────────────────

  private buildStats(racks: RackEntity[], wallRuns: WallRunInfo[], aisles: AisleInfo[]): RackPlannerStats {
    let n3 = 0, n4 = 0, nc = 0, ne = 0, nco = 0;
    let usedWall = 0;
    let totalWall = 0;
    for (const seg of this.segments) totalWall += seg.length;

    for (const r of racks) {
      switch (r.properties.rackType) {
        case 'wall_rack_7x3': n3++; usedWall += W3; break;
        case 'wall_rack_7x4': n4++; usedWall += W4; break;
        case 'center_rack_5x3': nc++; break;
        case 'endcap_5x3': ne++; break;
        case 'corner_rack_2x2x2': nco++; break;
      }
    }

    const roomArea = (this.roomBounds.maxX - this.roomBounds.minX) * (this.roomBounds.maxY - this.roomBounds.minY);
    let usedFloor = 0;
    for (const r of racks) {
      const b = this.rackAABB(r);
      usedFloor += (b.maxX - b.minX) * (b.maxY - b.minY);
    }

    return {
      wallRack7x3Count: n3, wallRack7x4Count: n4, centerRackCount: nc,
      endcapCount: ne, cornerRackCount: nco,
      totalRacks: racks.length,
      wallUtilizationPct: totalWall > 0 ? Math.min(100, Math.round((usedWall / totalWall) * 100)) : 0,
      floorUtilizationPct: roomArea > 0 ? Math.min(100, Math.round((usedFloor / roomArea) * 100)) : 0,
      minAisleInches: this.opts.minAisleInches,
      wallRuns,
      aisles,
    };
  }

  private empty(message: string): RackPlannerResult {
    return {
      racks: [], aiDimensions: [], message,
      stats: {
        wallRack7x3Count: 0, wallRack7x4Count: 0, centerRackCount: 0,
        endcapCount: 0, cornerRackCount: 0, totalRacks: 0,
        wallUtilizationPct: 0, floorUtilizationPct: 0,
        minAisleInches: this.opts.minAisleInches, wallRuns: [], aisles: [],
      },
    };
  }
}
