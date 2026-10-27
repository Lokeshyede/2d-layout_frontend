import { CADEntity, DimensionItem, Point2D, BoundingBox2D } from '../types';
import { formatFeetInches } from '../geometry/FeetInches';
import { distance, midpoint, perpendicularVector } from '../geometry/GeometryMath';

export interface DimensionConfig {
  showOverallDimensions: boolean;
  showSegmentDimensions: boolean;
  showColumnInwardDimensions: boolean;
  showRackDimensions: boolean;
  showTemporaryReferenceDimensions: boolean;
  baseOffsetInches: number;
  laneSpacingInches: number;
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
      baseOffsetInches: 24,
      laneSpacingInches: 18,
      ...config,
    };
  }

  public setConfig(config: Partial<DimensionConfig>) {
    this.config = { ...this.config, ...config };
  }

  public generateDimensions(entities: CADEntity[], selectedEntityId: string | null, overrideTempRefMode = false, overrideRackDimMode = false): DimensionItem[] {
    const rawRequests: DimensionItem[] = [];

    const walls = entities.filter(e => e.type === 'wall');
    const columns = entities.filter(e => e.type === 'column');
    const racks = entities.filter(e => e.type === 'rack');
    const doors = entities.filter(e => e.type === 'door');
    const windows = entities.filter(e => e.type === 'window');
    const shutters = entities.filter(e => e.type === 'shutter');
    const gates = entities.filter(e => e.type === 'glass_gate');
    const partitions = entities.filter(e => e.type === 'partition');

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const w of walls) {
      minX = Math.min(minX, (w as any).geometry.x1, (w as any).geometry.x2);
      maxX = Math.max(maxX, (w as any).geometry.x1, (w as any).geometry.x2);
      minY = Math.min(minY, (w as any).geometry.y1, (w as any).geometry.y2);
      maxY = Math.max(maxY, (w as any).geometry.y1, (w as any).geometry.y2);
    }
    const hasValidRoomBounds = minX !== Infinity && maxX > minX && maxY > minY;

    // 1. Overall Dimensions
    if (this.config.showOverallDimensions && hasValidRoomBounds) {
      const overallWidth = maxX - minX;
      const overallHeight = maxY - minY;

      rawRequests.push(this.createDimensionItem({
        id: 'dim_overall_top_w',
        startPoint: { x: minX, y: minY },
        endPoint: { x: maxX, y: minY },
        value: overallWidth,
        orientation: 'horizontal',
        lane: 3,
        priority: 10,
        type: 'overall',
        offsetDistance: -(this.config.baseOffsetInches + this.config.laneSpacingInches * 2),
        labelPoint: { x: (minX + maxX) / 2, y: minY - (this.config.baseOffsetInches + this.config.laneSpacingInches * 2) },
      }));

      rawRequests.push(this.createDimensionItem({
        id: 'dim_overall_left_h',
        startPoint: { x: minX, y: minY },
        endPoint: { x: minX, y: maxY },
        value: overallHeight,
        orientation: 'vertical',
        lane: 3,
        priority: 10,
        type: 'overall',
        offsetDistance: -(this.config.baseOffsetInches + this.config.laneSpacingInches * 2),
        labelPoint: { x: minX - (this.config.baseOffsetInches + this.config.laneSpacingInches * 2), y: (minY + maxY) / 2 },
      }));
    }

    // 2. Wall Segment Chains (Segment + Object + Segment)
    if (this.config.showSegmentDimensions) {
      for (const w of walls) {
        const p1 = { x: (w as any).geometry.x1, y: (w as any).geometry.y1 };
        const p2 = { x: (w as any).geometry.x2, y: (w as any).geometry.y2 };
        const wallLen = distance(p1, p2);
        if (wallLen < 6) continue;

        const isHoriz = Math.abs(p1.y - p2.y) < 1;
        const isVert = Math.abs(p1.x - p2.x) < 1;
        const orient = isHoriz ? 'horizontal' : isVert ? 'vertical' : 'aligned';

        let offsetSign = 1;
        if (hasValidRoomBounds) {
          const mid = midpoint(p1, p2);
          const roomCenter = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
          if (isHoriz) {
            offsetSign = mid.y <= roomCenter.y ? -1 : 1;
          } else if (isVert) {
            offsetSign = mid.x <= roomCenter.x ? -1 : 1;
          }
        }
        
        const perp = perpendicularVector(p1, p2, this.config.baseOffsetInches * offsetSign);
        
        // Find attached objects
        const attached = [...doors, ...windows, ...shutters, ...gates, ...columns].filter(
          e => (e as any).properties?.attachedWallId === w.id
        );
        
        let cutPoints = [0, wallLen];
        for (const obj of attached) {
           const center = { x: (obj as any).geometry.x, y: (obj as any).geometry.y };
           // project center onto wall (distance from p1)
           let t = 0;
           if (isHoriz) t = Math.abs(center.x - p1.x);
           else if (isVert) t = Math.abs(center.y - p1.y);
           else {
             const dx = p2.x - p1.x; const dy = p2.y - p1.y;
             const len = Math.sqrt(dx*dx + dy*dy);
             t = ((center.x - p1.x)*dx + (center.y - p1.y)*dy) / len;
           }
           
           const ow = (obj as any).geometry.width || 24;
           cutPoints.push(Math.max(0, t - ow/2));
           cutPoints.push(Math.min(wallLen, t + ow/2));
        }
        
        cutPoints = [...new Set(cutPoints)].sort((a,b) => a - b);
        
        for (let i = 0; i < cutPoints.length - 1; i++) {
           const startT = cutPoints[i];
           const endT = cutPoints[i+1];
           const segLen = endT - startT;
           if (segLen < 1) continue; // skip tiny segments
           
           // interpolate points
           const ratio1 = startT / wallLen;
           const ratio2 = endT / wallLen;
           const sp = { x: p1.x + (p2.x - p1.x)*ratio1, y: p1.y + (p2.y - p1.y)*ratio1 };
           const ep = { x: p1.x + (p2.x - p1.x)*ratio2, y: p1.y + (p2.y - p1.y)*ratio2 };
           
           const mid = midpoint(sp, ep);
           const labelP = { x: mid.x + perp.x, y: mid.y + perp.y };
           
           rawRequests.push(this.createDimensionItem({
             id: `dim_seg_${w.id}_${i}`,
             entityId: w.id,
             startPoint: sp,
             endPoint: ep,
             value: segLen,
             orientation: orient,
             lane: 2,
             priority: 5,
             type: 'segment',
             offsetDistance: this.config.baseOffsetInches * offsetSign,
             labelPoint: labelP,
           }));
        }
      }
    }

    // 3. Object-Specific Dimensions (Widths)
    const objects = [...doors, ...windows, ...shutters, ...gates];
    for (const obj of objects) {
       const cw = (obj as any).geometry.width || 36;
       const cx = (obj as any).geometry.x;
       const cy = (obj as any).geometry.y;
       
       // Draw width dimension offset slightly from the object
       rawRequests.push(this.createDimensionItem({
         id: `dim_obj_w_${obj.id}`,
         entityId: obj.id,
         startPoint: { x: cx - cw / 2, y: cy },
         endPoint: { x: cx + cw / 2, y: cy },
         value: cw,
         orientation: 'horizontal',
         lane: 1,
         priority: 6,
         type: 'door_width',
         offsetDistance: 12,
         labelPoint: { x: cx, y: cy + 12 },
       }));
    }
    
    // Partitions
    for (const p of partitions) {
       const p1 = { x: (p as any).geometry.x1, y: (p as any).geometry.y1 };
       const p2 = { x: (p as any).geometry.x2, y: (p as any).geometry.y2 };
       const len = distance(p1, p2);
       const mid = midpoint(p1, p2);
       const isHoriz = Math.abs(p1.y - p2.y) < 1;
       const orient = isHoriz ? 'horizontal' : 'vertical';
       
       rawRequests.push(this.createDimensionItem({
         id: `dim_part_${p.id}`,
         entityId: p.id,
         startPoint: p1,
         endPoint: p2,
         value: len,
         orientation: orient,
         lane: 1,
         priority: 4,
         type: 'segment',
         offsetDistance: 12,
         labelPoint: { x: mid.x + (isHoriz ? 0 : 12), y: mid.y + (isHoriz ? 12 : 0) },
       }));
    }

    // Columns
    if (this.config.showColumnInwardDimensions) {
      for (const col of columns) {
        const cx = (col as any).geometry.x;
        const cy = (col as any).geometry.y;
        const cw = (col as any).geometry.width || 24;
        const ch = (col as any).geometry.height || 24;
        const inwardProj = (col as any).properties.inwardProjection || 24;
        const isSelected = col.id === selectedEntityId;

        if ((col as any).properties.columnType === 'wall') {
           rawRequests.push(this.createDimensionItem({
             id: `dim_col_w_${col.id}`,
             entityId: col.id,
             startPoint: { x: cx - cw / 2, y: cy },
             endPoint: { x: cx + cw / 2, y: cy },
             value: cw,
             orientation: 'horizontal',
             lane: 0,
             priority: 8,
             type: 'column_width',
             offsetDistance: - (ch / 2 + 10),
             labelPoint: { x: cx, y: cy - ch / 2 - 12 },
           }));
           
           rawRequests.push(this.createDimensionItem({
             id: `dim_col_proj_${col.id}`,
             entityId: col.id,
             startPoint: { x: cx, y: cy - inwardProj / 2 },
             endPoint: { x: cx, y: cy + inwardProj / 2 },
             value: inwardProj,
             orientation: 'inward',
             lane: 1,
             priority: 8,
             type: 'column_inward',
             offsetDistance: cw / 2 + 10,
             labelPoint: { x: cx + cw / 2 + 12, y: cy },
           }));
        } else if ((col as any).properties.columnType === 'free') {
           rawRequests.push(this.createDimensionItem({
             id: `dim_free_col_w_${col.id}`,
             entityId: col.id,
             startPoint: { x: cx - cw / 2, y: cy - ch / 2 },
             endPoint: { x: cx + cw / 2, y: cy - ch / 2 },
             value: cw,
             orientation: 'horizontal',
             lane: 0,
             priority: 8,
             type: 'column_width',
             offsetDistance: -10,
             labelPoint: { x: cx, y: cy - ch / 2 - 12 },
           }));
           
           rawRequests.push(this.createDimensionItem({
             id: `dim_free_col_d_${col.id}`,
             entityId: col.id,
             startPoint: { x: cx + cw / 2, y: cy - ch / 2 },
             endPoint: { x: cx + cw / 2, y: cy + ch / 2 },
             value: ch,
             orientation: 'vertical',
             lane: 0,
             priority: 8,
             type: 'column_inward',
             offsetDistance: 10,
             labelPoint: { x: cx + cw / 2 + 12, y: cy },
           }));

           const showFreeRef = isSelected || this.config.showTemporaryReferenceDimensions || overrideTempRefMode;
           if (showFreeRef && hasValidRoomBounds) {
             rawRequests.push(this.createDimensionItem({
               id: `dim_free_ref_l_${col.id}`,
               entityId: col.id,
               startPoint: { x: minX, y: cy },
               endPoint: { x: cx - cw / 2, y: cy },
               value: (cx - cw / 2) - minX,
               orientation: 'horizontal',
               lane: 1,
               priority: 3,
               type: 'segment',
               offsetDistance: 0,
               labelPoint: { x: (minX + cx - cw / 2) / 2, y: cy - 10 },
             }));
             rawRequests.push(this.createDimensionItem({
               id: `dim_free_ref_r_${col.id}`,
               entityId: col.id,
               startPoint: { x: cx + cw / 2, y: cy },
               endPoint: { x: maxX, y: cy },
               value: maxX - (cx + cw / 2),
               orientation: 'horizontal',
               lane: 1,
               priority: 3,
               type: 'segment',
               offsetDistance: 0,
               labelPoint: { x: ((cx + cw / 2) + maxX) / 2, y: cy - 10 },
             }));
             rawRequests.push(this.createDimensionItem({
               id: `dim_free_ref_t_${col.id}`,
               entityId: col.id,
               startPoint: { x: cx, y: minY },
               endPoint: { x: cx, y: cy - ch / 2 },
               value: (cy - ch / 2) - minY,
               orientation: 'vertical',
               lane: 1,
               priority: 3,
               type: 'segment',
               offsetDistance: 0,
               labelPoint: { x: cx + 10, y: (minY + cy - ch / 2) / 2 },
             }));
             rawRequests.push(this.createDimensionItem({
               id: `dim_free_ref_b_${col.id}`,
               entityId: col.id,
               startPoint: { x: cx, y: cy + ch / 2 },
               endPoint: { x: cx, y: maxY },
               value: maxY - (cy + ch / 2),
               orientation: 'vertical',
               lane: 1,
               priority: 3,
               type: 'segment',
               offsetDistance: 0,
               labelPoint: { x: cx + 10, y: ((cy + ch / 2) + maxY) / 2 },
             }));
           }
        }
      }
    }

    const showRackDims = this.config.showRackDimensions || overrideRackDimMode;
    for (const rack of racks) {
      const isSelected = rack.id === selectedEntityId;
      if (showRackDims || isSelected) {
        const rx = (rack as any).geometry.x;
        const ry = (rack as any).geometry.y;
        const rw = (rack as any).geometry.width || 36;
        const rd = (rack as any).geometry.depth || 18;

        rawRequests.push(this.createDimensionItem({
          id: `dim_rack_w_${rack.id}`,
          entityId: rack.id,
          startPoint: { x: rx - rw / 2, y: ry - rd / 2 },
          endPoint: { x: rx + rw / 2, y: ry - rd / 2 },
          value: rw,
          orientation: 'horizontal',
          lane: 0,
          priority: 2,
          type: 'rack',
          offsetDistance: -12,
          labelPoint: { x: rx, y: ry - rd / 2 - 12 },
        }));
        
        rawRequests.push(this.createDimensionItem({
          id: `dim_rack_d_${rack.id}`,
          entityId: rack.id,
          startPoint: { x: rx - rw / 2, y: ry - rd / 2 },
          endPoint: { x: rx - rw / 2, y: ry + rd / 2 },
          value: rd,
          orientation: 'vertical',
          lane: 0,
          priority: 2,
          type: 'rack',
          offsetDistance: -12,
          labelPoint: { x: rx - rw / 2 - 12, y: ry },
        }));
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
    type: 'overall' | 'segment' | 'column_inward' | 'column_width' | 'door_width' | 'rack';
    offsetDistance: number;
    labelPoint: Point2D;
  }): DimensionItem {
    const formatted = formatFeetInches(params.value);
    const boxWidth = Math.max(formatted.length * 7, 24);
    const boxHeight = 14;

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
      labelPoint: params.labelPoint,
    };
  }

  private solveDimensionCollisions(items: DimensionItem[], entities: CADEntity[]): DimensionItem[] {
    const sorted = [...items].sort((a, b) => b.priority - a.priority);
    const resolved: DimensionItem[] = [];

    const entityBoxes: BoundingBox2D[] = [];
    for (const ent of entities) {
      if (ent.type === 'wall' || ent.type === 'partition') {
        const thickness = (ent as any).properties?.thickness || 4;
        const minX = Math.min((ent as any).geometry.x1, (ent as any).geometry.x2) - thickness / 2;
        const maxX = Math.max((ent as any).geometry.x1, (ent as any).geometry.x2) + thickness / 2;
        const minY = Math.min((ent as any).geometry.y1, (ent as any).geometry.y2) - thickness / 2;
        const maxY = Math.max((ent as any).geometry.y1, (ent as any).geometry.y2) + thickness / 2;
        entityBoxes.push({ minX, maxX, minY, maxY });
      } else if (
        ent.type === 'column' || ent.type === 'door' || ent.type === 'window' ||
        ent.type === 'rack' || ent.type === 'shutter' || ent.type === 'glass_gate' || ent.type === 'text'
      ) {
        const geom = (ent as any).geometry;
        const w = geom.width || 24;
        const h = geom.height || geom.depth || 24;
        entityBoxes.push({
          minX: geom.x - w / 2, maxX: geom.x + w / 2,
          minY: geom.y - h / 2, maxY: geom.y + h / 2,
        });
      }
    }

    for (const item of sorted) {
      let currentItem = { ...item };
      let collisionDetected = true;
      let attempts = 0;

      while (collisionDetected && attempts < 8) {
        collisionDetected = false;
        
        for (const existing of resolved) {
          if (this.doBoundingBoxesOverlap(currentItem.boundingBox, existing.boundingBox, 4)) {
            collisionDetected = true;
            break;
          }
        }

        if (!collisionDetected) {
          for (const box of entityBoxes) {
            if (this.doBoundingBoxesOverlap(currentItem.boundingBox, box, 4)) {
              collisionDetected = true;
              break;
            }
          }
        }

        if (collisionDetected) {
            currentItem.lane += 1;
            const shiftOffset = this.config.laneSpacingInches;
            const dir = currentItem.offsetDistance < 0 ? -1 : 1;
            currentItem.offsetDistance += shiftOffset * dir;

            if (currentItem.orientation === 'horizontal') {
              currentItem.labelPoint = {
                x: currentItem.labelPoint.x,
                y: currentItem.labelPoint.y + shiftOffset * dir,
              };
            } else if (currentItem.orientation === 'vertical') {
              currentItem.labelPoint = {
                x: currentItem.labelPoint.x + shiftOffset * dir,
                y: currentItem.labelPoint.y,
              };
            } else if (currentItem.orientation === 'inward' || currentItem.orientation === 'aligned') {
               currentItem.labelPoint = {
                 x: currentItem.labelPoint.x,
                 y: currentItem.labelPoint.y + shiftOffset * dir,
               };
            }
            
            const bw = currentItem.boundingBox.maxX - currentItem.boundingBox.minX;
            const bh = currentItem.boundingBox.maxY - currentItem.boundingBox.minY;
            currentItem.boundingBox = {
              minX: currentItem.labelPoint.x - bw/2,
              maxX: currentItem.labelPoint.x + bw/2,
              minY: currentItem.labelPoint.y - bh/2,
              maxY: currentItem.labelPoint.y + bh/2,
            };
        }
        attempts++;
      }
      resolved.push(currentItem);
    }

    return resolved;
  }

  private doBoundingBoxesOverlap(b1: BoundingBox2D, b2: BoundingBox2D, padding = 0): boolean {
    return !(
      b1.maxX + padding < b2.minX ||
      b1.minX - padding > b2.maxX ||
      b1.maxY + padding < b2.minY ||
      b1.minY - padding > b2.maxY
    );
  }
}
