import type { Point2D, ViewportState, BoundingBox2D } from '../types';

export class Viewport {
  public zoom: number = 0.8;
  public panX: number = 0;
  public panY: number = 0;
  public width: number = 800;
  public height: number = 600;
  public dpr: number = window.devicePixelRatio || 1;
  public roomShapeMode?: 'AUTO' | 'MANUAL';

  constructor(state?: Partial<ViewportState>) {
    if (state) {
      if (state.zoom !== undefined) this.zoom = state.zoom;
      if (state.panX !== undefined) this.panX = state.panX;
      if (state.panY !== undefined) this.panY = state.panY;
      if (state.roomShapeMode !== undefined) this.roomShapeMode = state.roomShapeMode;
    }
  }

  public resize(width: number, height: number, dpr = window.devicePixelRatio || 1) {
    this.width = width;
    this.height = height;
    this.dpr = dpr;
  }

  public screenToWorld(screenPoint: Point2D): Point2D {
    return {
      x: (screenPoint.x - this.panX) / this.zoom,
      y: (screenPoint.y - this.panY) / this.zoom,
    };
  }

  public worldToScreen(worldPoint: Point2D): Point2D {
    return {
      x: worldPoint.x * this.zoom + this.panX,
      y: worldPoint.y * this.zoom + this.panY,
    };
  }

  public zoomAt(screenPoint: Point2D, factor: number) {
    const minZoom = 0.05;
    const maxZoom = 15.0;

    const oldZoom = this.zoom;
    const newZoom = Math.min(maxZoom, Math.max(minZoom, oldZoom * factor));

    if (newZoom === oldZoom) return;

    this.panX = screenPoint.x - (screenPoint.x - this.panX) * (newZoom / oldZoom);
    this.panY = screenPoint.y - (screenPoint.y - this.panY) * (newZoom / oldZoom);
    this.zoom = newZoom;
  }

  public panBy(deltaX: number, deltaY: number) {
    this.panX += deltaX;
    this.panY += deltaY;
  }

  public zoomToFit(box: BoundingBox2D, padding = 80) {
    const boxW = Math.max(box.maxX - box.minX, 120);
    const boxH = Math.max(box.maxY - box.minY, 120);

    const availW = Math.max(this.width - padding * 2, 200);
    const availH = Math.max(this.height - padding * 2, 200);

    const zoomX = availW / boxW;
    const zoomY = availH / boxH;
    const newZoom = Math.min(zoomX, zoomY, 2.0);

    this.zoom = Math.max(0.1, newZoom);

    const centerWorldX = (box.minX + box.maxX) / 2;
    const centerWorldY = (box.minY + box.maxY) / 2;

    this.panX = this.width / 2 - centerWorldX * this.zoom;
    this.panY = this.height / 2 - centerWorldY * this.zoom;
  }

  public getState(): ViewportState {
    return {
      zoom: this.zoom,
      panX: this.panX,
      panY: this.panY,
      roomShapeMode: this.roomShapeMode,
    };
  }

  public setState(state: ViewportState) {
    this.zoom = state.zoom;
    this.panX = state.panX;
    this.panY = state.panY;
    if (state.roomShapeMode !== undefined) {
      this.roomShapeMode = state.roomShapeMode;
    }
  }
}
