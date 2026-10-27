import type {
  CADEntity,
  DimensionItem,
  DimensionClassification,
  Point2D,
  BoundingBox2D,
  WallEntity,
  ColumnEntity,
  DoorEntity,
  WindowEntity,
  RackEntity,
  ShutterEntity,
  GateEntity,
  GlassGateEntity,
  PartitionEntity
} from '../types';
import { formatFeetInches } from '../geometry/FeetInches';
import { distance, midpoint, buildRoomPolygon, calculateWallInwardNormal } from '../geometry/GeometryMath';
import { RemainingSpaceEngine } from '../engine/RemainingSpaceEngine';

export interface DimensionConfig {
  showOverallDimensions: boolean;
  showSegmentDimensions: boolean;
  showColumnInwardDimensions: boolean;
  showRackDimensions: boolean;
  showTemporaryReferenceDimensions: boolean;
  baseOffsetInches: number;
  laneSpacingInches: number;
  roomShapeMode?: 'AUTO' | 'MANUAL';
}

export class DimensionManager {
  private config: DimensionConfig;

  constructor(config?: Partial<DimensionConfig>) {
    this.config = {
      showOverallDimensions: true,
      showSegmentDimensions: true,
      showColumnInwardDimensions: true,
      showRackDimensions: false,
      showTemporaryReferenceDimensions: false,
      // Increased base offset and lane spacing for proper external dimension lanes
      baseOffsetInches: 36,
      laneSpacingInches: 24,
      roomShapeMode: 'AUTO',
      ...config,
    };
  }

  public setConfig(config: Partial<DimensionConfig>) {
    this.config = { ...this.config, ...config };
  }

  public generateDimensions(
    entities: CADEntity[],
    selectedEntityId: string | null = null,
    overrideTempRefMode: boolean = false,
    _overrideRackDimMode: boolean = false
  ): DimensionItem[] {
    const rawRequests: DimensionItem[] = [];
    
    const walls = entities.filter((e): e is WallEntity => e.type === 'wall');
    const columns = entities.filter((e): e is ColumnEntity => e.type === 'column');
    const racks = entities.filter((e): e is RackEntity => e.type === 'rack');
    const doors = entities.filter((e): e is DoorEntity => e.type === 'door');
    const windows = entities.filter((e): e is WindowEntity => e.type === 'window');
    const shutters = entities.filter((e): e is ShutterEntity => e.type === 'shutter');
    const gates = entities.filter((e): e is GateEntity => e.type === 'gate');
    const glassGates = entities.filter((e): e is GlassGateEntity => e.type === 'glass_gate');
    const partitions = entities.filter((e): e is PartitionEntity => e.type === 'partition');

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const w of walls) {
      minX = Math.min(minX, w.geometry.x1, w.geometry.x2);
      maxX = Math.max(maxX, w.geometry.x1, w.geometry.x2);
      minY = Math.min(minY, w.geometry.y1, w.geometry.y2);
      maxY = Math.max(maxY, w.geometry.y1, w.geometry.y2);
    }
    const hasValidRoomBounds = minX !== Infinity && maxX > minX && maxY > minY;
    const roomCX = hasValidRoomBounds ? (minX + maxX) / 2 : 0;
    const roomCY = hasValidRoomBounds ? (minY + maxY) / 2 : 0;
    const roomPolygon = this.config.roomShapeMode === 'MANUAL' ? buildRoomPolygon(walls) : [];

    // ── 1. OVERALL DIMENSIONS (outside room, lane 3) ─────────────────────────
    if (this.config.showOverallDimensions && hasValidRoomBounds && this.config.roomShapeMode !== 'MANUAL') {
      const overallWidth = maxX - minX;
      const overallHeight = maxY - minY;
      const outerOff = this.config.baseOffsetInches + this.config.laneSpacingInches * 2;

      // TOP: overall width
      rawRequests.push(this.createDimensionItem({
        id: 'dim_overall_top_w',
        startPoint: { x: minX, y: minY },
        endPoint: { x: maxX, y: minY },
        value: overallWidth,
        orientation: 'horizontal',
        lane: 3,
        priority: 10,
        type: 'overall',
        classification: 'OVERALL_BOUNDING',
        offsetDistance: -outerOff,
        labelPoint: { x: (minX + maxX) / 2, y: minY - outerOff },
        suffix: '\n(OVERALL WIDTH)',
      }));

      // Left overall dimension intentionally omitted. Only Top and Right are rendered.

      // RIGHT: overall height/length (mirrored for reference-image parity)
      rawRequests.push(this.createDimensionItem({
        id: 'dim_overall_right_h',
        startPoint: { x: maxX, y: minY },
        endPoint: { x: maxX, y: maxY },
        value: overallHeight,
        orientation: 'vertical',
        lane: 3,
        priority: 9,
        type: 'overall',
        classification: 'OVERALL_BOUNDING',
        offsetDistance: outerOff,
        labelPoint: { x: maxX + outerOff, y: (minY + maxY) / 2 },
        suffix: '\n(OVERALL LENGTH)',
      }));
    }

    // ── 2. WALL SEGMENT CHAIN: opening + free-segment (ALL OUTSIDE ROOM) ─────
    if (this.config.showSegmentDimensions) {
      for (const w of walls) {
        const p1 = { x: w.geometry.x1, y: w.geometry.y1 };
        const p2 = { x: w.geometry.x2, y: w.geometry.y2 };
        const wallLen = distance(p1, p2);
        if (wallLen < 6) continue;

        const isHoriz = Math.abs(p1.y - p2.y) < 1;
        const isVert = Math.abs(p1.x - p2.x) < 1;
        const midPt = midpoint(p1, p2);

        let dirX: number;
        let dirY: number;
        let extNx: number;
        let extNy: number;
        let orient: 'horizontal' | 'vertical' | 'aligned';

        if (this.config.roomShapeMode === 'MANUAL') {
          // Geometry-first inward/exterior normal calculation from room polygon
          const normals = calculateWallInwardNormal(p1, p2, roomPolygon);
          dirX = normals.wallDirection.x;
          dirY = normals.wallDirection.y;
          // Exterior normal points OUTSIDE the room
          extNx = normals.exteriorNormal.x;
          extNy = normals.exteriorNormal.y;
          orient = 'aligned';
        } else {
          // AUTO mode remains 100% unchanged
          const dx = p2.x - p1.x;
          const dy = p2.y - p1.y;
          dirX = dx / wallLen;
          dirY = dy / wallLen;
          const nx = -dirY;
          const ny = dirX;
          orient = isHoriz ? 'horizontal' : isVert ? 'vertical' : 'aligned';

          let offsetSign = -1;
          if (hasValidRoomBounds) {
            if (isHoriz) {
              offsetSign = midPt.y <= roomCY ? -1 : 1;
            } else if (isVert) {
              offsetSign = midPt.x <= roomCX ? -1 : 1;
            }
          }
          extNx = offsetSign * nx;
          extNy = offsetSign * ny;
        }

        const baseOff = this.config.baseOffsetInches;

        // Find attached structural objects (openings, columns on this wall)
        const attached: (DoorEntity | WindowEntity | ShutterEntity | GateEntity | GlassGateEntity | ColumnEntity)[] = [];
        [...doors, ...windows, ...shutters, ...gates, ...glassGates].forEach(obj => {
          if ('attachedWallId' in obj.properties && obj.properties.attachedWallId === w.id) {
            attached.push(obj);
          }
        });
        columns.forEach(col => {
          if (col.properties.columnType === 'wall' && col.properties.attachedWallId === w.id) attached.push(col);
        });

        // Project all objects onto the wall 1-D axis using dot product with wall direction
        type WallItem = { start: number; end: number; type: 'column' | 'opening'; entityId: string; objType?: string };
        const items: WallItem[] = [];
        for (const obj of attached) {
          const center = { x: obj.geometry.x, y: obj.geometry.y };
          const t = (center.x - p1.x) * dirX + (center.y - p1.y) * dirY;
          const ow = obj.geometry.width || 24;
          let itemType: WallItem['type'] = 'opening';
          if (obj.type === 'column') itemType = 'column';
          
          items.push({
            start: Math.max(0, t - ow / 2),
            end: Math.min(wallLen, t + ow / 2),
            type: itemType,
            entityId: obj.id,
            objType: obj.type
          });
        }

        items.sort((a, b) => a.start - b.start);
        
        // Resolve overlaps
        const mergedItems: WallItem[] = [];
        for (const it of items) {
          if (mergedItems.length === 0) {
            mergedItems.push({ ...it });
          } else {
            const last = mergedItems[mergedItems.length - 1];
            if (it.start <= last.end + 1.0) {
              last.end = Math.max(last.end, it.end);
            } else {
              mergedItems.push({ ...it });
            }
          }
        }

        // Build continuous chain of free and occupied segments
        const chainItems: { start: number; end: number; type: 'free' | 'column' | 'opening'; entityId?: string; objType?: string }[] = [];
        let cursor = 0;
        for (const item of mergedItems) {
          if (item.start > cursor + 1) {
            chainItems.push({ start: cursor, end: item.start, type: 'free' });
          }
          chainItems.push({
            start: Math.max(cursor, item.start),
            end: Math.max(cursor, item.end),
            type: item.type,
            entityId: item.entityId,
            objType: item.objType
          });
          cursor = Math.max(cursor, item.end);
        }
        if (wallLen > cursor + 1) {
          chainItems.push({ start: cursor, end: wallLen, type: 'free' });
        }

        // ── MANUAL MODE: LANE 1 = TOTAL WALL LENGTH (OUTSIDE ROOM) ──
        if (this.config.roomShapeMode === 'MANUAL') {
          const labelX = midPt.x + extNx * baseOff;
          const labelY = midPt.y + extNy * baseOff;
          
          rawRequests.push(this.createDimensionItem({
            id: 'dim_wall_len_' + w.id,
            entityId: w.id,
            startPoint: p1,
            endPoint: p2,
            value: wallLen,
            orientation: 'aligned',
            lane: 1,
            priority: 10,
            type: 'segment',
            classification: 'WALL_LENGTH',
            offsetDistance: baseOff,
            labelPoint: { x: labelX, y: labelY }
          }));
        }

        // ── LANE 2 (or Lane 1 for AUTO): OBJECT LOCATIONS (OUTSIDE ROOM) ──
        const segmentLane = this.config.roomShapeMode === 'MANUAL' && mergedItems.length > 0 ? 2 : 1;
        const segmentOffsetDist = baseOff + (segmentLane - 1) * this.config.laneSpacingInches;

        for (const chain of chainItems) {
          const segLen = chain.end - chain.start;
          if (segLen < 1) continue;

          // In AUTO mode, if there are no objects, we skip generating a segment because OVERALL covers it
          if (chain.type === 'free' && mergedItems.length === 0 && this.config.roomShapeMode === 'AUTO') continue;

          // In MANUAL mode, if there are NO objects attached, Lane 1 Total Wall Length already represents it
          if (chain.type === 'free' && mergedItems.length === 0 && this.config.roomShapeMode === 'MANUAL') continue;

          const ratio1 = chain.start / wallLen;
          const ratio2 = chain.end / wallLen;
          const sp = { x: p1.x + (p2.x - p1.x) * ratio1, y: p1.y + (p2.y - p1.y) * ratio1 };
          const ep = { x: p1.x + (p2.x - p1.x) * ratio2, y: p1.y + (p2.y - p1.y) * ratio2 };
          const segMid = midpoint(sp, ep);

          let labelX = segMid.x + extNx * segmentOffsetDist;
          let labelY = segMid.y + extNy * segmentOffsetDist;

          if (this.config.roomShapeMode === 'AUTO') {
            if (isHoriz) {
              labelX = segMid.x;
              labelY = segMid.y + (midPt.y <= roomCY ? -segmentOffsetDist : segmentOffsetDist);
            } else if (isVert) {
              labelX = segMid.x + (midPt.x <= roomCX ? -segmentOffsetDist : segmentOffsetDist);
              labelY = segMid.y;
            }
          }

          const labelPoint = { x: labelX, y: labelY };

          if (chain.type === 'free') {
            const classification: DimensionClassification = chain.start === 0 ? 'OBJECT_LOCATION_START' : 'OBJECT_LOCATION_END';
            rawRequests.push(this.createDimensionItem({
              id: 'dim_loc_' + Math.random().toString(36).slice(2, 8),
              entityId: chain.entityId || w.id,
              startPoint: sp,
              endPoint: ep,
              value: segLen,
              orientation: orient,
              lane: segmentLane,
              priority: 5,
              type: 'segment',
              classification,
              offsetDistance: segmentOffsetDist,
              labelPoint
            }));
          } else if (chain.type === 'column') {
            rawRequests.push(this.createDimensionItem({
              id: 'dim_col_w_' + chain.entityId,
              entityId: chain.entityId,
              startPoint: sp,
              endPoint: ep,
              value: segLen,
              orientation: orient,
              lane: segmentLane,
              priority: 7,
              type: 'column_width',
              classification: 'COLUMN_WIDTH',
              offsetDistance: segmentOffsetDist,
              labelPoint,
              suffix: '\n(WIDTH)'
            }));
          } else if (chain.type === 'opening') {
            const label = chain.objType ? chain.objType.replace('_', ' ').toUpperCase() : 'OPENING';
            rawRequests.push(this.createDimensionItem({
              id: 'dim_opening_' + chain.entityId,
              entityId: chain.entityId,
              startPoint: sp,
              endPoint: ep,
              value: segLen,
              orientation: orient,
              lane: segmentLane,
              priority: 7,
              type: 'door_width',
              classification: 'OBJECT_WIDTH',
              offsetDistance: segmentOffsetDist,
              labelPoint,
              suffix: `\n(${label} WIDTH)`
            }));
          }
        }
      }
    }

    // ── 3. PARTITIONS ────────────────────────────────────────────────────────
    for (const p of partitions) {
      const p1 = { x: p.geometry.x1, y: p.geometry.y1 };
      const p2 = { x: p.geometry.x2, y: p.geometry.y2 };
      const len = distance(p1, p2);
      const mid = midpoint(p1, p2);
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      
      const nx = -dy / len;
      const ny = dx / len;

      const isHoriz = Math.abs(p1.y - p2.y) < 1;
      
      let orient = 'aligned' as 'horizontal' | 'vertical' | 'aligned';
      let offsetD = 12;
      let labelP = { x: mid.x + nx * offsetD, y: mid.y + ny * offsetD };

      if (this.config.roomShapeMode === 'AUTO') {
        orient = isHoriz ? 'horizontal' : 'vertical';
        labelP = { x: mid.x + (isHoriz ? 0 : offsetD), y: mid.y + (isHoriz ? offsetD : 0) };
      }

      rawRequests.push(this.createDimensionItem({
        id: 'dim_part_' + p.id,
        entityId: p.id,
        startPoint: p1,
        endPoint: p2,
        value: len,
        orientation: orient,
        lane: 1,
        priority: 4,
        type: 'segment',
        offsetDistance: offsetD,
        labelPoint: labelP,
      }));
    }

    // ── 4. COLUMNS (Width + Depth INSIDE near column) ────────────────────────
    if (this.config.showColumnInwardDimensions) {
      for (const col of columns) {
        const cx = col.geometry.x;
        const cy = col.geometry.y;
        const cw = col.geometry.width || 24;
        const ch = col.geometry.height || 24;
        const isSelected = col.id === selectedEntityId;

        if (col.properties.columnType === 'wall') {
          const rot = (col.geometry.rotation || 0) * (Math.PI / 180);
          const cos = Math.cos(rot);
          const sin = Math.sin(rot);

          // Width dimension is now handled in the Wall Segment (Location Chain) logic on Lane 1 outside the room.

          // Depth dimension (along the rotated Y axis = inward into room)
          // Drawn at the right edge of the column (+cw/2)
          const dStart = { x: cx + (cw / 2) * cos + (ch / 2) * sin, y: cy + (cw / 2) * sin - (ch / 2) * cos };
          const dEnd = { x: cx + (cw / 2) * cos - (ch / 2) * sin, y: cy + (cw / 2) * sin + (ch / 2) * cos };

          const isHoriz = Math.abs(cos) > Math.abs(sin);
          let dOrient = 'aligned' as 'horizontal' | 'vertical' | 'aligned';
          if (this.config.roomShapeMode === 'AUTO') {
            dOrient = isHoriz ? 'vertical' : 'horizontal';
          }

          // Depth label: inside near column edge, offset along along-wall direction
          const dOffsetDist = cw / 2 + 12;
          const dLabelX = cx + cos * dOffsetDist;
          const dLabelY = cy + sin * dOffsetDist;

          rawRequests.push(this.createDimensionItem({
            id: 'dim_col_d_' + col.id,
            entityId: col.id,
            startPoint: dStart,
            endPoint: dEnd,
            value: ch,
            orientation: dOrient,
            lane: 0,
            priority: 8,
            type: 'column_inward',
            classification: 'COLUMN_DEPTH',
            offsetDistance: dOffsetDist,
            labelPoint: { x: dLabelX, y: dLabelY },
            suffix: ' DEPTH',
          }));

        } else if (col.properties.columnType === 'free') {
          rawRequests.push(this.createDimensionItem({
            id: 'dim_free_col_w_' + col.id,
            entityId: col.id,
            startPoint: { x: cx - cw / 2, y: cy - ch / 2 },
            endPoint: { x: cx + cw / 2, y: cy - ch / 2 },
            value: cw,
            orientation: 'horizontal',
            lane: 0,
            priority: 8,
            type: 'column_width',
            classification: 'COLUMN_WIDTH',
            offsetDistance: -12,
            labelPoint: { x: cx, y: cy - ch / 2 - 14 },
            suffix: ' WIDTH',
          }));

          rawRequests.push(this.createDimensionItem({
            id: 'dim_free_col_d_' + col.id,
            entityId: col.id,
            startPoint: { x: cx + cw / 2, y: cy - ch / 2 },
            endPoint: { x: cx + cw / 2, y: cy + ch / 2 },
            value: ch,
            orientation: 'vertical',
            lane: 0,
            priority: 8,
            type: 'column_inward',
            classification: 'COLUMN_DEPTH',
            offsetDistance: 12,
            labelPoint: { x: cx + cw / 2 + 14, y: cy },
            suffix: ' DEPTH',
          }));

          const showFreeRef = isSelected || this.config.showTemporaryReferenceDimensions || overrideTempRefMode;
          if (showFreeRef && hasValidRoomBounds) {
            rawRequests.push(this.createDimensionItem({
              id: 'dim_free_ref_l_' + col.id,
              entityId: col.id,
              startPoint: { x: minX, y: cy },
              endPoint: { x: cx - cw / 2, y: cy },
              value: (cx - cw / 2) - minX,
              orientation: 'horizontal',
              lane: 1,
              priority: 3,
              type: 'segment',
              offsetDistance: 0,
              labelPoint: { x: (minX + cx - cw / 2) / 2, y: cy - 12 },
            }));
            rawRequests.push(this.createDimensionItem({
              id: 'dim_free_ref_r_' + col.id,
              entityId: col.id,
              startPoint: { x: cx + cw / 2, y: cy },
              endPoint: { x: maxX, y: cy },
              value: maxX - (cx + cw / 2),
              orientation: 'horizontal',
              lane: 1,
              priority: 3,
              type: 'segment',
              offsetDistance: 0,
              labelPoint: { x: ((cx + cw / 2) + maxX) / 2, y: cy - 12 },
            }));
            rawRequests.push(this.createDimensionItem({
              id: 'dim_free_ref_t_' + col.id,
              entityId: col.id,
              startPoint: { x: cx, y: minY },
              endPoint: { x: cx, y: cy - ch / 2 },
              value: (cy - ch / 2) - minY,
              orientation: 'vertical',
              lane: 1,
              priority: 3,
              type: 'segment',
              offsetDistance: 0,
              labelPoint: { x: cx + 12, y: (minY + cy - ch / 2) / 2 },
            }));
            rawRequests.push(this.createDimensionItem({
              id: 'dim_free_ref_b_' + col.id,
              entityId: col.id,
              startPoint: { x: cx, y: cy + ch / 2 },
              endPoint: { x: cx, y: maxY },
              value: maxY - (cy + ch / 2),
              orientation: 'vertical',
              lane: 1,
              priority: 3,
              type: 'segment',
              offsetDistance: 0,
              labelPoint: { x: cx + 12, y: ((cy + ch / 2) + maxY) / 2 },
            }));
          }
        }
      }
    }

    // ── 5. RACK DIMENSIONS ───────────────────────────────────────────────────
    // Suppressed: "Rack dimensions must not be displayed... Rack size dimensions should not be generated as architectural dimension objects."
    // Rack labels (drawn by CADRenderer) are sufficient.

    // ── 6. SMART AISLE DIMENSIONS (Center Racks) ───────────────────────────
    const centerRacks = racks.filter(r => {
      const isWallOrCorner =
        r.properties.rackType?.startsWith('wall_rack') ||
        r.properties.rackType === 'corner_rack_2x2x2' ||
        r.properties.rackType === 'Corner Rack' ||
        r.properties.rackType === 'Wall Rack' ||
        r.properties.rackType?.toLowerCase().includes('wall') ||
        (r.properties.productName && r.properties.productName.toLowerCase().includes('wall')) ||
        (r.properties.productName && r.properties.productName.toLowerCase().includes('corner')) ||
        Boolean(r.properties.attachedWallId);
      if (isWallOrCorner) return false;
      // If manual mode, do not process rotated racks with the AABB logic
      if (this.config.roomShapeMode === 'MANUAL') {
        const rot = Math.abs((r.geometry.rotation || 0) % 90);
        if (rot > 1 && rot < 89) return false;
      }
      return true;
    });
    
    // Group by X and Y to find rows and columns
    interface AABB { minX: number; maxX: number; minY: number; maxY: number; }
    const rowMap = new Map<number, AABB>(); // y -> AABB of row
    const colMap = new Map<number, AABB>(); // x -> AABB of col
    const TOL = 24; // 24 inches tolerance for grouping rows/cols

    for (const r of centerRacks) {
      const cx = r.geometry.x;
      const cy = r.geometry.y;
      const rotRad = ((r.geometry.rotation || 0) * Math.PI) / 180;
      const cos = Math.abs(Math.cos(rotRad));
      const sin = Math.abs(Math.sin(rotRad));
      const w = r.geometry.width || 36;
      const d = r.geometry.depth || 24;
      const finalW = w * cos + d * sin;
      const finalH = w * sin + d * cos;
      const box = { minX: cx - finalW / 2, maxX: cx + finalW / 2, minY: cy - finalH / 2, maxY: cy + finalH / 2 };

      // Group into rows
      let foundRow = false;
      for (const [ry, rBox] of rowMap.entries()) {
        if (Math.abs(ry - cy) < TOL) {
          rBox.minX = Math.min(rBox.minX, box.minX);
          rBox.maxX = Math.max(rBox.maxX, box.maxX);
          rBox.minY = Math.min(rBox.minY, box.minY);
          rBox.maxY = Math.max(rBox.maxY, box.maxY);
          foundRow = true;
          break;
        }
      }
      if (!foundRow) rowMap.set(cy, { ...box });

      // Group into cols
      let foundCol = false;
      for (const [rx, cBox] of colMap.entries()) {
        if (Math.abs(rx - cx) < TOL) {
          cBox.minX = Math.min(cBox.minX, box.minX);
          cBox.maxX = Math.max(cBox.maxX, box.maxX);
          cBox.minY = Math.min(cBox.minY, box.minY);
          cBox.maxY = Math.max(cBox.maxY, box.maxY);
          foundCol = true;
          break;
        }
      }
      if (!foundCol) colMap.set(cx, { ...box });
    }

    const rows = Array.from(rowMap.values()).sort((a, b) => (a.minY + a.maxY) / 2 - (b.minY + b.maxY) / 2);
    const cols = Array.from(colMap.values()).sort((a, b) => (a.minX + a.maxX) / 2 - (b.minX + b.maxX) / 2);

    // Generate aisle between rows (horizontal aisles)
    for (let i = 0; i < rows.length - 1; i++) {
      const topRow = rows[i];
      const botRow = rows[i + 1];
      const aisleTop = topRow.maxY;
      const aisleBot = botRow.minY;
      const width = aisleBot - aisleTop;
      
      if (width >= 36) { // 36" threshold for major aisles
        const overlapMin = Math.max(topRow.minX, botRow.minX);
        const overlapMax = Math.min(topRow.maxX, botRow.maxX);
        if (overlapMax > overlapMin) {
          const midX = (overlapMin + overlapMax) / 2;
          rawRequests.push(this.createDimensionItem({
            id: 'dim_aisle_row_' + i,
            startPoint: { x: midX, y: aisleTop },
            endPoint: { x: midX, y: aisleBot },
            value: width,
            orientation: 'vertical',
            lane: 0,
            priority: 4,
            type: 'aisle',
            classification: 'AISLE',
            offsetDistance: 24,
            labelPoint: { x: midX + 28, y: (aisleTop + aisleBot) / 2 },
            suffix: '\nAISLE',
          }));
        }
      }
    }

    // Generate aisle between cols (vertical aisles)
    for (let i = 0; i < cols.length - 1; i++) {
      const leftCol = cols[i];
      const rightCol = cols[i + 1];
      const aisleLeft = leftCol.maxX;
      const aisleRight = rightCol.minX;
      const width = aisleRight - aisleLeft;

      if (width >= 36) {
        const overlapMin = Math.max(leftCol.minY, rightCol.minY);
        const overlapMax = Math.min(leftCol.maxY, rightCol.maxY);
        if (overlapMax > overlapMin) {
          const midY = (overlapMin + overlapMax) / 2;
          rawRequests.push(this.createDimensionItem({
            id: 'dim_aisle_col_' + i,
            startPoint: { x: aisleLeft, y: midY },
            endPoint: { x: aisleRight, y: midY },
            value: width,
            orientation: 'horizontal',
            lane: 0,
            priority: 4,
            type: 'aisle',
            classification: 'AISLE',
            offsetDistance: 24,
            labelPoint: { x: (aisleLeft + aisleRight) / 2, y: midY - 20 },
            suffix: '\nAISLE',
          }));
        }
      }
    }

    // ── 7. REMAINING SPACE DIMENSIONS (GREEN) ──────────────────────────────
    const remainingDims = RemainingSpaceEngine.calculateRemainingSpace(walls, entities, roomPolygon);
    rawRequests.push(...remainingDims);

    // ── 8. ENFORCE OUTSIDE PLACEMENT (AUTO mode only) ──
    // In MANUAL mode, dimensions are placed strictly via exteriorNormal calculated from room polygon.
    // Bounding-box based flipping MUST NOT run in MANUAL mode to avoid flipping diagonal/slanted dims inside.
    if (hasValidRoomBounds && this.config.roomShapeMode === 'AUTO') {
      for (const req of rawRequests) {
        // Column dims, aisle dims, remaining-space dims stay inside
        if (
          req.type === 'column_inward' ||
          req.type === 'column_width' ||
          req.type === 'remaining_space' ||
          req.type === 'aisle'
        ) continue;

        const midX = (req.startPoint.x + req.endPoint.x) / 2;
        const midY = (req.startPoint.y + req.endPoint.y) / 2;

        const currentOffsetVec = { x: req.labelPoint.x - midX, y: req.labelPoint.y - midY };
        const flippedLabel = { x: midX - currentOffsetVec.x, y: midY - currentOffsetVec.y };

        const isInside = req.labelPoint.x > minX && req.labelPoint.x < maxX &&
                         req.labelPoint.y > minY && req.labelPoint.y < maxY;

        const distCurrent = Math.hypot(req.labelPoint.x - roomCX, req.labelPoint.y - roomCY);
        const distFlipped = Math.hypot(flippedLabel.x - roomCX, flippedLabel.y - roomCY);

        // If label is inside room, or if flipping takes it further from center, flip it
        if (isInside || distFlipped > distCurrent + 2) {
          req.offsetDistance = -req.offsetDistance;
          req.labelPoint = flippedLabel;

          const bw = req.boundingBox.maxX - req.boundingBox.minX;
          const bh = req.boundingBox.maxY - req.boundingBox.minY;
          req.boundingBox = {
            minX: flippedLabel.x - bw / 2,
            maxX: flippedLabel.x + bw / 2,
            minY: flippedLabel.y - bh / 2,
            maxY: flippedLabel.y + bh / 2,
          };
        }
      }
    }

    return this.solveDimensionCollisions(rawRequests, entities);
  }

  private createDimensionItem(params: {
    id: string;
    entityId?: string;
    startPoint: Point2D;
    endPoint: Point2D;
    value: number;
    orientation: 'horizontal' | 'vertical' | 'aligned' | 'inward';
    lane: number;
    priority: number;
    type: 'overall' | 'segment' | 'column_inward' | 'column_width' | 'door_width' | 'rack' | 'remaining_space' | 'aisle';
    classification?: DimensionClassification;
    offsetDistance: number;
    labelPoint: Point2D;
    suffix?: string;
  }): DimensionItem {
    let formatted = formatFeetInches(params.value);
    // Handle multi-line suffix (e.g. '\n(OVERALL WIDTH)') — store as-is in formattedValue
    if (params.suffix) formatted += params.suffix;
    const firstLine = formatted.split('\n')[0];
    const boxWidth = Math.max(firstLine.length * 7, 40);
    const boxHeight = params.suffix?.includes('\n') ? 26 : 14;

    const bBox: BoundingBox2D = {
      minX: params.labelPoint.x - boxWidth / 2,
      maxX: params.labelPoint.x + boxWidth / 2,
      minY: params.labelPoint.y - boxHeight / 2,
      maxY: params.labelPoint.y + boxHeight / 2,
    };

    return {
      id: params.id,
      entityId: params.entityId,
      startPoint: params.startPoint,
      endPoint: params.endPoint,
      value: params.value,
      formattedValue: formatted,
      orientation: params.orientation,
      lane: params.lane,
      priority: params.priority,
      boundingBox: bBox,
      offsetDistance: params.offsetDistance,
      type: params.type,
      classification: params.classification,
      labelPoint: params.labelPoint,
    };
  }

  private solveDimensionCollisions(items: DimensionItem[], _entities: CADEntity[]): DimensionItem[] {
    if (items.length <= 1) return items;

    // Filter out unclassified dimensions
    const classified = items.filter((d) => d.classification !== undefined);

    // Sort by priority descending (higher priority keeps original placement)
    const sorted = [...classified].sort((a, b) => b.priority - a.priority);

    // Iterative label relaxation without modifying underlying geometry
    const MAX_PASSES = 3;
    const PADDING = 4.0; // inches padding between label bounding boxes

    for (let pass = 0; pass < MAX_PASSES; pass++) {
      let anyCollision = false;

      for (let i = 0; i < sorted.length; i++) {
        const itemA = sorted[i];

        for (let j = i + 1; j < sorted.length; j++) {
          const itemB = sorted[j];

          // Check if bounding boxes overlap
          const overlapX =
            Math.min(itemA.boundingBox.maxX, itemB.boundingBox.maxX) -
            Math.max(itemA.boundingBox.minX, itemB.boundingBox.minX);
          const overlapY =
            Math.min(itemA.boundingBox.maxY, itemB.boundingBox.maxY) -
            Math.max(itemA.boundingBox.minY, itemB.boundingBox.minY);

          if (overlapX > -PADDING && overlapY > -PADDING) {
            anyCollision = true;

            // Shift lower-priority label (itemB) perpendicular to its dimension line
            const dx = itemB.endPoint.x - itemB.startPoint.x;
            const dy = itemB.endPoint.y - itemB.startPoint.y;
            const len = Math.hypot(dx, dy);

            let nx = 0;
            let ny = 1;
            if (len > 0.001) {
              // Perpendicular unit vector
              nx = -dy / len;
              ny = dx / len;
            }

            // Shift distance: clear the overlap plus padding
            const shiftDist = Math.max(14.0, (overlapY + PADDING) * 1.2);
            itemB.labelPoint = {
              x: itemB.labelPoint.x + nx * shiftDist,
              y: itemB.labelPoint.y + ny * shiftDist,
            };

            const boxW = itemB.boundingBox.maxX - itemB.boundingBox.minX;
            const boxH = itemB.boundingBox.maxY - itemB.boundingBox.minY;
            itemB.boundingBox = {
              minX: itemB.labelPoint.x - boxW / 2,
              maxX: itemB.labelPoint.x + boxW / 2,
              minY: itemB.labelPoint.y - boxH / 2,
              maxY: itemB.labelPoint.y + boxH / 2,
            };
          }
        }
      }

      if (!anyCollision) break;
    }

    return sorted;
  }

}
