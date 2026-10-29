import type { CADEntity, DimensionItem, Point2D, SnapResult, ToolType, WallEntity, PartitionEntity, ColumnEntity, DoorEntity, WindowEntity, ShutterEntity, GateEntity, GlassGateEntity, RackEntity, TextEntity } from '../types';

// Measure annotation type (mirrored from CADEditor for renderer use)
interface MeasureAnnotation {
  id: string;
  p1: Point2D;
  p2: Point2D;
  distInches: number;
  label: string;
}
import { Viewport } from '../engine/Viewport';
import {
  distance,
  perpendicularVector,
  degreesToRadians,
  buildRoomPolygon,
  calculateWallInwardNormal,
  isPointInPolygon,
  isPolygonInsidePolygon
} from '../geometry/GeometryMath';
import { formatFeetInches, formatCustomRackLabel } from '../geometry/FeetInches';
import type { WallPlacementCalculationResult } from '../engine/WallPlacementEngine';
import { CenterGondolaEngine, type GondolaRun } from '../engine/CenterGondolaEngine';
import { CornerRackEngine } from '../engine/CornerRackEngine';
export class CADRenderer {
  private ctx: CanvasRenderingContext2D;
  private viewport: Viewport;

  constructor(ctx: CanvasRenderingContext2D, viewport: Viewport) {
    this.ctx = ctx;
    this.viewport = viewport;
  }

  public render(params: {
    entities: CADEntity[];
    dimensions: DimensionItem[];
    selectedEntityId?: string | null;
    /** Multi-select IDs (distinct teal outline, no geometry change) */
    selectedEntityIds?: Set<string>;
    activeTool: ToolType;
    previewPoints?: Point2D[];
    snapResult?: SnapResult | null;
    cursorWorldPos?: Point2D | null;
    showGrid?: boolean;
    showDimensions?: boolean;
    /** AI Planner preview racks — drawn with distinct dashed/transparent style, not committed */
    aiPreviewRacks?: RackEntity[];
    /** AI Planner remaining-space dimensions — drawn in violet, not committed */
    aiPreviewDimensions?: DimensionItem[];
    /** Real-time wall-based tool placement live preview */
    wallToolPreview?: WallPlacementCalculationResult | null;
    /** Visual Debug Mode overlay */
    showDebugOverlay?: boolean;
    /** Drag-selection rubber-band rectangle in screen coordinates */
    dragSelectionRect?: { x: number; y: number; w: number; h: number } | null;
    /** Persistent measure tool annotations — drawn in world-space, stable during pan/zoom */
    measureAnnotations?: MeasureAnnotation[];
    /** Interactive Rack Placement preview */
    rackPlacementPreview?: {
      x: number;
      y: number;
      width: number;
      depth: number;
      height: number;
      rotation: number;
      rackType?: string;
      productName?: string;
      isSnapped?: boolean;
      snapType?: string;
    } | null;
  }) {
    const { ctx, viewport } = this;
    const { width, height, dpr } = viewport;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width * dpr, height * dpr);

    ctx.scale(dpr, dpr);

    if (params.showGrid !== false) {
      this.drawGrid();
    }

    let roomPoly: Point2D[] = [];
    const walls = params.entities.filter((e): e is WallEntity => e.type === 'wall');
    if (walls.length >= 3) {
      roomPoly = buildRoomPolygon(walls);
    }

    const runs = CenterGondolaEngine.detectRuns(params.entities);

    for (const ent of params.entities) {
      const isSelected = ent.id === params.selectedEntityId;
      const isMultiSelected = !isSelected && (params.selectedEntityIds?.has(ent.id) ?? false);
      switch (ent.type) {
        case 'wall':
          this.drawWall(ent as WallEntity, isSelected);
          break;
        case 'partition':
          this.drawPartition(ent as PartitionEntity, isSelected);
          break;
        case 'column':
          this.drawColumn(ent as ColumnEntity, isSelected, params.entities);
          break;
        case 'door':
          this.drawDoor(ent as DoorEntity, isSelected);
          break;
        case 'window':
          this.drawWindow(ent as WindowEntity, isSelected);
          break;
        case 'shutter':
          this.drawShutter(ent as ShutterEntity, isSelected);
          break;
        case 'gate':
          this.drawGate(ent as GateEntity, isSelected);
          break;
        case 'glass_gate':
          this.drawGlassGate(ent as GlassGateEntity, isSelected);
          break;
        case 'rack':
          this.drawRack(ent as RackEntity, isSelected || isMultiSelected, params.entities, roomPoly, runs, isMultiSelected);
          break;
        case 'text':
          this.drawText(ent as TextEntity, isSelected);
          break;
      }
    }

    // Draw drag-selection rubber-band rectangle
    if (params.dragSelectionRect) {
      const { ctx } = this;
      const r = params.dragSelectionRect;
      ctx.save();
      ctx.strokeStyle = 'rgba(99, 102, 241, 0.9)'; // indigo
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 3]);
      ctx.fillStyle = 'rgba(99, 102, 241, 0.08)';
      ctx.beginPath();
      ctx.rect(r.x, r.y, r.w, r.h);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    if (params.showDimensions !== false) {
      for (const dim of params.dimensions) {
        this.drawDimension(dim, roomPoly);
      }
    }

    // AI Planner preview racks — drawn after committed entities, visually distinct
    if (params.aiPreviewRacks && params.aiPreviewRacks.length > 0) {
      this.drawAIPreviewRacks(params.aiPreviewRacks, params.entities, roomPoly);
    }

    // AI Planner remaining-space dimensions — drawn in violet
    if (params.aiPreviewDimensions && params.aiPreviewDimensions.length > 0) {
      this.drawAIDimensions(params.aiPreviewDimensions);
    }

    if (params.previewPoints && params.previewPoints.length > 0) {
      this.drawToolPreview(params.activeTool, params.previewPoints, params.cursorWorldPos);
    }

    // Persistent measure annotations — drawn in world-space after tool preview so they are always on top
    if (params.measureAnnotations && params.measureAnnotations.length > 0) {
      this.drawMeasureAnnotations(params.measureAnnotations);
    }

    if (params.snapResult) {
      this.drawSnapIndicator(params.snapResult);
    }

    // Real-time wall tool placement live preview
    if (params.wallToolPreview) {
      this.drawWallToolPreview(params.wallToolPreview);
    }

    // Real-time interactive rack placement live preview
    if (params.rackPlacementPreview) {
      this.drawRackPlacementPreview(params.rackPlacementPreview);
    }

    // Visual Debug Mode overlay
    if (params.showDebugOverlay) {
      this.drawVisualDebugOverlay(params.entities, roomPoly);
    }
  }

  private drawGrid() {
    const { ctx, viewport } = this;
    const { zoom, panX, panY, width, height } = viewport;

    const majorGridInches = 12;
    const majorGridPixels = majorGridInches * zoom;

    if (majorGridPixels < 6) return;

    ctx.save();

    const startWorldX = -panX / zoom;
    const startWorldY = -panY / zoom;
    const endWorldX = (width - panX) / zoom;
    const endWorldY = (height - panY) / zoom;

    const firstGridX = Math.floor(startWorldX / majorGridInches) * majorGridInches;
    const firstGridY = Math.floor(startWorldY / majorGridInches) * majorGridInches;

    if (majorGridPixels >= 40) {
      const subGrid = 3;
      ctx.strokeStyle = '#f1f5f9';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      for (let x = firstGridX; x <= endWorldX; x += subGrid) {
        const sx = x * zoom + panX;
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx, height);
      }
      for (let y = firstGridY; y <= endWorldY; y += subGrid) {
        const sy = y * zoom + panY;
        ctx.moveTo(0, sy);
        ctx.lineTo(width, sy);
      }
      ctx.stroke();
    }

    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = firstGridX; x <= endWorldX; x += majorGridInches) {
      const sx = x * zoom + panX;
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, height);
    }
    for (let y = firstGridY; y <= endWorldY; y += majorGridInches) {
      const sy = y * zoom + panY;
      ctx.moveTo(0, sy);
      ctx.lineTo(width, sy);
    }
    ctx.stroke();

    const originX = panX;
    const originY = panY;

    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.strokeStyle = '#f87171';
    ctx.moveTo(originX, originY);
    ctx.lineTo(originX + 60, originY);
    ctx.stroke();

    ctx.beginPath();
    ctx.strokeStyle = '#1e293b';
    ctx.moveTo(originX, originY);
    ctx.lineTo(originX, originY + 60);
    ctx.stroke();

    ctx.fillStyle = '#64748b';
    ctx.font = '9px JetBrains Mono, monospace';
    ctx.fillText('(0,0)', originX + 5, originY - 5);

    ctx.restore();
  }

  private drawWall(wall: WallEntity, isSelected: boolean) {
    const { ctx, viewport } = this;
    const p1 = viewport.worldToScreen({ x: wall.geometry.x1, y: wall.geometry.y1 });
    const p2 = viewport.worldToScreen({ x: wall.geometry.x2, y: wall.geometry.y2 });
    const thickness = (wall.properties.thickness || 9) * viewport.zoom;

    ctx.save();
    ctx.lineCap = 'square';
    ctx.lineJoin = 'miter';

    if (isSelected) {
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = Math.max(thickness + 6, 8);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }

    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = Math.max(thickness, 2.5);
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();

    if (thickness > 6) {
      const perp = perpendicularVector(p1, p2, thickness / 2);
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 1.2;

      ctx.beginPath();
      ctx.moveTo(p1.x + perp.x, p1.y + perp.y);
      ctx.lineTo(p2.x + perp.x, p2.y + perp.y);
      ctx.moveTo(p1.x - perp.x, p1.y - perp.y);
      ctx.lineTo(p2.x - perp.x, p2.y - perp.y);
      ctx.stroke();
    }

    ctx.restore();
  }

  private drawPartition(part: PartitionEntity, isSelected: boolean) {
    const { ctx, viewport } = this;
    const p1 = viewport.worldToScreen({ x: part.geometry.x1, y: part.geometry.y1 });
    const p2 = viewport.worldToScreen({ x: part.geometry.x2, y: part.geometry.y2 });
    const thickness = (part.properties.thickness || 4) * viewport.zoom;

    ctx.save();
    if (isSelected) {
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = thickness + 4;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }

    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = Math.max(thickness, 2);
    ctx.setLineDash([8, 4]);
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
    ctx.restore();
  }

  private drawColumn(col: ColumnEntity, isSelected: boolean, entities: CADEntity[]) {
    if (col.properties.columnType === 'free') {
      this.drawFreeColumn(col, isSelected);
    } else {
      this.drawWallColumn(col, isSelected, entities);
    }
  }

  private drawFreeColumn(col: ColumnEntity, isSelected: boolean) {
    const { ctx, viewport } = this;
    const center = viewport.worldToScreen({ x: col.geometry.x, y: col.geometry.y });
    const cw = (col.geometry.width || 24) * viewport.zoom;
    const ch = (col.geometry.height || 24) * viewport.zoom;
    const rot = degreesToRadians(col.geometry.rotation || 0);

    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.rotate(rot);
    
    // Draw relative to translated origin (0,0)
    const x = -cw / 2;
    const y = -ch / 2;

    if (isSelected) {
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 3;
      ctx.strokeRect(x - 3, y - 3, cw + 6, ch + 6);
    }

    ctx.fillStyle = '#94a3b8'; // Lighter gray for free column
    ctx.fillRect(x, y, cw, ch);

    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, cw, ch);
    if (cw >= 20) {
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('COL', 0, 0);
    }

    ctx.restore();
  }

  private drawWallColumn(col: ColumnEntity, isSelected: boolean, entities: CADEntity[]) {
    const { ctx, viewport } = this;
    const wall = entities.find(e => e.id === col.properties.attachedWallId) as WallEntity | undefined;
    
    // Default rotation is from the wall tangent
    let defaultRot = 0;
    if (wall) {
      const p1 = { x: wall.geometry.x1, y: wall.geometry.y1 };
      const p2 = { x: wall.geometry.x2, y: wall.geometry.y2 };
      defaultRot = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    }
    
    // If the column has an explicit rotation, use it, otherwise use the wall's rotation
    const rot = col.geometry.rotation !== undefined ? degreesToRadians(col.geometry.rotation) : defaultRot;
    
    const center = viewport.worldToScreen({ x: col.geometry.x, y: col.geometry.y });
    const cw = (col.geometry.width || 24) * viewport.zoom;
    const cDepth = (col.geometry.height || 24) * viewport.zoom;
    
    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.rotate(rot);
    
    const startY = -cDepth / 2;
    
    if (isSelected) {
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 3;
      ctx.strokeRect(-cw/2 - 3, startY - 3, cw + 6, cDepth + 6);
    }

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(-cw/2, startY, cw, cDepth);

    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    ctx.strokeRect(-cw/2, startY, cw, cDepth);

    ctx.strokeStyle = '#475569';
    ctx.beginPath();
    ctx.moveTo(-cw/2, startY);
    ctx.lineTo(cw/2, startY + cDepth);
    ctx.moveTo(cw/2, startY);
    ctx.lineTo(-cw/2, startY + cDepth);
    ctx.stroke();

    if (cw >= 20) {
      // Label is centered in the column body.
      // We are already in the column's local (rotated) coordinate space,
      // so simply reset rotation to draw text upright.
      ctx.save();
      ctx.rotate(-rot);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // Center of column body in the rotated frame is (0, startY + cDepth/2)
      // After counter-rotating, we project back to screen-aligned coords.
      const bodyCenterRot = { x: 0, y: startY + cDepth / 2 };
      const screenX = bodyCenterRot.x * Math.cos(-rot) - bodyCenterRot.y * Math.sin(-rot);
      const screenY = bodyCenterRot.x * Math.sin(-rot) + bodyCenterRot.y * Math.cos(-rot);
      ctx.fillText('W-COL', screenX, screenY);
      ctx.restore();
    }

    ctx.restore();
  }

  private drawDoor(door: DoorEntity, isSelected: boolean) {
    const { ctx, viewport } = this;
    const center = viewport.worldToScreen({ x: door.geometry.x, y: door.geometry.y });
    const dw = (door.geometry.width || 36) * viewport.zoom;
    const rot = degreesToRadians(door.geometry.rotation || 0);

    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.rotate(rot);

    if (isSelected) {
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 2;
      ctx.strokeRect(-dw / 2 - 4, -dw - 4, dw + 8, dw + 8);
    }

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-dw / 2, -4, dw, 8);

    ctx.fillStyle = '#b91c1c';
    ctx.fillRect(-dw / 2 - 2, -4, 4, 8);
    ctx.fillRect(dw / 2 - 2, -4, 4, 8);

    ctx.strokeStyle = '#dc2626';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-dw / 2, 0);
    ctx.lineTo(-dw / 2, -dw);
    ctx.stroke();

    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([4, 2]);
    ctx.beginPath();
    ctx.arc(-dw / 2, 0, dw, -Math.PI / 2, 0);
    ctx.stroke();

    ctx.restore();
  }

  private drawWindow(win: WindowEntity, isSelected: boolean) {
    const { ctx, viewport } = this;
    const center = viewport.worldToScreen({ x: win.geometry.x, y: win.geometry.y });
    const ww = (win.geometry.width || 48) * viewport.zoom;
    const rot = degreesToRadians(win.geometry.rotation || 0);

    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.rotate(rot);

    if (isSelected) {
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 2;
      ctx.strokeRect(-ww / 2 - 4, -8, ww + 8, 16);
    }

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-ww / 2, -4, ww, 8);

    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-ww / 2, -3);
    ctx.lineTo(ww / 2, -3);
    ctx.moveTo(-ww / 2, 0);
    ctx.lineTo(ww / 2, 0);
    ctx.moveTo(-ww / 2, 3);
    ctx.lineTo(ww / 2, 3);
    ctx.stroke();

    ctx.fillStyle = '#0369a1';
    ctx.fillRect(-ww / 2 - 2, -5, 4, 10);
    ctx.fillRect(ww / 2 - 2, -5, 4, 10);

    ctx.restore();
  }

  private drawShutter(shutter: ShutterEntity, isSelected: boolean) {
    const { ctx, viewport } = this;
    const center = viewport.worldToScreen({ x: shutter.geometry.x, y: shutter.geometry.y });
    const sw = (shutter.geometry.width || 96) * viewport.zoom;
    const rot = degreesToRadians(shutter.geometry.rotation || 0);

    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.rotate(rot);

    if (isSelected) {
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 2;
      ctx.strokeRect(-sw / 2 - 4, -8, sw + 8, 16);
    }

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-sw / 2, -5, sw, 10);

    ctx.strokeStyle = '#b91c1c';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const step = 6;
    let up = true;
    for (let x = -sw / 2; x <= sw / 2; x += step) {
      ctx.lineTo(x, up ? -3 : 3);
      up = !up;
    }
    ctx.stroke();

    ctx.fillStyle = '#7f1d1d';
    ctx.font = 'bold 8px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SHUTTER', 0, -8);

    ctx.restore();
  }

  private drawGlassGate(gate: GlassGateEntity, isSelected: boolean) {
    const { ctx, viewport } = this;
    const center = viewport.worldToScreen({ x: gate.geometry.x, y: gate.geometry.y });
    const gw = (gate.geometry.width || 72) * viewport.zoom;

    ctx.save();
    ctx.translate(center.x, center.y);

    if (isSelected) {
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 2;
      ctx.strokeRect(-gw / 2 - 4, -10, gw + 8, 20);
    }

    ctx.fillStyle = '#e0f2fe';
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 1.5;
    ctx.fillRect(-gw / 2, -6, gw, 12);
    ctx.strokeRect(-gw / 2, -6, gw, 12);

    ctx.fillStyle = '#0369a1';
    ctx.font = 'bold 8px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('GLASS GATE', 0, 3);

    ctx.restore();
  }

  private drawGate(gate: GateEntity, isSelected: boolean) {
    const { ctx, viewport } = this;
    const center = viewport.worldToScreen({ x: gate.geometry.x, y: gate.geometry.y });
    const gw = (gate.geometry.width || 48) * viewport.zoom;
    const rot = degreesToRadians(gate.geometry.rotation || 0);

    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.rotate(rot);

    if (isSelected) {
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 2;
      ctx.strokeRect(-gw / 2 - 4, -10, gw + 8, 20);
    }

    // Outer dark structural steel frame
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.5;
    ctx.fillRect(-gw / 2, -6, gw, 12);
    ctx.strokeRect(-gw / 2, -6, gw, 12);

    // Vertical security grille bars
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.2;
    const barStep = 8 * viewport.zoom;
    ctx.beginPath();
    for (let x = -gw / 2 + 5; x <= gw / 2 - 5; x += barStep) {
      ctx.moveTo(x, -6);
      ctx.lineTo(x, 6);
    }
    ctx.stroke();

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 8px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('GATE', 0, 3);

    ctx.restore();
  }

  public drawRackPlacementPreview(preview: {
    x: number;
    y: number;
    width: number;
    depth: number;
    height: number;
    rotation: number;
    rackType?: string;
    productName?: string;
    isSnapped?: boolean;
    snapType?: string;
  }) {
    const { ctx, viewport } = this;
    const { x, y, width, depth, rotation, productName, isSnapped, snapType } = preview;

    ctx.save();
    const centerScreen = viewport.worldToScreen({ x, y });
    const rad = ((rotation || 0) * Math.PI) / 180;
    const rw = width * viewport.zoom;
    const rd = depth * viewport.zoom;

    ctx.translate(centerScreen.x, centerScreen.y);
    ctx.rotate(rad);

    // Glow shadow
    ctx.shadowColor = isSnapped ? 'rgba(16, 185, 129, 0.4)' : 'rgba(220, 38, 38, 0.35)';
    ctx.shadowBlur = 8;

    // Semi-transparent Fill
    ctx.fillStyle = isSnapped ? 'rgba(16, 185, 129, 0.18)' : 'rgba(220, 38, 38, 0.2)';
    ctx.fillRect(-rw / 2, -rd / 2, rw, rd);

    // Dashed Outline
    ctx.strokeStyle = isSnapped ? '#10b981' : '#dc2626';
    ctx.lineWidth = Math.max(1.5, 2);
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(-rw / 2, -rd / 2, rw, rd);
    ctx.setLineDash([]);

    // Front face shelf indicator (bold line along +Y or front edge)
    ctx.strokeStyle = isSnapped ? '#34d399' : '#f87171';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-rw / 2, rd / 2);
    ctx.lineTo(rw / 2, rd / 2);
    ctx.stroke();

    // Center crosshair
    ctx.strokeStyle = isSnapped ? 'rgba(52, 211, 153, 0.7)' : 'rgba(248, 113, 113, 0.7)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-6, 0); ctx.lineTo(6, 0);
    ctx.moveTo(0, -6); ctx.lineTo(0, 6);
    ctx.stroke();

    // Info Badge
    ctx.shadowBlur = 0;
    ctx.font = 'bold 11px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const label = productName || 'Rack';
    const dimText = `${formatFeetInches(width)} × ${formatFeetInches(depth)}`;

    const badgeW = Math.max(Math.min(rw * 0.95, 160), 90);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.beginPath();
    ctx.roundRect(-badgeW / 2, -15, badgeW, 30, 6);
    ctx.fill();
    ctx.strokeStyle = isSnapped ? '#10b981' : '#475569';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, 0, -5);
    ctx.fillStyle = isSnapped ? '#34d399' : '#cbd5e1';
    ctx.font = '9px JetBrains Mono, monospace';
    ctx.fillText(isSnapped ? `[${snapType || 'SNAP'}] ${dimText}` : dimText, 0, 7);

    ctx.restore();
  }

  private drawWallToolPreview(preview: WallPlacementCalculationResult) {
    const { ctx, viewport } = this;
    const { metrics, centerPoint, startPoint, endPoint, rotation, extents, isValid, wallPlacement } = preview;

    ctx.save();

    // 1. Highlight target wall with subtle glowing border
    const wp1 = viewport.worldToScreen(metrics.start);
    const wp2 = viewport.worldToScreen(metrics.end);
    ctx.strokeStyle = isValid ? '#06b6d4' : '#ef4444';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.moveTo(wp1.x, wp1.y);
    ctx.lineTo(wp2.x, wp2.y);
    ctx.stroke();
    ctx.globalAlpha = 1.0;

    // 2. Draw candidate entity footprint
    if (preview.wallPlacement.depthInches && preview.inwardNormal) {
      // Wall Rack / Inward-projecting entity:
      // anchor is centerPoint on the wall face.
      // Width spans ±rw/2 along wall direction (metrics.direction).
      // Depth extends 0 -> rd along inwardNormal into the room.
      const rw = wallPlacement.widthInches;
      const rd = wallPlacement.depthInches || 24;
      const dir = metrics.direction;
      const norm = preview.inwardNormal;

      const toWorld = (along: number, depth: number) => ({
        x: centerPoint.x + dir.x * along + norm.x * depth,
        y: centerPoint.y + dir.y * along + norm.y * depth,
      });

      const sTL = viewport.worldToScreen(toWorld(-rw / 2, 0));
      const sTR = viewport.worldToScreen(toWorld(rw / 2, 0));
      const sBR = viewport.worldToScreen(toWorld(rw / 2, rd));
      const sBL = viewport.worldToScreen(toWorld(-rw / 2, rd));

      ctx.save();
      ctx.fillStyle = isValid ? 'rgba(6, 182, 212, 0.25)' : 'rgba(239, 68, 68, 0.25)';
      ctx.strokeStyle = isValid ? '#0891b2' : '#dc2626';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);

      ctx.beginPath();
      ctx.moveTo(sTL.x, sTL.y);
      ctx.lineTo(sTR.x, sTR.y);
      ctx.lineTo(sBR.x, sBR.y);
      ctx.lineTo(sBL.x, sBL.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Label at center of rack footprint
      const sCenter = viewport.worldToScreen(toWorld(0, rd / 2));
      ctx.fillStyle = isValid ? '#0891b2' : '#dc2626';
      ctx.font = 'bold 9px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${formatFeetInches(wallPlacement.widthInches)}`, sCenter.x, sCenter.y);

      ctx.restore();
    } else {
      const cp = viewport.worldToScreen(centerPoint);
      const rotRad = degreesToRadians(rotation);
      const w = wallPlacement.widthInches * viewport.zoom;
      const d = (wallPlacement.depthInches || (wallPlacement.wallId ? (preview.metrics.wall.properties.thickness || 9) : 9)) * viewport.zoom;

      ctx.save();
      ctx.translate(cp.x, cp.y);
      ctx.rotate(rotRad);

      ctx.fillStyle = isValid ? 'rgba(6, 182, 212, 0.25)' : 'rgba(239, 68, 68, 0.25)';
      ctx.strokeStyle = isValid ? '#0891b2' : '#dc2626';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);

      ctx.fillRect(-w / 2, -d / 2, w, d);
      ctx.strokeRect(-w / 2, -d / 2, w, d);

      // Label
      ctx.fillStyle = isValid ? '#0891b2' : '#dc2626';
      ctx.font = 'bold 9px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${formatFeetInches(wallPlacement.widthInches)}`, 0, 0);

      ctx.restore();
    }

    // 3. Draw wall-aligned location dimensions
    const dimOffset = 24 * viewport.zoom;
    const perpNorm = {
      x: -metrics.direction.y,
      y: metrics.direction.x,
    };

    const spScreen = viewport.worldToScreen(startPoint);
    const epScreen = viewport.worldToScreen(endPoint);

    // Dimension line: Start to Tool Start (if > 0)
    if (extents.startDist > 0.5) {
      this.drawPreviewDimLine(
        wp1,
        spScreen,
        perpNorm,
        dimOffset,
        formatFeetInches(extents.startDist)
      );
    }

    // Dimension line: Tool Start to Tool End (Width)
    this.drawPreviewDimLine(
      spScreen,
      epScreen,
      perpNorm,
      dimOffset,
      formatFeetInches(wallPlacement.widthInches)
    );

    // Dimension line: Tool End to Wall End (if > 0)
    const remaining = metrics.length - extents.endDist;
    if (remaining > 0.5) {
      this.drawPreviewDimLine(
        epScreen,
        wp2,
        perpNorm,
        dimOffset,
        formatFeetInches(remaining)
      );
    }

    ctx.restore();
  }

  private drawPreviewDimLine(
    p1: Point2D,
    p2: Point2D,
    normal: Point2D,
    offset: number,
    label: string
  ) {
    const { ctx } = this;
    const o1 = { x: p1.x + normal.x * offset, y: p1.y + normal.y * offset };
    const o2 = { x: p2.x + normal.x * offset, y: p2.y + normal.y * offset };

    ctx.save();
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);

    // Extension witness lines
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(o1.x, o1.y);
    ctx.moveTo(p2.x, p2.y);
    ctx.lineTo(o2.x, o2.y);
    ctx.stroke();

    // Dimension line
    ctx.setLineDash([]);
    ctx.strokeStyle = '#0369a1';
    ctx.beginPath();
    ctx.moveTo(o1.x, o1.y);
    ctx.lineTo(o2.x, o2.y);
    ctx.stroke();

    // Tick marks
    const tickLen = 4;
    ctx.beginPath();
    ctx.moveTo(o1.x - normal.y * tickLen, o1.y + normal.x * tickLen);
    ctx.lineTo(o1.x + normal.y * tickLen, o1.y - normal.x * tickLen);
    ctx.moveTo(o2.x - normal.y * tickLen, o2.y + normal.x * tickLen);
    ctx.lineTo(o2.x + normal.y * tickLen, o2.y - normal.x * tickLen);
    ctx.stroke();

    // Text badge
    const midX = (o1.x + o2.x) / 2;
    const midY = (o1.y + o2.y) / 2;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(midX - 22, midY - 6, 44, 12);
    ctx.strokeStyle = '#0284c7';
    ctx.strokeRect(midX - 22, midY - 6, 44, 12);

    ctx.fillStyle = '#0369a1';
    ctx.font = 'bold 8px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, midX, midY);

    ctx.restore();
  }

  private drawRack(rack: RackEntity, isSelected: boolean, entities: CADEntity[], roomPolygon?: Point2D[], runs?: GondolaRun[], isMultiSelected = false) {
    const rackType = rack.properties.rackType || 'wall_rack_7x3';

    // Hard validation in MANUAL mode: assert rack footprint is inside manual room polygon
    if (this.viewport.roomShapeMode === 'MANUAL' && roomPolygon && roomPolygon.length >= 3) {
      const fp = this.computeRackFootprint(rack, entities, roomPolygon);
      if (!isPolygonInsidePolygon(fp, roomPolygon)) {
        return; // Reject rendering of rack outside room polygon
      }
    }

    const isCorner = rackType === 'corner_rack_2x2x2' || rackType === 'Corner Rack' || (rack.properties?.productName && rack.properties.productName.toLowerCase().includes('corner'));
    const isEndcap = rackType === 'endcap_5x3' || rackType === 'End Cap' || (rack.properties?.productName && rack.properties.productName.toLowerCase().includes('end'));
    const isWall =
      rackType.startsWith('wall_rack') ||
      rackType === 'Wall Rack' ||
      Boolean(rack.properties?.attachedWallId) ||
      (rack.properties?.productName && rack.properties.productName.toLowerCase().includes('wall')) ||
      ((rackType === 'CUSTOM' || rackType === 'custom_rack' || rack.properties?.isCustom) && Boolean(rack.properties?.attachedWallId));

    if (isCorner) {
      this.drawCornerRack(rack, isSelected, entities, roomPolygon);
    } else if (isWall) {
      this.drawWallRack(rack, isSelected, entities, roomPolygon);
    } else if (isEndcap) {
      this.drawEndcap(rack, isSelected);
    } else {
      this.drawCenterRack(rack, isSelected, runs);
    }

    // Multi-select teal dashed halo (only when NOT the primary single-selected entity)
    if (isMultiSelected && !isSelected) {
      const { ctx, viewport } = this;
      const geom = rack.geometry;
      const cx = geom.x * viewport.zoom + viewport.panX;
      const cy = geom.y * viewport.zoom + viewport.panY;
      const hw = ((geom.width || 36) / 2 + 4) * viewport.zoom;
      const hd = ((geom.depth || 24) / 2 + 4) * viewport.zoom;
      const rotRad = ((geom.rotation || 0) * Math.PI) / 180;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rotRad);
      ctx.strokeStyle = '#6366f1'; // indigo-500
      ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 3]);
      ctx.strokeRect(-hw, -hd, hw * 2, hd * 2);
      ctx.setLineDash([]);
      ctx.restore();
    }
  }

  private computeRackFootprint(rack: RackEntity, entities: CADEntity[], roomPolygon?: Point2D[]): Point2D[] {
    const rackType = rack.properties.rackType || 'wall_rack_7x3';
    const rw = rack.geometry.width || 36;
    const rd = rack.geometry.depth || 24;

    if (
      rackType.startsWith('wall_rack') ||
      rackType === 'Wall Rack' ||
      ((rackType === 'CUSTOM' || rackType === 'custom_rack' || rack.properties?.isCustom) && Boolean(rack.properties?.attachedWallId))
    ) {
      const wall = entities.find((e) => e.id === rack.properties.attachedWallId) as WallEntity | undefined;
      const wallAngleRad = wall
        ? Math.atan2(wall.geometry.y2 - wall.geometry.y1, wall.geometry.x2 - wall.geometry.x1)
        : ((rack.geometry.rotation || 0) * Math.PI) / 180;

      let clampedW = rw;
      let shiftX = 0;
      let shiftY = 0;
      if (wall) {
        const clampResult = CornerRackEngine.clampWallRack(rack, wall, entities, roomPolygon || []);
        if (clampResult) {
          clampedW = clampResult.width;
          shiftX = clampResult.shiftX;
          shiftY = clampResult.shiftY;
        }
      }

      let inwardDx = 0;
      let inwardDy = 0;
      if (rack.properties.inwardNormal) {
        inwardDx = rack.properties.inwardNormal.x;
        inwardDy = rack.properties.inwardNormal.y;
      } else if (wall && roomPolygon && roomPolygon.length >= 3) {
        const normals = calculateWallInwardNormal(
          { x: wall.geometry.x1, y: wall.geometry.y1 },
          { x: wall.geometry.x2, y: wall.geometry.y2 },
          roomPolygon
        );
        inwardDx = normals.inwardNormal.x;
        inwardDy = normals.inwardNormal.y;
      } else {
        inwardDx = -Math.sin(wallAngleRad);
        inwardDy = Math.cos(wallAngleRad);
      }

      const cos = Math.cos(wallAngleRad);
      const sin = Math.sin(wallAngleRad);
      const toW = (along: number, depth: number) => ({
        x: rack.geometry.x + shiftX + along * cos + inwardDx * depth,
        y: rack.geometry.y + shiftY + along * sin + inwardDy * depth,
      });

      return [toW(-clampedW / 2, 0), toW(clampedW / 2, 0), toW(clampedW / 2, rd), toW(-clampedW / 2, rd)];
    }

    if (rackType === 'corner_rack_2x2x2' || rackType === 'Corner Rack' || (rackType && rackType.toLowerCase().includes('corner'))) {
      const sideA = rack.geometry.width || 33;
      const sideB = rack.geometry.depth || 37;
      const thickness = (rack.properties as any)?.shelfDepth || (sideA >= 30 ? 18 : 12);
      const rotRad = ((rack.geometry.rotation || 0) * Math.PI) / 180;
      const v1 = { x: Math.cos(rotRad), y: Math.sin(rotRad) };
      const v2 = { x: -Math.sin(rotRad), y: Math.cos(rotRad) };
      const anchor = { x: rack.geometry.x, y: rack.geometry.y };

      return [
        anchor,
        { x: anchor.x + v1.x * sideA, y: anchor.y + v1.y * sideA },
        { x: anchor.x + v1.x * sideA + v2.x * thickness, y: anchor.y + v1.y * sideA + v2.y * thickness },
        { x: anchor.x + v1.x * thickness + v2.x * thickness, y: anchor.y + v1.y * thickness + v2.y * thickness },
        { x: anchor.x + v1.x * thickness + v2.x * sideB, y: anchor.y + v1.y * thickness + v2.y * sideB },
        { x: anchor.x + v2.x * sideB, y: anchor.y + v2.y * sideB },
      ];
    }

    // Centered rack
    const rotRad = ((rack.geometry.rotation || 0) * Math.PI) / 180;
    const cos = Math.cos(rotRad);
    const sin = Math.sin(rotRad);
    const cx = rack.geometry.x;
    const cy = rack.geometry.y;
    const toW = (lx: number, ly: number) => ({
      x: cx + lx * cos - ly * sin,
      y: cy + lx * sin + ly * cos,
    });

    return [toW(-rw / 2, -rd / 2), toW(rw / 2, -rd / 2), toW(rw / 2, rd / 2), toW(-rw / 2, rd / 2)];
  }

  /**
   * Wall Rack — anchor at wall face, extends depth into room.
   * geometry.x/y = anchor point on wall face (center of the rack's wall-side edge).
   * depth extends perpendicularly into the room.
   * width runs along the wall.
   */
  private drawWallRack(rack: RackEntity, isSelected: boolean, entities: CADEntity[], roomPolygon?: Point2D[]) {
    const { ctx, viewport } = this;
    let rw = rack.geometry.width || 36;  // Width (along wall, e.g. 3' for wall_rack_7x3)
    const rd = rack.geometry.depth || 24;  // Depth (into room)

    let shiftX = 0;
    let shiftY = 0;

    const wall = entities.find(e => e.id === rack.properties.attachedWallId) as WallEntity | undefined;
    if (wall) {
      const clampResult = CornerRackEngine.clampWallRack(rack, wall, entities, roomPolygon || []);
      if (clampResult) {
        rw = clampResult.width;
        shiftX = clampResult.shiftX;
        shiftY = clampResult.shiftY;
      }
    }

    // Determine wall orientation
    let wallAngleRad = 0;
    if (wall) {
      wallAngleRad = Math.atan2(wall.geometry.y2 - wall.geometry.y1, wall.geometry.x2 - wall.geometry.x1);
    } else {
      // Fall back to stored rotation (set at creation time)
      wallAngleRad = ((rack.geometry.rotation || 0) * Math.PI) / 180;
    }

    // Perpendicular into room direction (inward)
    let inwardDx = 0;
    let inwardDy = 0;

    if (rack.properties.inwardNormal) {
      inwardDx = rack.properties.inwardNormal.x;
      inwardDy = rack.properties.inwardNormal.y;
    } else if (wall && roomPolygon && roomPolygon.length >= 3) {
      const normals = calculateWallInwardNormal(
        { x: wall.geometry.x1, y: wall.geometry.y1 },
        { x: wall.geometry.x2, y: wall.geometry.y2 },
        roomPolygon
      );
      inwardDx = normals.inwardNormal.x;
      inwardDy = normals.inwardNormal.y;
    } else {
      // AUTO mode behavior (preserved 100%)
      const wallSide = rack.properties.wallSide;
      if (wallSide === 'top') { inwardDx = 0; inwardDy = 1; }
      else if (wallSide === 'bottom') { inwardDx = 0; inwardDy = -1; }
      else if (wallSide === 'left') { inwardDx = 1; inwardDy = 0; }
      else if (wallSide === 'right') { inwardDx = -1; inwardDy = 0; }
      else {
        // Derive inward from wall normal (rotate wall vector 90° toward room center)
        const perpX = -Math.sin(wallAngleRad);
        const perpY = Math.cos(wallAngleRad);
        inwardDx = perpX;
        inwardDy = perpY;
      }
    }

    // The anchor is at rack.geometry.x/y (on wall face, center of rack width)
    // The rack body spans:
    //   Along wall: ±rw/2 from anchor
    //   Into room:  0 → rd (from anchor)
    // Corners in local (wall-aligned) space:
    //   TL: (-rw/2, 0), TR: (rw/2, 0), BR: (rw/2, rd), BL: (-rw/2, rd)
    const cos = Math.cos(wallAngleRad);
    const sin = Math.sin(wallAngleRad);

    // Helper: convert local (along, depth) to world
    const toWorld = (along: number, depth: number) => ({
      x: rack.geometry.x + shiftX + along * cos + inwardDx * depth,
      y: rack.geometry.y + shiftY + along * sin + inwardDy * depth,
    });

    const worldTL = toWorld(-rw / 2, 0);
    const worldTR = toWorld(rw / 2, 0);
    const worldBR = toWorld(rw / 2, rd);
    const worldBL = toWorld(-rw / 2, rd);

    const sTL = viewport.worldToScreen(worldTL);
    const sTR = viewport.worldToScreen(worldTR);
    const sBR = viewport.worldToScreen(worldBR);
    const sBL = viewport.worldToScreen(worldBL);

    ctx.save();

    // Selection outline (dashed, thick, NO fill)
    if (isSelected) {
      ctx.save();
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(sTL.x, sTL.y);
      ctx.lineTo(sTR.x, sTR.y);
      ctx.lineTo(sBR.x, sBR.y);
      ctx.lineTo(sBL.x, sBL.y);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }

    // Body fill
    ctx.beginPath();
    ctx.moveTo(sTL.x, sTL.y);
    ctx.lineTo(sTR.x, sTR.y);
    ctx.lineTo(sBR.x, sBR.y);
    ctx.lineTo(sBL.x, sBL.y);
    ctx.closePath();
    ctx.fillStyle = '#f8fafc';
    ctx.fill();

    // Wall-anchor edge (bold thick line — the wall side)
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(sTL.x, sTL.y);
    ctx.lineTo(sTR.x, sTR.y);
    ctx.stroke();

    // Outer structural outline
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(sTL.x, sTL.y);
    ctx.lineTo(sTR.x, sTR.y);
    ctx.lineTo(sBR.x, sBR.y);
    ctx.lineTo(sBL.x, sBL.y);
    ctx.closePath();
    ctx.stroke();

    // Shelf lines (horizontal, parallel to width)
    const shelfCount = rack.properties.shelfCount ?? rack.properties.shelves ?? 6;
    const numShelves = Math.max(1, shelfCount - 1);
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 0.8;
    ctx.setLineDash([]);
    for (let s = 1; s <= numShelves; s++) {
      const t = (s / (numShelves + 1)) * rd;
      const sl = toWorld(-rw / 2, t);
      const sr = toWorld(rw / 2, t);
      const ssl = viewport.worldToScreen(sl);
      const ssr = viewport.worldToScreen(sr);
      ctx.beginPath();
      ctx.moveTo(ssl.x, ssl.y);
      ctx.lineTo(ssr.x, ssr.y);
      ctx.stroke();
    }

    // Label — short human readable name centered in rack body
    const centerW = viewport.worldToScreen(toWorld(0, rd / 2));
    const isCustom =
      rack.properties.rackType === 'CUSTOM' ||
      rack.properties.rackType === 'custom_rack' ||
      rack.properties.isCustom ||
      Boolean(rack.properties.productModelId) ||
      rack.properties.rackType?.toLowerCase().includes('custom');

    ctx.save();
    ctx.translate(centerW.x, centerW.y);

    // Clamp rotation so text is never upside down or backwards
    let textRot = wallAngleRad;
    if (textRot > Math.PI / 2 + 0.01 || textRot < -Math.PI / 2 - 0.01) {
      textRot += Math.PI;
    }
    ctx.rotate(textRot);

    ctx.fillStyle = '#1e293b';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (isCustom) {
      const h = rack.geometry.height || (rack.properties as any)?.height || 84;
      const customLabel = formatCustomRackLabel(h, rw, rd, true);
      const availableWidthPx = rw * viewport.zoom * 0.9;
      ctx.font = 'bold 8px Inter, sans-serif';
      const textWidth = ctx.measureText(customLabel).width;
      if (textWidth > availableWidthPx && availableWidthPx > 16) {
        const scale = availableWidthPx / textWidth;
        const fontSize = Math.max(5.5, Math.floor(8 * scale));
        ctx.font = `bold ${fontSize}px Inter, sans-serif`;
      }
      const title = rack.properties.productModelId
        ? (rack.properties.productName?.slice(0, 10).toUpperCase() || 'RACK')
        : 'C-RACK';
      ctx.fillText(title, 0, -4.5);
      ctx.fillText(customLabel, 0, 4.5);
    } else {
      ctx.font = 'bold 8px Inter, sans-serif';
      const title = rack.properties.sku || (rack.properties.productName ? rack.properties.productName.slice(0, 10).toUpperCase() : 'W-RACK');
      const dimStr = formatFeetInches(rw) + '×' + formatFeetInches(rack.geometry.height || 84);
      ctx.fillText(title, 0, -4.5);
      ctx.fillText(dimStr, 0, 4.5);
    }
    ctx.restore();

    ctx.restore();
  }

  /**
   * Center Rack (Gondola) — free-standing, centered on geometry.x/y.
   * Standard rectangle with center spine and shelf lines.
   */
  private drawCenterRack(rack: RackEntity, isSelected: boolean, runs?: GondolaRun[]) {
    const { ctx, viewport } = this;
    const rw = rack.geometry.width || 36;  // Width (e.g. 3' for center_rack_5x3)
    const rd = rack.geometry.depth || 24;  // Depth (floor plan)
    const rot = ((rack.geometry.rotation || 0) * Math.PI) / 180;

    let worldX = rack.geometry.x;
    let worldY = rack.geometry.y;

    if (runs) {
      const myRun = runs.find(r => r.racks.some(rk => rk.id === rack.id));
      if (myRun && myRun.racks.length > 1) {
        const aligned = myRun.alignedPositions.get(rack.id);
        if (aligned) {
          worldX = aligned.x;
          worldY = aligned.y;
        }
      }
    }

    const center = viewport.worldToScreen({ x: worldX, y: worldY });
    const sW = rw * viewport.zoom;
    const sD = rd * viewport.zoom;

    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.rotate(rot);

    const x = -sW / 2;
    const y = -sD / 2;

    // Selection outline (dashed, thick)
    if (isSelected) {
      ctx.save();
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(x - 3, y - 3, sW + 6, sD + 6);
      ctx.restore();
    }

    // Body fill
    ctx.fillStyle = '#dbeafe';
    ctx.fillRect(x, y, sW, sD);

    // Outer outline
    ctx.strokeStyle = '#1e40af';
    ctx.lineWidth = 1.4;
    ctx.strokeRect(x, y, sW, sD);

    // Side upright channels (the two side structural posts)
    ctx.fillStyle = '#93c5fd';
    ctx.fillRect(x, y, 5, sD);
    ctx.fillRect(x + sW - 5, y, 5, sD);

    // Center spine
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(0, y + sD);
    ctx.stroke();

    // Shelf lines
    const shelfCount = rack.properties.shelfCount ?? rack.properties.shelves ?? 6;
    const numShelves = Math.max(1, shelfCount - 1);
    ctx.strokeStyle = '#60a5fa';
    ctx.lineWidth = 0.8;
    for (let s = 1; s <= numShelves; s++) {
      const sy = y + (s / (numShelves + 1)) * sD;
      ctx.beginPath();
      ctx.moveTo(x + 5, sy);
      ctx.lineTo(x + sW - 5, sy);
      ctx.stroke();
    }

    // Label
    ctx.fillStyle = '#1d4ed8';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const h = rack.geometry.height || (rack.properties as any)?.height || 60;
    const fullDimLabel = formatCustomRackLabel(h, rw, rd, false);
    const compactDimLabel = formatCustomRackLabel(h, rw, rd, true);
    const availableWidthPx = sW * 0.9;
    ctx.font = 'bold 8px Inter, sans-serif';
    const dimLabel = ctx.measureText(fullDimLabel).width <= availableWidthPx ? fullDimLabel : compactDimLabel;
    const textWidth = ctx.measureText(dimLabel).width;
    if (textWidth > availableWidthPx && availableWidthPx > 14) {
      const scale = availableWidthPx / textWidth;
      const fontSize = Math.max(5.0, Math.floor(8 * scale));
      ctx.font = `bold ${fontSize}px Inter, sans-serif`;
    }

    const title = rack.properties.productName
      ? rack.properties.productName.slice(0, 14).toUpperCase()
      : (rack.properties.sku || 'CENTER RACK');

    if (sD >= 20) {
      ctx.fillText(title, 0, -4);
      ctx.fillText(dimLabel, 0, 5);
    } else {
      ctx.fillText(dimLabel, 0, 0);
    }

    ctx.restore();
  }

  /**
   * Endcap — free-standing, visually distinct from center rack.
   * Has diagonal stripe pattern on the "cap" face + bold end marker.
   */
  private drawEndcap(rack: RackEntity, isSelected: boolean) {
    const { ctx, viewport } = this;
    const rw = rack.geometry.width || 36;  // Width (e.g. 3' for endcap_5x3)
    const rd = rack.geometry.depth || 24;  // Depth (floor plan)
    const rot = ((rack.geometry.rotation || 0) * Math.PI) / 180;

    const center = viewport.worldToScreen({ x: rack.geometry.x, y: rack.geometry.y });
    const sW = rw * viewport.zoom;
    const sD = rd * viewport.zoom;

    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.rotate(rot);

    const x = -sW / 2;
    const y = -sD / 2;

    // Selection outline
    if (isSelected) {
      ctx.save();
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(x - 3, y - 3, sW + 6, sD + 6);
      ctx.restore();
    }

    // Body fill
    ctx.fillStyle = '#fdf4ff';
    ctx.fillRect(x, y, sW, sD);

    // Outer outline
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, sW, sD);

    // Endcap marker bar (bold colored bar at top = cap face)
    ctx.fillStyle = '#7c3aed';
    ctx.fillRect(x, y, sW, Math.max(6, sD * 0.15));

    // Diagonal stripe detail on cap zone
    const capH = Math.max(6, sD * 0.15);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, sW, capH);
    ctx.clip();
    ctx.strokeStyle = '#a855f7';
    ctx.lineWidth = 1;
    const stripeStep = 8;
    for (let sx = x - capH; sx < x + sW + capH; sx += stripeStep) {
      ctx.beginPath();
      ctx.moveTo(sx, y);
      ctx.lineTo(sx + capH, y + capH);
      ctx.stroke();
    }
    ctx.restore();

    // Shelf lines in body area
    const bodyTop = y + capH;
    const bodyH = sD - capH;
    const numShelves = 2;
    ctx.strokeStyle = '#c084fc';
    ctx.lineWidth = 0.8;
    for (let s = 1; s <= numShelves; s++) {
      const sy = bodyTop + (s / (numShelves + 1)) * bodyH;
      ctx.beginPath();
      ctx.moveTo(x + 4, sy);
      ctx.lineTo(x + sW - 4, sy);
      ctx.stroke();
    }

    // Label — dynamic SKU/Name and dimensions
    ctx.fillStyle = '#6d28d9';
    ctx.font = 'bold 8px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const ecLabelY = bodyTop + bodyH / 2;
    const title = rack.properties.sku || (rack.properties.productName ? rack.properties.productName.slice(0, 10).toUpperCase() : 'ENDCAP');
    const h = rack.geometry.height || (rack.properties as any)?.height || 60;
    const fullDimStr = formatCustomRackLabel(h, rw, rd, false);
    const compactDimStr = formatCustomRackLabel(h, rw, rd, true);
    const availableWidthPx = sW * 0.9;
    const dimStr = ctx.measureText(fullDimStr).width <= availableWidthPx ? fullDimStr : compactDimStr;
    const textWidth = ctx.measureText(dimStr).width;
    if (textWidth > availableWidthPx && availableWidthPx > 14) {
      const scale = availableWidthPx / textWidth;
      const fontSize = Math.max(5.0, Math.floor(8 * scale));
      ctx.font = `bold ${fontSize}px Inter, sans-serif`;
    }
    if (bodyH >= 20) {
      ctx.fillText(title, 0, ecLabelY - 4);
      ctx.fillText(dimStr, 0, ecLabelY + 5);
    } else {
      ctx.fillText(title, 0, ecLabelY);
    }

    ctx.restore();
  }

  /**
   * Corner Rack — L-shaped footprint.
   * geometry.x/y = the inner corner point (intersection of the two wings).
   * cornerPosition determines which room corner (and thus orientation of the L).
   * Wing A runs along X, Wing B runs along Y.
   *
   *  top-left corner:
   *    Wing A: extends RIGHT from corner (→)
   *    Wing B: extends DOWN from corner (↓)
   *
   *  top-right corner:
   *    Wing A: extends LEFT from corner (←)
   *    Wing B: extends DOWN from corner (↓)
   *
   *  bottom-left corner:
   *    Wing A: extends RIGHT from corner (→)
   *    Wing B: extends UP from corner (↑)
   *
   *  bottom-right corner:
   *    Wing A: extends LEFT from corner (←)
   *    Wing B: extends UP from corner (↑)
   */
  private drawCornerRack(rack: RackEntity, isSelected: boolean, entities: CADEntity[], roomPolygon?: Point2D[]) {
    const { ctx, viewport } = this;
    const sideA = rack.geometry.width || 24;   // horizontal wing length
    const sideB = rack.geometry.depth || 24;   // vertical wing length
    const thickness = Math.min(sideA, sideB);  // wing thickness = shorter side (both are equal for 2x2)

    let aDx = 1, aDy = 0; // Wing A direction
    let bDx = 0, bDy = 1; // Wing B direction

    let anchor = { x: rack.geometry.x, y: rack.geometry.y };

    const cornerResult = CornerRackEngine.detectCornerConnection(rack, entities, roomPolygon || []);
    if (cornerResult && cornerResult.isValid && cornerResult.cornerPoint) {
      anchor = cornerResult.cornerPoint;
      
      // Actually, wait. The local axes for drawCornerRack: aDx is horizontal, aDy is vertical.
      // If we use CornerRackEngine's rotationY (which points +Z to the room interior),
      // let's derive aDx, aDy from the walls directly.
      const wA = cornerResult.wallA!;
      const wB = cornerResult.wallB!;

      // Direction of Wall A from corner
      const ptA = (distance(anchor, {x: wA.geometry.x1, y: wA.geometry.y1}) > 1) ? {x: wA.geometry.x1, y: wA.geometry.y1} : {x: wA.geometry.x2, y: wA.geometry.y2};
      // Direction of Wall B from corner
      const ptB = (distance(anchor, {x: wB.geometry.x1, y: wB.geometry.y1}) > 1) ? {x: wB.geometry.x1, y: wB.geometry.y1} : {x: wB.geometry.x2, y: wB.geometry.y2};
      
      const vA = { x: ptA.x - anchor.x, y: ptA.y - anchor.y };
      const lenA = Math.hypot(vA.x, vA.y);
      aDx = vA.x / lenA;
      aDy = vA.y / lenA;

      const vB = { x: ptB.x - anchor.x, y: ptB.y - anchor.y };
      const lenB = Math.hypot(vB.x, vB.y);
      let tBDx = vB.x / lenB;
      let tBDy = vB.y / lenB;
      
      const cross = aDx * tBDy - aDy * tBDx;
      if (cross < 0) {
        // Swap A and B directions to match 3D rotation logic (where Width goes along Wall B and Depth goes along Wall A)
        const tempX = aDx, tempY = aDy;
        aDx = tBDx; aDy = tBDy;
        bDx = tempX; bDy = tempY;
      } else {
        bDx = tBDx; bDy = tBDy;
      }
    } else {
      // Fallback
      if (rack.geometry.rotation !== undefined && Math.abs(rack.geometry.rotation) > 0.01) {
        const rotRad = ((rack.geometry.rotation || 0) * Math.PI) / 180;
        aDx = Math.cos(rotRad);
        aDy = Math.sin(rotRad);
        bDx = -Math.sin(rotRad);
        bDy = Math.cos(rotRad);
      } else {
        const cornerPos = rack.properties.cornerPosition || 'top-left';
        switch (cornerPos) {
          case 'top-left':    aDx =  1; aDy = 0; bDx = 0; bDy =  1; break;
          case 'top-right':   aDx = -1; aDy = 0; bDx = 0; bDy =  1; break;
          case 'bottom-left': aDx =  1; aDy = 0; bDx = 0; bDy = -1; break;
          case 'bottom-right':aDx = -1; aDy = 0; bDx = 0; bDy = -1; break;
        }
      }
    }

    // Wing A corners (the horizontal wing)
    // Starts at anchor, goes aDx direction for sideA, with thickness bDy direction
    const aP1 = viewport.worldToScreen(anchor);
    const aP2 = viewport.worldToScreen({ x: anchor.x + aDx * sideA, y: anchor.y + aDy * sideA });
    const aP3 = viewport.worldToScreen({ x: anchor.x + aDx * sideA + bDx * thickness, y: anchor.y + aDy * sideA + bDy * thickness });
    const aP4 = viewport.worldToScreen({ x: anchor.x + bDx * thickness, y: anchor.y + bDy * thickness });

    // Wing B corners (the vertical wing)
    // Starts at anchor, goes bDy direction for sideB, with thickness aDx direction
    const bP1 = viewport.worldToScreen(anchor);
    const bP2 = viewport.worldToScreen({ x: anchor.x + aDx * thickness, y: anchor.y + aDy * thickness });
    const bP3 = viewport.worldToScreen({ x: anchor.x + aDx * thickness + bDx * sideB, y: anchor.y + aDy * thickness + bDy * sideB });
    const bP4 = viewport.worldToScreen({ x: anchor.x + bDx * sideB, y: anchor.y + bDy * sideB });

    ctx.save();

    // Selection outline — draw the full L outline
    if (isSelected) {
      ctx.save();
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 2.5;
      // Draw L outline path
      this.drawLShapeOutline(ctx, anchor, aDx, aDy, bDx, bDy, sideA, sideB, thickness, viewport.zoom, 4);
      ctx.restore();
    }

    // Wing A fill
    ctx.fillStyle = '#f0fdf4';
    ctx.beginPath();
    ctx.moveTo(aP1.x, aP1.y);
    ctx.lineTo(aP2.x, aP2.y);
    ctx.lineTo(aP3.x, aP3.y);
    ctx.lineTo(aP4.x, aP4.y);
    ctx.closePath();
    ctx.fill();

    // Wing B fill
    ctx.beginPath();
    ctx.moveTo(bP1.x, bP1.y);
    ctx.lineTo(bP2.x, bP2.y);
    ctx.lineTo(bP3.x, bP3.y);
    ctx.lineTo(bP4.x, bP4.y);
    ctx.closePath();
    ctx.fill();

    // L-shape outline
    ctx.strokeStyle = '#166534';
    ctx.lineWidth = 1.4;
    ctx.setLineDash([]);
    this.drawLShapeOutline(ctx, anchor, aDx, aDy, bDx, bDy, sideA, sideB, thickness, viewport.zoom, 0);

    // Wall anchor edges (the two wall-facing sides — bold)
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 3;
    // Wing A outer edge (away from corner)
    ctx.beginPath();
    ctx.moveTo(aP1.x, aP1.y);
    ctx.lineTo(aP2.x, aP2.y);
    ctx.stroke();
    // Wing B outer edge
    ctx.beginPath();
    ctx.moveTo(bP1.x, bP1.y);
    ctx.lineTo(bP4.x, bP4.y);
    ctx.stroke();

    // Shelf lines on Wing A
    const numShelves = 2;
    ctx.strokeStyle = '#4ade80';
    ctx.lineWidth = 0.8;
    for (let s = 1; s <= numShelves; s++) {
      const t = (s / (numShelves + 1));
      const sl = viewport.worldToScreen({ x: anchor.x + aDx * sideA * t, y: anchor.y + aDy * sideA * t });
      const sr = viewport.worldToScreen({ x: anchor.x + aDx * sideA * t + bDx * thickness, y: anchor.y + aDy * sideA * t + bDy * thickness });
      ctx.beginPath();
      ctx.moveTo(sl.x, sl.y);
      ctx.lineTo(sr.x, sr.y);
      ctx.stroke();
    }
    // Shelf lines on Wing B (only the non-overlap portion)
    for (let s = 1; s <= numShelves; s++) {
      const t = (s / (numShelves + 1));
      const adjustedT = thickness / sideB + t * (1 - thickness / sideB); // skip overlap zone
      const sl = viewport.worldToScreen({ x: anchor.x + bDx * sideB * adjustedT, y: anchor.y + bDy * sideB * adjustedT });
      const sr = viewport.worldToScreen({ x: anchor.x + aDx * thickness + bDx * sideB * adjustedT, y: anchor.y + aDy * thickness + bDy * sideB * adjustedT });
      ctx.beginPath();
      ctx.moveTo(sl.x, sl.y);
      ctx.lineTo(sr.x, sr.y);
      ctx.stroke();
    }

    // Label at centroid of Wing A — two lines: CRN / 2×2
    const labelWorld = {
      x: anchor.x + aDx * sideA * 0.5 + bDx * thickness * 0.5,
      y: anchor.y + aDy * sideA * 0.5 + bDy * thickness * 0.5,
    };
    const labelScr = viewport.worldToScreen(labelWorld);
    ctx.fillStyle = '#166534';
    ctx.font = 'bold 8px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('CRN', labelScr.x, labelScr.y - 4);
    ctx.fillText('2×2', labelScr.x, labelScr.y + 5);

    // =========================================================
    // DEV-ONLY DEBUG VISUALIZATION
    // =========================================================
    const devMode = true; // Temporary debug flag as requested
    if (devMode && cornerResult && cornerResult.isValid) {
      ctx.save();
      ctx.lineWidth = 2;
      const cp = viewport.worldToScreen(anchor);
      
      // WHITE: Corner point
      ctx.fillStyle = 'white';
      ctx.beginPath();
      ctx.arc(cp.x, cp.y, 4, 0, Math.PI * 2);
      ctx.fill();
      
      // GREEN: Room interior direction
      if (cornerResult.alignedPosition) {
        ctx.strokeStyle = '#22c55e'; // Green
        ctx.beginPath();
        ctx.moveTo(cp.x, cp.y);
        const inwardPoint = { x: anchor.x + (aDx + bDx) * 12, y: anchor.y + (aDy + bDy) * 12 };
        const inwardS = viewport.worldToScreen(inwardPoint);
        ctx.lineTo(inwardS.x, inwardS.y);
        ctx.stroke();
      }

      // RED: Wall A Tangent (represented by aDx, aDy)
      ctx.strokeStyle = '#ef4444'; // Red
      ctx.beginPath();
      ctx.moveTo(cp.x, cp.y);
      const waP = viewport.worldToScreen({ x: anchor.x + aDx * 36, y: anchor.y + aDy * 36 });
      ctx.lineTo(waP.x, waP.y);
      ctx.stroke();

      // BLUE: Wall B Tangent (represented by bDx, bDy)
      ctx.strokeStyle = '#3b82f6'; // Blue
      ctx.beginPath();
      ctx.moveTo(cp.x, cp.y);
      const wbP = viewport.worldToScreen({ x: anchor.x + bDx * 36, y: anchor.y + bDy * 36 });
      ctx.lineTo(wbP.x, wbP.y);
      ctx.stroke();

      // Debug Text overlay
      ctx.fillStyle = 'black';
      ctx.font = '10px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`Angle: ${cornerResult.angleDeg?.toFixed(1)}°`, cp.x + 10, cp.y + 10);
      ctx.fillText(`W: ${sideA}", D: ${sideB}"`, cp.x + 10, cp.y + 22);
      
      ctx.restore();
    }
    // =========================================================

    ctx.restore();
  }

  /** Draws the L-shape outline path (stroked) using world-space anchor + directions */
  private drawLShapeOutline(
    ctx: CanvasRenderingContext2D,
    anchor: { x: number; y: number },
    aDx: number, aDy: number,
    bDx: number, bDy: number,
    sideA: number, sideB: number, thickness: number,
    _zoom: number,
    _inset: number
  ) {
    const vp = this.viewport;
    const pts = [
      anchor,
      { x: anchor.x + aDx * sideA, y: anchor.y + aDy * sideA },
      { x: anchor.x + aDx * sideA + bDx * thickness, y: anchor.y + aDy * sideA + bDy * thickness },
      { x: anchor.x + aDx * thickness + bDx * thickness, y: anchor.y + aDy * thickness + bDy * thickness },
      { x: anchor.x + aDx * thickness + bDx * sideB, y: anchor.y + aDy * thickness + bDy * sideB },
      { x: anchor.x + bDx * sideB, y: anchor.y + bDy * sideB },
    ].map(p => vp.worldToScreen(p));

    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.stroke();
  }

  private drawText(textEnt: TextEntity, isSelected: boolean) {
    const { ctx, viewport } = this;
    const pos = viewport.worldToScreen({ x: textEnt.geometry.x, y: textEnt.geometry.y });
    const fontSize = (textEnt.properties.fontSize || 14) * (viewport.zoom / 0.8);

    ctx.save();
    ctx.font = `${textEnt.properties.fontWeight || 'bold'} ${Math.max(fontSize, 10)}px Inter, sans-serif`;
    ctx.fillStyle = textEnt.properties.color || '#0f172a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (isSelected) {
      const metrics = ctx.measureText(textEnt.properties.text || '');
      const bw = metrics.width + 12;
      const bh = fontSize + 8;
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(pos.x - bw / 2, pos.y - bh / 2, bw, bh);
    }

    ctx.fillText(textEnt.properties.text || '', pos.x, pos.y);
    ctx.restore();
  }

  private drawDimension(dim: DimensionItem, roomPolygon?: Point2D[]) {
    // Hard validation in MANUAL mode: exterior architectural dimensions must NOT render inside room polygon
    if (this.viewport.roomShapeMode === 'MANUAL' && roomPolygon && roomPolygon.length >= 3) {
      const isInteriorAllowed =
        dim.type === 'aisle' ||
        dim.type === 'remaining_space' ||
        dim.classification === 'AISLE' ||
        dim.classification === 'REMAINING_SPACE' ||
        dim.classification === 'COLUMN_DEPTH' ||
        dim.orientation === 'inward';

      if (!isInteriorAllowed) {
        if (isPointInPolygon(dim.labelPoint, roomPolygon, false)) {
          return; // Reject rendering of interior-crossing architectural dimension
        }
      }
    }

    const { ctx, viewport } = this;
    const p1 = viewport.worldToScreen(dim.startPoint);
    const p2 = viewport.worldToScreen(dim.endPoint);
    const labelP = viewport.worldToScreen(dim.labelPoint);

    // Column dims use architectural red; aisle/remaining use green
    const isGreen =
      dim.type === 'aisle' ||
      dim.type === 'remaining_space' ||
      dim.classification === 'AISLE' ||
      dim.classification === 'REMAINING_SPACE';
    const strokeColor = isGreen ? '#16a34a' : '#b91c1c';
    const fillColor   = isGreen ? '#16a34a' : '#b91c1c';
    const textColor   = isGreen ? '#14532d' : '#991b1b';
    const badgeBorder = isGreen ? '#bbf7d0' : '#fee2e2';

    ctx.save();
    ctx.strokeStyle = strokeColor;
    ctx.fillStyle = fillColor;
    ctx.lineWidth = isGreen ? 1.2 : 1;
    if (isGreen) ctx.setLineDash([4, 2]);

    let lineStart = { x: 0, y: 0 };
    let lineEnd = { x: 0, y: 0 };

    // For slanted/diagonal walls (both dx and dy non-negligible), enforce aligned orientation
    // so dimension lines stay strictly parallel to the wall segment
    const isSlanted = Math.abs(dim.startPoint.x - dim.endPoint.x) > 2 && Math.abs(dim.startPoint.y - dim.endPoint.y) > 2;
    const effectiveOrientation = (isSlanted && dim.orientation !== 'inward') ? 'aligned' : dim.orientation;

    if (effectiveOrientation === 'horizontal') {
      lineStart = { x: p1.x, y: labelP.y };
      lineEnd = { x: p2.x, y: labelP.y };
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p1.x, labelP.y);
      ctx.moveTo(p2.x, p2.y);
      ctx.lineTo(p2.x, labelP.y);
      ctx.stroke();
    } else if (effectiveOrientation === 'vertical') {
      lineStart = { x: labelP.x, y: p1.y };
      lineEnd = { x: labelP.x, y: p2.y };
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(labelP.x, p1.y);
      ctx.moveTo(p2.x, p2.y);
      ctx.lineTo(labelP.x, p2.y);
      ctx.stroke();
    } else { // 'inward' or 'aligned'
      const lDx = labelP.x - (p1.x + p2.x) / 2;
      const lDy = labelP.y - (p1.y + p2.y) / 2;
      lineStart = { x: p1.x + lDx, y: p1.y + lDy };
      lineEnd = { x: p2.x + lDx, y: p2.y + lDy };
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(lineStart.x, lineStart.y);
      ctx.moveTo(p2.x, p2.y);
      ctx.lineTo(lineEnd.x, lineEnd.y);
      ctx.stroke();
    }

    // Dimension main line
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(lineStart.x, lineStart.y);
    ctx.lineTo(lineEnd.x, lineEnd.y);
    ctx.stroke();

    // Arrowheads
    ctx.fillStyle = fillColor;
    const lineRot = Math.atan2(lineEnd.y - lineStart.y, lineEnd.x - lineStart.x);
    const arrowLen = isGreen ? 5 : 6;
    const arrowAngle = Math.PI / 6;

    ctx.beginPath();
    ctx.moveTo(lineEnd.x, lineEnd.y);
    ctx.lineTo(lineEnd.x - arrowLen * Math.cos(lineRot - arrowAngle), lineEnd.y - arrowLen * Math.sin(lineRot - arrowAngle));
    ctx.lineTo(lineEnd.x - arrowLen * Math.cos(lineRot + arrowAngle), lineEnd.y - arrowLen * Math.sin(lineRot + arrowAngle));
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(lineStart.x, lineStart.y);
    ctx.lineTo(lineStart.x + arrowLen * Math.cos(lineRot - arrowAngle), lineStart.y + arrowLen * Math.sin(lineRot - arrowAngle));
    ctx.lineTo(lineStart.x + arrowLen * Math.cos(lineRot + arrowAngle), lineStart.y + arrowLen * Math.sin(lineRot + arrowAngle));
    ctx.closePath();
    ctx.fill();

    // Dimension Text — supports two-line labels (split on '\n')
    const lines = dim.formattedValue.split('\n');
    const mainLine = lines[0];
    const subLine  = lines[1] || '';

    ctx.font = 'bold 10px JetBrains Mono, Inter, monospace';
    const mainW = ctx.measureText(mainLine).width;
    const subW  = subLine ? ctx.measureText(subLine).width : 0;
    const badgeW = Math.max(mainW, subW) + 8;
    const badgeH = subLine ? 24 : 14;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(labelP.x - badgeW / 2, labelP.y - badgeH / 2, badgeW, badgeH);

    ctx.strokeStyle = badgeBorder;
    ctx.lineWidth = 0.8;
    ctx.setLineDash([]);
    ctx.strokeRect(labelP.x - badgeW / 2, labelP.y - badgeH / 2, badgeW, badgeH);

    ctx.fillStyle = textColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (subLine) {
      ctx.font = 'bold 10px JetBrains Mono, Inter, monospace';
      ctx.fillText(mainLine, labelP.x, labelP.y - 5);
      ctx.font = 'bold 7px Inter, sans-serif';
      ctx.fillStyle = isGreen ? '#166534' : '#b91c1c';
      ctx.fillText(subLine, labelP.x, labelP.y + 6);
    } else {
      ctx.fillText(mainLine, labelP.x, labelP.y + 1);
    }

    ctx.restore();
  }


  private drawToolPreview(tool: ToolType, points: Point2D[], cursorWorldPos?: Point2D | null) {
    const { ctx, viewport } = this;
    if (points.length === 0) return;

    ctx.save();
    const p1 = viewport.worldToScreen(points[0]);
    const p2 = cursorWorldPos ? viewport.worldToScreen(cursorWorldPos) : p1;

    if (tool === 'wall' || tool === 'partition') {
      ctx.strokeStyle = tool === 'wall' ? '#dc2626' : '#64748b';
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();

      if (cursorWorldPos) {
        const rawDist = distance(points[0], cursorWorldPos);
        const formatted = formatFeetInches(rawDist);

        const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
        ctx.font = 'bold 11px JetBrains Mono, monospace';
        const tw = ctx.measureText(formatted).width;

        ctx.fillStyle = '#0f172a';
        ctx.fillRect(mid.x - tw / 2 - 6, mid.y - 20, tw + 12, 18);

        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(formatted, mid.x, mid.y - 11);
      }
    } else if (tool === 'measure') {
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Endpoint markers
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(p1.x, p1.y, 4, 0, Math.PI * 2);
      ctx.fill();
      if (cursorWorldPos) {
        ctx.beginPath();
        ctx.arc(p2.x, p2.y, 4, 0, Math.PI * 2);
        ctx.fill();
      }

      // Perpendicular tick marks at endpoints
      if (cursorWorldPos) {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len > 0) {
          const nx = (-dy / len) * 6;
          const ny = (dx / len) * 6;
          ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(p1.x + nx, p1.y + ny);
          ctx.lineTo(p1.x - nx, p1.y - ny);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(p2.x + nx, p2.y + ny);
          ctx.lineTo(p2.x - nx, p2.y - ny);
          ctx.stroke();
        }
      }

      if (cursorWorldPos) {
        const rawDist = distance(points[0], cursorWorldPos);
        const formatted = formatFeetInches(rawDist);
        const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
        ctx.font = 'bold 11px JetBrains Mono, monospace';
        const tw = ctx.measureText(formatted).width;
        const badgeW = tw + 16;
        const badgeH = 20;
        ctx.fillStyle = 'rgba(217, 119, 6, 0.95)';
        ctx.beginPath();
        // Rounded rectangle badge
        const bx = mid.x - badgeW / 2;
        const by = mid.y - badgeH - 6;
        const r = 4;
        ctx.moveTo(bx + r, by);
        ctx.lineTo(bx + badgeW - r, by);
        ctx.quadraticCurveTo(bx + badgeW, by, bx + badgeW, by + r);
        ctx.lineTo(bx + badgeW, by + badgeH - r);
        ctx.quadraticCurveTo(bx + badgeW, by + badgeH, bx + badgeW - r, by + badgeH);
        ctx.lineTo(bx + r, by + badgeH);
        ctx.quadraticCurveTo(bx, by + badgeH, bx, by + badgeH - r);
        ctx.lineTo(bx, by + r);
        ctx.quadraticCurveTo(bx, by, bx + r, by);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(formatted, mid.x, by + badgeH / 2);
      }
    }

    ctx.restore();
  }

  private drawSnapIndicator(snap: SnapResult) {
    const { ctx, viewport } = this;
    const p = viewport.worldToScreen(snap.point);

    ctx.save();
    if (snap.type === 'endpoint') {
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2;
      ctx.strokeRect(p.x - 5, p.y - 5, 10, 10);
    } else if (snap.type === 'midpoint') {
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - 6);
      ctx.lineTo(p.x + 6, p.y + 6);
      ctx.lineTo(p.x - 6, p.y + 6);
      ctx.closePath();
      ctx.stroke();
    } else if (snap.type === 'wall') {
      ctx.strokeStyle = '#8b5cf6';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * Draw all persisted measure tool annotations.
   * Annotations are stored in world-space coordinates, so they automatically
   * follow pan and zoom without any extra computation.
   */
  private drawMeasureAnnotations(annotations: MeasureAnnotation[]) {
    const { ctx, viewport } = this;
    ctx.save();

    for (const ann of annotations) {
      const sp1 = viewport.worldToScreen(ann.p1);
      const sp2 = viewport.worldToScreen(ann.p2);

      // ── Line ──────────────────────────────────────────────────────────────
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.moveTo(sp1.x, sp1.y);
      ctx.lineTo(sp2.x, sp2.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // ── Perpendicular ticks ───────────────────────────────────────────────
      const dx = sp2.x - sp1.x;
      const dy = sp2.y - sp1.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      let nx = 0, ny = 0;
      if (len > 0) {
        nx = (-dy / len) * 7;
        ny = (dx / len) * 7;
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.9;
        for (const pt of [sp1, sp2]) {
          ctx.beginPath();
          ctx.moveTo(pt.x + nx, pt.y + ny);
          ctx.lineTo(pt.x - nx, pt.y - ny);
          ctx.stroke();
        }
      }

      // ── Endpoint dots ─────────────────────────────────────────────────────
      ctx.globalAlpha = 1;
      for (const pt of [sp1, sp2]) {
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 2, 0, Math.PI * 2);
        ctx.fill();
      }

      // ── Label badge ───────────────────────────────────────────────────────
      const mid = { x: (sp1.x + sp2.x) / 2, y: (sp1.y + sp2.y) / 2 };

      // Offset the badge perpendicular to the line to avoid overlap
      const labelOffsetMag = 14;
      let lox = 0, loy = -labelOffsetMag;
      if (len > 0) {
        lox = (-dy / len) * labelOffsetMag;
        loy = (dx / len) * labelOffsetMag;
        // Always prefer the upward screen direction (smaller y)
        if (loy > 0) { lox = -lox; loy = -loy; }
      }
      const lx = mid.x + lox;
      const ly = mid.y + loy;

      ctx.font = 'bold 11px JetBrains Mono, monospace';
      const tw = ctx.measureText(ann.label).width;
      const badgeW = tw + 16;
      const badgeH = 20;
      const bx = lx - badgeW / 2;
      const by = ly - badgeH / 2;
      const r = 4;

      // Badge shadow
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = 4;

      // Badge fill
      ctx.fillStyle = 'rgba(217, 119, 6, 0.97)';
      ctx.beginPath();
      ctx.moveTo(bx + r, by);
      ctx.lineTo(bx + badgeW - r, by);
      ctx.quadraticCurveTo(bx + badgeW, by, bx + badgeW, by + r);
      ctx.lineTo(bx + badgeW, by + badgeH - r);
      ctx.quadraticCurveTo(bx + badgeW, by + badgeH, bx + badgeW - r, by + badgeH);
      ctx.lineTo(bx + r, by + badgeH);
      ctx.quadraticCurveTo(bx, by + badgeH, bx, by + badgeH - r);
      ctx.lineTo(bx, by + r);
      ctx.quadraticCurveTo(bx, by, bx + r, by);
      ctx.closePath();
      ctx.fill();

      ctx.shadowBlur = 0;
      ctx.shadowColor = 'transparent';

      // Badge border
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Label text
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(ann.label, lx, ly);

      // Thin leader line from badge centre to measurement midpoint
      if (len > 4) {
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.45)';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.moveTo(lx, ly);
        ctx.lineTo(mid.x, mid.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    ctx.restore();
  }

  /**
   * Render the current CAD state to an off-screen canvas at the given pixel size.
   * Uses the same render pipeline as the live canvas — no second renderer.
   * The Viewport is computed to fit all entities with the given padding.
   *
   * @param entities  Current CAD entities (same array as live editor)
   * @param dimensions  Computed DimensionItems (from DimensionManager)
   * @param viewW  Output canvas width in CSS pixels
   * @param viewH  Output canvas height in CSS pixels
   * @param padding  World-space padding around content (inches)
   * @returns The rendered HTMLCanvasElement (use .toDataURL() to get PNG)
   */
  public static renderToOffscreenCanvas(
    entities: CADEntity[],
    dimensions: DimensionItem[],
    viewW: number,
    viewH: number,
    padding = 80
  ): HTMLCanvasElement {
    // --- 1. Build off-screen canvas ---
    const dpr = 1; // Export at 1:1 — caller controls size
    const canvas = document.createElement('canvas');
    canvas.width = viewW;
    canvas.height = viewH;
    const ctx = canvas.getContext('2d')!;

    // White background
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, viewW, viewH);

    // --- 2. Compute bounding box of all entities ---
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const e of entities) {
      if (e.type === 'wall') {
        const w = e as WallEntity;
        minX = Math.min(minX, w.geometry.x1, w.geometry.x2);
        maxX = Math.max(maxX, w.geometry.x1, w.geometry.x2);
        minY = Math.min(minY, w.geometry.y1, w.geometry.y2);
        maxY = Math.max(maxY, w.geometry.y1, w.geometry.y2);
      } else if ('x' in e.geometry && 'y' in e.geometry) {
        const g = e.geometry as { x: number; y: number; width?: number; depth?: number; height?: number };
        const hw = (g.width || 36) / 2;
        const hd = (g.depth || g.height || 36) / 2;
        minX = Math.min(minX, g.x - hw);
        maxX = Math.max(maxX, g.x + hw);
        minY = Math.min(minY, g.y - hd);
        maxY = Math.max(maxY, g.y + hd);
      }
    }
    // Also expand from dimension label points
    for (const dim of dimensions) {
      minX = Math.min(minX, dim.startPoint.x, dim.endPoint.x, dim.labelPoint.x);
      maxX = Math.max(maxX, dim.startPoint.x, dim.endPoint.x, dim.labelPoint.x);
      minY = Math.min(minY, dim.startPoint.y, dim.endPoint.y, dim.labelPoint.y);
      maxY = Math.max(maxY, dim.startPoint.y, dim.endPoint.y, dim.labelPoint.y);
    }
    if (minX === Infinity) { minX = 0; minY = 0; maxX = 600; maxY = 400; }

    // --- 3. Set up Viewport to fit the content ---
    const vp = new Viewport();
    vp.dpr = dpr;
    vp.resize(viewW, viewH, dpr);
    vp.zoomToFit({ minX, minY, maxX, maxY }, padding);

    // --- 4. Render using the full live render pipeline ---
    const renderer = new CADRenderer(ctx, vp);
    renderer.render({
      entities,
      dimensions,
      selectedEntityId: null,    // No selection highlight in export
      activeTool: 'select',
      showGrid: false,           // Clean export — no grid
      showDimensions: true,
    });

    return canvas;
  }

  // ─── AI Planner Preview Rendering ────────────────────────────────────────

  /**
   * Draw AI-suggested racks as dashed preview overlays.
   * These are NOT committed entities — they vanish on Cancel.
   * Visual style: violet/indigo dashed outline + semi-transparent fill + "AI" badge.
   */
  private drawAIPreviewRacks(racks: RackEntity[], entities: CADEntity[], roomPolygon?: Point2D[]) {
    for (const rack of racks) {
      const rt = rack.properties.rackType;
      const isCorner = rt === 'corner_rack_2x2x2' || rt === 'Corner Rack';
      const isWall = rt.startsWith('wall_rack') || rt === 'Wall Rack';

      if (isCorner) {
        this.drawAIPreviewCornerRack(rack);
      } else if (isWall) {
        this.drawAIPreviewWallRack(rack, entities, roomPolygon);
      } else {
        this.drawAIPreviewRectRack(rack);
      }
    }
  }

  private drawAIPreviewWallRack(rack: RackEntity, entities: CADEntity[], roomPolygon?: Point2D[]) {
    const { ctx, viewport } = this;
    const rw = rack.geometry.width || 36;
    const rd = rack.geometry.depth || 24;

    let wallAngleRad = 0;
    const wall = entities.find((e) => e.id === rack.properties.attachedWallId) as WallEntity | undefined;
    if (wall) {
      wallAngleRad = Math.atan2(wall.geometry.y2 - wall.geometry.y1, wall.geometry.x2 - wall.geometry.x1);
    } else {
      wallAngleRad = ((rack.geometry.rotation || 0) * Math.PI) / 180;
    }

    let inwardDx = 0;
    let inwardDy = 0;
    if (rack.properties.inwardNormal) {
      inwardDx = rack.properties.inwardNormal.x;
      inwardDy = rack.properties.inwardNormal.y;
    } else if (wall && roomPolygon && roomPolygon.length >= 3) {
      const normals = calculateWallInwardNormal(
        { x: wall.geometry.x1, y: wall.geometry.y1 },
        { x: wall.geometry.x2, y: wall.geometry.y2 },
        roomPolygon
      );
      inwardDx = normals.inwardNormal.x;
      inwardDy = normals.inwardNormal.y;
    } else {
      const wallSide = rack.properties.wallSide;
      if (wallSide === 'top') { inwardDx = 0; inwardDy = 1; }
      else if (wallSide === 'bottom') { inwardDx = 0; inwardDy = -1; }
      else if (wallSide === 'left') { inwardDx = 1; inwardDy = 0; }
      else if (wallSide === 'right') { inwardDx = -1; inwardDy = 0; }
      else {
        inwardDx = -Math.sin(wallAngleRad);
        inwardDy = Math.cos(wallAngleRad);
      }
    }

    const cos = Math.cos(wallAngleRad);
    const sin = Math.sin(wallAngleRad);
    const toWorld = (along: number, depth: number) => ({
      x: rack.geometry.x + along * cos + inwardDx * depth,
      y: rack.geometry.y + along * sin + inwardDy * depth,
    });

    const worldTL = toWorld(-rw / 2, 0);
    const worldTR = toWorld(rw / 2, 0);
    const worldBR = toWorld(rw / 2, rd);
    const worldBL = toWorld(-rw / 2, rd);

    const sTL = viewport.worldToScreen(worldTL);
    const sTR = viewport.worldToScreen(worldTR);
    const sBR = viewport.worldToScreen(worldBR);
    const sBL = viewport.worldToScreen(worldBL);

    ctx.save();
    // Fill
    ctx.beginPath();
    ctx.moveTo(sTL.x, sTL.y);
    ctx.lineTo(sTR.x, sTR.y);
    ctx.lineTo(sBR.x, sBR.y);
    ctx.lineTo(sBL.x, sBL.y);
    ctx.closePath();
    ctx.fillStyle = 'rgba(99, 102, 241, 0.12)';
    ctx.fill();

    // Dashed border
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = '#818cf8';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(sTL.x, sTL.y);
    ctx.lineTo(sTR.x, sTR.y);
    ctx.lineTo(sBR.x, sBR.y);
    ctx.lineTo(sBL.x, sBL.y);
    ctx.closePath();
    ctx.stroke();

    // Wall anchor line (bold)
    ctx.setLineDash([]);
    ctx.strokeStyle = '#4f46e5';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(sTL.x, sTL.y);
    ctx.lineTo(sTR.x, sTR.y);
    ctx.stroke();

    // AI badge
    const centerW = viewport.worldToScreen(toWorld(0, rd / 2));
    ctx.fillStyle = 'rgba(99, 102, 241, 0.85)';
    ctx.beginPath();
    ctx.roundRect(centerW.x - 11, centerW.y - 6, 22, 12, 3);
    ctx.fill();

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 8px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('AI', centerW.x, centerW.y);

    ctx.restore();
  }

  private drawAIPreviewRectRack(rack: RackEntity) {
    const { ctx, viewport } = this;
    const rw = rack.geometry.width;
    const rd = rack.geometry.depth;
    const rot = ((rack.geometry.rotation || 0) * Math.PI) / 180;

    const center = viewport.worldToScreen({ x: rack.geometry.x, y: rack.geometry.y });
    const sW = rw * viewport.zoom;
    const sD = rd * viewport.zoom;

    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.rotate(rot);

    const x = -sW / 2;
    const y = -sD / 2;

    // Semi-transparent fill
    ctx.fillStyle = 'rgba(99, 102, 241, 0.12)';
    ctx.fillRect(x, y, sW, sD);

    // Dashed violet border
    ctx.save();
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = '#818cf8';
    ctx.lineWidth = 1.8;
    ctx.strokeRect(x, y, sW, sD);
    ctx.restore();

    // Thin inner border
    ctx.strokeStyle = 'rgba(139, 92, 246, 0.4)';
    ctx.lineWidth = 0.8;
    ctx.setLineDash([]);
    ctx.strokeRect(x + 3, y + 3, sW - 6, sD - 6);

    // "AI" badge in center
    if (sW > 20 && sD > 12) {
      ctx.fillStyle = 'rgba(99, 102, 241, 0.85)';
      const bw = Math.min(22, sW * 0.4);
      const bh = 12;
      ctx.beginPath();
      ctx.roundRect(-bw / 2, -bh / 2, bw, bh, 3);
      ctx.fill();

      ctx.fillStyle = '#fff';
      ctx.font = `bold ${Math.min(8, sD * 0.35)}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('AI', 0, 0);
    }

    ctx.restore();
  }

  private drawAIPreviewCornerRack(rack: RackEntity) {
    const { ctx, viewport } = this;
    const sideA = rack.geometry.width || 24;
    const sideB = rack.geometry.depth || 24;
    const thickness = Math.min(sideA, sideB);

    let aDx = 1, aDy = 0, bDx = 0, bDy = 1;
    if (rack.geometry.rotation !== undefined && Math.abs(rack.geometry.rotation) > 0.01) {
      const rotRad = ((rack.geometry.rotation || 0) * Math.PI) / 180;
      aDx = Math.cos(rotRad);
      aDy = Math.sin(rotRad);
      bDx = -Math.sin(rotRad);
      bDy = Math.cos(rotRad);
    } else {
      const cornerPos = rack.properties.cornerPosition || 'top-left';
      switch (cornerPos) {
        case 'top-left':    aDx =  1; aDy = 0; bDx = 0; bDy =  1; break;
        case 'top-right':   aDx = -1; aDy = 0; bDx = 0; bDy =  1; break;
        case 'bottom-left': aDx =  1; aDy = 0; bDx = 0; bDy = -1; break;
        case 'bottom-right':aDx = -1; aDy = 0; bDx = 0; bDy = -1; break;
      }
    }

    const anchor = { x: rack.geometry.x, y: rack.geometry.y };
    const toScreen = (wx: number, wy: number) => viewport.worldToScreen({ x: wx, y: wy });

    const aP1 = toScreen(anchor.x, anchor.y);
    const aP2 = toScreen(anchor.x + aDx * sideA, anchor.y + aDy * sideA);
    const aP3 = toScreen(anchor.x + aDx * sideA + bDx * thickness, anchor.y + aDy * sideA + bDy * thickness);
    const aP4 = toScreen(anchor.x + bDx * thickness, anchor.y + bDy * thickness);

    const bP2 = toScreen(anchor.x + aDx * thickness, anchor.y + aDy * thickness);
    const bP3 = toScreen(anchor.x + aDx * thickness + bDx * sideB, anchor.y + aDy * thickness + bDy * sideB);
    const bP4 = toScreen(anchor.x + bDx * sideB, anchor.y + bDy * sideB);

    ctx.save();

    // Fill both wings
    ctx.fillStyle = 'rgba(99, 102, 241, 0.12)';
    ctx.beginPath();
    ctx.moveTo(aP1.x, aP1.y); ctx.lineTo(aP2.x, aP2.y);
    ctx.lineTo(aP3.x, aP3.y); ctx.lineTo(aP4.x, aP4.y);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(aP1.x, aP1.y); ctx.lineTo(bP2.x, bP2.y);
    ctx.lineTo(bP3.x, bP3.y); ctx.lineTo(bP4.x, bP4.y);
    ctx.closePath(); ctx.fill();

    // Dashed outline for both wings
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = '#818cf8';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(aP1.x, aP1.y); ctx.lineTo(aP2.x, aP2.y);
    ctx.lineTo(aP3.x, aP3.y); ctx.lineTo(aP4.x, aP4.y);
    ctx.closePath(); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(aP1.x, aP1.y); ctx.lineTo(bP2.x, bP2.y);
    ctx.lineTo(bP3.x, bP3.y); ctx.lineTo(bP4.x, bP4.y);
    ctx.closePath(); ctx.stroke();

    // "AI" label at anchor
    const anchorScreen = toScreen(anchor.x, anchor.y);
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(99, 102, 241, 0.85)';
    ctx.beginPath();
    ctx.roundRect(anchorScreen.x + 2, anchorScreen.y + 2, 20, 10, 3);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 7px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('AI', anchorScreen.x + 5, anchorScreen.y + 7);

    ctx.restore();
  }

  // ─── AI Remaining-Space Dimension Rendering ───────────────────────────────

  private drawAIDimensions(dims: DimensionItem[]) {
    const { ctx, viewport } = this;
    for (const dim of dims) {
      const p1 = viewport.worldToScreen(dim.startPoint);
      const p2 = viewport.worldToScreen(dim.endPoint);
      const labelP = viewport.worldToScreen(dim.labelPoint);

      // Per requirement: both aisle AND remaining-space use GREEN
      const color = '#16a34a'; // green-600
      const textColor = '#14532d'; // green-900
      const badgeBg = 'rgba(240, 253, 244, 0.95)'; // green-50 semi-transparent

      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.2;
      ctx.setLineDash([5, 3]);

      // Draw dashed line from p1 to p2
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();

      // Arrowheads at both ends
      ctx.setLineDash([]);
      ctx.fillStyle = color;
      const lineRot = Math.atan2(p2.y - p1.y, p2.x - p1.x);
      const arrowLen = 5;
      const arrowAngle = Math.PI / 6;

      ctx.beginPath();
      ctx.moveTo(p2.x, p2.y);
      ctx.lineTo(p2.x - arrowLen * Math.cos(lineRot - arrowAngle), p2.y - arrowLen * Math.sin(lineRot - arrowAngle));
      ctx.lineTo(p2.x - arrowLen * Math.cos(lineRot + arrowAngle), p2.y - arrowLen * Math.sin(lineRot + arrowAngle));
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p1.x + arrowLen * Math.cos(lineRot - arrowAngle), p1.y + arrowLen * Math.sin(lineRot - arrowAngle));
      ctx.lineTo(p1.x + arrowLen * Math.cos(lineRot + arrowAngle), p1.y + arrowLen * Math.sin(lineRot + arrowAngle));
      ctx.closePath();
      ctx.fill();

      // Label — parse multi-line formattedValue (e.g. "3'-0"\nAISLE")
      const lines = dim.formattedValue.split('\n');
      const valText  = lines[0] || dim.formattedValue;
      const typeText = lines[1] || (dim.type === 'aisle' ? 'AISLE' : 'REMAINING');

      ctx.font = 'bold 9px Inter, sans-serif';
      const padding = 4;
      const tw = Math.max(ctx.measureText(valText).width, ctx.measureText(typeText).width);
      const th = 22;
      const lx = labelP.x, ly = labelP.y;

      ctx.fillStyle = badgeBg;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(lx - tw / 2 - padding, ly - th / 2, tw + padding * 2, th, 4);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = textColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 9px Inter, sans-serif';
      ctx.fillText(valText, lx, ly - 4);
      ctx.font = 'bold 7px Inter, sans-serif';
      ctx.fillText(typeText, lx, ly + 5);

      ctx.restore();
    }
  }

  /**
   * Temporary development Visual Debug Mode overlay.
   * Displays wall centerline, wall interior face, inward normal vectors,
   * rack true footprints, and rack wall-face anchor points.
   */
  private drawVisualDebugOverlay(entities: CADEntity[], roomPolygon: Point2D[]) {
    const { ctx, viewport } = this;
    ctx.save();

    const walls = entities.filter((e): e is WallEntity => e.type === 'wall');
    for (const w of walls) {
      const p1 = { x: w.geometry.x1, y: w.geometry.y1 };
      const p2 = { x: w.geometry.x2, y: w.geometry.y2 };
      const s1 = viewport.worldToScreen(p1);
      const s2 = viewport.worldToScreen(p2);
      const thick = w.properties.thickness || 9;

      // 1. Wall Centerline (dashed gray)
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(s1.x, s1.y);
      ctx.lineTo(s2.x, s2.y);
      ctx.stroke();

      // 2. Inward normal arrow & Interior wall face
      if (roomPolygon && roomPolygon.length >= 3) {
        const normals = calculateWallInwardNormal(p1, p2, roomPolygon);
        const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
        const smid = viewport.worldToScreen(mid);
        const arrowTip = viewport.worldToScreen({
          x: mid.x + normals.inwardNormal.x * 24,
          y: mid.y + normals.inwardNormal.y * 24,
        });

        // Green arrow for inward normal
        ctx.setLineDash([]);
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(smid.x, smid.y);
        ctx.lineTo(arrowTip.x, arrowTip.y);
        ctx.stroke();

        // Arrowhead
        const arrowAngle = Math.atan2(arrowTip.y - smid.y, arrowTip.x - smid.x);
        ctx.fillStyle = '#10b981';
        ctx.beginPath();
        ctx.moveTo(arrowTip.x, arrowTip.y);
        ctx.lineTo(arrowTip.x - 6 * Math.cos(arrowAngle - 0.4), arrowTip.y - 6 * Math.sin(arrowAngle - 0.4));
        ctx.lineTo(arrowTip.x - 6 * Math.cos(arrowAngle + 0.4), arrowTip.y - 6 * Math.sin(arrowAngle + 0.4));
        ctx.closePath();
        ctx.fill();

        // Interior wall face (cyan line)
        const f1 = viewport.worldToScreen({
          x: p1.x + normals.inwardNormal.x * (thick / 2),
          y: p1.y + normals.inwardNormal.y * (thick / 2),
        });
        const f2 = viewport.worldToScreen({
          x: p2.x + normals.inwardNormal.x * (thick / 2),
          y: p2.y + normals.inwardNormal.y * (thick / 2),
        });
        ctx.strokeStyle = '#06b6d4';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.moveTo(f1.x, f1.y);
        ctx.lineTo(f2.x, f2.y);
        ctx.stroke();
      }
    }

    // 3. Rack anchor points & true footprints
    const racks = entities.filter((e): e is RackEntity => e.type === 'rack');
    for (const r of racks) {
      const anchorScr = viewport.worldToScreen({ x: r.geometry.x, y: r.geometry.y });
      // Magenta dot at anchor
      ctx.fillStyle = '#ec4899';
      ctx.beginPath();
      ctx.arc(anchorScr.x, anchorScr.y, 3.5, 0, Math.PI * 2);
      ctx.fill();

      // True footprint overlay
      const fp = this.computeRackFootprint(r, entities, roomPolygon);
      if (fp.length >= 3) {
        const sfp = fp.map((pt) => viewport.worldToScreen(pt));
        ctx.strokeStyle = '#a855f7';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(sfp[0].x, sfp[0].y);
        for (let i = 1; i < sfp.length; i++) ctx.lineTo(sfp[i].x, sfp[i].y);
        ctx.closePath();
        ctx.stroke();
      }
    }

    ctx.restore();
  }
}

