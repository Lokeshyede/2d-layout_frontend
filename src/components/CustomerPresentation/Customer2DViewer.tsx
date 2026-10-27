import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { CADEntity, BoundingBox2D } from '../../cad/types';
import { Viewport } from '../../cad/engine/Viewport';
import { CADRenderer } from '../../cad/rendering/CADRenderer';
import { DimensionManager } from '../../cad/dimensions/DimensionManager';
import { ZoomIn, ZoomOut, Maximize2, Download, Layers } from 'lucide-react';

interface Customer2DViewerProps {
  entities: CADEntity[];
  storeName?: string;
  projectTitle?: string;
  allowPngDownload?: boolean;
}

export const Customer2DViewer: React.FC<Customer2DViewerProps> = ({
  entities,
  storeName = 'Retail Store',
  projectTitle = 'Store Layout',
  allowPngDownload = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<Viewport>(new Viewport({ zoom: 1.0, panX: 0, panY: 0 }));
  const rendererRef = useRef<CADRenderer | null>(null);
  const dimManagerRef = useRef<DimensionManager>(new DimensionManager());

  const [isPanning, setIsPanning] = useState(false);
  const lastMousePos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const [downloadingPng, setDownloadingPng] = useState(false);

  // Compute store bounding box from actual saved entities
  const computeStoreBounds = useCallback((): BoundingBox2D => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    for (const ent of entities) {
      if (ent.type === 'wall' && (ent as any).geometry) {
        const g = (ent as any).geometry;
        minX = Math.min(minX, g.x1, g.x2);
        minY = Math.min(minY, g.y1, g.y2);
        maxX = Math.max(maxX, g.x1, g.x2);
        maxY = Math.max(maxY, g.y1, g.y2);
      } else if ((ent as any).geometry) {
        const g = (ent as any).geometry;
        const x = g.x || 0;
        const y = g.y || 0;
        const w = g.width || 0;
        const h = g.height || g.length || 0;
        minX = Math.min(minX, x - w / 2);
        minY = Math.min(minY, y - h / 2);
        maxX = Math.max(maxX, x + w / 2);
        maxY = Math.max(maxY, y + h / 2);
      }
    }

    if (!isFinite(minX) || !isFinite(maxX)) {
      return { minX: 0, minY: 0, maxX: 400, maxY: 300 };
    }

    return {
      minX,
      minY,
      maxX,
      maxY,
    };
  }, [entities]);

  // Render function
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !rendererRef.current) return;

    const dimensions = dimManagerRef.current.generateDimensions(entities);

    rendererRef.current.render({
      entities,
      dimensions,
      activeTool: 'select',
      showGrid: true,
      showDimensions: true,
    });
  }, [entities]);

  // Fit to screen
  const fitToScreen = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const bounds = computeStoreBounds();
    const w = container.clientWidth;
    const h = container.clientHeight;
    viewportRef.current.resize(w, h);
    viewportRef.current.zoomToFit(bounds, 60);
    renderCanvas();
  }, [computeStoreBounds, renderCanvas]);

  // Setup canvas & resize observer
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    rendererRef.current = new CADRenderer(ctx, viewportRef.current);

    const updateDimensions = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      viewportRef.current.resize(w, h, dpr);
      renderCanvas();
    };

    updateDimensions();
    fitToScreen();

    const resizeObserver = new ResizeObserver(() => {
      updateDimensions();
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, [fitToScreen, renderCanvas]);

  // Pan & Zoom Event Handlers
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const screenPos = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };

    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
    viewportRef.current.zoomAt(screenPos, zoomFactor);
    renderCanvas();
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0 || e.button === 1) {
      setIsPanning(true);
      lastMousePos.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPanning) return;
    const dx = e.clientX - lastMousePos.current.x;
    const dy = e.clientY - lastMousePos.current.y;
    lastMousePos.current = { x: e.clientX, y: e.clientY };

    viewportRef.current.panBy(dx, dy);
    renderCanvas();
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  // Touch event handlers for mobile
  const touchStartRef = useRef<{ x: number; y: number; dist?: number }>({ x: 0, y: 0 });

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      touchStartRef.current.dist = Math.hypot(dx, dy);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    e.preventDefault();
    if (e.touches.length === 1) {
      const dx = e.touches[0].clientX - touchStartRef.current.x;
      const dy = e.touches[0].clientY - touchStartRef.current.y;
      touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      viewportRef.current.panBy(dx, dy);
      renderCanvas();
    } else if (e.touches.length === 2 && touchStartRef.current.dist) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const factor = dist / touchStartRef.current.dist;
      touchStartRef.current.dist = dist;

      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
        viewportRef.current.zoomAt({ x: midX, y: midY }, factor);
        renderCanvas();
      }
    }
  };

  // Zoom buttons
  const handleZoomIn = () => {
    const container = containerRef.current;
    if (!container) return;
    const center = { x: container.clientWidth / 2, y: container.clientHeight / 2 };
    viewportRef.current.zoomAt(center, 1.25);
    renderCanvas();
  };

  const handleZoomOut = () => {
    const container = containerRef.current;
    if (!container) return;
    const center = { x: container.clientWidth / 2, y: container.clientHeight / 2 };
    viewportRef.current.zoomAt(center, 0.8);
    renderCanvas();
  };

  // Export high-resolution PNG representing actual CAD geometry with watermark
  const handleDownloadPng = async () => {
    try {
      setDownloadingPng(true);
      const bounds = computeStoreBounds();
      const exportWidth = 2400;
      const exportHeight = 1600;

      const offscreen = document.createElement('canvas');
      offscreen.width = exportWidth;
      offscreen.height = exportHeight;
      const offCtx = offscreen.getContext('2d');
      if (!offCtx) return;

      const exportViewport = new Viewport({ zoom: 1.0, panX: 0, panY: 0 });
      exportViewport.resize(exportWidth, exportHeight, 1);
      exportViewport.zoomToFit(bounds, 120);

      const exportRenderer = new CADRenderer(offCtx, exportViewport);
      const dimensions = dimManagerRef.current.generateDimensions(entities);

      exportRenderer.render({
        entities,
        dimensions,
        activeTool: 'select',
        showGrid: true,
        showDimensions: true,
      });

      // Subtle RetailFix Watermark (Clean & Professional)
      offCtx.save();
      offCtx.fillStyle = 'rgba(237, 28, 36, 0.85)'; // RetailFix Red
      offCtx.font = 'bold 28px Inter, sans-serif';
      offCtx.fillText('RetailFix', 40, 50);

      offCtx.fillStyle = '#334155';
      offCtx.font = '500 18px Inter, sans-serif';
      offCtx.fillText(`${storeName} — ${projectTitle}`, 40, 78);

      offCtx.fillStyle = '#64748b';
      offCtx.font = '14px Inter, sans-serif';
      offCtx.fillText('Confidential — RetailFix CAD Layout Proposal', 40, 102);

      // Bottom right subtle watermark
      offCtx.textAlign = 'right';
      offCtx.font = '13px Inter, sans-serif';
      offCtx.fillStyle = 'rgba(100, 116, 139, 0.6)';
      offCtx.fillText('Generated by RetailFix CAD Engine', exportWidth - 40, exportHeight - 30);
      offCtx.restore();

      // Trigger download
      const dataUrl = offscreen.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = dataUrl;
      const cleanStore = storeName.replace(/[^a-zA-Z0-9_-]/g, '_');
      link.download = `RetailFix_${cleanStore}_2D_Layout.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('PNG export failed:', err);
    } finally {
      setDownloadingPng(false);
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-[#f8fafc] overflow-hidden select-none"
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full block cursor-grab active:cursor-grabbing"
      />

      {/* Floating 2D Controls Bar */}
      <div className="absolute bottom-6 right-6 z-20 flex items-center gap-2 bg-white/95 backdrop-blur-md px-3 py-2 rounded-2xl shadow-xl border border-slate-200">
        <button
          onClick={handleZoomIn}
          title="Zoom In"
          className="p-2 rounded-xl text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={handleZoomOut}
          title="Zoom Out"
          className="p-2 rounded-xl text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          onClick={fitToScreen}
          title="Fit Store"
          className="p-2 rounded-xl text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors"
        >
          <Maximize2 className="w-4 h-4" />
        </button>

        {allowPngDownload && (
          <>
            <div className="h-4 w-px bg-slate-200 mx-1" />
            <button
              onClick={handleDownloadPng}
              disabled={downloadingPng}
              title="Download 2D CAD Layout as High-Resolution PNG"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-all"
            >
              <Download className="w-3.5 h-3.5" />
              {downloadingPng ? 'Exporting...' : 'Download PNG'}
            </button>
          </>
        )}
      </div>

      {/* Floating Floor Plan Info Badge */}
      <div className="absolute top-4 left-4 z-20 pointer-events-none bg-white/90 backdrop-blur-md px-3.5 py-1.5 rounded-xl border border-slate-200 shadow-md flex items-center gap-2">
        <Layers className="w-4 h-4 text-red-600" />
        <span className="text-xs font-semibold text-slate-800">2D Floor Plan • Read Only</span>
      </div>
    </div>
  );
};
