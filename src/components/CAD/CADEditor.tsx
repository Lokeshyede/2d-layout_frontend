import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';

// ── Measure tool annotation type ─────────────────────────────────────────────
interface MeasureAnnotation {
  id: string;
  p1: Point2D;
  p2: Point2D;
  distInches: number;
  label: string;
}
import type {
  CADEntity,
  ToolType,
  Point2D,
  WallEntity,
  ColumnEntity,
  DoorEntity,
  WindowEntity,
  RackEntity,
  ShutterEntity,
  GateEntity,
  GlassGateEntity,
  PartitionEntity,
  TextEntity,
} from '../../cad/types';
import { Viewport } from '../../cad/engine/Viewport';
import { SnapEngine } from '../../cad/engine/SnapEngine';
import { HistoryManager } from '../../cad/engine/HistoryManager';
import { RackConnectionEngine } from '../../cad/engine/RackConnectionEngine';
import { RackGroupTransformEngine } from '../../cad/engine/RackGroupTransformEngine';
import { DimensionManager } from '../../cad/dimensions/DimensionManager';
import { CADRenderer } from '../../cad/rendering/CADRenderer';
import { SheetExporter } from '../../cad/export/SheetExporter';
import { DXFExporter } from '../../cad/export/DXFExporter';
import { DimensionInput } from './DimensionInput';
import { AIPlannerModal } from './AIPlannerModal';
import { CustomRackModal, type CustomRackParams } from './CustomRackModal';
import { RackCatalogueModal } from './RackCatalogueModal';
import { ShareModal } from './ShareModal';
import { MultiSelectRotationToolbar } from './MultiSelectRotationToolbar';
import { Store3DViewer } from '../../cad/rendering3d/Store3DViewer';
import { ProductModelRegistry } from '../../cad/services/ProductModelRegistry';
import type { Product3DModelData } from '../../services/api';
import { formatFeetInches, parseFeetInches, formatCustomRackLabel } from '../../cad/geometry/FeetInches';
import { distance, midpoint, buildRoomPolygon, calculateWallInwardNormal, projectPointOntoLine } from '../../cad/geometry/GeometryMath';
import { WallPlacementEngine, type WallPlacementCalculationResult } from '../../cad/engine/WallPlacementEngine';
import { RackPlacementController, type RackPlacementTemplate, type RackPlacementCalculation } from '../../cad/engine/RackPlacementController';
import { WallPositioningPanel } from './WallPositioningPanel';
import { api, type ProjectDataResponse } from '../../services/api';
import {
  MousePointer,
  Hand,
  Square,
  DoorOpen,
  Maximize2,
  Box,
  ShoppingBag,
  Sliders,
  Shield,
  Ruler,
  Type,
  Trash2,
  Undo2,
  Redo2,
  Save,
  Download,
  FileDown,
  Layers,
  ZoomIn,
  ZoomOut,
  Maximize,
  Compass,
  Info,
  Sparkles,
  RotateCw,
  Share2,
  AlertCircle,
  MoreVertical,
  X,
  RotateCcw,
  Check,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  Store,
  CornerDownRight,
  LayoutGrid,
  Columns,
} from 'lucide-react';

const EMPTY_ROOM_POLYGON: Point2D[] = [];

interface CADEditorProps {
  projectId: string;
  surveyToken?: string;
  isAdmin?: boolean;
  onExit?: () => void;
}

export const CADEditor: React.FC<CADEditorProps> = ({ projectId, surveyToken, isAdmin, onExit }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Engines (persisted via refs)
  const viewportRef = useRef<Viewport>(new Viewport());
  const snapEngineRef = useRef<SnapEngine>(new SnapEngine());
  const historyRef = useRef<HistoryManager>(new HistoryManager());
  const dimManagerRef = useRef<DimensionManager>(new DimensionManager());
  const rendererRef = useRef<CADRenderer | null>(null);

  // CAD State
  const [entities, setEntities] = useState<CADEntity[]>([]);
  const entitiesRef = useRef<CADEntity[]>([]);

  const activeRoomPolygon = useMemo(() => {
    if (viewportRef.current.roomShapeMode === 'MANUAL') {
      const walls = entities.filter((e): e is WallEntity => e.type === 'wall');
      return walls.length >= 3 ? buildRoomPolygon(walls) : EMPTY_ROOM_POLYGON;
    }
    return EMPTY_ROOM_POLYGON;
  }, [entities]);
  const [activeTool, setActiveTool] = useState<ToolType>('wall');
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const selectedEntityIdRef = useRef<string | null>(null);
  useEffect(() => {
    selectedEntityIdRef.current = selectedEntityId;
  }, [selectedEntityId]);

  // Multi-select state: Set of rack entity IDs that are part of the batch selection
  const [selectedEntityIds, setSelectedEntityIds] = useState<Set<string>>(new Set());
  const selectedEntityIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    selectedEntityIdsRef.current = selectedEntityIds;
  }, [selectedEntityIds]);

  // Drag-selection rubber-band state
  const isDragSelectingRef = useRef(false);
  /** True when Ctrl was held at drag-selection start — merges with existing selection */
  const isDragSelectAddModeRef = useRef(false);
  const dragSelectStartScreenRef = useRef<Point2D>({ x: 0, y: 0 });
  const dragSelectStartWorldRef = useRef<Point2D>({ x: 0, y: 0 });
  const [dragSelectionRect, setDragSelectionRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const dragSelectionRectRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);


  const [activeDrawingPoints, setActiveDrawingPoints] = useState<Point2D[]>([]);
  const activeDrawingPointsRef = useRef<Point2D[]>([]);
  const [isExporting, setIsExporting] = useState(false);

  // ── Measure tool: persisted completed measurement annotations ────────────
  const [measureAnnotations, setMeasureAnnotations] = useState<MeasureAnnotation[]>([]);
  const measureAnnotationsRef = useRef<MeasureAnnotation[]>([]);

  useEffect(() => {
    activeDrawingPointsRef.current = activeDrawingPoints;
  }, [activeDrawingPoints]);

  useEffect(() => {
    measureAnnotationsRef.current = measureAnnotations;
  }, [measureAnnotations]);

  const [cursorWorldPos, setCursorWorldPos] = useState<Point2D>({ x: 0, y: 0 });
  const [snapIndicator, setSnapIndicator] = useState<any>(null);

  // Metadata & Project Info
  const [projectData, setProjectData] = useState<ProjectDataResponse | null>(null);
  const [revision, setRevision] = useState<string>('REV 1');
  const [revisionsList, setRevisionsList] = useState<{ id: number; revisionName: string }[]>([]);

  // Toggles & Settings
  const [showGrid, setShowGrid] = useState(true);
  const [gridSnap, setGridSnap] = useState(true);
  const [orthoMode, setOrthoMode] = useState(false);
  const [showDimensions, setShowDimensions] = useState(true);
  const [showRackDimensions, setShowRackDimensions] = useState(false);
  const [showTempRefDimensions, setShowTempRefDimensions] = useState(false);

  // Auto-Save State
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved' | 'error'>('saved');
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);
  const [showMobileProps, setShowMobileProps] = useState(false);
  const [showMobileMoreMenu, setShowMobileMoreMenu] = useState(false);
  const [showMobileMoreTools, setShowMobileMoreTools] = useState(false);
  const [tabletInspectorOpen, setTabletInspectorOpen] = useState(false);
  const [touchMultiSelectMode, setTouchMultiSelectMode] = useState(false);
  const touchMultiSelectModeRef = useRef(false);
  useEffect(() => {
    touchMultiSelectModeRef.current = touchMultiSelectMode;
  }, [touchMultiSelectMode]);

  // Touch & Pinch-to-zoom Refs
  const isPinchingRef = useRef(false);
  const pinchLastDistRef = useRef(0);
  const pinchLastMidpointRef = useRef<Point2D>({ x: 0, y: 0 });

  const [showShareModal, setShowShareModal] = useState(false);
  const autoSaveTimerRef = useRef<any>(null);

  // Mouse Interaction Drag / Pan State
  const isMouseDownRef = useRef(false);
  const isMiddleDragRef = useRef(false);
  const dragStartScreenRef = useRef<Point2D>({ x: 0, y: 0 });
  const dragStartWorldRef = useRef<Point2D>({ x: 0, y: 0 });
  const isDraggingEntityRef = useRef(false);
  const isDraggingGroupRef = useRef(false);
  const groupDragMovedRef = useRef(false);

  // Wall-based tool placement state
  const [placementModeTool, setPlacementModeTool] = useState<ToolType | null>(null);
  const [wallToolPreview, setWallToolPreview] = useState<WallPlacementCalculationResult | null>(null);
  const wallToolPreviewRef = useRef<WallPlacementCalculationResult | null>(null);

  const [showRackMenu, setShowRackMenu] = useState(false);

  // Interactive Rack Placement state
  const [pendingRackPlacement, setPendingRackPlacement] = useState<{
    rackType: RackEntity['properties']['rackType'];
    productModelId?: string;
    productName?: string;
    sku?: string;
    width: number;
    depth: number;
    height: number;
    shelves: number;
    shelfCount: number;
    shelfThickness: number;
    shelfSpacing?: number | 'auto';
    rotation: number;
    isCustom?: boolean;
    baseWidth?: number;
    baseDepth?: number;
    baseHeight?: number;
    scalingMode?: string;
  } | null>(null);
  const pendingRackPlacementRef = useRef(pendingRackPlacement);
  useEffect(() => {
    pendingRackPlacementRef.current = pendingRackPlacement;
  }, [pendingRackPlacement]);

  const [showExitConfirmDialog, setShowExitConfirmDialog] = useState(false);
  const cursorWorldPosRef = useRef<Point2D>({ x: 0, y: 0 });
  useEffect(() => {
    cursorWorldPosRef.current = cursorWorldPos;
  }, [cursorWorldPos]);

  const lastTouchTimeRef = useRef<number>(0);
  const lastPlacementTimeRef = useRef<number>(0);
  const touchStartPosRef = useRef<Point2D>({ x: 0, y: 0 });
  const touchStartTimeRef = useRef<number>(0);
  const touchMovedTotalRef = useRef<number>(0);

  // 3D View State
  const [viewMode, setViewMode] = useState<'2D' | '3D'>('2D');

  // AI Rack Planner
  const [showAIPlanner, setShowAIPlanner] = useState(false);
  const [aiPreviewRacks, setAiPreviewRacks] = useState<RackEntity[]>([]);
  const [aiPreviewDimensions, setAiPreviewDimensions] = useState<import('../../cad/types').DimensionItem[]>([]);

  // ── Planner 5D Redesign State ──
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showStarterCard, setShowStarterCard] = useState(true);
  const [showQuickRoomModal, setShowQuickRoomModal] = useState(false);
  const [quickRoomWidth, setQuickRoomWidth] = useState("30'-0\"");
  const [quickRoomDepth, setQuickRoomDepth] = useState("20'-0\"");
  const [showDesktopMoreMenu, setShowDesktopMoreMenu] = useState(false);
  const [showShopGuide, setShowShopGuide] = useState(false);

  // Beginner 6-Step Checklist computed completion state
  const hasWalls = useMemo(() => entities.some((e) => e.type === 'wall'), [entities]);
  const hasDoorsOrShutters = useMemo(() => entities.some((e) => e.type === 'door' || e.type === 'shutter' || e.type === 'gate' || e.type === 'glass_gate'), [entities]);
  const hasColumns = useMemo(() => entities.some((e) => e.type === 'column'), [entities]);
  const hasRacks = useMemo(() => entities.some((e) => e.type === 'rack'), [entities]);
  const storeGuideCompletedCount = useMemo(() => {
    let count = 0;
    if (hasWalls) count++;
    if (hasDoorsOrShutters) count++;
    if (hasColumns) count++;
    if (hasRacks) count++;
    if (viewMode === '3D') count++;
    if (saveStatus === 'saved') count++;
    return count;
  }, [hasWalls, hasDoorsOrShutters, hasColumns, hasRacks, viewMode, saveStatus]);

  const handleAddRack = (
    rackType: RackEntity['properties']['rackType'],
    w: number,
    d: number,
    h: number,
    productModelId?: string,
    productName?: string
  ) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const screenCenter = { x: rect.width / 2, y: rect.height / 2 };
    const worldCenter = viewportRef.current.screenToWorld(screenCenter);

    const isWallRack =
      rackType === 'wall_rack_7x3' ||
      rackType === 'wall_rack_7x4' ||
      rackType === 'Wall Rack' ||
      rackType?.toLowerCase().includes('wall');
    const isCornerRack =
      rackType === 'corner_rack_2x2x2' ||
      rackType === 'Corner Rack' ||
      rackType?.toLowerCase().includes('corner');

    let spawnX = worldCenter.x;
    let spawnY = worldCenter.y;
    let rotation = 0;
    let attachedWallId: string | undefined;
    let wallSide: RackEntity['properties']['wallSide'];
    let cornerPosition: RackEntity['properties']['cornerPosition'];

    // Find all walls to determine room geometry
    const walls = entities.filter(e => e.type === 'wall') as WallEntity[];

    if (isWallRack && walls.length > 0) {
      // Find the nearest wall to viewport center and snap the rack to it
      let bestWall: WallEntity | null = null;
      let bestDist = Infinity;
      for (const w of walls) {
        const proj = projectPointOntoLine(
          worldCenter,
          { x: w.geometry.x1, y: w.geometry.y1 },
          { x: w.geometry.x2, y: w.geometry.y2 }
        );
        if (proj.distance < bestDist) {
          bestDist = proj.distance;
          bestWall = w;
        }
      }

      if (bestWall) {
        attachedWallId = bestWall.id;
        const wx1 = bestWall.geometry.x1, wy1 = bestWall.geometry.y1;
        const wx2 = bestWall.geometry.x2, wy2 = bestWall.geometry.y2;
        const wallAngle = Math.atan2(wy2 - wy1, wx2 - wx1);
        rotation = wallAngle * (180 / Math.PI);

        // Determine which side this wall is (top/bottom/left/right)
        const isHoriz = Math.abs(wy2 - wy1) < 1;
        const isVert  = Math.abs(wx2 - wx1) < 1;

        // Find room center to determine inward direction
        let roomCx = worldCenter.x, roomCy = worldCenter.y;
        if (walls.length >= 4) {
          const xs = walls.flatMap(ww => [ww.geometry.x1, ww.geometry.x2]);
          const ys = walls.flatMap(ww => [ww.geometry.y1, ww.geometry.y2]);
          roomCx = (Math.min(...xs) + Math.max(...xs)) / 2;
          roomCy = (Math.min(...ys) + Math.max(...ys)) / 2;
        }

        const wallMidX = (wx1 + wx2) / 2;
        const wallMidY = (wy1 + wy2) / 2;

        if (isHoriz) {
          // Top or Bottom wall
          if (wallMidY <= roomCy) {
            wallSide = 'top';
          } else {
            wallSide = 'bottom';
          }
        } else if (isVert) {
          if (wallMidX <= roomCx) {
            wallSide = 'left';
          } else {
            wallSide = 'right';
          }
        } else {
          // Diagonal — use perpendicular normal
          wallSide = undefined;
        }

        // Place anchor at wall midpoint (user can change position along wall later)
        spawnX = wallMidX;
        spawnY = wallMidY;
      }
    } else if (isCornerRack && walls.length >= 4) {
      // Find room bounding box corners and snap to nearest
      const xs = walls.flatMap(ww => [ww.geometry.x1, ww.geometry.x2]);
      const ys = walls.flatMap(ww => [ww.geometry.y1, ww.geometry.y2]);
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const minY = Math.min(...ys), maxY = Math.max(...ys);
      const corners = [
        { x: minX, y: minY, pos: 'top-left' as const },
        { x: maxX, y: minY, pos: 'top-right' as const },
        { x: minX, y: maxY, pos: 'bottom-left' as const },
        { x: maxX, y: maxY, pos: 'bottom-right' as const },
      ];
      let bestCorner = corners[0];
      let bestDist = Math.hypot(bestCorner.x - worldCenter.x, bestCorner.y - worldCenter.y);
      for (const c of corners.slice(1)) {
        const d = Math.hypot(c.x - worldCenter.x, c.y - worldCenter.y);
        if (d < bestDist) { bestDist = d; bestCorner = c; }
      }
      spawnX = bestCorner.x;
      spawnY = bestCorner.y;
      cornerPosition = bestCorner.pos;
      // Encode corner in rotation: 0=TL, 90=TR, 180=BR, 270=BL
      const cornerRotMap = { 'top-left': 0, 'top-right': 90, 'bottom-right': 180, 'bottom-left': 270 };
      rotation = cornerRotMap[bestCorner.pos];
    }
    const matchedProduct = ProductModelRegistry.resolve(productModelId, rackType);
    const resolvedShelfCount = matchedProduct?.shelfCount ?? 6;
    const resolvedShelfThickness = (matchedProduct as any)?.shelfThickness ?? 1.0;

    const newRack: RackEntity = {
      id: `rack_${Date.now()}`,
      type: 'rack',
      geometry: { x: spawnX, y: spawnY, width: w, depth: d, height: h, rotation },
      properties: {
        rackType,
        productModelId,
        productName: productName || matchedProduct?.productName,
        shelves: resolvedShelfCount,
        shelfCount: resolvedShelfCount,
        shelfSpacing: 'auto',
        shelfThickness: resolvedShelfThickness,
        attachedWallId,
        wallSide,
        cornerPosition
      },
    };
    updateEntitiesWithHistory([...entities, newRack], 'Add ' + (productName || rackType));
    setSelectedEntityId(newRack.id);
    setShowRackMenu(false);
    setActiveTool('select');
  };

  const [showCustomRackModal, setShowCustomRackModal] = useState(false);
  const [selectedProductForCustom, setSelectedProductForCustom] = useState<Product3DModelData | null>(null);
  const [activeProducts, setActiveProducts] = useState<Product3DModelData[]>(() => ProductModelRegistry.getActive());
  const [productsLoading, setProductsLoading] = useState<boolean>(() => ProductModelRegistry.getIsLoading());
  const [productsError, setProductsError] = useState<string | null>(() => ProductModelRegistry.getLoadError());

  useEffect(() => {
    ProductModelRegistry.loadProducts(true).then(() => {
      setActiveProducts(ProductModelRegistry.getActive());
      setProductsLoading(ProductModelRegistry.getIsLoading());
      setProductsError(ProductModelRegistry.getLoadError());
    }).catch(() => {
      setActiveProducts(ProductModelRegistry.getActive());
      setProductsLoading(ProductModelRegistry.getIsLoading());
      setProductsError(ProductModelRegistry.getLoadError());
    });
    const unsubscribe = ProductModelRegistry.subscribe(() => {
      setActiveProducts(ProductModelRegistry.getActive());
      setProductsLoading(ProductModelRegistry.getIsLoading());
      setProductsError(ProductModelRegistry.getLoadError());
    });
    return unsubscribe;
  }, []);

  const handleAddCustomRack = (params: CustomRackParams) => {
    const { widthInches, depthInches, heightInches, placementType, targetWallId } = params;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const screenCenter = { x: rect.width / 2, y: rect.height / 2 };
    const worldCenter = viewportRef.current.screenToWorld(screenCenter);

    const walls = entities.filter((e): e is WallEntity => e.type === 'wall');
    const isWallPlacement = placementType === 'wall' && walls.length > 0;

    let spawnX = worldCenter.x;
    let spawnY = worldCenter.y;
    let rotation = 0;
    let attachedWallId: string | undefined = undefined;
    let inwardNormal: Point2D | undefined = undefined;
    let wallSide: RackEntity['properties']['wallSide'] = undefined;
    let wallThickness = 9;

    if (isWallPlacement) {
      let targetWall: WallEntity | null = null;
      if (targetWallId) {
        targetWall = walls.find((w) => w.id === targetWallId) || null;
      }
      if (!targetWall) {
        let bestDist = Infinity;
        for (const w of walls) {
          const proj = projectPointOntoLine(
            worldCenter,
            { x: w.geometry.x1, y: w.geometry.y1 },
            { x: w.geometry.x2, y: w.geometry.y2 }
          );
          if (proj.distance < bestDist) {
            bestDist = proj.distance;
            targetWall = w;
          }
        }
      }

      if (targetWall) {
        attachedWallId = targetWall.id;
        wallThickness = targetWall.properties?.thickness ?? 9;
        const wx1 = targetWall.geometry.x1;
        const wy1 = targetWall.geometry.y1;
        const wx2 = targetWall.geometry.x2;
        const wy2 = targetWall.geometry.y2;
        const wallAngle = Math.atan2(wy2 - wy1, wx2 - wx1);
        rotation = wallAngle * (180 / Math.PI);

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

        const wallMidX = (wx1 + wx2) / 2;
        const wallMidY = (wy1 + wy2) / 2;

        // Anchor on interior wall face (center along width)
        spawnX = wallMidX + inwardNormal.x * (wallThickness / 2);
        spawnY = wallMidY + inwardNormal.y * (wallThickness / 2);

        if (Math.abs(inwardNormal.y - 1) < 0.2) wallSide = 'top';
        else if (Math.abs(inwardNormal.y + 1) < 0.2) wallSide = 'bottom';
        else if (Math.abs(inwardNormal.x - 1) < 0.2) wallSide = 'left';
        else if (Math.abs(inwardNormal.x + 1) < 0.2) wallSide = 'right';
      }
    }

    const rackLabel = formatCustomRackLabel(heightInches, widthInches, depthInches);
    const prodName = params.productName || 'Custom Rack';

    const newRack: RackEntity = {
      id: `rack_${Date.now()}`,
      type: 'rack',
      geometry: {
        x: spawnX,
        y: spawnY,
        width: widthInches,
        depth: depthInches,
        height: heightInches,
        rotation,
      },
      properties: {
        rackType: params.productModelId ? params.productModelId : 'CUSTOM',
        productModelId: params.productModelId,
        productName: params.productModelId ? `${prodName} ${rackLabel}` : `Custom Rack ${rackLabel}`,
        sku: params.sku,
        baseWidth: params.baseWidth,
        baseDepth: params.baseDepth,
        baseHeight: params.baseHeight,
        scalingMode: params.scalingMode || 'stretch',
        label: `C-RACK ${rackLabel}`,
        shelves: params.shelfCount ?? params.shelves ?? 6,
        shelfCount: params.shelfCount ?? params.shelves ?? 6,
        shelfSpacing: params.shelfSpacing ?? 'auto',
        shelfThickness: params.shelfThickness ?? 1.0,
        attachedWallId,
        wallSide,
        inwardNormal,
        wallThickness,
        isCustom: true,
        canonicalWidth: widthInches,
        canonicalDepth: depthInches,
        canonicalHeight: heightInches,
        width: widthInches,
        depth: depthInches,
        height: heightInches,
      },
    };

    updateEntitiesWithHistory([...entities, newRack], `Add ${prodName} (${rackLabel})`);
    setSelectedEntityId(newRack.id);
    setShowCustomRackModal(false);
    setSelectedProductForCustom(null);
    setShowRackMenu(false);
    setActiveTool('select');
  };

  // ── Rack Placement Mode Handlers ──
  const calculateRackPlacement = useCallback((
    targetPt: Point2D,
    template: RackPlacementTemplate
  ): RackPlacementCalculation => {
    const walls = entitiesRef.current.filter((e): e is WallEntity => e.type === 'wall');
    const existingRacks = entitiesRef.current.filter((e): e is RackEntity => e.type === 'rack');
    return RackPlacementController.calculatePlacement(
      targetPt,
      template,
      walls,
      existingRacks,
      activeRoomPolygon
    );
  }, [activeRoomPolygon]);

  // Default parameters
  const [wallThickness] = useState(9); // 9 inches
  const [doorWidth] = useState(36); // 3'-0"
  const [columnWidth] = useState(24); // 2'-0"
  const [columnHeight] = useState(24); // 2'-0"
  const [showDebugOverlay, setShowDebugOverlay] = useState(false);

  // 1. Initial Project Loading
  useEffect(() => {
    let isMounted = true;

    async function loadProject() {
      try {
        const data = await api.getProject(projectId, surveyToken);
        if (!isMounted) return;

        setProjectData(data);
        setRevision(data.revision || 'REV 1');
        setRevisionsList(data.versions || []);

        if (data.viewport) {
          viewportRef.current.setState(data.viewport);
        }

        if (data.entities && data.entities.length > 0) {
          setEntities(data.entities);
          historyRef.current.pushInitialState(data.entities);
        } else {
          const shapeMode = data.viewport?.roomShapeMode || 'AUTO';

          if (shapeMode === 'AUTO') {
            const wInches = parseFeetInches(data.approxWidth || "50'-0\"") || 600;
            const hInches = parseFeetInches(data.approxHeight || "30'-0\"") || 360;

            const starterWalls: WallEntity[] = [
              { id: 'w_top', type: 'wall', geometry: { x1: 0, y1: 0, x2: wInches, y2: 0 }, properties: { thickness: 9 } },
              { id: 'w_right', type: 'wall', geometry: { x1: wInches, y1: 0, x2: wInches, y2: hInches }, properties: { thickness: 9 } },
              { id: 'w_bottom', type: 'wall', geometry: { x1: wInches, y1: hInches, x2: 0, y2: hInches }, properties: { thickness: 9 } },
              { id: 'w_left', type: 'wall', geometry: { x1: 0, y1: hInches, x2: 0, y2: 0 }, properties: { thickness: 9 } },
            ];
            setEntities(starterWalls);
            historyRef.current.pushInitialState(starterWalls);

            // Center view on initial walls
            viewportRef.current.zoomToFit({ minX: 0, minY: 0, maxX: wInches, maxY: hInches }, 80);
          } else {
            // MANUAL mode
            setEntities([]);
            historyRef.current.pushInitialState([]);
            
            // Just center view based on dimensions
            const wInches = parseFeetInches(data.approxWidth || "50'-0\"") || 600;
            const hInches = parseFeetInches(data.approxHeight || "30'-0\"") || 360;
            viewportRef.current.zoomToFit({ minX: 0, minY: 0, maxX: wInches, maxY: hInches }, 80);
          }
        }

        setSaveStatus('saved');
        setLastSavedTime(new Date().toLocaleTimeString());
      } catch (err) {
        console.error('Failed to load project:', err);
      }
    }

    loadProject();
    return () => { isMounted = false; };
  }, [projectId, surveyToken]);

  // 2. Sync Snap Engine Config
  useEffect(() => {
    snapEngineRef.current.config.gridSnap = gridSnap;
    snapEngineRef.current.config.orthoMode = orthoMode;
  }, [gridSnap, orthoMode]);

  // 3. Debounced Auto-Save trigger
  const isSavingRef = useRef(false);
  const pendingSaveRef = useRef<CADEntity[] | null>(null);

  const performSave = async (ents: CADEntity[]) => {
    if (isSavingRef.current) {
      pendingSaveRef.current = ents;
      return;
    }
    isSavingRef.current = true;
    setSaveStatus('saving');
    try {
      await api.saveProject(projectId, {
        title: projectData?.title || 'Store Layout',
        scale: '1/4" = 1\'-0"',
        unit: 'Feet + Inches',
        viewport: viewportRef.current.getState(),
        entities: ents,
      }, surveyToken);
      setSaveStatus('saved');
      setLastSavedTime(new Date().toLocaleTimeString());
    } catch (err) {
      setSaveStatus('error');
    } finally {
      isSavingRef.current = false;
      if (pendingSaveRef.current) {
        const next = pendingSaveRef.current;
        pendingSaveRef.current = null;
        performSave(next);
      }
    }
  };

  const triggerAutoSave = useCallback((newEntities: CADEntity[]) => {
    setSaveStatus('unsaved');
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      performSave(newEntities);
    }, 800);
  }, [projectId, projectData, surveyToken]);

  // 4. Update entities with History & Auto-Save
  const updateEntitiesWithHistory = useCallback((newEntities: CADEntity[], actionDesc?: string) => {
    setEntities(newEntities);
    historyRef.current.pushState(newEntities, actionDesc);
    triggerAutoSave(newEntities);
  }, [triggerAutoSave]);

  const commitNewRackPlacement = useCallback((
    placement: RackPlacementCalculation,
    template: NonNullable<typeof pendingRackPlacement>
  ) => {
    const newRack = RackPlacementController.createRackEntity(placement, template);

    updateEntitiesWithHistory([...entitiesRef.current, newRack], 'Add ' + (newRack.properties.productName || newRack.properties.rackType));
    setSelectedEntityId(newRack.id);
    setShowMobileProps(false);
    setTabletInspectorOpen(false);
    lastPlacementTimeRef.current = Date.now();
    setPendingRackPlacement(null);
    setActiveTool('select');
  }, [updateEntitiesWithHistory]);

  const handleSelectRackForPlacement = useCallback((prod: Product3DModelData) => {
    const template = {
      rackType: prod.productType || 'Wall Rack',
      productModelId: prod.productId,
      productName: prod.productName,
      sku: prod.sku,
      width: prod.width,
      depth: prod.depth,
      height: prod.height,
      shelves: prod.shelfCount || 6,
      shelfCount: prod.shelfCount || 6,
      shelfThickness: (prod as any)?.shelfThickness || 1.0,
      shelfSpacing: 'auto' as const,
      rotation: 0,
    };
    setPendingRackPlacement(template);
    setActiveTool('rack');
    setShowRackMenu(false);
    setShowMobileProps(false);
    setTabletInspectorOpen(false);

    const canvas = canvasRef.current;
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      const centerWorld = viewportRef.current.screenToWorld({ x: rect.width / 2, y: rect.height / 2 });
      cursorWorldPosRef.current = centerWorld;
      setCursorWorldPos(centerWorld);
    }
  }, []);

  const handleRotatePendingRack = useCallback(() => {
    setPendingRackPlacement((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        rotation: (prev.rotation + 90) % 360,
      };
    });
  }, []);

  const handleCancelRackPlacement = useCallback(() => {
    setPendingRackPlacement(null);
    setActiveTool('select');
  }, []);

  const handleQuickPlaceCenter = useCallback(() => {
    const template = pendingRackPlacementRef.current;
    if (!template) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const screenCenter = { x: rect.width / 2, y: rect.height / 2 };
    const worldCenter = viewportRef.current.screenToWorld(screenCenter);
    const placement = calculateRackPlacement(worldCenter, template);
    commitNewRackPlacement(placement, template);
  }, [calculateRackPlacement, commitNewRackPlacement]);

  const updateEntityProperty = useCallback(<T extends CADEntity>(id: string, actionDesc: string, updater: (ent: T) => T) => {
    const newEntities = entitiesRef.current.map((e) => {
      if (e.id === id) {
        return updater(e as T) as CADEntity;
      }
      return e;
    });
    updateEntitiesWithHistory(newEntities, actionDesc);
  }, [updateEntitiesWithHistory]);

  // 5. Canvas Resize & Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    rendererRef.current = new CADRenderer(ctx, viewportRef.current);

    const handleResize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;

      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;

      viewportRef.current.resize(rect.width, rect.height, dpr);
      renderScene();
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    const parent = canvas.parentElement;
    let resizeObserver: ResizeObserver | null = null;
    if (parent && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        handleResize();
      });
      resizeObserver.observe(parent);
    }

    const handleNativeWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const screenPt = { x: e.clientX - rect.left, y: e.clientY - rect.top };

      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
      viewportRef.current.zoomAt(screenPt, zoomFactor);
      if (renderSceneRef.current) {
        renderSceneRef.current();
      }
    };

    canvas.addEventListener('wheel', handleNativeWheel, { passive: false });

    return () => {
      window.removeEventListener('resize', handleResize);
      resizeObserver?.disconnect();
      canvas.removeEventListener('wheel', handleNativeWheel);
    };
  }, []);

  // AI Planner handlers
  const handleApplyAILayout = useCallback((racks: RackEntity[]) => {
    // Tag all newly placed AI racks
    const taggedRacks = racks.map((r) => ({
      ...r,
      properties: {
        ...r.properties,
        isAIGenerated: true,
      },
    }));

    // Strip any previous AI racks so re-applying cleanly replaces old AI racks, keeping all manual entities intact
    const manualEntities = entitiesRef.current.filter(
      (e) => !(e.type === 'rack' && (e as RackEntity).properties?.isAIGenerated)
    );

    // Single history push — one Undo removes ALL AI-generated racks and restores exact previous state
    updateEntitiesWithHistory([...manualEntities, ...taggedRacks], 'AI Rack Layout');
    setAiPreviewRacks([]);
    setAiPreviewDimensions([]);
    setShowAIPlanner(false);
  }, [updateEntitiesWithHistory]);

  const handleCloseAIPlanner = useCallback(() => {
    setAiPreviewRacks([]);
    setAiPreviewDimensions([]);
    setShowAIPlanner(false);
  }, []);

  // Wall-based tool placement apply handler
  const handleApplyPlacement = useCallback((calcResult: WallPlacementCalculationResult) => {
    if (!calcResult || !calcResult.isValid) return;

    if (selectedEntityId) {
      // Editing existing entity
      const nextEnts = entitiesRef.current.map((ent) => {
        if (ent.id === selectedEntityId) {
          return WallPlacementEngine.applyPlacementToEntity(ent, calcResult);
        }
        return ent;
      });
      updateEntitiesWithHistory(nextEnts, 'Update Wall Placement');
      setWallToolPreview(null);
      return;
    }

    // Placing new entity
    const tool = placementModeTool || activeTool;
    const now = Date.now();
    let newEntity: CADEntity | null = null;

    switch (tool) {
      case 'door': {
        const door: DoorEntity = {
          id: `door_${now}`,
          type: 'door',
          geometry: {
            x: calcResult.centerPoint.x,
            y: calcResult.centerPoint.y,
            width: calcResult.wallPlacement.widthInches,
            height: calcResult.wallPlacement.heightInches || 84,
            rotation: calcResult.rotation,
          },
          properties: {
            doorType: 'single',
            swing: 'inward',
            flipSide: 'left',
            attachedWallId: calcResult.wallPlacement.wallId,
            wallPlacement: calcResult.wallPlacement,
          },
        };
        newEntity = door;
        break;
      }
      case 'window': {
        const win: WindowEntity = {
          id: `win_${now}`,
          type: 'window',
          geometry: {
            x: calcResult.centerPoint.x,
            y: calcResult.centerPoint.y,
            width: calcResult.wallPlacement.widthInches,
            height: calcResult.wallPlacement.heightInches || 48,
            rotation: calcResult.rotation,
          },
          properties: {
            windowType: 'standard',
            attachedWallId: calcResult.wallPlacement.wallId,
            wallPlacement: calcResult.wallPlacement,
          },
        };
        newEntity = win;
        break;
      }
      case 'shutter': {
        const shutter: ShutterEntity = {
          id: `shutter_${now}`,
          type: 'shutter',
          geometry: {
            x: calcResult.centerPoint.x,
            y: calcResult.centerPoint.y,
            width: calcResult.wallPlacement.widthInches,
            height: calcResult.wallPlacement.heightInches || 96,
            rotation: calcResult.rotation,
          },
          properties: {
            shutterType: 'rolling',
            attachedWallId: calcResult.wallPlacement.wallId,
            wallPlacement: calcResult.wallPlacement,
          },
        };
        newEntity = shutter;
        break;
      }
      case 'gate': {
        const gate: GateEntity = {
          id: `gate_${now}`,
          type: 'gate',
          geometry: {
            x: calcResult.centerPoint.x,
            y: calcResult.centerPoint.y,
            width: calcResult.wallPlacement.widthInches,
            height: calcResult.wallPlacement.heightInches || 72,
            rotation: calcResult.rotation,
          },
          properties: {
            gateType: 'security',
            attachedWallId: calcResult.wallPlacement.wallId,
            wallPlacement: calcResult.wallPlacement,
          },
        };
        newEntity = gate;
        break;
      }
      case 'glass_gate': {
        const gg: GlassGateEntity = {
          id: `gate_${now}`,
          type: 'glass_gate',
          geometry: {
            x: calcResult.centerPoint.x,
            y: calcResult.centerPoint.y,
            width: calcResult.wallPlacement.widthInches,
            height: calcResult.wallPlacement.heightInches || 42,
            rotation: calcResult.rotation,
          },
          properties: {
            gateType: 'double_glass',
            attachedWallId: calcResult.wallPlacement.wallId,
            wallPlacement: calcResult.wallPlacement,
          },
        };
        newEntity = gg;
        break;
      }
      case 'column': {
        const depth = calcResult.wallPlacement.depthInches || 24;
        const col: ColumnEntity = {
          id: `col_${now}`,
          type: 'column',
          geometry: {
            x: calcResult.centerPoint.x,
            y: calcResult.centerPoint.y,
            width: calcResult.wallPlacement.widthInches,
            height: depth,
            rotation: calcResult.rotation,
          },
          properties: {
            columnType: 'wall',
            inwardProjection: depth,
            attachedWallId: calcResult.wallPlacement.wallId,
            wallPlacement: calcResult.wallPlacement,
          },
        };
        newEntity = col;
        break;
      }
      case 'rack': {
        const activeWallProduct = activeProducts.find(
          (p) => p.productType?.toLowerCase().includes('wall') || p.category?.toLowerCase().includes('wall')
        ) || activeProducts[0];
        if (!activeWallProduct) {
          console.warn('[CADEditor] No active rack product available for placement');
          break;
        }
        const depth = calcResult.wallPlacement.depthInches || activeWallProduct.depth || 24;
        const rack: RackEntity = {
          id: `rack_${now}`,
          type: 'rack',
          geometry: {
            x: calcResult.centerPoint.x,
            y: calcResult.centerPoint.y,
            width: calcResult.wallPlacement.widthInches || activeWallProduct.width || 36,
            depth,
            height: calcResult.wallPlacement.heightInches || activeWallProduct.height || 84,
            rotation: calcResult.rotation,
          },
          properties: {
            rackType: activeWallProduct.productType || 'Wall Rack',
            productModelId: activeWallProduct.productId,
            productName: activeWallProduct.productName,
            sku: activeWallProduct.sku,
            shelves: activeWallProduct.shelfCount || 4,
            shelfCount: activeWallProduct.shelfCount || 4,
            shelfSpacing: 'auto',
            shelfThickness: (activeWallProduct as any).shelfThickness || 1.0,
            attachedWallId: calcResult.wallPlacement.wallId,
            wallPlacement: calcResult.wallPlacement,
          },
        };
        newEntity = rack;
        break;
      }
    }

    if (newEntity) {
      const nextEnts = [...entitiesRef.current, newEntity];
      updateEntitiesWithHistory(nextEnts, `Add ${newEntity.type}`);
      setSelectedEntityId(newEntity.id);
      setPlacementModeTool(null);
      setActiveTool('select');
      setWallToolPreview(null);
    }
  }, [selectedEntityId, placementModeTool, activeTool, updateEntitiesWithHistory]);

  // 6. Main Render Loop
  const aiPreviewRacksRef = useRef<RackEntity[]>([]);
  const aiPreviewDimsRef = useRef<import('../../cad/types').DimensionItem[]>([]);

  // Synchronously update entity and preview refs during render
  entitiesRef.current = entities;
  wallToolPreviewRef.current = wallToolPreview;
  aiPreviewRacksRef.current = aiPreviewRacks;
  aiPreviewDimsRef.current = aiPreviewDimensions;
  measureAnnotationsRef.current = measureAnnotations;

  const renderScene = useCallback(() => {
    if (!rendererRef.current) return;

    dimManagerRef.current.setConfig({ roomShapeMode: viewportRef.current.roomShapeMode });
    const computedDims = dimManagerRef.current.generateDimensions(
      entitiesRef.current,
      selectedEntityId,
      showTempRefDimensions,
      showRackDimensions
    );

    let rackPlacementPreview: any = null;
    const activeCursor = cursorWorldPosRef.current || cursorWorldPos;
    if (activeTool === 'rack' && pendingRackPlacementRef.current && activeCursor) {
      const calc = calculateRackPlacement(activeCursor, pendingRackPlacementRef.current);
      rackPlacementPreview = {
        ...calc,
        width: pendingRackPlacementRef.current.width,
        depth: pendingRackPlacementRef.current.depth,
        height: pendingRackPlacementRef.current.height,
        productName: pendingRackPlacementRef.current.productName,
        rackType: pendingRackPlacementRef.current.rackType,
      };
    }

    rendererRef.current.render({
      entities: entitiesRef.current,
      dimensions: showDimensions ? computedDims : [],
      selectedEntityId,
      selectedEntityIds: selectedEntityIdsRef.current.size > 0 ? selectedEntityIdsRef.current : undefined,
      activeTool,
      previewPoints: activeDrawingPointsRef.current,
      snapResult: snapIndicator,
      cursorWorldPos,
      showGrid,
      showDimensions,
      aiPreviewRacks: aiPreviewRacksRef.current,
      aiPreviewDimensions: aiPreviewDimsRef.current,
      wallToolPreview: wallToolPreviewRef.current,
      rackPlacementPreview,
      showDebugOverlay,
      dragSelectionRect: dragSelectionRectRef.current,
      measureAnnotations: measureAnnotationsRef.current,
    });
  }, [selectedEntityId, selectedEntityIds, activeTool, snapIndicator, cursorWorldPos, showGrid, showDimensions, showRackDimensions, showTempRefDimensions, showDebugOverlay, pendingRackPlacement, calculateRackPlacement]);


  const renderSceneRef = useRef(renderScene);
  renderSceneRef.current = renderScene;

  // Consolidated render effect
  useEffect(() => {
    renderScene();
  }, [renderScene, wallToolPreview, aiPreviewRacks, aiPreviewDimensions, entities, selectedEntityIds, dragSelectionRect, measureAnnotations, pendingRackPlacement]);

  // ── Contextual Substate Computation ──
  const isContextualSubstate = useMemo(() => {
    return (
      showExitConfirmDialog ||
      showShareModal ||
      showAIPlanner ||
      showCustomRackModal ||
      showRackMenu ||
      showMobileMoreTools ||
      showMobileMoreMenu ||
      activeTool === 'rack' ||
      Boolean(pendingRackPlacement) ||
      showMobileProps ||
      tabletInspectorOpen ||
      Boolean(selectedEntityId) ||
      selectedEntityIds.size > 0 ||
      activeTool !== 'select' ||
      activeDrawingPoints.length > 0 ||
      viewMode === '3D'
    );
  }, [
    showExitConfirmDialog,
    showShareModal,
    showAIPlanner,
    showCustomRackModal,
    showRackMenu,
    showMobileMoreTools,
    showMobileMoreMenu,
    activeTool,
    pendingRackPlacement,
    showMobileProps,
    tabletInspectorOpen,
    selectedEntityId,
    selectedEntityIds,
    activeDrawingPoints,
    viewMode,
  ]);

  // ── Contextual Back Navigation Priority System ──
  const handleContextualBack = useCallback((): boolean => {
    // 1. If confirmation dialog is open, dismiss it
    if (showExitConfirmDialog) {
      setShowExitConfirmDialog(false);
      return true;
    }

    // 2. If any modal or rack catalogue is open, close that modal
    if (showShareModal) {
      setShowShareModal(false);
      return true;
    }
    if (showAIPlanner) {
      setShowAIPlanner(false);
      return true;
    }
    if (showCustomRackModal) {
      setShowCustomRackModal(false);
      return true;
    }
    if (showRackMenu) {
      setShowRackMenu(false);
      return true;
    }
    if (showMobileMoreTools) {
      setShowMobileMoreTools(false);
      return true;
    }
    if (showMobileMoreMenu) {
      setShowMobileMoreMenu(false);
      return true;
    }

    // 3. If user is in the 3D viewer, return to 2D editor
    if (viewMode === '3D') {
      setViewMode('2D');
      return true;
    }

    // 4. If rack placement mode is active, cancel placement and discard unplaced preview
    if (activeTool === 'rack' || pendingRackPlacementRef.current) {
      setPendingRackPlacement(null);
      setActiveTool('select');
      renderScene();
      return true;
    }

    // 5. If mobile properties drawer or tablet inspector is open, close the drawer
    if (showMobileProps || tabletInspectorOpen || selectedEntityIdRef.current || selectedEntityIdsRef.current.size > 0) {
      setShowMobileProps(false);
      setTabletInspectorOpen(false);
      setSelectedEntityId(null);
      setSelectedEntityIds(new Set());
      setPlacementModeTool(null);
      setWallToolPreview(null);
      renderScene();
      return true;
    }

    // 6. If temporary CAD drawing tool is active, return to selection mode
    if (activeTool !== 'select' || activeDrawingPointsRef.current.length > 0) {
      setActiveTool('select');
      setActiveDrawingPoints([]);
      setPlacementModeTool(null);
      setWallToolPreview(null);
      renderScene();
      return true;
    }

    // 7. Base level — user is requesting to navigate out of CAD editor
    if (saveStatus === 'unsaved') {
      setShowExitConfirmDialog(true);
      return true;
    }

    if (onExit) {
      onExit();
      return true;
    }

    return false;
  }, [
    showExitConfirmDialog,
    showShareModal,
    showAIPlanner,
    showCustomRackModal,
    showRackMenu,
    showMobileMoreTools,
    showMobileMoreMenu,
    activeTool,
    showMobileProps,
    tabletInspectorOpen,
    viewMode,
    saveStatus,
    onExit,
    renderScene,
  ]);

  const contextualBackRef = useRef(handleContextualBack);
  useEffect(() => {
    contextualBackRef.current = handleContextualBack;
  }, [handleContextualBack]);

  // ── History & Popstate Interceptor (Android Back & Browser Back) ──
  useEffect(() => {
    const cadMarker = { cadActive: true, time: Date.now() };
    window.history.pushState(cadMarker, '', window.location.href);

    const handlePopState = () => {
      const handled = contextualBackRef.current();
      if (handled) {
        window.history.pushState(cadMarker, '', window.location.href);
      }
    };

    window.addEventListener('popstate', handlePopState);

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (saveStatus === 'unsaved') {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [saveStatus]);


  // ─── Helper: is a rack entity a Center Rack type? ───
  const isCenterRackEntity = (ent: CADEntity): ent is RackEntity => {
    if (ent.type !== 'rack') return false;
    const r = ent as RackEntity;
    const rt = (r.properties.rackType || '').toLowerCase();
    const name = (r.properties.productName || '').toLowerCase();
    // Exclude wall, corner, endcap
    if (rt.includes('wall') || rt.includes('corner') || rt.includes('endcap') || rt.includes('end cap')) return false;
    if (name.includes('wall') || name.includes('corner') || name.includes('endcap') || name.includes('end cap')) return false;
    if (r.properties.attachedWallId) return false;
    return true;
  };

  // ─── Helper: direction state from rotation value ───
  // Convention (from drawCenterRack): rotation=0 → width spans X-axis → HORIZONTAL
  //   rotation=90 → width spans Y-axis → VERTICAL
  //   We normalise to [0,360) and treat 0±15 or 180±15 as horizontal,
  //   and 90±15 or 270±15 as vertical, to tolerate small float drift.
  const getRackDirection = (rotDeg: number): 'horizontal' | 'vertical' => {
    const n = ((rotDeg % 360) + 360) % 360;
    // Horizontal band: 0..15, 165..195, 345..360
    if (n <= 15 || n >= 345 || (n >= 165 && n <= 195)) return 'horizontal';
    return 'vertical';
  };

  // ─── Compute direction state of the current multi-selection ───
  const getSelectionDirectionState = useCallback((): 'horizontal' | 'vertical' | 'mixed' => {
    const ids = selectedEntityIdsRef.current;
    if (ids.size === 0) return 'horizontal';
    let h = 0; let v = 0;
    for (const ent of entitiesRef.current) {
      if (!ids.has(ent.id)) continue;
      const r = ent as RackEntity;
      const dir = getRackDirection(r.geometry.rotation || 0);
      if (dir === 'horizontal') h++; else v++;
    }
    if (h === 0) return 'vertical';
    if (v === 0) return 'horizontal';
    return 'mixed';
  }, [selectedEntityIds]); // re-runs when selection changes

  // Direction state — derived (recalculated on every render when selection changes)
  const selectionDirectionState: 'horizontal' | 'vertical' | 'mixed' = getSelectionDirectionState();

  // ─── Collision warning state ───
  const [collisionWarning, setCollisionWarning] = useState<string>('');

  // ─── Core: apply rotation / transformation to selected racks with OBB & boundary validation ───
  const applyDirectionChange = useCallback((
    nextEntities: CADEntity[],
    actionDesc: string
  ) => {
    const ids = selectedEntityIdsRef.current;
    const rotatedRacks = nextEntities.filter((e): e is RackEntity => ids.has(e.id) && e.type === 'rack');
    const walls = nextEntities.filter((e): e is WallEntity => e.type === 'wall');
    const roomPoly = viewportRef.current.roomShapeMode === 'MANUAL'
      ? buildRoomPolygon(walls)
      : [];

    const validation = RackGroupTransformEngine.validateTransformation(
      rotatedRacks,
      nextEntities,
      ids,
      roomPoly
    );

    if (!validation.isValid && validation.issues.length > 0) {
      const issuesText = validation.issues.slice(0, 3).join('\n');
      const moreText = validation.issues.length > 3 ? `\n...and ${validation.issues.length - 3} more` : '';
      const proceed = window.confirm(
        `Transformation Warning:\n${issuesText}${moreText}\n\nDo you want to proceed anyway? Click OK to apply, or Cancel to abort.`
      );
      if (!proceed) {
        return; // User cancelled transformation
      }
      setCollisionWarning(
        `${validation.issues.length} collision/boundary issue${validation.issues.length > 1 ? 's' : ''}: ${validation.issues[0]}`
      );
    } else {
      setCollisionWarning('');
    }

    updateEntitiesWithHistory(nextEntities, actionDesc);
  }, [updateEntitiesWithHistory]);

  // ─── Direction toggle: turn the entire selected group between H and V ───
  const handleToggleDirection = useCallback(() => {
    const ids = selectedEntityIdsRef.current;
    if (ids.size === 0) return;
    // Rotate entire group rigidly around shared bounding-box pivot by 90 deg
    const result = RackGroupTransformEngine.rotateGroup(entitiesRef.current, ids, 90);
    if (!result) return;
    const dir = selectionDirectionState;
    const label = dir === 'horizontal' ? 'Turn Vertical (Group)' : dir === 'vertical' ? 'Turn Horizontal (Group)' : 'Rotate Group 90°';
    applyDirectionChange(result.nextEntities, `${label} (${ids.size} rack${ids.size > 1 ? 's' : ''})`);
  }, [applyDirectionChange, selectionDirectionState]);

  // ─── Make All Horizontal (set rotation to 0°) ───
  const handleMakeAllHorizontal = useCallback(() => {
    const ids = selectedEntityIdsRef.current;
    if (ids.size === 0) return;
    const nextEntities = entitiesRef.current.map((ent): CADEntity => {
      if (!ids.has(ent.id)) return ent;
      const r = ent as RackEntity;
      // Snap to nearest multiple of 180 (preserve 0 or 180 depending on current)
      const curRot = r.geometry.rotation || 0;
      const n = ((curRot % 360) + 360) % 360;
      // Choose 0 or 180 — whichever is closer
      const newRot = n >= 90 && n < 270 ? 180 : 0;
      return { ...r, geometry: { ...r.geometry, rotation: newRot } };
    });
    applyDirectionChange(nextEntities, `Make All Horizontal (${ids.size} rack${ids.size > 1 ? 's' : ''})`);
  }, [applyDirectionChange]);

  // ─── Make All Vertical (set rotation to 90°) ───
  const handleMakeAllVertical = useCallback(() => {
    const ids = selectedEntityIdsRef.current;
    if (ids.size === 0) return;
    const nextEntities = entitiesRef.current.map((ent): CADEntity => {
      if (!ids.has(ent.id)) return ent;
      const r = ent as RackEntity;
      // Snap to nearest multiple of 90 that is vertical (90 or 270)
      const curRot = r.geometry.rotation || 0;
      const n = ((curRot % 360) + 360) % 360;
      const newRot = n >= 180 ? 270 : 90;
      return { ...r, geometry: { ...r.geometry, rotation: newRot } };
    });
    applyDirectionChange(nextEntities, `Make All Vertical (${ids.size} rack${ids.size > 1 ? 's' : ''})`);
  }, [applyDirectionChange]);

  // ─── Batch rotation: rotate group around shared bounding box pivot OR in place ───
  const handleBatchRotateDelta = useCallback((angleDeg: number, mode: 'in_place' | 'group' = 'group') => {
    const ids = selectedEntityIdsRef.current;
    if (ids.size === 0) return;

    const result = mode === 'group'
      ? RackGroupTransformEngine.rotateGroup(entitiesRef.current, ids, angleDeg)
      : RackGroupTransformEngine.rotateInPlace(entitiesRef.current, ids, angleDeg);

    if (!result) return;

    applyDirectionChange(
      result.nextEntities,
      `Batch Rotate ${angleDeg > 0 ? '+' : ''}${angleDeg}\u00b0 (${mode === 'in_place' ? 'In Place' : 'Group'}, ${ids.size} racks)`
    );
  }, [applyDirectionChange]);

  const handleRotateGroupCW = useCallback(() => {
    handleBatchRotateDelta(90, 'group');
  }, [handleBatchRotateDelta]);

  const handleRotateGroupCCW = useCallback(() => {
    handleBatchRotateDelta(-90, 'group');
  }, [handleBatchRotateDelta]);

  // ─── Batch rotation: set absolute rotation for each rack ───
  const handleSetAbsoluteRotation = useCallback((angleDeg: number) => {
    const ids = selectedEntityIdsRef.current;
    if (ids.size === 0) return;
    const nextEntities = entitiesRef.current.map((ent): CADEntity => {
      if (!ids.has(ent.id)) return ent;
      const r = ent as RackEntity;
      return { ...r, geometry: { ...r.geometry, rotation: ((angleDeg % 360) + 360) % 360 } };
    });
    applyDirectionChange(nextEntities, `Set Rotation ${angleDeg}\u00b0 (${ids.size} racks)`);
  }, [applyDirectionChange]);

  // ─── Batch rotation: reset rotation to 0° ───
  const handleResetRotation = useCallback(() => {
    const ids = selectedEntityIdsRef.current;
    if (ids.size === 0) return;
    const nextEntities = entitiesRef.current.map((ent): CADEntity => {
      if (!ids.has(ent.id)) return ent;
      const r = ent as RackEntity;
      return { ...r, geometry: { ...r.geometry, rotation: 0 } };
    });
    applyDirectionChange(nextEntities, `Reset Rotation (${ids.size} racks)`);
  }, [applyDirectionChange]);

  // ─── Select All Center Racks ───
  const handleSelectAllCenterRacks = useCallback(() => {
    const centerRackIds = new Set(
      entitiesRef.current.filter(isCenterRackEntity).map(e => e.id)
    );
    setSelectedEntityIds(centerRackIds);
    setSelectedEntityId(null);
    setCollisionWarning('');
  }, []);

  // 7. Mouse & Touch Handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // Ignore synthetic mouse events generated by mobile browsers within 500ms of touch or 800ms of rack placement
    const isRecentTouch = Date.now() - lastTouchTimeRef.current < 1000;
    if (isRecentTouch && (Date.now() - lastTouchTimeRef.current < 500 || Date.now() - lastPlacementTimeRef.current < 800)) {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const screenPt = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const rawWorldPt = viewportRef.current.screenToWorld(screenPt);

    const isMiddleOrPan = e.button === 1 || activeTool === 'pan' || e.altKey;
    if (!isMiddleOrPan && e.button !== 0) return;

    executePointerDown(
      screenPt,
      rawWorldPt,
      !!(e.ctrlKey || e.metaKey || touchMultiSelectModeRef.current),
      isMiddleOrPan
    );
  };

  // ── Unified Pointer Down Core Logic (Mouse & Touch) ──
  const executePointerDown = (
    screenPt: Point2D,
    rawWorldPt: Point2D,
    isMultiSelectToggle: boolean,
    isMiddleOrPan: boolean
  ) => {
    isMouseDownRef.current = true;
    dragStartScreenRef.current = screenPt;
    dragStartWorldRef.current = rawWorldPt;

    if (isMiddleOrPan) {
      isMiddleDragRef.current = true;
      return;
    }

    // ── Arm drag-selection rubber-band (select tool) ──
    // Must be done BEFORE the Ctrl+Click block so Ctrl+drag is also armed.
    // isDragSelectAddModeRef records whether to merge or replace on mouseup.
    if (activeTool === 'select') {
      isDragSelectingRef.current = false; // will be activated on move
      isDragSelectAddModeRef.current = isMultiSelectToggle;
      dragSelectStartScreenRef.current = screenPt;
      dragSelectStartWorldRef.current = rawWorldPt;
    }

    // ── Touch Multi-Select Mode OR Ctrl+Click multi-select toggle (select tool only) ──
    if (activeTool === 'select' && isMultiSelectToggle) {
      // Find the clicked rack
      let found: CADEntity | null = null;
      for (let i = entities.length - 1; i >= 0; i--) {
        const ent = entities[i];
        if (ent.type !== 'rack') continue;
        const rack = ent as RackEntity;
        const geom = rack.geometry;
        const rotRad = -((geom.rotation || 0) * Math.PI) / 180;
        const dx = rawWorldPt.x - geom.x;
        const dy = rawWorldPt.y - geom.y;
        const lx = dx * Math.cos(rotRad) - dy * Math.sin(rotRad);
        const ly = dx * Math.sin(rotRad) + dy * Math.cos(rotRad);
        const width = geom.width || 36;
        const depth = geom.depth || 24;
        if (Math.abs(lx) <= width / 2 + 12 && Math.abs(ly) <= depth / 2 + 12) {
          found = ent;
          break;
        }
      }
      if (found && isCenterRackEntity(found)) {
        const newIds = new Set(selectedEntityIdsRef.current);
        if (newIds.has(found.id)) {
          newIds.delete(found.id);
        } else {
          newIds.add(found.id);
        }
        setSelectedEntityIds(newIds);
        setSelectedEntityId(null); // clear single-select when multi-selecting
      }
      return; // don't start single-select; drag-select was already armed above
    }



    const basePoint = activeDrawingPoints.length > 0 ? activeDrawingPoints[0] : null;
    const snap = snapEngineRef.current.findSnapPoint(rawWorldPt, entities, viewportRef.current.zoom, basePoint);
    const worldPt = snap.point;

    switch (activeTool) {
      case 'select': {
        let found: CADEntity | null = null;
        for (let i = entities.length - 1; i >= 0; i--) {
          const ent = entities[i];
          if (ent.type === 'wall' || ent.type === 'partition') {
            const p1 = { x: ent.geometry.x1, y: ent.geometry.y1 };
            const p2 = { x: ent.geometry.x2, y: ent.geometry.y2 };
            const mid = midpoint(p1, p2);
            if (distance(rawWorldPt, mid) < 30 || distance(rawWorldPt, p1) < 20 || distance(rawWorldPt, p2) < 20) {
              found = ent;
              break;
            }
          } else if (ent.type === 'rack') {
            const rack = ent as RackEntity;
            const geom = rack.geometry;
            const rt = rack.properties?.rackType || '';
            const isCorner = rt === 'corner_rack_2x2x2' || rt === 'Corner Rack';
            const isWall = rt.startsWith('wall_rack') || rt === 'Wall Rack' || !!rack.properties?.attachedWallId;
            const rotRad = -((geom.rotation || 0) * Math.PI) / 180;

            if (isCorner) {
              const dx = rawWorldPt.x - geom.x;
              const dy = rawWorldPt.y - geom.y;
              const lx = dx * Math.cos(rotRad) - dy * Math.sin(rotRad);
              const ly = dx * Math.sin(rotRad) + dy * Math.cos(rotRad);
              const sideA = geom.width || 24;
              const sideB = geom.depth || 24;
              if (lx >= -6 && lx <= sideA + 6 && ly >= -6 && ly <= sideB + 6) {
                found = ent;
                break;
              }
            } else if (isWall) {
              const inNorm = rack.properties?.inwardNormal || { x: 0, y: 1 };
              const depth = geom.depth || 24;
              const width = geom.width || 36;
              const cx = geom.x + inNorm.x * (depth / 2);
              const cy = geom.y + inNorm.y * (depth / 2);
              const dx = rawWorldPt.x - cx;
              const dy = rawWorldPt.y - cy;
              const lx = dx * Math.cos(rotRad) - dy * Math.sin(rotRad);
              const ly = dx * Math.sin(rotRad) + dy * Math.cos(rotRad);
              if (Math.abs(lx) <= width / 2 + 8 && Math.abs(ly) <= depth / 2 + 8) {
                found = ent;
                break;
              }
            } else {
              const dx = rawWorldPt.x - geom.x;
              const dy = rawWorldPt.y - geom.y;
              const lx = dx * Math.cos(rotRad) - dy * Math.sin(rotRad);
              const ly = dx * Math.sin(rotRad) + dy * Math.cos(rotRad);
              const width = geom.width || 36;
              const depth = geom.depth || 24;
              if (Math.abs(lx) <= width / 2 + 8 && Math.abs(ly) <= depth / 2 + 8) {
                found = ent;
                break;
              }
            }
          } else if (ent.type === 'column' || ent.type === 'door' || ent.type === 'window' || ent.type === 'shutter') {
            const geom = ent.geometry as { x: number; y: number; width?: number; height?: number; depth?: number };
            const w = geom.width || 24;
            const h = geom.height || geom.depth || 24;
            if (Math.abs(rawWorldPt.x - geom.x) <= w / 2 + 10 && Math.abs(rawWorldPt.y - geom.y) <= h / 2 + 10) {
              found = ent;
              break;
            }
          }
        }
        if (found) {
          if (selectedEntityIdsRef.current.has(found.id)) {
            // Clicked an already-selected entity in a multi-selection:
            // Prepare to drag the entire selected group together!
            isDraggingGroupRef.current = true;
            groupDragMovedRef.current = false;
            dragStartWorldRef.current = snap.point;
          } else {
            setSelectedEntityId(found.id);
            setSelectedEntityIds(new Set());
            isDraggingEntityRef.current = true;
            setShowMobileProps(true);
            setTabletInspectorOpen(true);
          }
        } else {
          // Clicked on empty canvas — clear selection
          setSelectedEntityId(null);
          if (selectedEntityIdsRef.current.size > 0) {
            setSelectedEntityIds(new Set());
          }
        }
        break;
      }


      case 'wall': {
        if (activeDrawingPoints.length === 0) {
          setActiveDrawingPoints([worldPt]);
        } else {
          const startPt = activeDrawingPoints[0];
          const len = distance(startPt, worldPt);
          if (len > 6) {
            const newWall: WallEntity = {
              id: `wall_${Date.now()}`,
              type: 'wall',
              geometry: { x1: startPt.x, y1: startPt.y, x2: worldPt.x, y2: worldPt.y },
              properties: { thickness: wallThickness },
            };
            const updated = [...entities, newWall];
            updateEntitiesWithHistory(updated, 'Add Wall');
          }
          setActiveDrawingPoints([]);
        }
        break;
      }

      case 'partition': {
        if (activeDrawingPoints.length === 0) {
          setActiveDrawingPoints([worldPt]);
        } else {
          const startPt = activeDrawingPoints[0];
          if (distance(startPt, worldPt) > 6) {
            const newPart: PartitionEntity = {
              id: `part_${Date.now()}`,
              type: 'partition',
              geometry: { x1: startPt.x, y1: startPt.y, x2: worldPt.x, y2: worldPt.y },
              properties: { thickness: 4, material: 'drywall' },
            };
            updateEntitiesWithHistory([...entities, newPart], 'Add Partition');
          }
          setActiveDrawingPoints([]);
        }
        break;
      }

      case 'column': {
        const isWallCol = snap.type === 'wall' || snap.type === 'endpoint';
        const targetWall = snap.targetEntityId ? entities.find((w): w is WallEntity => w.type === 'wall' && w.id === snap.targetEntityId) : undefined;
        let x = worldPt.x;
        let y = worldPt.y;
        let rot = 0;
        let wp: any = undefined;

        if (targetWall) {
          const metrics = WallPlacementEngine.getWallMetrics(targetWall);
          rot = metrics.angleDeg;
          const dummyCol: ColumnEntity = {
            id: 'temp',
            type: 'column',
            geometry: { x, y, width: columnWidth, height: columnHeight, rotation: rot },
            properties: { columnType: 'wall', attachedWallId: targetWall.id }
          };
          wp = WallPlacementEngine.derivePlacementFromGeometry(dummyCol, targetWall, 'start');
          const calcRes = WallPlacementEngine.calculatePlacement({
            wall: targetWall,
            anchor: 'start',
            offsetInches: wp.offsetInches,
            widthInches: columnWidth,
            depthInches: columnHeight,
            entityType: 'column',
          });
          x = calcRes.centerPoint.x;
          y = calcRes.centerPoint.y;
        }

        const newCol: ColumnEntity = {
          id: `col_${Date.now()}`,
          type: 'column',
          geometry: { x, y, width: columnWidth, height: columnHeight, rotation: rot },
          properties: {
            columnType: isWallCol ? 'wall' : 'free',
            inwardProjection: columnHeight,
            attachedWallId: snap.targetEntityId,
            wallPlacement: wp,
          },
        };
        updateEntitiesWithHistory([...entities, newCol], 'Add Column');
        setSelectedEntityId(newCol.id);
        setPlacementModeTool(null);
        break;
      }

      case 'door': {
        const targetWall = snap.targetEntityId ? entities.find((w): w is WallEntity => w.type === 'wall' && w.id === snap.targetEntityId) : undefined;
        let x = worldPt.x;
        let y = worldPt.y;
        let rot = 0;
        let wp: any = undefined;

        if (targetWall) {
          const metrics = WallPlacementEngine.getWallMetrics(targetWall);
          rot = metrics.angleDeg;
          const dummy: DoorEntity = {
            id: 'temp',
            type: 'door',
            geometry: { x, y, width: doorWidth, height: wallThickness, rotation: rot },
            properties: { doorType: 'single', swing: 'inward', flipSide: 'left', attachedWallId: targetWall.id }
          };
          wp = WallPlacementEngine.derivePlacementFromGeometry(dummy, targetWall, 'start');
          const calcRes = WallPlacementEngine.calculatePlacement({
            wall: targetWall,
            anchor: 'start',
            offsetInches: wp.offsetInches,
            widthInches: doorWidth,
            entityType: 'door',
          });
          x = calcRes.centerPoint.x;
          y = calcRes.centerPoint.y;
        }

        const newDoor: DoorEntity = {
          id: `door_${Date.now()}`,
          type: 'door',
          geometry: { x, y, width: doorWidth, height: wallThickness, rotation: rot },
          properties: { doorType: 'single', swing: 'inward', flipSide: 'left', attachedWallId: snap.targetEntityId, wallPlacement: wp },
        };
        updateEntitiesWithHistory([...entities, newDoor], 'Add Door');
        setSelectedEntityId(newDoor.id);
        setPlacementModeTool(null);
        break;
      }

      case 'window': {
        const targetWall = snap.targetEntityId ? entities.find((w): w is WallEntity => w.type === 'wall' && w.id === snap.targetEntityId) : undefined;
        let x = worldPt.x;
        let y = worldPt.y;
        let rot = 0;
        let wp: any = undefined;

        if (targetWall) {
          const metrics = WallPlacementEngine.getWallMetrics(targetWall);
          rot = metrics.angleDeg;
          const dummy: WindowEntity = {
            id: 'temp',
            type: 'window',
            geometry: { x, y, width: 48, rotation: rot },
            properties: { windowType: 'standard', attachedWallId: targetWall.id }
          };
          wp = WallPlacementEngine.derivePlacementFromGeometry(dummy, targetWall, 'start');
          const calcRes = WallPlacementEngine.calculatePlacement({
            wall: targetWall,
            anchor: 'start',
            offsetInches: wp.offsetInches,
            widthInches: 48,
            entityType: 'window',
          });
          x = calcRes.centerPoint.x;
          y = calcRes.centerPoint.y;
        }

        const newWin: WindowEntity = {
          id: `win_${Date.now()}`,
          type: 'window',
          geometry: { x, y, width: 48, rotation: rot },
          properties: { windowType: 'standard', attachedWallId: snap.targetEntityId, wallPlacement: wp },
        };
        updateEntitiesWithHistory([...entities, newWin], 'Add Window');
        setSelectedEntityId(newWin.id);
        setPlacementModeTool(null);
        break;
      }

      case 'shutter': {
        const targetWall = snap.targetEntityId ? entities.find((w): w is WallEntity => w.type === 'wall' && w.id === snap.targetEntityId) : undefined;
        let x = worldPt.x;
        let y = worldPt.y;
        let rot = 0;
        let wp: any = undefined;

        if (targetWall) {
          const metrics = WallPlacementEngine.getWallMetrics(targetWall);
          rot = metrics.angleDeg;
          const dummy: ShutterEntity = {
            id: 'temp',
            type: 'shutter',
            geometry: { x, y, width: 96, rotation: rot },
            properties: { shutterType: 'rolling', attachedWallId: targetWall.id }
          };
          wp = WallPlacementEngine.derivePlacementFromGeometry(dummy, targetWall, 'start');
          const calcRes = WallPlacementEngine.calculatePlacement({
            wall: targetWall,
            anchor: 'start',
            offsetInches: wp.offsetInches,
            widthInches: 96,
            entityType: 'shutter',
          });
          x = calcRes.centerPoint.x;
          y = calcRes.centerPoint.y;
        }

        const newShutter: ShutterEntity = {
          id: `shutter_${Date.now()}`,
          type: 'shutter',
          geometry: { x, y, width: 96, rotation: rot },
          properties: { shutterType: 'rolling', attachedWallId: snap.targetEntityId, wallPlacement: wp },
        };
        updateEntitiesWithHistory([...entities, newShutter], 'Add Shutter');
        setSelectedEntityId(newShutter.id);
        setPlacementModeTool(null);
        break;
      }

      case 'gate': {
        const targetWall = snap.targetEntityId ? entities.find((w): w is WallEntity => w.type === 'wall' && w.id === snap.targetEntityId) : undefined;
        let x = worldPt.x;
        let y = worldPt.y;
        let rot = 0;
        let wp: any = undefined;

        if (targetWall) {
          const metrics = WallPlacementEngine.getWallMetrics(targetWall);
          rot = metrics.angleDeg;
          const dummy: GateEntity = {
            id: 'temp',
            type: 'gate',
            geometry: { x, y, width: 48, height: 72, rotation: rot },
            properties: { gateType: 'security', attachedWallId: targetWall.id }
          };
          wp = WallPlacementEngine.derivePlacementFromGeometry(dummy, targetWall, 'start');
          const calcRes = WallPlacementEngine.calculatePlacement({
            wall: targetWall,
            anchor: 'start',
            offsetInches: wp.offsetInches,
            widthInches: 48,
            entityType: 'gate',
          });
          x = calcRes.centerPoint.x;
          y = calcRes.centerPoint.y;
        }

        const newGate: GateEntity = {
          id: `gate_${Date.now()}`,
          type: 'gate',
          geometry: { x, y, width: 48, height: 72, rotation: rot },
          properties: { gateType: 'security', attachedWallId: snap.targetEntityId, wallPlacement: wp },
        };
        updateEntitiesWithHistory([...entities, newGate], 'Add Security Gate');
        setSelectedEntityId(newGate.id);
        setPlacementModeTool(null);
        break;
      }

      case 'glass_gate': {
        const targetWall = snap.targetEntityId ? entities.find((w): w is WallEntity => w.type === 'wall' && w.id === snap.targetEntityId) : undefined;
        let x = worldPt.x;
        let y = worldPt.y;
        let rot = 0;
        let wp: any = undefined;

        if (targetWall) {
          const metrics = WallPlacementEngine.getWallMetrics(targetWall);
          rot = metrics.angleDeg;
          const dummy: GlassGateEntity = {
            id: 'temp',
            type: 'glass_gate',
            geometry: { x, y, width: 72, height: 42, rotation: rot },
            properties: { gateType: 'double_glass', attachedWallId: targetWall.id }
          };
          wp = WallPlacementEngine.derivePlacementFromGeometry(dummy, targetWall, 'start');
          const calcRes = WallPlacementEngine.calculatePlacement({
            wall: targetWall,
            anchor: 'start',
            offsetInches: wp.offsetInches,
            widthInches: 72,
            entityType: 'glass_gate',
          });
          x = calcRes.centerPoint.x;
          y = calcRes.centerPoint.y;
        }

        const newGate: GlassGateEntity = {
          id: `gate_${Date.now()}`,
          type: 'glass_gate',
          geometry: { x, y, width: 72, rotation: rot },
          properties: { gateType: 'double_glass', attachedWallId: snap.targetEntityId, wallPlacement: wp },
        };
        updateEntitiesWithHistory([...entities, newGate], 'Add Glass Gate');
        setSelectedEntityId(newGate.id);
        setPlacementModeTool(null);
        break;
      }

      case 'text': {
        const label = prompt('Enter Room or Area Label:', 'SALES FLOOR');
        if (label) {
          const newText: TextEntity = {
            id: `text_${Date.now()}`,
            type: 'text',
            geometry: { x: worldPt.x, y: worldPt.y },
            properties: { text: label, fontSize: 16, fontWeight: 'bold' },
          };
          updateEntitiesWithHistory([...entities, newText], 'Add Text Label');
        }
        break;
      }

      case 'measure': {
        if (activeDrawingPoints.length === 0) {
          // First click — record the start point
          setActiveDrawingPoints([worldPt]);
        } else {
          // Second click — finalize and persist the completed measurement
          const p1 = activeDrawingPoints[0];
          const p2 = worldPt;
          const distInches = distance(p1, p2);
          const label = formatFeetInches(distInches);
          const annotation: MeasureAnnotation = {
            id: `meas_${Date.now()}`,
            p1,
            p2,
            distInches,
            label,
          };
          setMeasureAnnotations((prev) => [...prev, annotation]);
          // Reset so the user can start the next measurement immediately
          setActiveDrawingPoints([]);
        }
        break;
      }

      case 'eraser': {
        const remaining = entities.filter((ent) => {
          if (ent.type === 'wall' || ent.type === 'partition') {
            const p1 = { x: ent.geometry.x1, y: ent.geometry.y1 };
            const p2 = { x: ent.geometry.x2, y: ent.geometry.y2 };
            return distance(rawWorldPt, midpoint(p1, p2)) >= 25 && distance(rawWorldPt, p1) >= 20 && distance(rawWorldPt, p2) >= 20;
          }
          const geom = ent.geometry as { x: number; y: number; width?: number; height?: number; depth?: number };
          const w = geom.width || 24;
          const h = geom.height || geom.depth || 24;
          return Math.abs(rawWorldPt.x - geom.x) > w / 2 + 10 || Math.abs(rawWorldPt.y - geom.y) > h / 2 + 10;
        });

        if (remaining.length !== entities.length) {
          updateEntitiesWithHistory(remaining, 'Erase Entity');
          setSelectedEntityId(null);
        }
        break;
      }

      case 'rack': {
        const template = pendingRackPlacementRef.current;
        if (template) {
          const placement = calculateRackPlacement(rawWorldPt, template);
          commitNewRackPlacement(placement, template);
        }
        break;
      }
    }
  };

  // ── Unified Pointer Move Core Logic (Mouse & Touch) ──
  const executePointerMove = (screenPt: Point2D, rawWorldPt: Point2D) => {
    if (isMiddleDragRef.current && isMouseDownRef.current) {
      const dx = screenPt.x - dragStartScreenRef.current.x;
      const dy = screenPt.y - dragStartScreenRef.current.y;
      viewportRef.current.panBy(dx, dy);
      dragStartScreenRef.current = screenPt;
      renderScene();
      return;
    }

    const basePoint = activeDrawingPoints.length > 0 ? activeDrawingPoints[0] : null;
    const snap = snapEngineRef.current.findSnapPoint(rawWorldPt, entities, viewportRef.current.zoom, basePoint);

    setCursorWorldPos(snap.point);
    setSnapIndicator(snap.type !== 'grid' ? snap : null);

    // ── Drag-selection rubber-band tracking ──
    // Suppress when group-dragging or entity-dragging is already in progress.
    if (isMouseDownRef.current && activeTool === 'select' && !isDraggingEntityRef.current && !isDraggingGroupRef.current && !isMiddleDragRef.current) {
      const dx = screenPt.x - dragSelectStartScreenRef.current.x;
      const dy = screenPt.y - dragSelectStartScreenRef.current.y;
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
        isDragSelectingRef.current = true;
        const rect = {
          x: Math.min(screenPt.x, dragSelectStartScreenRef.current.x),
          y: Math.min(screenPt.y, dragSelectStartScreenRef.current.y),
          w: Math.abs(dx),
          h: Math.abs(dy),
        };
        dragSelectionRectRef.current = rect;
        setDragSelectionRect(rect);
      }
    }

    // ── Drag entire multi-selected group together ──
    if (isMouseDownRef.current && isDraggingGroupRef.current && selectedEntityIdsRef.current.size > 0) {
      const dx = snap.point.x - dragStartWorldRef.current.x;
      const dy = snap.point.y - dragStartWorldRef.current.y;
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
        groupDragMovedRef.current = true;
        const nextEnts = RackGroupTransformEngine.moveGroup(entitiesRef.current, selectedEntityIdsRef.current, dx, dy);
        entitiesRef.current = nextEnts;
        setEntities(nextEnts);
        dragStartWorldRef.current = snap.point;
        renderScene();
        return;
      }
    }

    if (isMouseDownRef.current && isDraggingEntityRef.current && selectedEntityId) {
      const dx = snap.point.x - dragStartWorldRef.current.x;
      const dy = snap.point.y - dragStartWorldRef.current.y;

      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
        let movedWall: WallEntity | null = null;
        let nextEnts = entitiesRef.current.map((ent): CADEntity => {
          if (ent.id !== selectedEntityId) return ent;

          if (ent.type === 'wall') {
            const updatedWall: WallEntity = {
              ...ent,
              geometry: {
                x1: ent.geometry.x1 + dx,
                y1: ent.geometry.y1 + dy,
                x2: ent.geometry.x2 + dx,
                y2: ent.geometry.y2 + dy,
              },
            };
            movedWall = updatedWall;
            return updatedWall;
          }

          if (ent.type === 'partition') {
            return {
              ...ent,
              geometry: {
                x1: ent.geometry.x1 + dx,
                y1: ent.geometry.y1 + dy,
                x2: ent.geometry.x2 + dx,
                y2: ent.geometry.y2 + dy,
              },
            };
          }

          // Check if entity is wall-attached
          const attachedWallId = (ent as any).properties?.attachedWallId;
          if (attachedWallId && WallPlacementEngine.isWallAttachedEntity(ent)) {
            const attachedWall = entitiesRef.current.find((w) => w.id === attachedWallId) as WallEntity | undefined;
            if (attachedWall) {
              const metrics = WallPlacementEngine.getWallMetrics(attachedWall);
              if (metrics.length > 0) {
                const geom = ent.geometry as any;
                const newRawX = geom.x + dx;
                const newRawY = geom.y + dy;
                const entWidth = geom.width || 36;
                const t = (newRawX - metrics.start.x) * metrics.direction.x + (newRawY - metrics.start.y) * metrics.direction.y;
                const clampedT = Math.max(entWidth / 2, Math.min(t, metrics.length - entWidth / 2));

                const currentAnchor = (ent as any).properties?.wallPlacement?.anchor || 'start';
                let newOffset = 0;
                if (currentAnchor === 'start') newOffset = Math.max(0, clampedT - entWidth / 2);
                else if (currentAnchor === 'center') newOffset = clampedT;
                else if (currentAnchor === 'end') newOffset = Math.max(0, metrics.length - (clampedT + entWidth / 2));

                const calcRes = WallPlacementEngine.calculatePlacement({
                  wall: attachedWall,
                  anchor: currentAnchor,
                  offsetInches: newOffset,
                  widthInches: entWidth,
                  heightInches: geom.height,
                  depthInches: geom.depth,
                  entityType: ent.type,
                  entityId: ent.id,
                  roomPolygon: viewportRef.current.roomShapeMode === 'MANUAL'
                    ? buildRoomPolygon(entitiesRef.current.filter((e): e is WallEntity => e.type === 'wall'))
                    : [],
                  allEntities: entitiesRef.current,
                });

                return WallPlacementEngine.applyPlacementToEntity(ent, calcRes);
              }
            }
          }

          // Free movement for center, endcap, corner racks, free columns, text
          const geom = ent.geometry as any;
          let newX = geom.x + dx;
          let newY = geom.y + dy;
          let newRot = geom.rotation || 0;

          if (ent.type === 'rack') {
             const allRacks = entitiesRef.current.filter((r): r is RackEntity => r.type === 'rack');
             const bestSnap = RackConnectionEngine.findBestSnap(ent as RackEntity, allRacks, { x: newX, y: newY }, newRot);
             if (bestSnap) {
                newX = bestSnap.position.x;
                newY = bestSnap.position.y;
                newRot = bestSnap.rotation;
             }
          }

          return {
            ...ent,
            geometry: {
              ...geom,
              x: newX,
              y: newY,
              rotation: newRot
            },
          };
        });

        // If a wall was moved, keep attached entities synchronized with the moved wall
        if (movedWall) {
          const roomPoly = viewportRef.current.roomShapeMode === 'MANUAL'
            ? buildRoomPolygon(nextEnts.filter((e): e is WallEntity => e.type === 'wall'))
            : [];
          nextEnts = WallPlacementEngine.updateAttachedEntitiesForWall(movedWall, nextEnts, roomPoly);
        }

        entitiesRef.current = nextEnts;
        setEntities(nextEnts);
        dragStartWorldRef.current = snap.point;
      }
    }

    renderScene();
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // Ignore synthetic mouse events generated by mobile browsers within 500ms of touch or 800ms of rack placement
    const isRecentTouch = Date.now() - lastTouchTimeRef.current < 1000;
    if (isRecentTouch && (Date.now() - lastTouchTimeRef.current < 500 || Date.now() - lastPlacementTimeRef.current < 800)) {
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const screenPt = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const rawWorldPt = viewportRef.current.screenToWorld(screenPt);
    executePointerMove(screenPt, rawWorldPt);
  };

  const handleMouseUp = () => {
    // Finalize drag-selection
    if (isDragSelectingRef.current) {
      const rect = dragSelectionRectRef.current;
      if (rect) {
        // Convert rect corners to world space
        const vp = viewportRef.current;
        const wTopLeft = vp.screenToWorld({ x: rect.x, y: rect.y });
        const wBotRight = vp.screenToWorld({ x: rect.x + rect.w, y: rect.y + rect.h });
        const minWx = Math.min(wTopLeft.x, wBotRight.x);
        const maxWx = Math.max(wTopLeft.x, wBotRight.x);
        const minWy = Math.min(wTopLeft.y, wBotRight.y);
        const maxWy = Math.max(wTopLeft.y, wBotRight.y);

        // Collect center racks that are inside OR overlapping the selection rect.
        // A rack is selected if its CENTER falls within the rect, OR any of its
        // OBB corners fall within the rect (covers partial overlap cases).
        const newIds = new Set<string>();
        for (const ent of entitiesRef.current) {
          if (!isCenterRackEntity(ent)) continue;
          const r = ent as RackEntity;
          // Fast check: center point
          const cx = r.geometry.x;
          const cy = r.geometry.y;
          if (cx >= minWx && cx <= maxWx && cy >= minWy && cy <= maxWy) {
            newIds.add(r.id);
            continue;
          }
          // Slower check: any OBB corner inside the world rect
          const geom = r.geometry;
          const w2 = (geom.width || 36) / 2;
          const d2 = (geom.depth || 24) / 2;
          const rotRad = (geom.rotation || 0) * Math.PI / 180;
          const cos = Math.cos(rotRad);
          const sin = Math.sin(rotRad);
          const corners = [
            { x: cx + (-w2) * cos - (-d2) * sin, y: cy + (-w2) * sin + (-d2) * cos },
            { x: cx + ( w2) * cos - (-d2) * sin, y: cy + ( w2) * sin + (-d2) * cos },
            { x: cx + ( w2) * cos - ( d2) * sin, y: cy + ( w2) * sin + ( d2) * cos },
            { x: cx + (-w2) * cos - ( d2) * sin, y: cy + (-w2) * sin + ( d2) * cos },
          ];
          if (corners.some(pt => pt.x >= minWx && pt.x <= maxWx && pt.y >= minWy && pt.y <= maxWy)) {
            newIds.add(r.id);
          }
        }

        if (newIds.size > 0) {
          // Merge with existing selection when Ctrl was held at drag start; else replace
          if (isDragSelectAddModeRef.current && selectedEntityIdsRef.current.size > 0) {
            const merged = new Set(selectedEntityIdsRef.current);
            newIds.forEach(id => merged.add(id));
            setSelectedEntityIds(merged);
          } else {
            setSelectedEntityIds(newIds);
          }
          setSelectedEntityId(null);
        }
      }
      isDragSelectingRef.current = false;
      isDragSelectAddModeRef.current = false;
      dragSelectionRectRef.current = null;
      setDragSelectionRect(null);
    }

    if (isDraggingEntityRef.current && selectedEntityId) {
      updateEntitiesWithHistory(entities, 'Move Entity');
    }
    if (isDraggingGroupRef.current) {
      if (groupDragMovedRef.current) {
        updateEntitiesWithHistory(entitiesRef.current, `Move Rack Group (${selectedEntityIdsRef.current.size} racks)`);
      }
      isDraggingGroupRef.current = false;
      groupDragMovedRef.current = false;
    }
    isMouseDownRef.current = false;
    isMiddleDragRef.current = false;
    isDraggingEntityRef.current = false;
  };

  // ── Touch Handlers for Pinch-to-Zoom, Two-Finger Pan, and Touch Interaction ──
  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    lastTouchTimeRef.current = Date.now();
    touchStartTimeRef.current = Date.now();
    touchMovedTotalRef.current = 0;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();

    if (e.touches.length === 2) {
      // 2-Finger Pinch / Pan Start
      isPinchingRef.current = true;
      isMouseDownRef.current = false;
      isDraggingEntityRef.current = false;
      isDraggingGroupRef.current = false;
      isDragSelectingRef.current = false;
      setDragSelectionRect(null);

      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const midScreen = {
        x: (t1.clientX + t2.clientX) / 2 - rect.left,
        y: (t1.clientY + t2.clientY) / 2 - rect.top,
      };

      pinchLastDistRef.current = dist;
      pinchLastMidpointRef.current = midScreen;
      if (e.cancelable) e.preventDefault();
      return;
    }

    if (e.touches.length === 1) {
      if (e.cancelable) {
        e.preventDefault();
      }
      const t = e.touches[0];
      const screenPt = { x: t.clientX - rect.left, y: t.clientY - rect.top };
      touchStartPosRef.current = screenPt;
      const rawWorldPt = viewportRef.current.screenToWorld(screenPt);

      if (activeTool === 'rack' && pendingRackPlacementRef.current) {
        cursorWorldPosRef.current = rawWorldPt;
        setCursorWorldPos(rawWorldPt);
        renderScene();
        return;
      }

      executePointerDown(screenPt, rawWorldPt, touchMultiSelectModeRef.current, false);
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();

    if (e.touches.length === 2 && isPinchingRef.current) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const midScreen = {
        x: (t1.clientX + t2.clientX) / 2 - rect.left,
        y: (t1.clientY + t2.clientY) / 2 - rect.top,
      };

      if (pinchLastDistRef.current > 0) {
        const zoomFactor = dist / pinchLastDistRef.current;
        // Pinch-to-zoom around the midpoint
        viewportRef.current.zoomAt(midScreen, zoomFactor);

        // Pan with the midpoint displacement
        const panDx = midScreen.x - pinchLastMidpointRef.current.x;
        const panDy = midScreen.y - pinchLastMidpointRef.current.y;
        viewportRef.current.panBy(panDx, panDy);

        pinchLastDistRef.current = dist;
        pinchLastMidpointRef.current = midScreen;
        renderScene();
      }
      if (e.cancelable) e.preventDefault();
      return;
    }

    if (e.touches.length === 1 && !isPinchingRef.current) {
      if (e.cancelable) {
        e.preventDefault();
      }
      const t = e.touches[0];
      const screenPt = { x: t.clientX - rect.left, y: t.clientY - rect.top };
      const moveDist = Math.hypot(screenPt.x - touchStartPosRef.current.x, screenPt.y - touchStartPosRef.current.y);
      touchMovedTotalRef.current = Math.max(touchMovedTotalRef.current, moveDist);

      const rawWorldPt = viewportRef.current.screenToWorld(screenPt);

      if (activeTool === 'rack' && pendingRackPlacementRef.current) {
        cursorWorldPosRef.current = rawWorldPt;
        setCursorWorldPos(rawWorldPt);
        renderScene();
        return;
      }

      executePointerMove(screenPt, rawWorldPt);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (isPinchingRef.current) {
      if (e.touches.length < 2) {
        isPinchingRef.current = false;
        pinchLastDistRef.current = 0;
      }
      if (e.cancelable) e.preventDefault();
      return;
    }

    if (activeTool === 'rack' && pendingRackPlacementRef.current) {
      const canvas = canvasRef.current;
      if (canvas && e.changedTouches.length > 0) {
        const t = e.changedTouches[0];
        const rect = canvas.getBoundingClientRect();
        const screenPt = { x: t.clientX - rect.left, y: t.clientY - rect.top };
        const elapsed = Date.now() - touchStartTimeRef.current;
        const totalMoved = touchMovedTotalRef.current;
        const rawWorldPt = viewportRef.current.screenToWorld(screenPt);

        // Tap detection: on touchscreens, a deliberate tap is < 28px movement and < 800ms duration
        if (RackPlacementController.isDeliberateTap(elapsed, totalMoved)) {
          const placement = calculateRackPlacement(rawWorldPt, pendingRackPlacementRef.current);
          commitNewRackPlacement(placement, pendingRackPlacementRef.current);
          if (e.cancelable) e.preventDefault();
          return;
        }

        // If finger dragged >= 28px, keep the preview anchored at this release location
        cursorWorldPosRef.current = rawWorldPt;
        setCursorWorldPos(rawWorldPt);
        renderScene();
        if (e.cancelable) e.preventDefault();
        return;
      }
    }

    handleMouseUp();
  };

  const handleTouchCancel = () => {
    isPinchingRef.current = false;
    pinchLastDistRef.current = 0;
    handleMouseUp();
  };




  // ── Clear measure annotations ──────────────────────────────────────────
  const handleClearMeasurements = useCallback(() => {
    setMeasureAnnotations([]);
    setActiveDrawingPoints([]);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore global shortcuts if the user is typing in an input or textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // T — Tape Measure tool
      if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 't') {
        e.preventDefault();
        setActiveTool('measure');
        setPlacementModeTool(null);
        setActiveDrawingPoints([]);
        setShowRackMenu(false);
        return;
      }

      // R — Rotate pending rack by 90 deg when in rack placement mode, or open rack menu
      if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'r') {
        e.preventDefault();
        if (activeTool === 'rack' && pendingRackPlacementRef.current) {
          handleRotatePendingRack();
        } else {
          setShowRackMenu(true);
        }
        return;
      }
      
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        const prev = historyRef.current.undo();
        if (prev) {
          setEntities(prev);
          triggerAutoSave(prev);
        }
      } else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        e.preventDefault();
        const next = historyRef.current.redo();
        if (next) {
          setEntities(next);
          triggerAutoSave(next);
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleManualSave();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        const selectedId = selectedEntityIdRef.current;
        const multiIds = selectedEntityIdsRef.current;
        if (multiIds.size > 0) {
          // Delete all multi-selected entities in one history transaction
          const remaining = entitiesRef.current.filter((ent) => !multiIds.has(ent.id));
          updateEntitiesWithHistory(remaining, `Delete ${multiIds.size} Selected Racks`);
          setSelectedEntityIds(new Set());
        } else if (selectedId) {
          const remaining = entitiesRef.current.filter((ent) => ent.id !== selectedId);
          updateEntitiesWithHistory(remaining, 'Delete Selected');
          setSelectedEntityId(null);
        }
      } else if (e.key === 'F8') {
        e.preventDefault();
        setOrthoMode((prev) => !prev);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        contextualBackRef.current();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        // Ctrl+A = Select all center racks
        const centerRackIds = new Set(
          entitiesRef.current.filter(isCenterRackEntity).map(ent => ent.id)
        );
        if (centerRackIds.size > 0) {
          setSelectedEntityIds(centerRackIds);
          setSelectedEntityId(null);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [triggerAutoSave, updateEntitiesWithHistory]);


  const handleManualSave = async (createRev = false, revName?: string) => {
    setSaveStatus('saving');
    try {
      const res = await api.saveProject(projectId, {
        title: projectData?.title,
        scale: projectData?.scale || '1/4" = 1\'-0"',
        unit: 'Feet + Inches',
        viewport: viewportRef.current.getState(),
        entities,
        createRevision: createRev,
        revisionName: revName,
      }, surveyToken);

      setProjectData(res);
      setRevision(res.revision);
      setRevisionsList(res.versions || []);
      setSaveStatus('saved');
      setLastSavedTime(new Date().toLocaleTimeString());
      alert('✓ Project saved successfully!');
    } catch (err: any) {
      setSaveStatus('error');
      alert(`Save failed: ${err.message}`);
    }
  };

  const handleZoomIn = () => {
    const center = { x: viewportRef.current.width / 2, y: viewportRef.current.height / 2 };
    viewportRef.current.zoomAt(center, 1.25);
    renderScene();
  };

  const handleZoomOut = () => {
    const center = { x: viewportRef.current.width / 2, y: viewportRef.current.height / 2 };
    viewportRef.current.zoomAt(center, 0.8);
    renderScene();
  };

  const handleZoomToFit = () => {
    if (entities.length === 0) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const ent of entities) {
      if (ent.type === 'wall' || ent.type === 'partition') {
        minX = Math.min(minX, ent.geometry.x1, ent.geometry.x2);
        maxX = Math.max(maxX, ent.geometry.x1, ent.geometry.x2);
        minY = Math.min(minY, ent.geometry.y1, ent.geometry.y2);
        maxY = Math.max(maxY, ent.geometry.y1, ent.geometry.y2);
      } else {
        const geom = ent.geometry as { x: number; y: number; width?: number; height?: number };
        const hw = (geom.width || 24) / 2;
        const hh = (geom.height || 24) / 2;
        minX = Math.min(minX, geom.x - hw);
        maxX = Math.max(maxX, geom.x + hw);
        minY = Math.min(minY, geom.y - hh);
        maxY = Math.max(maxY, geom.y + hh);
      }
    }
    
    // Add extra padding to account for annotations outside the room.
    const padding = 100;
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;
    
    viewportRef.current.zoomToFit({ minX, minY, maxX, maxY }, 40);
    renderScene();
  };

  // ── Quick Store Setup & Tool Palette Action Handlers ──
  const handleCreateQuickRoom = useCallback((widthStr: string, depthStr: string, thickness: number = 9) => {
    const widthInches = parseFeetInches(widthStr) || 360; // default 30'
    const depthInches = parseFeetInches(depthStr) || 240; // default 20'

    const halfW = widthInches / 2;
    const halfD = depthInches / 2;
    const now = Date.now();

    const walls: WallEntity[] = [
      {
        id: `wall_${now}_1`,
        type: 'wall',
        geometry: { x1: -halfW, y1: -halfD, x2: halfW, y2: -halfD },
        properties: { thickness, isExterior: true },
      },
      {
        id: `wall_${now}_2`,
        type: 'wall',
        geometry: { x1: halfW, y1: -halfD, x2: halfW, y2: halfD },
        properties: { thickness, isExterior: true },
      },
      {
        id: `wall_${now}_3`,
        type: 'wall',
        geometry: { x1: halfW, y1: halfD, x2: -halfW, y2: halfD },
        properties: { thickness, isExterior: true },
      },
      {
        id: `wall_${now}_4`,
        type: 'wall',
        geometry: { x1: -halfW, y1: halfD, x2: -halfW, y2: -halfD },
        properties: { thickness, isExterior: true },
      },
    ];

    updateEntitiesWithHistory([...entitiesRef.current, ...walls], 'Create Store Boundary');
    setShowQuickRoomModal(false);
    setShowStarterCard(false);

    // Zoom to fit layout nicely
    setTimeout(() => {
      handleZoomToFit();
    }, 50);
  }, [updateEntitiesWithHistory, handleZoomToFit]);

  const handleAddWallRack = useCallback(() => {
    const wallProd = (activeProducts || []).find((p) =>
      p.productType?.toLowerCase().includes('wall') ||
      p.category?.toLowerCase().includes('wall') ||
      p.productName?.toLowerCase().includes('wall')
    );
    if (wallProd) {
      handleSelectRackForPlacement(wallProd);
    } else {
      const template = {
        rackType: 'Wall Rack' as const,
        productName: "Wall Display Rack 7' × 3'",
        sku: 'Wr-7x3',
        width: 36,
        depth: 18,
        height: 84,
        shelves: 6,
        shelfCount: 6,
        shelfThickness: 1.0,
        shelfSpacing: 'auto' as const,
        rotation: 0,
      };
      setPendingRackPlacement(template);
      setActiveTool('rack');
      setShowRackMenu(false);
      setShowMobileProps(false);
      setTabletInspectorOpen(false);
      const canvas = canvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const centerWorld = viewportRef.current.screenToWorld({ x: rect.width / 2, y: rect.height / 2 });
        cursorWorldPosRef.current = centerWorld;
        setCursorWorldPos(centerWorld);
      }
    }
  }, [activeProducts, handleSelectRackForPlacement]);

  const handleAddCenterRack = useCallback(() => {
    const centerProd = (activeProducts || []).find((p) =>
      p.productType?.toLowerCase().includes('center') ||
      p.productType?.toLowerCase().includes('gondola') ||
      p.category?.toLowerCase().includes('center') ||
      p.category?.toLowerCase().includes('gondola') ||
      p.productName?.toLowerCase().includes('center') ||
      p.productName?.toLowerCase().includes('gondola')
    );
    if (centerProd) {
      handleSelectRackForPlacement(centerProd);
    } else {
      const template = {
        rackType: 'Center Rack' as const,
        productName: "Center Gondola Rack 5' × 3'",
        sku: 'wr - 5x3',
        width: 36,
        depth: 36,
        height: 60,
        shelves: 4,
        shelfCount: 4,
        shelfThickness: 1.0,
        shelfSpacing: 'auto' as const,
        rotation: 0,
      };
      setPendingRackPlacement(template);
      setActiveTool('rack');
      setShowRackMenu(false);
      setShowMobileProps(false);
      setTabletInspectorOpen(false);
      const canvas = canvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const centerWorld = viewportRef.current.screenToWorld({ x: rect.width / 2, y: rect.height / 2 });
        cursorWorldPosRef.current = centerWorld;
        setCursorWorldPos(centerWorld);
      }
    }
  }, [activeProducts, handleSelectRackForPlacement]);

  const handleAddCornerRack = useCallback(() => {
    const cornerProd = (activeProducts || []).find((p) =>
      p.productType?.toLowerCase().includes('corner') ||
      p.category?.toLowerCase().includes('corner') ||
      p.productName?.toLowerCase().includes('corner')
    );
    if (cornerProd) {
      handleSelectRackForPlacement(cornerProd);
    } else {
      const template = {
        rackType: 'Corner Rack' as const,
        productName: "Corner Display Rack 2' × 2'",
        sku: 'SKU-CR-22',
        width: 24,
        depth: 24,
        height: 84,
        shelves: 6,
        shelfCount: 6,
        shelfThickness: 1.0,
        shelfSpacing: 'auto' as const,
        rotation: 0,
      };
      setPendingRackPlacement(template);
      setActiveTool('rack');
      setShowRackMenu(false);
      setShowMobileProps(false);
      setTabletInspectorOpen(false);
      const canvas = canvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const centerWorld = viewportRef.current.screenToWorld({ x: rect.width / 2, y: rect.height / 2 });
        cursorWorldPosRef.current = centerWorld;
        setCursorWorldPos(centerWorld);
      }
    }
  }, [activeProducts, handleSelectRackForPlacement]);

  const handleAddEndcapRack = useCallback(() => {
    const endcapProd = (activeProducts || []).find((p) =>
      p.productType?.toLowerCase().includes('end') ||
      p.category?.toLowerCase().includes('end') ||
      p.productName?.toLowerCase().includes('endcap')
    );
    if (endcapProd) {
      handleSelectRackForPlacement(endcapProd);
    } else {
      const template = {
        rackType: 'Endcap Rack' as const,
        productName: "Endcap Gondola Display 5' × 3'",
        sku: 'SKU-EC-53',
        width: 36,
        depth: 24,
        height: 60,
        shelves: 4,
        shelfCount: 4,
        shelfThickness: 1.0,
        shelfSpacing: 'auto' as const,
        rotation: 0,
      };
      setPendingRackPlacement(template);
      setActiveTool('rack');
      setShowRackMenu(false);
      setShowMobileProps(false);
      setTabletInspectorOpen(false);
      const canvas = canvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const centerWorld = viewportRef.current.screenToWorld({ x: rect.width / 2, y: rect.height / 2 });
        cursorWorldPosRef.current = centerWorld;
        setCursorWorldPos(centerWorld);
      }
    }
  }, [activeProducts, handleSelectRackForPlacement]);

  const handleOpenCustomRack = useCallback(() => {
    setShowRackMenu(false);
    setSelectedProductForCustom((activeProducts || [])[0] || null);
    setShowCustomRackModal(true);
  }, [activeProducts]);

  const handleRotateCurrentSelection = useCallback(() => {
    if (selectedEntityIdsRef.current.size > 0) {
      handleRotateGroupCW();
    } else if (selectedEntityIdRef.current) {
      const curId = selectedEntityIdRef.current;
      const target = entitiesRef.current.find((e) => e.id === curId);
      if (target && target.type === 'rack') {
        const curRot = (target as RackEntity).geometry.rotation || 0;
        const newRot = (curRot + 90) % 360;
        updateEntityProperty<RackEntity>(curId, 'Rotate Rack 90°', (e) => ({
          ...e,
          geometry: { ...e.geometry, rotation: newRot },
        }));
      }
    }
  }, [handleRotateGroupCW, updateEntityProperty]);

  const handleDeleteCurrentSelection = useCallback(() => {
    if (selectedEntityIdsRef.current.size > 0) {
      const ids = selectedEntityIdsRef.current;
      const remaining = entitiesRef.current.filter((e) => !ids.has(e.id));
      updateEntitiesWithHistory(remaining, 'Delete Selected Racks');
      setSelectedEntityIds(new Set());
      setSelectedEntityId(null);
      setShowMobileProps(false);
    } else if (selectedEntityIdRef.current) {
      const curId = selectedEntityIdRef.current;
      const remaining = entitiesRef.current.filter((e) => e.id !== curId);
      updateEntitiesWithHistory(remaining, 'Delete Entity');
      setSelectedEntityId(null);
      setShowMobileProps(false);
    }
  }, [updateEntitiesWithHistory]);

  // ─── Shared helper: render current CAD state to an off-screen canvas ───
  const buildExportCanvas = () => {
    dimManagerRef.current.setConfig({ roomShapeMode: viewportRef.current.roomShapeMode });
    const computedDims = dimManagerRef.current.generateDimensions(
      entities, selectedEntityId, showRackDimensions
    );
    // High-res off-screen canvas: 2800×1900 px (fits well in A3)
    return CADRenderer.renderToOffscreenCanvas(entities, computedDims, 2800, 1900, 100);
  };

  const buildExportMeta = () => ({
    surveyId:     projectData?.surveyId     || projectId,
    customerName: projectData?.customerName || 'Customer',
    storeName:    projectData?.storeName    || 'Retail Store',
    storeType:    projectData?.storeType    || 'Supermarket',
    surveyDate:   projectData?.surveyDate   || new Date().toISOString().split('T')[0],
    revision,
  });

  const handleDownloadPDF = () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      const cadCanvas = buildExportCanvas();
      const meta = buildExportMeta();
      SheetExporter.exportToPDF(cadCanvas, meta, `RETAILFIX_${projectId}_${revision}.pdf`);
    } catch (err: any) {
      alert(`PDF Export failed: ${err.message}`);
      console.error('[PDF Export]', err);
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadPNG = async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      const cadCanvas = buildExportCanvas();
      const meta = buildExportMeta();
      const dataUrl = SheetExporter.composeSheetCanvas(cadCanvas, meta);
      SheetExporter.downloadFile(dataUrl, `RETAILFIX_${projectId}_${revision}.png`);
    } catch (err: any) {
      alert(`PNG Export failed: ${err.message}`);
      console.error('[PNG Export]', err);
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadDXF = () => {
    try {
      dimManagerRef.current.setConfig({ roomShapeMode: viewportRef.current.roomShapeMode });
      const computedDims = dimManagerRef.current.generateDimensions(entities, selectedEntityId, showRackDimensions);
      const dxfContent = DXFExporter.exportToDXF(entities, computedDims);
      DXFExporter.downloadDXF(dxfContent, `RETAILFIX_${projectId}_${revision}.dxf`);
    } catch (err: any) {
      alert(`DXF Export failed: ${err.message}`);
    }
  };

  const selectedEntity = entities.find((e) => e.id === selectedEntityId);

  const showDepthProperty = (entityType: string) => {
    return entityType === 'rack' || entityType === 'column';
  };

  const renderOrientationControl = (entity: CADEntity) => {
    if (!['door', 'window', 'shutter', 'glass_gate', 'column'].includes(entity.type)) return null;
    if (entity.type === 'column' && (entity as any).properties?.columnType !== 'wall' && (entity as any).properties?.columnType !== 'free') return null;
    
    const rot = (entity as any).geometry.rotation || 0;
    
    // Horizontal = 0 or 180 degrees. Vertical = 90 or 270 degrees.
    const isHoriz = (Math.abs(Math.round(rot)) % 180) === 0;
    
    const setRot = (newRot: number) => {
      updateEntityProperty(entity.id, 'Update Orientation', (e: any) => ({
        ...e,
        geometry: { ...e.geometry, rotation: ((newRot % 360) + 360) % 360 }
      }));
    };

    return (
      <div className="mt-4 pt-4 border-t border-slate-700/50">
        <span className="text-slate-400 block mb-2 text-xs font-semibold">Orientation</span>
        <div className="flex gap-2 mb-2">
          <button
            className={`flex-1 py-1.5 px-2 text-[11px] font-medium rounded border transition-colors ${isHoriz ? 'bg-blue-600/20 border-blue-500/50 text-blue-400' : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-slate-200'}`}
            onClick={() => {
              if (!isHoriz) setRot(rot - 90);
            }}
          >
            Horizontal
          </button>
          <button
            className={`flex-1 py-1.5 px-2 text-[11px] font-medium rounded border transition-colors ${!isHoriz ? 'bg-blue-600/20 border-blue-500/50 text-blue-400' : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-slate-200'}`}
            onClick={() => {
              if (isHoriz) setRot(rot + 90);
            }}
          >
            Vertical
          </button>
        </div>
        <button
          className="w-full py-1.5 px-2 text-[11px] font-medium rounded border bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white flex items-center justify-center gap-1.5 transition-colors"
          onClick={() => setRot(rot + 90)}
        >
          <RotateCw className="w-3 h-3" /> Rotate 90°
        </button>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-screen w-full bg-slate-900 text-slate-100 select-none overflow-hidden font-sans">
      <header className="bg-retailfix-dark-900 border-b border-slate-800 shrink-0 z-30 flex flex-col">
        {/* ── Mobile Top Toolbar (320px – 767px) ── */}
        <div className="flex md:hidden items-center justify-between px-2 h-12 bg-retailfix-dark-900 border-b border-slate-800 shrink-0 z-30 gap-1">
          <div className="flex items-center gap-1.5 min-w-0 max-w-[115px] sm:max-w-[160px]">
            <button
              id="btn-mobile-back"
              className="w-7 h-7 rounded-md bg-retailfix-red-600 active:bg-retailfix-red-700 flex items-center justify-center shrink-0 cursor-pointer touch-manipulation transition-colors"
              onClick={() => handleContextualBack()}
              title={isContextualSubstate ? "Back / Close (Esc)" : "Exit to Projects"}
              aria-label={isContextualSubstate ? "Back" : "Exit"}
            >
              {isContextualSubstate ? <ArrowLeft className="w-4 h-4 text-white" /> : <Compass className="w-4 h-4 text-white" />}
            </button>
            <div className="flex flex-col min-w-0 truncate">
              <span className="font-extrabold text-xs text-white leading-tight truncate">
                {projectData?.surveyId || projectId}
              </span>
              <div className="flex items-center gap-1">
                {saveStatus === 'saved' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />}
                {saveStatus === 'saving' && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping shrink-0" />}
                {saveStatus === 'unsaved' && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />}
                {saveStatus === 'error' && <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />}
                <span className="text-[9px] text-slate-400 font-mono truncate">{revision}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0 overflow-x-auto scrollbar-hide py-1">
            {/* Undo */}
            <button
              onClick={() => {
                const prev = historyRef.current.undo();
                if (prev) {
                  setEntities(prev);
                  triggerAutoSave(prev);
                }
              }}
              disabled={!historyRef.current.canUndo()}
              title="Undo"
              className="p-1.5 rounded-lg bg-slate-800 active:bg-slate-700 disabled:opacity-30 text-slate-200"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            {/* Redo */}
            <button
              onClick={() => {
                const next = historyRef.current.redo();
                if (next) {
                  setEntities(next);
                  triggerAutoSave(next);
                }
              }}
              disabled={!historyRef.current.canRedo()}
              title="Redo"
              className="p-1.5 rounded-lg bg-slate-800 active:bg-slate-700 disabled:opacity-30 text-slate-200"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>

            {/* AI Rack Planner button (Mobile visible toolbar) */}
            <button
              id="btn-mobile-ai-planner"
              onClick={() => {
                setShowRackMenu(false);
                setShowAIPlanner(true);
              }}
              title="AI Rack Planner"
              className="relative bg-gradient-to-r from-violet-700 to-indigo-700 active:from-violet-600 active:to-indigo-600 text-white text-[11px] font-bold px-2 py-1 rounded-lg shadow-sm flex items-center gap-1 transition-all active:scale-95 shrink-0"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>AI Plan</span>
              {aiPreviewRacks.length > 0 && (
                <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-400 text-slate-900 text-[8px] font-extrabold flex items-center justify-center animate-pulse">
                  {aiPreviewRacks.length}
                </span>
              )}
            </button>

            {/* 2D / 3D compact switcher */}
            <div className="flex bg-slate-800 rounded-lg p-0.5 border border-slate-700 shrink-0">
              <button
                id="btn-mobile-view-2d"
                onClick={() => setViewMode('2D')}
                className={`px-2 py-1 rounded text-[11px] font-bold transition-colors ${
                  viewMode === '2D' ? 'bg-retailfix-red-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                2D
              </button>
              <button
                id="btn-mobile-view-3d"
                onClick={() => setViewMode('3D')}
                className={`px-2 py-1 rounded text-[11px] font-bold transition-colors ${
                  viewMode === '3D' ? 'bg-retailfix-red-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                3D
              </button>
            </div>

            {/* Save Button */}
            <button
              id="btn-mobile-save"
              onClick={() => handleManualSave(false)}
              className="p-1.5 rounded-lg bg-retailfix-red-600 text-white active:bg-retailfix-red-700 flex items-center justify-center shadow shrink-0"
              title="Save Project"
            >
              <Save className="w-3.5 h-3.5" />
            </button>

            {/* More Menu Toggle */}
            <button
              id="btn-mobile-more-menu"
              onClick={() => setShowMobileMoreMenu(true)}
              className="p-1.5 rounded-lg bg-slate-800 text-slate-200 active:bg-slate-700 border border-slate-700 shrink-0"
              title="More Project Actions (AI, Share, Exports)"
              aria-label="More Project Actions"
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* ── Desktop & Tablet Top Toolbar (768px+) ── */}
        <div className="hidden md:flex items-center justify-between px-3 h-14 gap-2 overflow-x-auto scrollbar-hide">
          {/* ZONE 1 (LEFT): Back / Project Name / Live Save Status / Undo & Redo / Save */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Back to Projects */}
            <div
              className="flex items-center gap-2 cursor-pointer group"
              onClick={() => handleContextualBack()}
              title="RetailFix CAD (Exit/Back)"
            >
              <div className="w-8 h-8 rounded-lg bg-retailfix-red-600 flex items-center justify-center shadow-md group-hover:bg-retailfix-red-700 transition-colors">
                <ArrowLeft className="w-4 h-4 text-white" />
              </div>
              <div className="hidden xl:flex flex-col">
                <span className="font-extrabold text-sm text-white tracking-wide">
                  RETAIL<span className="text-retailfix-red-500">FIX</span>
                </span>
                <span className="text-[9px] text-slate-400 font-mono -mt-0.5">2D CAD</span>
              </div>
            </div>

            <div className="h-6 w-px bg-slate-800 mx-1" />

            {/* Project Title & Survey ID */}
            <div className="flex items-center gap-2 bg-slate-800/80 border border-slate-700/80 px-2.5 py-1.5 rounded-lg text-xs">
              <span className="font-bold text-white max-w-[130px] lg:max-w-[180px] truncate" title={projectData?.title || 'Store Layout'}>
                {projectData?.title || 'Store Layout'}
              </span>
              <span className="text-slate-400 text-[10px] font-mono bg-slate-900/80 px-1.5 py-0.5 rounded border border-slate-700/50">
                {projectData?.surveyId || projectId}
              </span>
            </div>

            {/* Live Save Status Badge */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-slate-800/50 border border-slate-700/60">
              {saveStatus === 'saved' && (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span className="text-emerald-400">Saved ✓ {lastSavedTime && <span className="text-slate-400 text-[10px] hidden 2xl:inline">({lastSavedTime})</span>}</span>
                </>
              )}
              {saveStatus === 'saving' && (
                <>
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                  <span className="text-amber-300">Saving...</span>
                </>
              )}
              {saveStatus === 'unsaved' && (
                <>
                  <span className="w-2 h-2 rounded-full bg-blue-400" />
                  <span className="text-slate-300">Unsaved changes</span>
                </>
              )}
              {saveStatus === 'error' && (
                <>
                  <span className="w-2 h-2 rounded-full bg-red-400" />
                  <span className="text-red-400">Save Error</span>
                </>
              )}
            </div>

            {/* Undo / Redo */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  const prev = historyRef.current.undo();
                  if (prev) {
                    setEntities(prev);
                    triggerAutoSave(prev);
                  }
                }}
                disabled={!historyRef.current.canUndo()}
                title="Undo (Ctrl+Z)"
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 active:bg-slate-600 disabled:opacity-30 disabled:pointer-events-none text-slate-200 transition-colors"
              >
                <Undo2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  const next = historyRef.current.redo();
                  if (next) {
                    setEntities(next);
                    triggerAutoSave(next);
                  }
                }}
                disabled={!historyRef.current.canRedo()}
                title="Redo (Ctrl+Y)"
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 active:bg-slate-600 disabled:opacity-30 disabled:pointer-events-none text-slate-200 transition-colors"
              >
                <Redo2 className="w-4 h-4" />
              </button>
            </div>

            {/* Desktop & Tablet Save Button */}
            <button
              id="btn-desktop-save"
              onClick={() => handleManualSave(false)}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-semibold border border-slate-700 shadow-sm transition-colors"
              title="Save Project (Ctrl+S)"
            >
              <Save className="w-3.5 h-3.5 text-retailfix-red-400" />
              <span>Save</span>
            </button>
          </div>

          {/* ZONE 2 (CENTER): 2D Plan / 3D Preview Segmented Control */}
          <div className="flex items-center bg-slate-950/80 border border-slate-800 p-1 rounded-xl shadow-inner shrink-0">
            <button
              id="btn-desktop-view-2d"
              onClick={() => setViewMode('2D')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                viewMode === '2D'
                  ? 'bg-retailfix-red-600 text-white shadow-md shadow-red-950/40'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>2D Plan</span>
            </button>
            <button
              id="btn-desktop-view-3d"
              onClick={() => setViewMode('3D')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                viewMode === '3D'
                  ? 'bg-retailfix-red-600 text-white shadow-md shadow-red-950/40'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Box className="w-4 h-4" />
              <span>3D Preview</span>
            </button>
          </div>

          {/* ZONE 3 (RIGHT): Measurements / Zoom controls / Fit / Export PDF / More Actions */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Measurements visibility toggle */}
            <button
              id="btn-toggle-dimensions"
              onClick={() => setShowDimensions(!showDimensions)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border flex items-center gap-1.5 transition-colors ${
                showDimensions
                  ? 'bg-slate-800 text-retailfix-red-400 border-retailfix-red-500/40 shadow-sm'
                  : 'bg-slate-800/60 text-slate-400 border-slate-700/80 hover:text-white'
              }`}
              title="Toggle Real Architectural Dimensions"
            >
              <Ruler className="w-3.5 h-3.5" />
              <span className="hidden xl:inline">Dimensions</span>
            </button>

            {/* Zoom Controls */}
            <div className="flex items-center bg-slate-800/90 border border-slate-700 rounded-lg p-0.5">
              <button
                onClick={handleZoomOut}
                title="Zoom Out (-)"
                className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-700 rounded transition-colors"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <button
                id="btn-zoom-fit"
                onClick={handleZoomToFit}
                title="Fit Layout to Screen (F)"
                className="px-2 py-1 text-slate-300 hover:text-white hover:bg-slate-700 rounded flex items-center gap-1 text-[11px] font-mono transition-colors"
              >
                <Maximize className="w-3 h-3 text-cyan-400" />
                <span className="hidden xl:inline">Fit</span>
              </button>
              <button
                onClick={handleZoomIn}
                title="Zoom In (+)"
                className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-700 rounded transition-colors"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* AI Planner launcher */}
            <button
              id="btn-desktop-ai-planner"
              onClick={() => { setShowRackMenu(false); setShowAIPlanner(true); }}
              title="AI Auto Rack Planner"
              className="hidden 2xl:flex relative bg-gradient-to-r from-violet-700 to-indigo-700 hover:from-violet-600 hover:to-indigo-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-md shadow-violet-950/40 items-center gap-1.5 transition-all hover:scale-[1.02]"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>AI Plan</span>
              {aiPreviewRacks.length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-emerald-400 text-slate-900 text-[9px] font-extrabold flex items-center justify-center animate-pulse">
                  {aiPreviewRacks.length}
                </span>
              )}
            </button>

            {/* Export PDF Button */}
            <button
              id="btn-export-pdf"
              onClick={handleDownloadPDF}
              disabled={isExporting}
              className={`bg-retailfix-red-600 hover:bg-retailfix-red-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-md shadow-red-950/40 flex items-center gap-1.5 transition-colors ${
                isExporting ? 'opacity-60 cursor-not-allowed' : ''
              }`}
              title="Export Architectural PDF Plan Sheet"
            >
              <FileDown className="w-3.5 h-3.5" />
              <span>Export PDF</span>
            </button>

            {/* Tablet Inspector Toggle */}
            <button
              onClick={() => setTabletInspectorOpen(!tabletInspectorOpen)}
              className={`flex lg:hidden items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-colors ${
                tabletInspectorOpen ? 'bg-retailfix-red-600 text-white border-retailfix-red-500' : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
              }`}
              title="Toggle Properties Panel"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Props</span>
            </button>

            {/* More Actions Dropdown Menu Button */}
            <div className="relative">
              <button
                id="btn-desktop-more-menu"
                onClick={() => setShowDesktopMoreMenu(!showDesktopMoreMenu)}
                className={`p-1.5 rounded-lg border transition-colors ${
                  showDesktopMoreMenu
                    ? 'bg-slate-700 text-white border-slate-600'
                    : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white hover:bg-slate-700'
                }`}
                title="More Actions & Project Tools"
                aria-label="More Project Actions"
              >
                <MoreVertical className="w-4 h-4" />
              </button>

              {/* Desktop More Menu Dropdown */}
              {showDesktopMoreMenu && (
                <div className="absolute right-0 top-full mt-2 w-64 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-2.5 z-50 text-xs space-y-2 backdrop-blur-md">
                  <div className="flex items-center justify-between pb-1.5 border-b border-slate-800 font-bold text-white text-xs">
                    <span>Project Tools</span>
                    <span className="text-[10px] text-slate-400 font-mono">{revision}</span>
                  </div>

                  <div className="space-y-1">
                    <button
                      id="btn-share-project"
                      onClick={() => { setShowDesktopMoreMenu(false); setShowShareModal(true); }}
                      className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-slate-800 text-slate-200 flex items-center gap-2 transition-colors font-medium"
                    >
                      <Share2 className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Customer Presentation & Share</span>
                    </button>

                    <button
                      onClick={() => { setShowDesktopMoreMenu(false); handleDownloadPNG(); }}
                      disabled={isExporting}
                      className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-slate-800 text-slate-200 flex items-center gap-2 transition-colors font-medium"
                    >
                      <Download className="w-3.5 h-3.5 text-blue-400" />
                      <span>Export Plan as PNG Image</span>
                    </button>

                    <button
                      onClick={() => { setShowDesktopMoreMenu(false); handleDownloadDXF(); }}
                      className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-slate-800 text-slate-200 flex items-center gap-2 transition-colors font-medium"
                    >
                      <Download className="w-3.5 h-3.5 text-amber-400" />
                      <span>Export CAD File (DXF)</span>
                    </button>

                    <button
                      id="btn-select-all-centers"
                      onClick={() => { setShowDesktopMoreMenu(false); handleSelectAllCenterRacks(); }}
                      className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-slate-800 text-indigo-300 flex items-center gap-2 transition-colors font-medium"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <rect x="1" y="1" width="6" height="6" rx="1" />
                        <rect x="9" y="1" width="6" height="6" rx="1" />
                        <rect x="1" y="9" width="6" height="6" rx="1" />
                        <rect x="9" y="9" width="6" height="6" rx="1" />
                      </svg>
                      <span>Select Center Racks ({entities.filter(isCenterRackEntity).length})</span>
                    </button>

                    <button
                      onClick={() => { setShowDesktopMoreMenu(false); setShowShopGuide(true); }}
                      className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-slate-800 text-cyan-300 flex items-center gap-2 transition-colors font-medium"
                    >
                      <HelpCircle className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Open Store Setup Guide</span>
                    </button>
                  </div>

                  <div className="pt-2 border-t border-slate-800 space-y-1.5">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Canvas Display</span>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        onClick={() => setShowGrid(!showGrid)}
                        className={`p-1.5 rounded-lg border text-left text-[11px] font-medium ${showGrid ? 'bg-slate-800 border-retailfix-red-500/50 text-white' : 'bg-slate-900 border-slate-800 text-slate-400'}`}
                      >
                        Grid: {showGrid ? 'ON' : 'OFF'}
                      </button>
                      <button
                        onClick={() => setGridSnap(!gridSnap)}
                        className={`p-1.5 rounded-lg border text-left text-[11px] font-medium ${gridSnap ? 'bg-slate-800 border-retailfix-red-500/50 text-white' : 'bg-slate-900 border-slate-800 text-slate-400'}`}
                      >
                        Snap: {gridSnap ? 'ON' : 'OFF'}
                      </button>
                      <button
                        onClick={() => setOrthoMode(!orthoMode)}
                        className={`p-1.5 rounded-lg border text-left text-[11px] font-medium ${orthoMode ? 'bg-slate-800 border-retailfix-red-500/50 text-white' : 'bg-slate-900 border-slate-800 text-slate-400'}`}
                      >
                        Ortho: {orthoMode ? 'ON' : 'OFF'}
                      </button>
                      <button
                        onClick={() => setShowRackDimensions(!showRackDimensions)}
                        className={`p-1.5 rounded-lg border text-left text-[11px] font-medium ${showRackDimensions ? 'bg-slate-800 border-retailfix-red-500/50 text-white' : 'bg-slate-900 border-slate-800 text-slate-400'}`}
                      >
                        Rack Dims: {showRackDimensions ? 'ON' : 'OFF'}
                      </button>
                    </div>
                  </div>

                  {isAdmin && (
                    <button
                      onClick={() => {
                        setShowDesktopMoreMenu(false);
                        const nextRev = `REV ${revisionsList.length + 1}`;
                        handleManualSave(true, nextRev);
                      }}
                      className="w-full text-left px-2.5 py-1.5 rounded-lg bg-slate-800 text-retailfix-red-400 hover:text-retailfix-red-300 font-bold transition-colors text-xs"
                    >
                      + Create New Revision
                    </button>
                  )}

                  {onExit && (
                    <button
                      onClick={() => { setShowDesktopMoreMenu(false); handleContextualBack(); }}
                      className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                    >
                      Exit CAD Editor
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Desktop Multi-select toolbar row (shown only when racks are selected on desktop) ── */}
        {selectedEntityIds.size > 0 && (
          <div className="hidden md:flex border-t border-slate-800 px-3 py-1.5 overflow-x-auto scrollbar-hide items-center">
            <MultiSelectRotationToolbar
              selectionCount={selectedEntityIds.size}
              directionState={selectionDirectionState}
              collisionWarning={collisionWarning || undefined}
              onToggleDirection={handleToggleDirection}
              onMakeAllHorizontal={handleMakeAllHorizontal}
              onMakeAllVertical={handleMakeAllVertical}
              onRotateGroupCW={handleRotateGroupCW}
              onRotateGroupCCW={handleRotateGroupCCW}
              onRotateDelta={handleBatchRotateDelta}
              onSetAbsolute={handleSetAbsoluteRotation}
              onResetRotation={handleResetRotation}
              onDismissWarning={() => setCollisionWarning('')}
              onClearSelection={() => {
                setSelectedEntityIds(new Set());
                setSelectedEntityId(null);
                setCollisionWarning('');
              }}
            />
          </div>
        )}
      </header>

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        {/* ── Desktop & Tablet Left Sidebar (768px+) ── */}
        <aside
          className={`hidden md:flex ${
            sidebarCollapsed ? 'w-16' : 'w-56'
          } bg-retailfix-dark-900 border-r border-slate-800 flex-col py-2 z-20 shrink-0 transition-all duration-150 overflow-y-auto select-none`}
        >
          {/* Header with expand/collapse toggle */}
          <div className="flex items-center justify-between px-3 pb-2 mb-1 border-b border-slate-800 shrink-0">
            {!sidebarCollapsed && (
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                CAD Tools
              </span>
            )}
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="p-1 rounded-md bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors ml-auto"
              title={sidebarCollapsed ? "Expand Sidebar (Show Labels)" : "Collapse Sidebar (Icons Only)"}
              aria-label="Toggle Sidebar"
            >
              {sidebarCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* GROUP 1 — BUILD SHOP */}
          <div className="px-2 mb-2 space-y-1">
            {!sidebarCollapsed ? (
              <div className="text-[10px] font-extrabold text-slate-400 tracking-wider px-2 py-1 uppercase font-mono">
                Build Shop
              </div>
            ) : (
              <div className="h-px bg-slate-800 my-1 mx-2" title="Build Shop" />
            )}

            {[
              { tool: 'select', label: 'Select', shortcut: '(V)', icon: MousePointer, tooltip: 'Select, move and inspect objects (V)' },
              { tool: 'wall', label: 'Draw Wall', shortcut: '(W)', icon: Square, tooltip: 'Draw exterior or interior walls (W)' },
              { tool: 'room_box', label: 'Room Box', shortcut: '', icon: Maximize2, tooltip: 'Quick rectangular store boundary generator', isAction: true, onClick: () => setShowQuickRoomModal(true) },
              { tool: 'door', label: 'Door', shortcut: '(D)', icon: DoorOpen, tooltip: 'Add entrance or internal doors (D)' },
              { tool: 'window', label: 'Window', shortcut: '(N)', icon: Maximize2, tooltip: 'Add exterior display windows (N)' },
              { tool: 'shutter', label: 'Rolling Shutter', shortcut: '(S)', icon: Sliders, tooltip: 'Add commercial roll-up shutter (S)' },
              { tool: 'column', label: 'Column / Pillar', shortcut: '(C)', icon: Box, tooltip: 'Add support pillar or wall column (C)' },
              { tool: 'partition', label: 'Partition Wall', shortcut: '(P)', icon: Layers, tooltip: 'Add interior divider partition (P)' },
            ].map((item) => {
              const Icon = item.icon;
              const isActive = !item.isAction && activeTool === item.tool;
              return (
                <button
                  key={item.tool}
                  onClick={() => {
                    if (item.isAction && item.onClick) {
                      item.onClick();
                      return;
                    }
                    if (['door', 'window', 'shutter', 'column'].includes(item.tool)) {
                      setShowRackMenu(false);
                      setPendingRackPlacement(null);
                      setActiveTool(item.tool as ToolType);
                      setPlacementModeTool(item.tool as ToolType);
                      setSelectedEntityId(null);
                      setTabletInspectorOpen(true);
                      setShowMobileProps(true);
                      setActiveDrawingPoints([]);
                    } else {
                      setShowRackMenu(false);
                      setPendingRackPlacement(null);
                      setActiveTool(item.tool as ToolType);
                      setPlacementModeTool(null);
                      setWallToolPreview(null);
                      setActiveDrawingPoints([]);
                    }
                  }}
                  title={item.tooltip}
                  className={`w-full min-h-[44px] rounded-xl flex items-center px-2.5 transition-all text-xs ${
                    sidebarCollapsed ? 'justify-center py-2' : 'justify-start gap-2.5 py-2'
                  } ${
                    isActive
                      ? 'bg-retailfix-red-600 text-white font-bold shadow-md shadow-red-950/40'
                      : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {!sidebarCollapsed && (
                    <div className="flex items-center justify-between w-full min-w-0">
                      <span className="truncate">{item.label}</span>
                      {item.shortcut && <span className="text-[10px] text-slate-400 font-mono ml-1">{item.shortcut}</span>}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* GROUP 2 — ADD DISPLAY */}
          <div className="px-2 mb-2 space-y-1">
            {!sidebarCollapsed ? (
              <div className="text-[10px] font-extrabold text-slate-400 tracking-wider px-2 py-1 uppercase font-mono">
                Add Display
              </div>
            ) : (
              <div className="h-px bg-slate-800 my-1 mx-2" title="Add Display" />
            )}

            {/* Racks Catalogue Button (has id="btn-desktop-add-rack") */}
            <button
              id="btn-desktop-add-rack"
              onClick={() => {
                setShowRackMenu(true);
                setPlacementModeTool(null);
              }}
              title="Open full retail racks catalogue (R)"
              className={`w-full min-h-[44px] rounded-xl flex items-center px-2.5 transition-all text-xs ${
                sidebarCollapsed ? 'justify-center py-2' : 'justify-start gap-2.5 py-2'
              } ${
                showRackMenu || (activeTool === 'rack' && Boolean(pendingRackPlacement))
                  ? 'bg-retailfix-red-600 text-white font-bold shadow-md shadow-red-950/40'
                  : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
              }`}
            >
              <ShoppingBag className="w-4 h-4 shrink-0 text-amber-400" />
              {!sidebarCollapsed && (
                <div className="flex items-center justify-between w-full min-w-0">
                  <span className="truncate font-semibold">Racks Catalogue</span>
                  <span className="text-[10px] text-slate-400 font-mono ml-1">(R)</span>
                </div>
              )}
            </button>

            {/* Wall Rack */}
            <button
              onClick={handleAddWallRack}
              title="Quick add 7'×3' wall display rack"
              className={`w-full min-h-[44px] rounded-xl flex items-center px-2.5 transition-all text-xs ${
                sidebarCollapsed ? 'justify-center py-2' : 'justify-start gap-2.5 py-2'
              } text-slate-300 hover:bg-slate-800/80 hover:text-white`}
            >
              <LayoutGrid className="w-4 h-4 shrink-0 text-rose-400" />
              {!sidebarCollapsed && (
                <div className="flex items-center justify-between w-full min-w-0">
                  <span className="truncate">Wall Rack</span>
                  <span className="text-[10px] text-slate-500 font-mono ml-1">7'x3'</span>
                </div>
              )}
            </button>

            {/* Gondola / Centre Rack */}
            <button
              onClick={handleAddCenterRack}
              title="Quick add 5'×3' center gondola rack"
              className={`w-full min-h-[44px] rounded-xl flex items-center px-2.5 transition-all text-xs ${
                sidebarCollapsed ? 'justify-center py-2' : 'justify-start gap-2.5 py-2'
              } text-slate-300 hover:bg-slate-800/80 hover:text-white`}
            >
              <Columns className="w-4 h-4 shrink-0 text-amber-400" />
              {!sidebarCollapsed && (
                <div className="flex items-center justify-between w-full min-w-0">
                  <span className="truncate">Centre Gondola</span>
                  <span className="text-[10px] text-slate-500 font-mono ml-1">5'x3'</span>
                </div>
              )}
            </button>

            {/* Corner Rack */}
            <button
              onClick={handleAddCornerRack}
              title="Quick add 2'×2' corner display rack"
              className={`w-full min-h-[44px] rounded-xl flex items-center px-2.5 transition-all text-xs ${
                sidebarCollapsed ? 'justify-center py-2' : 'justify-start gap-2.5 py-2'
              } text-slate-300 hover:bg-slate-800/80 hover:text-white`}
            >
              <CornerDownRight className="w-4 h-4 shrink-0 text-cyan-400" />
              {!sidebarCollapsed && (
                <div className="flex items-center justify-between w-full min-w-0">
                  <span className="truncate">Corner Rack</span>
                  <span className="text-[10px] text-slate-500 font-mono ml-1">2'x2'</span>
                </div>
              )}
            </button>

            {/* Endcap Rack */}
            <button
              onClick={handleAddEndcapRack}
              title="Quick add 5'×3' aisle endcap rack"
              className={`w-full min-h-[44px] rounded-xl flex items-center px-2.5 transition-all text-xs ${
                sidebarCollapsed ? 'justify-center py-2' : 'justify-start gap-2.5 py-2'
              } text-slate-300 hover:bg-slate-800/80 hover:text-white`}
            >
              <Layers className="w-4 h-4 shrink-0 text-emerald-400" />
              {!sidebarCollapsed && (
                <div className="flex items-center justify-between w-full min-w-0">
                  <span className="truncate">Endcap Rack</span>
                  <span className="text-[10px] text-slate-500 font-mono ml-1">5'x3'</span>
                </div>
              )}
            </button>

            {/* Custom Rack */}
            <button
              onClick={handleOpenCustomRack}
              title="Define custom rack dimensions & shelves"
              className={`w-full min-h-[44px] rounded-xl flex items-center px-2.5 transition-all text-xs ${
                sidebarCollapsed ? 'justify-center py-2' : 'justify-start gap-2.5 py-2'
              } text-slate-300 hover:bg-slate-800/80 hover:text-white`}
            >
              <Sliders className="w-4 h-4 shrink-0 text-violet-400" />
              {!sidebarCollapsed && (
                <div className="flex items-center justify-between w-full min-w-0">
                  <span className="truncate">Custom Rack</span>
                  <span className="text-[10px] text-slate-500 font-mono ml-1">Params</span>
                </div>
              )}
            </button>
          </div>

          {/* GROUP 3 — MEASURE & EDIT */}
          <div className="px-2 mb-2 space-y-1">
            {!sidebarCollapsed ? (
              <div className="text-[10px] font-extrabold text-slate-400 tracking-wider px-2 py-1 uppercase font-mono">
                Measure & Edit
              </div>
            ) : (
              <div className="h-px bg-slate-800 my-1 mx-2" title="Measure & Edit" />
            )}

            {/* Measure Tool */}
            <button
              onClick={() => {
                setActiveTool('measure');
                setPlacementModeTool(null);
                setShowRackMenu(false);
                setActiveDrawingPoints([]);
              }}
              title="Tape measure distance between two points (T)"
              className={`w-full min-h-[44px] rounded-xl flex items-center px-2.5 transition-all text-xs ${
                sidebarCollapsed ? 'justify-center py-2' : 'justify-start gap-2.5 py-2'
              } ${
                activeTool === 'measure'
                  ? 'bg-retailfix-red-600 text-white font-bold shadow-md shadow-red-950/40'
                  : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
              }`}
            >
              <Ruler className="w-4 h-4 shrink-0 text-amber-400" />
              {!sidebarCollapsed && (
                <div className="flex items-center justify-between w-full min-w-0">
                  <span className="truncate">Measure</span>
                  <span className="text-[10px] text-slate-400 font-mono ml-1">(T)</span>
                </div>
              )}
            </button>

            {/* Pan / Move Canvas */}
            <button
              onClick={() => {
                setActiveTool(activeTool === 'pan' ? 'select' : 'pan');
                setPlacementModeTool(null);
                setShowRackMenu(false);
              }}
              title="Pan / Move canvas without selecting objects (H)"
              className={`w-full min-h-[44px] rounded-xl flex items-center px-2.5 transition-all text-xs ${
                sidebarCollapsed ? 'justify-center py-2' : 'justify-start gap-2.5 py-2'
              } ${
                activeTool === 'pan'
                  ? 'bg-cyan-600 text-white font-bold shadow-md shadow-cyan-950/40'
                  : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
              }`}
            >
              <Hand className="w-4 h-4 shrink-0" />
              {!sidebarCollapsed && (
                <div className="flex items-center justify-between w-full min-w-0">
                  <span className="truncate">Pan Canvas</span>
                  <span className="text-[10px] text-slate-400 font-mono ml-1">(H)</span>
                </div>
              )}
            </button>

            {/* Rotate 90° */}
            <button
              onClick={handleRotateCurrentSelection}
              title="Rotate selected rack by 90 degrees"
              className={`w-full min-h-[44px] rounded-xl flex items-center px-2.5 transition-all text-xs ${
                sidebarCollapsed ? 'justify-center py-2' : 'justify-start gap-2.5 py-2'
              } text-slate-300 hover:bg-slate-800/80 hover:text-white`}
            >
              <RotateCw className="w-4 h-4 shrink-0" />
              {!sidebarCollapsed && (
                <div className="flex items-center justify-between w-full min-w-0">
                  <span className="truncate">Rotate 90°</span>
                </div>
              )}
            </button>

            {/* Delete */}
            <button
              onClick={handleDeleteCurrentSelection}
              title="Delete selected wall or rack"
              className={`w-full min-h-[44px] rounded-xl flex items-center px-2.5 transition-all text-xs ${
                sidebarCollapsed ? 'justify-center py-2' : 'justify-start gap-2.5 py-2'
              } text-red-400 hover:bg-red-950/40 hover:text-red-300`}
            >
              <Trash2 className="w-4 h-4 shrink-0" />
              {!sidebarCollapsed && (
                <div className="flex items-center justify-between w-full min-w-0">
                  <span className="truncate">Delete</span>
                  <span className="text-[10px] text-slate-500 font-mono ml-1">Del</span>
                </div>
              )}
            </button>
          </div>
        </aside>

        {/* ── Mobile Touch Bottom Dock (320px – 767px) — Only shown in 2D Layout Mode ── */}
        {viewMode === '2D' && (
          <aside className="md:hidden fixed bottom-0 inset-x-0 h-16 bg-slate-950/95 backdrop-blur-lg border-t border-slate-800 z-40 flex items-center justify-around px-2 pb-safe">
            {/* 1. Select Mode */}
            <button
              onClick={() => {
                setActiveTool('select');
                setPlacementModeTool(null);
                setShowRackMenu(false);
              }}
              className={`flex flex-col items-center justify-center w-12 h-12 rounded-xl transition-all ${
                activeTool === 'select' ? 'bg-retailfix-red-600 text-white shadow-lg shadow-red-900/50' : 'text-slate-400 active:bg-slate-800'
              }`}
              title="Select Mode"
            >
              <MousePointer className="w-5 h-5" />
              <span className="text-[9px] font-bold mt-0.5">Select</span>
            </button>

            {/* 2. Pan Mode */}
            <button
              onClick={() => {
                setActiveTool('pan');
                setPlacementModeTool(null);
                setShowRackMenu(false);
              }}
              className={`flex flex-col items-center justify-center w-12 h-12 rounded-xl transition-all ${
                activeTool === 'pan' ? 'bg-retailfix-red-600 text-white shadow-lg shadow-red-900/50' : 'text-slate-400 active:bg-slate-800'
              }`}
              title="Pan Navigation Mode"
            >
              <Hand className="w-5 h-5" />
              <span className="text-[9px] font-bold mt-0.5">Pan</span>
            </button>

            {/* 3. Wall Tool */}
            <button
              onClick={() => {
                setActiveTool('wall');
                setPlacementModeTool(null);
                setShowRackMenu(false);
                setActiveDrawingPoints([]);
              }}
              className={`flex flex-col items-center justify-center w-12 h-12 rounded-xl transition-all ${
                activeTool === 'wall' ? 'bg-retailfix-red-600 text-white shadow-lg shadow-red-900/50' : 'text-slate-400 active:bg-slate-800'
              }`}
              title="Draw Wall"
            >
              <Square className="w-5 h-5" />
              <span className="text-[9px] font-bold mt-0.5">Wall</span>
            </button>

            {/* 4. Racks Tool */}
            <button
              id="btn-mobile-dock-racks"
              onClick={() => {
                setShowRackMenu(true);
                setPlacementModeTool(null);
              }}
              className={`flex flex-col items-center justify-center w-12 h-12 rounded-xl transition-all ${
                showRackMenu || (activeTool === 'rack' && Boolean(pendingRackPlacement)) ? 'bg-retailfix-red-600 text-white shadow-lg shadow-red-900/50' : 'text-slate-400 active:bg-slate-800'
              }`}
              title="Add Racks"
            >
              <ShoppingBag className="w-5 h-5" />
              <span className="text-[9px] font-bold mt-0.5">Racks</span>
            </button>

            {/* 5. Measure Tool */}
            <button
              onClick={() => {
                setActiveTool('measure');
                setPlacementModeTool(null);
                setShowRackMenu(false);
                setActiveDrawingPoints([]);
              }}
              className={`flex flex-col items-center justify-center w-12 h-12 rounded-xl transition-all ${
                activeTool === 'measure' ? 'bg-retailfix-red-600 text-white shadow-lg shadow-red-900/50' : 'text-slate-400 active:bg-slate-800'
              }`}
              title="Tape Measure Tool"
            >
              <Ruler className="w-5 h-5" />
              <span className="text-[9px] font-bold mt-0.5">Measure</span>
            </button>

            {/* 6. More Tools */}
            <button
              onClick={() => {
                setShowMobileMoreTools(true);
                setShowRackMenu(false);
              }}
              className="flex flex-col items-center justify-center w-12 h-12 rounded-xl text-slate-400 active:bg-slate-800"
              title="All CAD Tools"
            >
              <Sliders className="w-5 h-5" />
              <span className="text-[9px] font-bold mt-0.5">More</span>
            </button>
          </aside>
        )}

        {/* ── Main CAD Canvas Container ── */}
        <main className={`flex-1 relative bg-white overflow-hidden flex items-center justify-center cad-canvas-container ${viewMode === '3D' ? 'pb-0' : 'pb-16 md:pb-0'}`}>
          {viewMode === '3D' && (
            <div className="absolute inset-0 z-30">
              <Store3DViewer
                entities={entities}
                onBackTo2D={() => setViewMode('2D')}
                projectId={projectData?.surveyId || projectId}
                storeName={projectData?.title || 'Retail Store'}
              />
            </div>
          )}
          <canvas
            id="cad-canvas"
            ref={canvasRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchCancel}
            className="w-full h-full block bg-white touch-none"
            style={{ touchAction: 'none' }}
          />

          {/* Canvas Mode Indicator & Quick Action Badges (Top-Left) */}
          <div className="absolute top-3 left-3 flex flex-wrap items-center gap-1.5 z-10 max-w-[calc(100%-110px)]">
            <div className="bg-slate-900/90 backdrop-blur-md px-2.5 py-1.5 rounded-xl border border-slate-700 text-xs font-mono flex items-center gap-2 shadow-lg">
              <span className={`w-2 h-2 rounded-full ${activeTool === 'pan' ? 'bg-cyan-400 animate-pulse' : 'bg-retailfix-red-500 animate-pulse'}`} />
              <span className="text-slate-400 font-sans text-[11px] hidden sm:inline">MODE:</span>
              <strong className="text-white uppercase font-bold text-[11px]">
                {activeTool === 'pan' ? 'NAVIGATE (PAN)' : activeTool}
              </strong>
              {activeTool === 'measure' && (
                <span className="text-amber-400 font-sans text-[10px]">
                  {activeDrawingPoints.length === 0 ? '(Tap 1st Pt)' : '(Tap 2nd Pt)'}
                </span>
              )}
            </div>

            {/* Quick Pan / Select Switcher Button */}
            <button
              onClick={() => {
                setActiveTool(activeTool === 'pan' ? 'select' : 'pan');
                setPlacementModeTool(null);
                setShowRackMenu(false);
              }}
              className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold border shadow-lg transition-all flex items-center gap-1 ${
                activeTool === 'pan'
                  ? 'bg-cyan-600 text-white border-cyan-400/50 shadow-cyan-900/40'
                  : 'bg-slate-900/90 text-slate-300 border-slate-700 hover:text-white'
              }`}
              title="Toggle Pan / Select Mode"
            >
              {activeTool === 'pan' ? <MousePointer className="w-3.5 h-3.5" /> : <Hand className="w-3.5 h-3.5" />}
              <span>{activeTool === 'pan' ? 'Select Mode' : 'Pan Mode'}</span>
            </button>

            {/* Touch Multi-Select Mode Toggle Button (Mobile & Tablet) */}
            <button
              onClick={() => {
                setTouchMultiSelectMode(!touchMultiSelectMode);
                if (activeTool !== 'select') setActiveTool('select');
              }}
              className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold border shadow-lg transition-all flex items-center gap-1 ${
                touchMultiSelectMode
                  ? 'bg-indigo-600 text-white border-indigo-400 shadow-indigo-900/40'
                  : 'bg-slate-900/90 text-slate-300 border-slate-700 hover:text-white'
              }`}
              title="Toggle Multi-Select Mode (Tap racks to select multiple without Ctrl key)"
            >
              <span>+ Multi</span>
              {touchMultiSelectMode && <Check className="w-3 h-3 text-white" />}
            </button>
          </div>

          {/* Zoom controls (Top-Right) */}
          <div className="absolute top-3 right-3 flex items-center gap-1 bg-slate-900/90 backdrop-blur-md p-1 rounded-xl border border-slate-700 shadow-xl z-10">
            <button
              onClick={handleZoomIn}
              title="Zoom In"
              className="p-1.5 rounded-lg text-slate-300 hover:bg-slate-800 active:bg-slate-700 text-white"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={handleZoomOut}
              title="Zoom Out"
              className="p-1.5 rounded-lg text-slate-300 hover:bg-slate-800 active:bg-slate-700 text-white"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              onClick={handleZoomToFit}
              title="Zoom to Fit"
              className="p-1.5 rounded-lg text-slate-300 hover:bg-slate-800 active:bg-slate-700 text-white"
            >
              <Maximize className="w-4 h-4" />
            </button>
          </div>

          {/* Floating Multi-Select Rotation Bar (Mobile & Tablet) */}
          {selectedEntityIds.size > 0 && (
            <div className="absolute bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 bg-slate-900/95 backdrop-blur-md px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-2xl border border-indigo-500/60 shadow-2xl flex items-center gap-1.5 sm:gap-2 z-20 max-w-[96vw] overflow-x-auto scrollbar-hide">
              <span className="text-[11px] sm:text-xs font-bold text-indigo-300 shrink-0 font-mono">
                {selectedEntityIds.size} Selected
              </span>
              <div className="h-4 w-px bg-slate-700 shrink-0" />
              <button
                onClick={handleRotateGroupCW}
                className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1 shrink-0"
                title="Rotate 90° Clockwise"
              >
                <RotateCw className="w-3.5 h-3.5" /> 90° CW
              </button>
              <button
                onClick={handleRotateGroupCCW}
                className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1 shrink-0"
                title="Rotate 90° Counter-Clockwise"
              >
                <RotateCcw className="w-3.5 h-3.5" /> 90° CCW
              </button>
              <button
                onClick={handleToggleDirection}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold shrink-0"
                title="Toggle Horizontal / Vertical"
              >
                Toggle H/V
              </button>
              <button
                onClick={() => {
                  setSelectedEntityIds(new Set());
                  setSelectedEntityId(null);
                  setCollisionWarning('');
                }}
                className="p-1 text-slate-400 hover:text-white shrink-0"
                title="Clear Selection"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Measure tool: Clear Measurements button */}
          {(activeTool === 'measure' || measureAnnotations.length > 0) && (
            <button
              onClick={handleClearMeasurements}
              title="Clear all temporary measurement annotations"
              className={`absolute bottom-20 md:bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all shadow-lg z-10 ${
                measureAnnotations.length > 0
                  ? 'bg-amber-600/90 hover:bg-amber-500 text-white border-amber-400/50 shadow-amber-900/40'
                  : 'bg-slate-800/80 hover:bg-slate-700 text-slate-400 border-slate-700'
              }`}
            >
              <Ruler className="w-3.5 h-3.5" />
              {measureAnnotations.length > 0 ? `Clear ${measureAnnotations.length} Measurement${measureAnnotations.length > 1 ? 's' : ''}` : 'No Measurements'}
            </button>
          )}

          {/* Interactive Rack Placement Floating Action Bar */}
          {activeTool === 'rack' && pendingRackPlacement && (
            <div id="rack-placement-action-bar" className="absolute top-16 md:top-4 inset-x-3 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 z-30 pointer-events-none flex flex-col items-center">
              <div className="pointer-events-auto bg-slate-900/95 backdrop-blur-md border border-retailfix-red-500/60 rounded-2xl p-2.5 sm:px-4 sm:py-2.5 shadow-2xl shadow-red-950/40 flex flex-wrap items-center justify-between gap-2.5 max-w-lg w-full border-t-2 border-t-retailfix-red-500">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-retailfix-red-600/20 text-retailfix-red-400 border border-retailfix-red-500/30 flex items-center justify-center shrink-0">
                    <Layers className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold text-retailfix-red-400 uppercase tracking-wider">Placement Mode</span>
                      <span className="text-[10px] font-mono text-slate-400 bg-slate-800 px-1 py-0.2 rounded">
                        {pendingRackPlacement.rotation}°
                      </span>
                    </div>
                    <span className="text-xs font-bold text-white block truncate max-w-[170px] sm:max-w-[220px]">
                      {pendingRackPlacement.productName || pendingRackPlacement.rackType}
                    </span>
                  </div>
                </div>

                {/* Placement Actions */}
                <div className="flex items-center gap-1.5 ml-auto">
                  <button
                    id="btn-rack-placement-confirm"
                    onClick={() => {
                      const template = pendingRackPlacementRef.current;
                      if (!template) return;
                      const canvas = canvasRef.current;
                      if (!canvas) return;
                      const targetPos = cursorWorldPosRef.current || viewportRef.current.screenToWorld({
                        x: canvas.getBoundingClientRect().width / 2,
                        y: canvas.getBoundingClientRect().height / 2,
                      });
                      const placement = calculateRackPlacement(targetPos, template);
                      commitNewRackPlacement(placement, template);
                    }}
                    className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-md shadow-emerald-950/40 touch-manipulation transition-colors"
                    title="Place rack at preview position"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Place Rack</span>
                  </button>

                  <button
                    id="btn-rack-placement-rotate"
                    onClick={handleRotatePendingRack}
                    className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1 border border-slate-700 shadow-sm touch-manipulation transition-colors"
                    title="Rotate 90 degrees (R)"
                  >
                    <RotateCw className="w-3.5 h-3.5 text-amber-400" />
                    <span>Rotate 90°</span>
                  </button>

                  <button
                    id="btn-rack-placement-center"
                    onClick={handleQuickPlaceCenter}
                    className="flex px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-200 rounded-xl text-xs font-semibold items-center gap-1 border border-slate-700 shadow-sm touch-manipulation transition-colors"
                    title="Place at room center"
                  >
                    <Maximize2 className="w-3 h-3 text-cyan-400" />
                    <span>Center</span>
                  </button>

                  <button
                    id="btn-rack-placement-cancel"
                    onClick={handleCancelRackPlacement}
                    className="p-1.5 sm:px-2.5 sm:py-1.5 bg-red-950/40 hover:bg-red-900/40 text-red-300 hover:text-white rounded-xl text-xs font-semibold flex items-center gap-1 border border-red-800/40 touch-manipulation transition-colors"
                    title="Cancel placement (Esc)"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Cancel</span>
                  </button>
                </div>

                {/* Instruction banner footer */}
                <div className="w-full pt-1 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-400">
                  <span className="flex items-center gap-1 text-retailfix-red-300 font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-retailfix-red-500 animate-ping inline-block" />
                    Tap canvas to position rack
                  </span>
                  <span>{formatFeetInches(pendingRackPlacement.width)} W × {formatFeetInches(pendingRackPlacement.depth)} D</span>
                </div>
              </div>
            </div>
          )}

          {/* Planner 5D-Inspired Empty-Canvas Onboarding Card */}
          {entities.length === 0 && showStarterCard && viewMode === '2D' && (
            <div className="absolute inset-0 z-20 flex items-center justify-center p-4 pointer-events-none">
              <div className="pointer-events-auto bg-slate-900/95 backdrop-blur-md border border-slate-700/80 rounded-2xl max-w-lg w-full p-6 shadow-2xl shadow-black/60 space-y-4 animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-retailfix-red-600 flex items-center justify-center shadow-lg shadow-red-900/40 shrink-0">
                      <Store className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h2 className="text-sm sm:text-base font-extrabold text-white">Welcome to RetailFix Store Designer</h2>
                      <p className="text-xs text-slate-400 mt-0.5">Design a compliant retail store layout in feet and inches</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowStarterCard(false)}
                    className="p-1 text-slate-500 hover:text-slate-300 rounded-lg hover:bg-slate-800 transition-colors"
                    title="Dismiss and start with blank canvas"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-2.5">
                  {/* Option 1: Quick Shop Dimensions */}
                  <div className="p-3.5 rounded-xl bg-slate-800/80 border border-slate-700/90 hover:border-retailfix-red-500/60 transition-all">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-bold text-white text-xs flex items-center gap-2">
                        <Maximize2 className="w-4 h-4 text-retailfix-red-400" />
                        1. Quick Start: Set Shop Size
                      </span>
                      <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full font-semibold border border-emerald-500/20">
                        Recommended
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mb-3">
                      Enter shop width & length to generate all 4 exterior boundary walls:
                    </p>
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <div>
                        <label className="text-[10px] text-slate-400 font-mono block mb-1">SHOP WIDTH (FT+IN)</label>
                        <input
                          type="text"
                          value={quickRoomWidth}
                          onChange={(e) => setQuickRoomWidth(e.target.value)}
                          placeholder="e.g. 30'-0&quot;"
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:border-retailfix-red-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-400 font-mono block mb-1">SHOP DEPTH / LENGTH (FT+IN)</label>
                        <input
                          type="text"
                          value={quickRoomDepth}
                          onChange={(e) => setQuickRoomDepth(e.target.value)}
                          placeholder="e.g. 20'-0&quot;"
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:border-retailfix-red-500 focus:outline-none"
                        />
                      </div>
                    </div>
                    <button
                      onClick={() => handleCreateQuickRoom(quickRoomWidth, quickRoomDepth)}
                      className="w-full py-2 px-3 bg-retailfix-red-600 hover:bg-retailfix-red-700 active:bg-retailfix-red-800 text-white rounded-lg text-xs font-bold shadow-md shadow-red-950/40 flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Square className="w-3.5 h-3.5" />
                      <span>Create Store Boundary</span>
                    </button>
                  </div>

                  {/* Option 2: Draw Custom Walls */}
                  <button
                    onClick={() => {
                      setShowStarterCard(false);
                      setActiveTool('wall');
                    }}
                    className="w-full p-2.5 rounded-xl bg-slate-800/40 border border-slate-700/60 hover:bg-slate-800/80 hover:border-slate-600 text-left transition-all flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2.5">
                      <Square className="w-4 h-4 text-cyan-400 shrink-0" />
                      <div>
                        <span className="font-bold text-white text-xs block">2. Draw Custom Walls</span>
                        <span className="text-[10px] text-slate-400">Click and drag freely to draw custom or angled walls</span>
                      </div>
                    </div>
                    <ArrowLeft className="w-4 h-4 text-slate-500 rotate-180 shrink-0" />
                  </button>

                  {/* Option 3: Add Racks directly */}
                  <button
                    onClick={() => {
                      setShowStarterCard(false);
                      setShowRackMenu(true);
                    }}
                    className="w-full p-2.5 rounded-xl bg-slate-800/40 border border-slate-700/60 hover:bg-slate-800/80 hover:border-slate-600 text-left transition-all flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2.5">
                      <ShoppingBag className="w-4 h-4 text-amber-400 shrink-0" />
                      <div>
                        <span className="font-bold text-white text-xs block">3. Browse Racks Catalogue First</span>
                        <span className="text-[10px] text-slate-400">Select wall display racks, center gondolas or endcaps</span>
                      </div>
                    </div>
                    <ArrowLeft className="w-4 h-4 text-slate-500 rotate-180 shrink-0" />
                  </button>
                </div>

                {/* Dismiss */}
                <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                  <span className="text-[11px]">Need help? Check the Store Guide anytime</span>
                  <button
                    onClick={() => setShowStarterCard(false)}
                    className="text-slate-400 hover:text-white underline text-[11px]"
                  >
                    Blank Canvas
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Beginner Store Setup Guide Widget (Bottom-Left) */}
          <div className="hidden sm:flex absolute bottom-4 left-4 z-20 flex-col items-start gap-2">
            <button
              onClick={() => setShowShopGuide(!showShopGuide)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border shadow-xl flex items-center gap-2 backdrop-blur-md transition-all ${
                showShopGuide
                  ? 'bg-slate-900 border-retailfix-red-500 text-white'
                  : 'bg-slate-900/90 border-slate-700 text-slate-300 hover:text-white'
              }`}
              title="Store Setup Workflow Guide"
            >
              <HelpCircle className="w-3.5 h-3.5 text-retailfix-red-400" />
              <span>Store Guide</span>
              <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded-full text-slate-400 font-mono">
                {storeGuideCompletedCount}/6
              </span>
            </button>

            {showShopGuide && (
              <div className="bg-slate-900/95 border border-slate-700 rounded-2xl p-4 w-72 shadow-2xl backdrop-blur-md text-xs space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="font-bold text-white text-xs uppercase tracking-wide">6-Step Store Setup</span>
                  <button onClick={() => setShowShopGuide(false)} className="text-slate-400 hover:text-white p-1">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="space-y-1.5">
                  {/* Step 1: Shop Boundary Walls */}
                  <div className={`p-2 rounded-lg flex items-center justify-between ${hasWalls ? 'bg-emerald-950/30 border border-emerald-800/40 text-emerald-300' : 'bg-slate-800/50 text-slate-300'}`}>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-4 h-4 rounded-full bg-slate-800 text-[10px] font-bold flex items-center justify-center shrink-0">1</span>
                      <span className="truncate">Boundary Walls</span>
                    </div>
                    {hasWalls ? <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" /> : (
                      <button onClick={() => setShowQuickRoomModal(true)} className="text-[10px] text-retailfix-red-400 hover:underline shrink-0 font-semibold">Set Size</button>
                    )}
                  </div>

                  {/* Step 2: Doors & Openings */}
                  <div className={`p-2 rounded-lg flex items-center justify-between ${hasDoorsOrShutters ? 'bg-emerald-950/30 border border-emerald-800/40 text-emerald-300' : 'bg-slate-800/50 text-slate-300'}`}>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-4 h-4 rounded-full bg-slate-800 text-[10px] font-bold flex items-center justify-center shrink-0">2</span>
                      <span className="truncate">Doors & Shutters</span>
                    </div>
                    {hasDoorsOrShutters ? <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" /> : (
                      <button onClick={() => { setActiveTool('door'); setPlacementModeTool('door'); setShowMobileProps(true); }} className="text-[10px] text-retailfix-red-400 hover:underline shrink-0 font-semibold">Add</button>
                    )}
                  </div>

                  {/* Step 3: Pillars & Columns */}
                  <div className={`p-2 rounded-lg flex items-center justify-between ${hasColumns ? 'bg-emerald-950/30 border border-emerald-800/40 text-emerald-300' : 'bg-slate-800/50 text-slate-300'}`}>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-4 h-4 rounded-full bg-slate-800 text-[10px] font-bold flex items-center justify-center shrink-0">3</span>
                      <span className="truncate">Columns / Pillars</span>
                    </div>
                    {hasColumns ? <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" /> : (
                      <button onClick={() => { setActiveTool('column'); setPlacementModeTool('column'); setShowMobileProps(true); }} className="text-[10px] text-retailfix-red-400 hover:underline shrink-0 font-semibold">Add</button>
                    )}
                  </div>

                  {/* Step 4: Display Racks */}
                  <div className={`p-2 rounded-lg flex items-center justify-between ${hasRacks ? 'bg-emerald-950/30 border border-emerald-800/40 text-emerald-300' : 'bg-slate-800/50 text-slate-300'}`}>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-4 h-4 rounded-full bg-slate-800 text-[10px] font-bold flex items-center justify-center shrink-0">4</span>
                      <span className="truncate">Display Racks</span>
                    </div>
                    {hasRacks ? <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" /> : (
                      <button onClick={() => setShowRackMenu(true)} className="text-[10px] text-retailfix-red-400 hover:underline shrink-0 font-semibold">Add Racks</button>
                    )}
                  </div>

                  {/* Step 5: Review in 3D */}
                  <div className={`p-2 rounded-lg flex items-center justify-between ${viewMode === '3D' ? 'bg-indigo-950/30 border border-indigo-800/40 text-indigo-300' : 'bg-slate-800/50 text-slate-300'}`}>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-4 h-4 rounded-full bg-slate-800 text-[10px] font-bold flex items-center justify-center shrink-0">5</span>
                      <span className="truncate">3D Preview</span>
                    </div>
                    <button onClick={() => setViewMode(viewMode === '3D' ? '2D' : '3D')} className="text-[10px] text-retailfix-red-400 hover:underline shrink-0 font-semibold">
                      {viewMode === '3D' ? 'In 3D' : 'Open 3D'}
                    </button>
                  </div>

                  {/* Step 6: Save & Export PDF */}
                  <div className="p-2 rounded-lg flex items-center justify-between bg-slate-800/50 text-slate-300">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-4 h-4 rounded-full bg-slate-800 text-[10px] font-bold flex items-center justify-center shrink-0">6</span>
                      <span className="truncate">Export PDF Plan</span>
                    </div>
                    <button onClick={handleDownloadPDF} className="text-[10px] text-retailfix-red-400 hover:underline shrink-0 font-semibold">Export</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>

        {/* ── Properties Inspector: Mobile Bottom Sheet / Tablet Drawer / Desktop Sidebar ── */}
        <aside
          className={`
            ${(showMobileProps && selectedEntity) || placementModeTool ? 'fixed inset-x-0 bottom-0 max-h-[70vh] bg-retailfix-dark-900 border-t border-slate-700 rounded-t-2xl shadow-2xl z-50 flex flex-col pb-safe' : 'hidden'}
            ${tabletInspectorOpen || placementModeTool ? 'md:fixed md:top-14 md:bottom-8 md:right-0 md:w-72 md:bg-retailfix-dark-900 md:border-l md:border-slate-800 md:z-30 md:shadow-2xl md:flex' : 'md:hidden'}
            lg:relative lg:top-auto lg:bottom-auto lg:right-auto lg:w-72 lg:border-l lg:border-slate-800 lg:flex lg:flex-col lg:shadow-none
            justify-between shrink-0 overflow-y-auto p-4 space-y-5 text-xs
          `}
        >
          <div className="space-y-4">
            {/* Inspector Header with Close Buttons for Mobile & Tablet */}
            <div className="flex items-center justify-between pb-2 border-b border-slate-800 shrink-0">
              <h3 className="font-bold text-white text-xs uppercase tracking-wider flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-retailfix-red-500" />
                Properties Inspector
              </h3>
            <div className="flex items-center gap-2">
              {selectedEntity && (
                <button
                  onClick={() => {
                    const remaining = entities.filter((e) => e.id !== selectedEntityId);
                    updateEntitiesWithHistory(remaining, 'Delete');
                    setSelectedEntityId(null);
                    setShowMobileProps(false);
                  }}
                  className="text-[10px] text-red-400 hover:underline flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-red-950/30"
                >
                  <Trash2 className="w-3 h-3" /> Delete
                </button>
              )}
              {/* Close Button on Mobile Sheet & Tablet Drawer */}
              <button
                id="btn-close-properties"
                onClick={() => {
                  setShowMobileProps(false);
                  setTabletInspectorOpen(false);
                  setPlacementModeTool(null);
                  setWallToolPreview(null);
                }}
                className="lg:hidden p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
                title="Close Properties"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

            {placementModeTool ? (
              <WallPositioningPanel
                entityType={placementModeTool}
                entities={entities}
                roomPolygon={activeRoomPolygon}
                onApply={handleApplyPlacement}
                onCancel={() => {
                  setPlacementModeTool(null);
                  setActiveTool('select');
                  setWallToolPreview(null);
                  setShowMobileProps(false);
                  setTabletInspectorOpen(false);
                }}
                onPreviewChange={setWallToolPreview}
              />
            ) : selectedEntity ? (
              WallPlacementEngine.isWallAttachedEntity(selectedEntity) &&
              !((selectedEntity as any).properties?.isCustom || (selectedEntity as any).properties?.rackType === 'CUSTOM' || (selectedEntity as any).properties?.rackType === 'custom_rack') ? (
                <div key={selectedEntity.id} className="space-y-3">
                  <WallPositioningPanel
                    entityType={selectedEntity.type}
                    existingEntity={selectedEntity}
                    entities={entities}
                    roomPolygon={activeRoomPolygon}
                    onApply={handleApplyPlacement}
                    onPreviewChange={setWallToolPreview}
                  />
                  {renderOrientationControl(selectedEntity)}
                </div>
              ) : (
              <div key={selectedEntity.id} className="space-y-3 bg-slate-800/60 p-3 rounded-xl border border-slate-700/80">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Type:</span>
                  <span className="font-mono font-bold text-retailfix-red-400 uppercase">{selectedEntity.type}</span>
                </div>

                {selectedEntity.type === 'wall' && (
                  <div className="space-y-3 mt-3">
                    {showDepthProperty(selectedEntity.type) && (
                      <DimensionInput
                        label="Thickness"
                        valueInches={(selectedEntity as WallEntity).properties.thickness}
                        onApply={(val) => updateEntityProperty<WallEntity>(selectedEntity.id, 'Update Wall Thickness', (e) => ({ ...e, properties: { ...e.properties, thickness: val } }))}
                      />
                    )}
                    <DimensionInput
                      label="Length"
                      valueInches={distance({x: (selectedEntity as WallEntity).geometry.x1, y: (selectedEntity as WallEntity).geometry.y1}, {x: (selectedEntity as WallEntity).geometry.x2, y: (selectedEntity as WallEntity).geometry.y2})}
                      onApply={(val) => updateEntityProperty<WallEntity>(selectedEntity.id, 'Update Wall Length', (e) => {
                        const len = distance({x: e.geometry.x1, y: e.geometry.y1}, {x: e.geometry.x2, y: e.geometry.y2});
                        if (len === 0) return e;
                        const scale = val / len;
                        const newX2 = e.geometry.x1 + (e.geometry.x2 - e.geometry.x1) * scale;
                        const newY2 = e.geometry.y1 + (e.geometry.y2 - e.geometry.y1) * scale;
                        return { ...e, geometry: { ...e.geometry, x2: newX2, y2: newY2 } };
                      })}
                    />
                  </div>
                )}

                {selectedEntity.type === 'column' && (
                  <div className="space-y-3 mt-3">
                    <div>
                      <span className="text-slate-400 block mb-1">Column Type:</span>
                      <select
                        value={(selectedEntity as ColumnEntity).properties.columnType}
                        onChange={(e) => {
                          const val = e.target.value as 'wall' | 'free';
                          const col = selectedEntity as ColumnEntity;
                          if (val === 'wall' && col.properties.columnType !== 'wall') {
                             const pt = { x: col.geometry.x, y: col.geometry.y };
                             const snap = snapEngineRef.current.findSnapPoint(pt, entities, viewportRef.current.zoom, null);
                             let targetWallId = snap.targetEntityId;
                             let newX = pt.x, newY = pt.y;
                             if (snap.type === 'wall' && targetWallId) {
                                newX = snap.point.x;
                                newY = snap.point.y;
                             } else {
                                let minDist = Infinity;
                                for (const w of entities) {
                                   if (w.type === 'wall' || w.type === 'partition') {
                                      const wg = (w as WallEntity | PartitionEntity).geometry;
                                      const p1 = { x: wg.x1, y: wg.y1 };
                                      const p2 = { x: wg.x2, y: wg.y2 };
                                      const md = midpoint(p1, p2);
                                      const d = distance(pt, md);
                                      if (d < minDist) { minDist = d; targetWallId = w.id; newX = md.x; newY = md.y; }
                                   }
                                }
                             }
                             updateEntityProperty<ColumnEntity>(col.id, 'Change Column Type to Wall', (e) => ({ ...e, geometry: { ...e.geometry, x: newX, y: newY }, properties: { ...e.properties, columnType: 'wall', attachedWallId: targetWallId } }));
                          } else if (val === 'free' && col.properties.columnType !== 'free') {
                             updateEntityProperty<ColumnEntity>(col.id, 'Change Column Type to Free', (e) => ({ ...e, properties: { ...e.properties, columnType: 'free', attachedWallId: undefined } }));
                          }
                        }}
                        className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-white"
                      >
                        <option value="wall">Wall Column</option>
                        <option value="free">Free Column</option>
                      </select>
                    </div>
                    <DimensionInput
                      label="Width"
                      valueInches={(selectedEntity as ColumnEntity).geometry.width}
                      onApply={(val) => updateEntityProperty<ColumnEntity>(selectedEntity.id, 'Update Column Width', (e) => ({ ...e, geometry: { ...e.geometry, width: val } }))}
                    />
                    {showDepthProperty(selectedEntity.type) && (
                      <DimensionInput
                        label="Depth"
                        valueInches={(selectedEntity as ColumnEntity).geometry.height}
                        onApply={(val) => updateEntityProperty<ColumnEntity>(selectedEntity.id, 'Update Column Depth', (e) => ({ ...e, geometry: { ...e.geometry, height: val } }))}
                      />
                    )}
                    {(selectedEntity as ColumnEntity).properties.columnType === 'wall' && (
                      <>

                    {(() => {
                      const attachedWall = entities.find((e) => e.id === (selectedEntity as any).properties?.attachedWallId) as any;
                      if (attachedWall) {
                        const dist = Math.hypot((selectedEntity as any).geometry.x - attachedWall.geometry.x1, (selectedEntity as any).geometry.y - attachedWall.geometry.y1);
                        return (
                          <DimensionInput
                            label="Position Along Wall"
                            valueInches={dist}
                            onApply={(val) => {
                              const wallLen = Math.hypot(attachedWall.geometry.x2 - attachedWall.geometry.x1, attachedWall.geometry.y2 - attachedWall.geometry.y1);
                              if (wallLen === 0) return;
                              const ratio = val / wallLen;
                              const newX = attachedWall.geometry.x1 + (attachedWall.geometry.x2 - attachedWall.geometry.x1) * ratio;
                              const newY = attachedWall.geometry.y1 + (attachedWall.geometry.y2 - attachedWall.geometry.y1) * ratio;
                              updateEntityProperty<any>(selectedEntity.id, 'Update Position Along Wall', (e) => ({ ...e, geometry: { ...e.geometry, x: newX, y: newY } }));
                            }}
                          />
                        );
                      }
                      return null;
                    })()}

                      </>
                    )}
                    {(selectedEntity as ColumnEntity).properties.columnType === 'free' && (
                      <div className="grid grid-cols-2 gap-2">
                        <DimensionInput
                          label="X Position"
                          valueInches={(selectedEntity as ColumnEntity).geometry.x}
                          onApply={(val) => updateEntityProperty<ColumnEntity>(selectedEntity.id, 'Update Column X', (e) => ({ ...e, geometry: { ...e.geometry, x: val } }))}
                        />
                        <DimensionInput
                          label="Y Position"
                          valueInches={(selectedEntity as ColumnEntity).geometry.y}
                          onApply={(val) => updateEntityProperty<ColumnEntity>(selectedEntity.id, 'Update Column Y', (e) => ({ ...e, geometry: { ...e.geometry, y: val } }))}
                        />
                      </div>
                    )}
                  </div>
                )}

                {selectedEntity.type === 'door' && (
                  <div className="space-y-3 mt-3">
                    <DimensionInput
                      label="Width"
                      valueInches={(selectedEntity as DoorEntity).geometry.width}
                      onApply={(val) => updateEntityProperty<DoorEntity>(selectedEntity.id, 'Update Door Width', (e) => ({ ...e, geometry: { ...e.geometry, width: val } }))}
                    />
                    <DimensionInput
                      label="Height"
                      valueInches={(selectedEntity as DoorEntity).geometry.height || 84}
                      onApply={(val) => updateEntityProperty<DoorEntity>(selectedEntity.id, 'Update Door Height', (e) => ({ ...e, geometry: { ...e.geometry, height: val } }))}
                    />
                    
                    {(() => {
                      const attachedWall = entities.find((e) => e.id === (selectedEntity as any).properties?.attachedWallId) as any;
                      if (attachedWall) {
                        const dist = Math.hypot((selectedEntity as any).geometry.x - attachedWall.geometry.x1, (selectedEntity as any).geometry.y - attachedWall.geometry.y1);
                        return (
                          <DimensionInput
                            label="Position Along Wall"
                            valueInches={dist}
                            onApply={(val) => {
                              const wallLen = Math.hypot(attachedWall.geometry.x2 - attachedWall.geometry.x1, attachedWall.geometry.y2 - attachedWall.geometry.y1);
                              if (wallLen === 0) return;
                              const ratio = val / wallLen;
                              const newX = attachedWall.geometry.x1 + (attachedWall.geometry.x2 - attachedWall.geometry.x1) * ratio;
                              const newY = attachedWall.geometry.y1 + (attachedWall.geometry.y2 - attachedWall.geometry.y1) * ratio;
                              updateEntityProperty<any>(selectedEntity.id, 'Update Position Along Wall', (e) => ({ ...e, geometry: { ...e.geometry, x: newX, y: newY } }));
                            }}
                          />
                        );
                      }
                      return null;
                    })()}

                    <DimensionInput
                      label="Frame Thickness"
                      valueInches={(selectedEntity as DoorEntity).properties.frameThickness || 2}
                      onApply={(val) => updateEntityProperty<DoorEntity>(selectedEntity.id, 'Update Door Frame', (e) => ({ ...e, properties: { ...e.properties, frameThickness: val } }))}
                    />
                  </div>
                )}

                {selectedEntity.type === 'window' && (
                  <div className="space-y-3 mt-3">
                    <DimensionInput
                      label="Width"
                      valueInches={(selectedEntity as WindowEntity).geometry.width}
                      onApply={(val) => updateEntityProperty<WindowEntity>(selectedEntity.id, 'Update Window Width', (e) => ({ ...e, geometry: { ...e.geometry, width: val } }))}
                    />
                    <DimensionInput
                      label="Height"
                      valueInches={(selectedEntity as WindowEntity).geometry.height || 48}
                      onApply={(val) => updateEntityProperty<WindowEntity>(selectedEntity.id, 'Update Window Height', (e) => ({ ...e, geometry: { ...e.geometry, height: val } }))}
                    />

                    {(() => {
                      const attachedWall = entities.find((e) => e.id === (selectedEntity as any).properties?.attachedWallId) as any;
                      if (attachedWall) {
                        const dist = Math.hypot((selectedEntity as any).geometry.x - attachedWall.geometry.x1, (selectedEntity as any).geometry.y - attachedWall.geometry.y1);
                        return (
                          <DimensionInput
                            label="Position Along Wall"
                            valueInches={dist}
                            onApply={(val) => {
                              const wallLen = Math.hypot(attachedWall.geometry.x2 - attachedWall.geometry.x1, attachedWall.geometry.y2 - attachedWall.geometry.y1);
                              if (wallLen === 0) return;
                              const ratio = val / wallLen;
                              const newX = attachedWall.geometry.x1 + (attachedWall.geometry.x2 - attachedWall.geometry.x1) * ratio;
                              const newY = attachedWall.geometry.y1 + (attachedWall.geometry.y2 - attachedWall.geometry.y1) * ratio;
                              updateEntityProperty<any>(selectedEntity.id, 'Update Position Along Wall', (e) => ({ ...e, geometry: { ...e.geometry, x: newX, y: newY } }));
                            }}
                          />
                        );
                      }
                      return null;
                    })()}

                  </div>
                )}

                {selectedEntity.type === 'rack' && (() => {
                  const rack = selectedEntity as RackEntity;
                  const rt = rack.properties.rackType;
                  const isCustom = rt === 'CUSTOM' || rt === 'custom_rack' || Boolean(rack.properties?.isCustom);
                  const isWallRackType = rt === 'wall_rack_7x3' || rt === 'wall_rack_7x4' || rt === 'Wall Rack' || (isCustom && Boolean(rack.properties.attachedWallId));
                  const isCornerRackType = rt === 'corner_rack_2x2x2' || rt === 'Corner Rack';

                  const rackTypeLabel: Record<string, string> = {
                    wall_rack_7x3: "Wall Rack 7' × 3'",
                    wall_rack_7x4: "Wall Rack 7' × 4'",
                    center_rack_5x3: "Center Rack 5' × 3' × 2'",
                    endcap_5x3: "Endcap 5' × 3' × 2'",
                    corner_rack_2x2x2: "Corner Rack 2' × 2' × 2'",
                    CUSTOM: "Custom Rack",
                    custom_rack: "Custom Rack",
                  };

                  return (
                    <div className="space-y-3 mt-3">
                      {/* Rack Type & Product Info */}
                      <div>
                        <span className="text-slate-400 block mb-1">Rack Type:</span>
                        <div className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-emerald-400 font-bold truncate">
                          {rack.properties.productName || (isCustom ? "Custom Rack" : (rackTypeLabel[rt] || rt.replace(/_/g, ' ').toUpperCase()))}
                        </div>
                      </div>

                      {/* Archived Product Warning if legacy/deactivated */}
                      {(() => {
                        const resolvedModel = ProductModelRegistry.resolve(rack.properties.productModelId, rack.properties.rackType);
                        if (resolvedModel && !resolvedModel.active) {
                          return (
                            <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] rounded-lg">
                              <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                              <span>Archived product used by this project.</span>
                            </div>
                          );
                        }
                        return null;
                      })()}

                      {rack.properties.sku && (
                        <div className="flex items-center justify-between text-[11px] bg-slate-900/60 px-2 py-1 rounded border border-slate-800">
                          <span className="text-slate-400">SKU / Code:</span>
                          <span className="text-white font-mono">{rack.properties.sku}</span>
                        </div>
                      )}

                      {(Boolean(rack.properties.baseWidth) || Boolean(rack.properties.baseHeight) || Boolean(rack.properties.baseDepth)) && (
                        <div className="flex items-center justify-between text-[11px] bg-slate-900/60 px-2 py-1 rounded border border-slate-800">
                          <span className="text-slate-400">Base Model Size:</span>
                          <span className="text-slate-300 font-mono">
                            {formatFeetInches(rack.properties.baseWidth || 0)} × {formatFeetInches(rack.properties.baseHeight || 0)} × {formatFeetInches(rack.properties.baseDepth || 0)}
                          </span>
                        </div>
                      )}

                      {/* WALL RACK CONTROLS */}
                      {isWallRackType && (
                        <>
                          {/* Wall selector */}
                          <div>
                            <span className="text-slate-400 block mb-1">Attached Wall:</span>
                            <select
                              value={rack.properties.attachedWallId || ''}
                              onChange={(ev) => {
                                const val = ev.target.value;
                                if (!val) {
                                  updateEntityProperty<RackEntity>(rack.id, 'Detach from Wall', (e) => ({
                                    ...e, properties: { ...e.properties, attachedWallId: undefined, wallSide: undefined }
                                  }));
                                } else {
                                  const targetWall = entities.find(w => w.id === val) as WallEntity | undefined;
                                  if (targetWall) {
                                    const wx1 = targetWall.geometry.x1;
                                    const wy1 = targetWall.geometry.y1;
                                    const wx2 = targetWall.geometry.x2;
                                    const wy2 = targetWall.geometry.y2;
                                    const wallAngle = Math.atan2(wy2 - wy1, wx2 - wx1);
                                    const wallThickness = targetWall.properties?.thickness ?? 9;
                                    const wallEntities = entities.filter(e => e.type === 'wall') as WallEntity[];
                                    const roomPoly = activeRoomPolygon.length >= 3 ? activeRoomPolygon : buildRoomPolygon(wallEntities);
                                    const normals = calculateWallInwardNormal({ x: wx1, y: wy1 }, { x: wx2, y: wy2 }, roomPoly);
                                    const inwardNormal = normals.inwardNormal;
                                    const mdX = (wx1 + wx2) / 2 + inwardNormal.x * (wallThickness / 2);
                                    const mdY = (wy1 + wy2) / 2 + inwardNormal.y * (wallThickness / 2);

                                    let newWallSide: RackEntity['properties']['wallSide'] = undefined;
                                    if (Math.abs(inwardNormal.y - 1) < 0.2) newWallSide = 'top';
                                    else if (Math.abs(inwardNormal.y + 1) < 0.2) newWallSide = 'bottom';
                                    else if (Math.abs(inwardNormal.x - 1) < 0.2) newWallSide = 'left';
                                    else if (Math.abs(inwardNormal.x + 1) < 0.2) newWallSide = 'right';

                                    updateEntityProperty<RackEntity>(rack.id, 'Attach to Wall', (e) => ({
                                      ...e,
                                      geometry: { ...e.geometry, x: mdX, y: mdY, rotation: wallAngle * (180 / Math.PI) },
                                      properties: { ...e.properties, attachedWallId: val, wallSide: newWallSide, inwardNormal },
                                    }));
                                  }
                                }
                              }}
                              className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-white"
                            >
                              <option value="">None (Free-standing)</option>
                              {entities.filter(e => e.type === 'wall').map((w, i) => (
                                <option key={w.id} value={w.id}>Wall {i + 1}</option>
                              ))}
                            </select>
                          </div>

                          {/* Wall side indicator */}
                          {rack.properties.wallSide && (
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="text-slate-400">Wall Side:</span>
                              <span className="text-amber-400 font-bold uppercase">{rack.properties.wallSide}</span>
                            </div>
                          )}

                          {/* Designation note */}
                          <div className="bg-slate-900/60 border border-slate-700/50 rounded px-2 py-1 text-[10px] text-slate-500">
                            Designation: <span className="text-slate-300 font-mono">{isCustom ? "Height × Width × Depth" : "Height × Width"}</span>
                          </div>
                          {isCustom && (
                            <div className="flex items-center justify-between text-[11px] bg-slate-900/40 px-2 py-1 rounded border border-slate-800">
                              <span className="text-slate-400">RetailFix Size:</span>
                              <span className="text-emerald-400 font-bold font-mono">
                                {formatCustomRackLabel(rack.geometry.height || 84, rack.geometry.width, rack.geometry.depth)}
                              </span>
                            </div>
                          )}

                          {/* Parametric Shelf Controls */}
                          <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800 space-y-2">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="text-slate-300 font-medium">Shelves:</span>
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const cur = rack.properties.shelfCount ?? rack.properties.shelves ?? 6;
                                    if (cur > 2) {
                                      updateEntityProperty<RackEntity>(rack.id, 'Decrease Shelves', (e) => ({
                                        ...e,
                                        properties: { ...e.properties, shelves: cur - 1, shelfCount: cur - 1 },
                                      }));
                                    }
                                  }}
                                  className="w-5 h-5 rounded bg-slate-800 hover:bg-slate-700 text-white font-bold flex items-center justify-center text-xs transition-colors"
                                >
                                  -
                                </button>
                                <span className="font-mono font-bold text-white text-xs min-w-[28px] text-center">
                                  {rack.properties.shelfCount ?? rack.properties.shelves ?? 6}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const cur = rack.properties.shelfCount ?? rack.properties.shelves ?? 6;
                                    if (cur < 12) {
                                      updateEntityProperty<RackEntity>(rack.id, 'Increase Shelves', (e) => ({
                                        ...e,
                                        properties: { ...e.properties, shelves: cur + 1, shelfCount: cur + 1 },
                                      }));
                                    }
                                  }}
                                  className="w-5 h-5 rounded bg-slate-800 hover:bg-slate-700 text-white font-bold flex items-center justify-center text-xs transition-colors"
                                >
                                  +
                                </button>
                              </div>
                            </div>

                            <div className="flex items-center justify-between text-[11px]">
                              <span className="text-slate-400">Thickness:</span>
                              <select
                                value={rack.properties.shelfThickness ?? 1.0}
                                onChange={(ev) => {
                                  const val = parseFloat(ev.target.value) || 1.0;
                                  updateEntityProperty<RackEntity>(rack.id, 'Update Shelf Thickness', (e) => ({
                                    ...e,
                                    properties: { ...e.properties, shelfThickness: val },
                                  }));
                                }}
                                className="bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-xs text-white font-mono"
                              >
                                <option value={1.0}>1.0″ (Standard)</option>
                                <option value={1.2}>1.2″</option>
                                <option value={1.5}>1.5″ (Heavy Duty)</option>
                                <option value={2.0}>2.0″ (Extra Heavy)</option>
                              </select>
                            </div>

                            <div className="flex items-center justify-between text-[11px]">
                              <span className="text-slate-400">Spacing:</span>
                              <select
                                value={rack.properties.shelfSpacing ?? 'auto'}
                                onChange={(ev) => {
                                  const val = ev.target.value === 'auto' ? 'auto' : parseFloat(ev.target.value);
                                  updateEntityProperty<RackEntity>(rack.id, 'Update Shelf Spacing', (e) => ({
                                    ...e,
                                    properties: { ...e.properties, shelfSpacing: val },
                                  }));
                                }}
                                className="bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-xs text-white font-mono"
                              >
                                <option value="auto">Auto (Equal)</option>
                                <option value={10}>10″ Spacing</option>
                                <option value={12}>12″ Spacing</option>
                                <option value={14}>14″ Spacing</option>
                                <option value={16}>16″ Spacing</option>
                              </select>
                            </div>
                          </div>

                          <DimensionInput
                            label="Width (Along Wall)"
                            valueInches={rack.geometry.width}
                            onApply={(val) => updateEntityProperty<RackEntity>(rack.id, 'Update Rack Width', (e) => {
                              if (isCustom) {
                                const curH = e.geometry.height || 84;
                                const curD = e.geometry.depth;
                                const newLabel = formatCustomRackLabel(curH, val, curD);
                                return {
                                  ...e,
                                  width: val,
                                  label: `C-RACK ${newLabel}`,
                                  geometry: { ...e.geometry, width: val },
                                  properties: {
                                    ...e.properties,
                                    width: val,
                                    canonicalWidth: val,
                                    label: `C-RACK ${newLabel}`,
                                    productName: `Custom Rack ${newLabel}`,
                                    wallPlacement: e.properties.wallPlacement ? {
                                      ...e.properties.wallPlacement,
                                      widthInches: val,
                                    } : undefined,
                                  },
                                };
                              }
                              return { ...e, geometry: { ...e.geometry, width: val } };
                            })}
                          />
                          <DimensionInput
                            label="Depth (Into Room)"
                            valueInches={rack.geometry.depth}
                            onApply={(val) => updateEntityProperty<RackEntity>(rack.id, 'Update Rack Depth', (e) => {
                              if (isCustom) {
                                const curH = e.geometry.height || 84;
                                const curW = e.geometry.width;
                                const newLabel = formatCustomRackLabel(curH, curW, val);
                                return {
                                  ...e,
                                  depth: val,
                                  label: `C-RACK ${newLabel}`,
                                  geometry: { ...e.geometry, depth: val },
                                  properties: {
                                    ...e.properties,
                                    depth: val,
                                    canonicalDepth: val,
                                    label: `C-RACK ${newLabel}`,
                                    productName: `Custom Rack ${newLabel}`,
                                    wallPlacement: e.properties.wallPlacement ? {
                                      ...e.properties.wallPlacement,
                                      depthInches: val,
                                    } : undefined,
                                  },
                                };
                              }
                              return { ...e, geometry: { ...e.geometry, depth: val } };
                            })}
                          />
                          <DimensionInput
                            label="Height"
                            valueInches={rack.geometry.height || 84}
                            onApply={(val) => updateEntityProperty<RackEntity>(rack.id, 'Update Rack Height', (e) => {
                              if (isCustom) {
                                const curW = e.geometry.width;
                                const curD = e.geometry.depth;
                                const newLabel = formatCustomRackLabel(val, curW, curD);
                                return {
                                  ...e,
                                  height: val,
                                  label: `C-RACK ${newLabel}`,
                                  geometry: { ...e.geometry, height: val },
                                  properties: {
                                    ...e.properties,
                                    height: val,
                                    canonicalHeight: val,
                                    label: `C-RACK ${newLabel}`,
                                    productName: `Custom Rack ${newLabel}`,
                                  },
                                };
                              }
                              return { ...e, geometry: { ...e.geometry, height: val } };
                            })}
                          />

                          {/* Position along wall */}
                          {(() => {
                            const attachedWall = entities.find(e => e.id === rack.properties.attachedWallId) as WallEntity | undefined;
                            if (attachedWall) {
                              const wLen = Math.hypot(
                                attachedWall.geometry.x2 - attachedWall.geometry.x1,
                                attachedWall.geometry.y2 - attachedWall.geometry.y1
                              );
                              const dist = Math.hypot(
                                rack.geometry.x - attachedWall.geometry.x1,
                                rack.geometry.y - attachedWall.geometry.y1
                              );
                              return (
                                <DimensionInput
                                  label="Position Along Wall"
                                  valueInches={Math.min(dist, wLen)}
                                  onApply={(val) => {
                                    const clamped = Math.max(0, Math.min(val, wLen));
                                    const ratio = wLen > 0 ? clamped / wLen : 0;
                                    const newX = attachedWall.geometry.x1 + ratio * (attachedWall.geometry.x2 - attachedWall.geometry.x1);
                                    const newY = attachedWall.geometry.y1 + ratio * (attachedWall.geometry.y2 - attachedWall.geometry.y1);
                                    updateEntityProperty<RackEntity>(rack.id, 'Update Position Along Wall', (e) => ({ ...e, geometry: { ...e.geometry, x: newX, y: newY } }));
                                  }}
                                />
                              );
                            }
                            // No wall attached — show X/Y
                            return (
                              <div className="grid grid-cols-2 gap-2 mt-1">
                                <DimensionInput label="X" valueInches={rack.geometry.x} onApply={(val) => updateEntityProperty<RackEntity>(rack.id, 'Update X', (e) => ({ ...e, geometry: { ...e.geometry, x: val } }))} />
                                <DimensionInput label="Y" valueInches={rack.geometry.y} onApply={(val) => updateEntityProperty<RackEntity>(rack.id, 'Update Y', (e) => ({ ...e, geometry: { ...e.geometry, y: val } }))} />
                              </div>
                            );
                          })()}
                        </>
                      )}

                      {/* CENTER RACK / ENDCAP CONTROLS */}
                      {!isWallRackType && !isCornerRackType && (
                        <>
                          {/* Designation note */}
                          <div className="bg-slate-900/60 border border-slate-700/50 rounded px-2 py-1 text-[10px] text-slate-500">
                            Designation: <span className="text-slate-300 font-mono">Height × Width × Depth</span>
                          </div>
                          <div className="flex items-center justify-between text-[11px] bg-slate-900/40 px-2 py-1 rounded border border-slate-800">
                            <span className="text-slate-400">RetailFix Size:</span>
                            <span className="text-emerald-400 font-bold font-mono">
                              {formatCustomRackLabel(rack.geometry.height || 60, rack.geometry.width, rack.geometry.depth)}
                            </span>
                          </div>
                          {/* Parametric Shelf Controls */}
                          <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800 space-y-2">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="text-slate-300 font-medium">Shelves:</span>
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const cur = rack.properties.shelfCount ?? rack.properties.shelves ?? 6;
                                    if (cur > 2) {
                                      updateEntityProperty<RackEntity>(rack.id, 'Decrease Shelves', (e) => ({
                                        ...e,
                                        properties: { ...e.properties, shelves: cur - 1, shelfCount: cur - 1 },
                                      }));
                                    }
                                  }}
                                  className="w-5 h-5 rounded bg-slate-800 hover:bg-slate-700 text-white font-bold flex items-center justify-center text-xs transition-colors"
                                >
                                  -
                                </button>
                                <span className="font-mono font-bold text-white text-xs min-w-[28px] text-center">
                                  {rack.properties.shelfCount ?? rack.properties.shelves ?? 6}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const cur = rack.properties.shelfCount ?? rack.properties.shelves ?? 6;
                                    if (cur < 12) {
                                      updateEntityProperty<RackEntity>(rack.id, 'Increase Shelves', (e) => ({
                                        ...e,
                                        properties: { ...e.properties, shelves: cur + 1, shelfCount: cur + 1 },
                                      }));
                                    }
                                  }}
                                  className="w-5 h-5 rounded bg-slate-800 hover:bg-slate-700 text-white font-bold flex items-center justify-center text-xs transition-colors"
                                >
                                  +
                                </button>
                              </div>
                            </div>

                            <div className="flex items-center justify-between text-[11px]">
                              <span className="text-slate-400">Thickness:</span>
                              <select
                                value={rack.properties.shelfThickness ?? 1.0}
                                onChange={(ev) => {
                                  const val = parseFloat(ev.target.value) || 1.0;
                                  updateEntityProperty<RackEntity>(rack.id, 'Update Shelf Thickness', (e) => ({
                                    ...e,
                                    properties: { ...e.properties, shelfThickness: val },
                                  }));
                                }}
                                className="bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-xs text-white font-mono"
                              >
                                <option value={1.0}>1.0″ (Standard)</option>
                                <option value={1.2}>1.2″</option>
                                <option value={1.5}>1.5″ (Heavy Duty)</option>
                                <option value={2.0}>2.0″ (Extra Heavy)</option>
                              </select>
                            </div>

                            <div className="flex items-center justify-between text-[11px]">
                              <span className="text-slate-400">Spacing:</span>
                              <select
                                value={rack.properties.shelfSpacing ?? 'auto'}
                                onChange={(ev) => {
                                  const val = ev.target.value === 'auto' ? 'auto' : parseFloat(ev.target.value);
                                  updateEntityProperty<RackEntity>(rack.id, 'Update Shelf Spacing', (e) => ({
                                    ...e,
                                    properties: { ...e.properties, shelfSpacing: val },
                                  }));
                                }}
                                className="bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-xs text-white font-mono"
                              >
                                <option value="auto">Auto (Equal)</option>
                                <option value={10}>10″ Spacing</option>
                                <option value={12}>12″ Spacing</option>
                                <option value={14}>14″ Spacing</option>
                                <option value={16}>16″ Spacing</option>
                              </select>
                            </div>
                          </div>

                          <DimensionInput
                            label="Width"
                            valueInches={rack.geometry.width}
                            onApply={(val) => updateEntityProperty<RackEntity>(rack.id, 'Update Rack Width', (e) => {
                              const curH = e.geometry.height || 60;
                              const curD = e.geometry.depth || 24;
                              const newLabel = formatCustomRackLabel(curH, val, curD);
                              return {
                                ...e,
                                width: val,
                                label: isCustom ? `C-RACK ${newLabel}` : (e.label || newLabel),
                                geometry: { ...e.geometry, width: val },
                                properties: {
                                  ...e.properties,
                                  width: val,
                                  canonicalWidth: val,
                                  label: isCustom ? `C-RACK ${newLabel}` : (e.properties.label || newLabel),
                                  productName: isCustom ? `Custom Rack ${newLabel}` : e.properties.productName,
                                }
                              };
                            })}
                          />
                          <DimensionInput
                            label="Depth"
                            valueInches={rack.geometry.depth}
                            onApply={(val) => updateEntityProperty<RackEntity>(rack.id, 'Update Rack Depth', (e) => {
                              const curH = e.geometry.height || 60;
                              const curW = e.geometry.width || 36;
                              const newLabel = formatCustomRackLabel(curH, curW, val);
                              return {
                                ...e,
                                depth: val,
                                label: isCustom ? `C-RACK ${newLabel}` : (e.label || newLabel),
                                geometry: { ...e.geometry, depth: val },
                                properties: {
                                  ...e.properties,
                                  depth: val,
                                  canonicalDepth: val,
                                  label: isCustom ? `C-RACK ${newLabel}` : (e.properties.label || newLabel),
                                  productName: isCustom ? `Custom Rack ${newLabel}` : e.properties.productName,
                                }
                              };
                            })}
                          />
                          <DimensionInput
                            label="Height"
                            valueInches={rack.geometry.height || 60}
                            onApply={(val) => updateEntityProperty<RackEntity>(rack.id, 'Update Rack Height', (e) => {
                              const curW = e.geometry.width || 36;
                              const curD = e.geometry.depth || 24;
                              const newLabel = formatCustomRackLabel(val, curW, curD);
                              return {
                                ...e,
                                height: val,
                                label: isCustom ? `C-RACK ${newLabel}` : (e.label || newLabel),
                                geometry: { ...e.geometry, height: val },
                                properties: {
                                  ...e.properties,
                                  height: val,
                                  canonicalHeight: val,
                                  label: isCustom ? `C-RACK ${newLabel}` : (e.properties.label || newLabel),
                                  productName: isCustom ? `Custom Rack ${newLabel}` : e.properties.productName,
                                }
                              };
                            })}
                          />
                          <div className="grid grid-cols-2 gap-2">
                            <DimensionInput
                              label="X Position"
                              valueInches={rack.geometry.x}
                              onApply={(val) => updateEntityProperty<RackEntity>(rack.id, 'Update X', (e) => ({ ...e, geometry: { ...e.geometry, x: val } }))}
                            />
                            <DimensionInput
                              label="Y Position"
                              valueInches={rack.geometry.y}
                              onApply={(val) => updateEntityProperty<RackEntity>(rack.id, 'Update Y', (e) => ({ ...e, geometry: { ...e.geometry, y: val } }))}
                            />
                          </div>
                          <div>
                            <span className="text-slate-400 block mb-1">Rotation (°):</span>
                            <input
                              type="number"
                              min={0} max={360} step={90}
                              defaultValue={rack.geometry.rotation || 0}
                              key={rack.id + '_rot'}
                              onBlur={(ev) => {
                                const val = parseFloat(ev.target.value) || 0;
                                updateEntityProperty<RackEntity>(rack.id, 'Update Rotation', (e) => ({ ...e, geometry: { ...e.geometry, rotation: val } }));
                              }}
                              className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-white"
                            />
                          </div>
                        </>
                      )}

                      {/* CORNER RACK CONTROLS */}
                      {isCornerRackType && (
                        <>
                          <DimensionInput
                            label="Side A (Horizontal)"
                            valueInches={rack.geometry.width}
                            onApply={(val) => updateEntityProperty<RackEntity>(rack.id, 'Update Side A', (e) => ({ ...e, geometry: { ...e.geometry, width: val } }))}
                          />
                          <DimensionInput
                            label="Side B (Vertical)"
                            valueInches={rack.geometry.depth}
                            onApply={(val) => updateEntityProperty<RackEntity>(rack.id, 'Update Side B', (e) => ({ ...e, geometry: { ...e.geometry, depth: val } }))}
                          />
                          <DimensionInput
                            label="Height"
                            valueInches={rack.geometry.height || 24}
                            onApply={(val) => updateEntityProperty<RackEntity>(rack.id, 'Update Rack Height', (e) => ({ ...e, geometry: { ...e.geometry, height: val } }))}
                          />
                          <div>
                            <span className="text-slate-400 block mb-1">Corner:</span>
                            <select
                              value={rack.properties.cornerPosition || 'top-left'}
                              onChange={(ev) => {
                                const pos = ev.target.value as RackEntity['properties']['cornerPosition'];
                                const rotMap: Record<string, number> = { 'top-left': 0, 'top-right': 90, 'bottom-right': 180, 'bottom-left': 270 };
                                const newRot = rotMap[pos as string] || 0;
                                updateEntityProperty<RackEntity>(rack.id, 'Update Corner Position', (e) => ({
                                  ...e,
                                  geometry: { ...e.geometry, rotation: newRot },
                                  properties: { ...e.properties, cornerPosition: pos },
                                }));
                              }}
                              className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-white"
                            >
                              <option value="top-left">Top-Left Corner</option>
                              <option value="top-right">Top-Right Corner</option>
                              <option value="bottom-left">Bottom-Left Corner</option>
                              <option value="bottom-right">Bottom-Right Corner</option>
                            </select>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <DimensionInput
                              label="X Position"
                              valueInches={rack.geometry.x}
                              onApply={(val) => updateEntityProperty<RackEntity>(rack.id, 'Update X', (e) => ({ ...e, geometry: { ...e.geometry, x: val } }))}
                            />
                            <DimensionInput
                              label="Y Position"
                              valueInches={rack.geometry.y}
                              onApply={(val) => updateEntityProperty<RackEntity>(rack.id, 'Update Y', (e) => ({ ...e, geometry: { ...e.geometry, y: val } }))}
                            />
                          </div>
                        </>
                      )}
                    </div>
                  );
                })()}


                {(selectedEntity.type === 'shutter' || selectedEntity.type === 'glass_gate') && (
                  <div className="space-y-3 mt-3">
                    <DimensionInput
                      label="Width"
                      valueInches={(selectedEntity as ShutterEntity).geometry.width}
                      onApply={(val) => updateEntityProperty<any>(selectedEntity.id, 'Update Width', (e) => ({ ...e, geometry: { ...e.geometry, width: val } }))}
                    />
                    <DimensionInput
                      label="Height"
                      valueInches={(selectedEntity as ShutterEntity).geometry.height || 96}
                      onApply={(val) => updateEntityProperty<any>(selectedEntity.id, 'Update Height', (e) => ({ ...e, geometry: { ...e.geometry, height: val } }))}
                    />

                    {((selectedEntity.type === 'shutter' || selectedEntity.type === 'glass_gate') && (selectedEntity as any).properties?.attachedWallId) ? (() => {
                      const attachedWall = entities.find((e) => e.id === (selectedEntity as any).properties?.attachedWallId) as any;
                      if (attachedWall) {
                        const dist = Math.hypot((selectedEntity as any).geometry.x - attachedWall.geometry.x1, (selectedEntity as any).geometry.y - attachedWall.geometry.y1);
                        return (
                          <DimensionInput
                            label="Position Along Wall"
                            valueInches={dist}
                            onApply={(val) => {
                              const wallLen = Math.hypot(attachedWall.geometry.x2 - attachedWall.geometry.x1, attachedWall.geometry.y2 - attachedWall.geometry.y1);
                              if (wallLen === 0) return;
                              const ratio = val / wallLen;
                              const newX = attachedWall.geometry.x1 + (attachedWall.geometry.x2 - attachedWall.geometry.x1) * ratio;
                              const newY = attachedWall.geometry.y1 + (attachedWall.geometry.y2 - attachedWall.geometry.y1) * ratio;
                              updateEntityProperty<any>(selectedEntity.id, 'Update Position Along Wall', (e) => ({ ...e, geometry: { ...e.geometry, x: newX, y: newY } }));
                            }}
                          />
                        );
                      }
                      return null;
                    })() : (
                      
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        <DimensionInput
                          label="X Position"
                          valueInches={(selectedEntity as any).geometry.x}
                          onApply={(val) => updateEntityProperty<any>(selectedEntity.id, 'Update X', (e) => ({ ...e, geometry: { ...e.geometry, x: val } }))}
                        />
                        <DimensionInput
                          label="Y Position"
                          valueInches={(selectedEntity as any).geometry.y}
                          onApply={(val) => updateEntityProperty<any>(selectedEntity.id, 'Update Y', (e) => ({ ...e, geometry: { ...e.geometry, y: val } }))}
                        />
                      </div>

                    )}

                  </div>
                )}

                {selectedEntity.type === 'partition' && (
                  <div className="space-y-3 mt-3">
                    <DimensionInput
                      label="Height"
                      valueInches={(selectedEntity as PartitionEntity).properties.height || 108}
                      onApply={(val) => updateEntityProperty<PartitionEntity>(selectedEntity.id, 'Update Partition Height', (e) => ({ ...e, properties: { ...e.properties, height: val } }))}
                    />
                    {showDepthProperty(selectedEntity.type) && (
                      <DimensionInput
                        label="Thickness"
                        valueInches={(selectedEntity as PartitionEntity).properties.thickness}
                        onApply={(val) => updateEntityProperty<PartitionEntity>(selectedEntity.id, 'Update Partition Thickness', (e) => ({ ...e, properties: { ...e.properties, thickness: val } }))}
                      />
                    )}
                    <DimensionInput
                      label="Length"
                      valueInches={distance({x: (selectedEntity as PartitionEntity).geometry.x1, y: (selectedEntity as PartitionEntity).geometry.y1}, {x: (selectedEntity as PartitionEntity).geometry.x2, y: (selectedEntity as PartitionEntity).geometry.y2})}
                      onApply={(val) => updateEntityProperty<PartitionEntity>(selectedEntity.id, 'Update Partition Length', (e) => {
                        const len = distance({x: e.geometry.x1, y: e.geometry.y1}, {x: e.geometry.x2, y: e.geometry.y2});
                        if (len === 0) return e;
                        const scale = val / len;
                        const newX2 = e.geometry.x1 + (e.geometry.x2 - e.geometry.x1) * scale;
                        const newY2 = e.geometry.y1 + (e.geometry.y2 - e.geometry.y1) * scale;
                        return { ...e, geometry: { ...e.geometry, x2: newX2, y2: newY2 } };
                      })}
                    />
                  </div>
                )}
                
                {renderOrientationControl(selectedEntity)}

              </div>
              )
            ) : (
              <div className="bg-slate-800/40 p-3 rounded-xl border border-slate-800 text-slate-500 text-center space-y-1">
                <Info className="w-4 h-4 mx-auto text-slate-600" />
                <p>Click any wall, column, or rack to inspect and adjust dimensions.</p>
              </div>
            )}
          </div>

          <div className="space-y-2.5">
            <h3 className="font-bold text-white text-xs uppercase tracking-wider border-b border-slate-800 pb-1.5 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-retailfix-red-500" />
              CAD Overlays & Snaps
            </h3>

            <div className="space-y-1.5">
              <label className="flex items-center justify-between p-2 rounded-lg bg-slate-800/50 hover:bg-slate-800 cursor-pointer">
                <span className="text-slate-300">CAD Grid (1 Foot)</span>
                <input
                  type="checkbox"
                  checked={showGrid}
                  onChange={(e) => setShowGrid(e.target.checked)}
                  className="rounded text-retailfix-red-600 focus:ring-0"
                />
              </label>

              <label className="flex items-center justify-between p-2 rounded-lg bg-slate-800/50 hover:bg-slate-800 cursor-pointer">
                <span className="text-slate-300">Grid Snap</span>
                <input
                  type="checkbox"
                  checked={gridSnap}
                  onChange={(e) => setGridSnap(e.target.checked)}
                  className="rounded text-retailfix-red-600 focus:ring-0"
                />
              </label>

              <label className="flex items-center justify-between p-2 rounded-lg bg-slate-800/50 hover:bg-slate-800 cursor-pointer">
                <span className="text-slate-300">Ortho Lock (F8 / Shift)</span>
                <input
                  type="checkbox"
                  checked={orthoMode}
                  onChange={(e) => setOrthoMode(e.target.checked)}
                  className="rounded text-retailfix-red-600 focus:ring-0"
                />
              </label>

              <label className="flex items-center justify-between p-2 rounded-lg bg-slate-800/50 hover:bg-slate-800 cursor-pointer">
                <span className="text-slate-300">Architectural Dimensions</span>
                <input
                  type="checkbox"
                  checked={showDimensions}
                  onChange={(e) => setShowDimensions(e.target.checked)}
                  className="rounded text-retailfix-red-600 focus:ring-0"
                />
              </label>

              <label className="flex items-center justify-between p-2 rounded-lg bg-slate-800/50 hover:bg-slate-800 cursor-pointer">
                <span className="text-slate-300">Rack Dimension Mode</span>
                <input
                  type="checkbox"
                  checked={showRackDimensions}
                  onChange={(e) => setShowRackDimensions(e.target.checked)}
                  className="rounded text-retailfix-red-600 focus:ring-0"
                />
              </label>

              <label className="flex items-center justify-between p-2 rounded-lg bg-slate-800/50 hover:bg-slate-800 cursor-pointer">
                <span className="text-slate-300">Column Ref Dimensions</span>
                <input
                  type="checkbox"
                  checked={showTempRefDimensions}
                  onChange={(e) => setShowTempRefDimensions(e.target.checked)}
                  className="rounded text-retailfix-red-600 focus:ring-0"
                />
              </label>

              <label className="flex items-center justify-between p-2 rounded-lg bg-slate-800/50 hover:bg-slate-800 cursor-pointer">
                <span className="text-slate-300">Visual Debug Overlay</span>
                <input
                  type="checkbox"
                  checked={showDebugOverlay}
                  onChange={(e) => setShowDebugOverlay(e.target.checked)}
                  className="rounded text-retailfix-red-600 focus:ring-0"
                />
              </label>
            </div>
          </div>

          <div className="bg-slate-800/40 p-3 rounded-xl border border-slate-800 text-[11px] space-y-1.5">
            <span className="text-slate-400 block font-bold text-[10px] uppercase">Survey Info</span>
            <div className="flex justify-between"><span className="text-slate-400">Store:</span><strong className="text-white">{projectData?.storeName || 'Retail Store'}</strong></div>
            <div className="flex justify-between"><span className="text-slate-400">Type:</span><span className="text-retailfix-red-400 font-semibold">{projectData?.storeType || 'Supermarket'}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Scale:</span><span className="font-mono text-slate-300">{projectData?.scale || '1/4" = 1\'-0"'}</span></div>
          </div>
        </aside>
      </div>

      <footer className="hidden md:flex h-8 bg-retailfix-dark-950 border-t border-slate-800 px-4 items-center justify-between text-[11px] font-mono text-slate-400 shrink-0 z-30">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500">CURSOR:</span>
            <span className="text-white font-bold">
              X: {formatFeetInches(cursorWorldPos.x)} &nbsp; Y: {formatFeetInches(cursorWorldPos.y)}
            </span>
          </div>

          <div className="hidden sm:flex items-center gap-3 pl-3 border-l border-slate-800">
            <span>GRID: <strong className={gridSnap ? 'text-emerald-400' : 'text-slate-500'}>{gridSnap ? '1\'-0"' : 'OFF'}</strong></span>
            <span>ORTHO: <strong className={orthoMode ? 'text-emerald-400' : 'text-slate-500'}>{orthoMode ? 'ON' : 'OFF'}</strong></span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <span>ENTITIES: <strong className="text-white">{entities.length}</strong></span>
          {selectedEntityIds.size > 0 && (
            <span className="text-indigo-400 font-bold">
              SELECTED: {selectedEntityIds.size} rack{selectedEntityIds.size !== 1 ? 's' : ''}
            </span>
          )}
          {aiPreviewRacks.length > 0 && (
            <span className="text-violet-400 font-bold animate-pulse">
              AI PREVIEW: {aiPreviewRacks.length} racks
            </span>
          )}
          <span>UNIT: <strong className="text-slate-200">Feet + Inches</strong></span>
          <span>SCALE: <strong className="text-slate-200">1/4" = 1'-0"</strong></span>
        </div>
      </footer>

      {/* Quick Room Setup Modal (Planner 5D-Style Room Dimensions) */}
      {showQuickRoomModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-retailfix-red-600 flex items-center justify-center text-white shadow-md">
                  <Maximize2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-sm">Set Shop Dimensions</h3>
                  <p className="text-[11px] text-slate-400">Generates 4 rectangular boundary walls</p>
                </div>
              </div>
              <button
                onClick={() => setShowQuickRoomModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-300 font-medium block mb-1">Store Front Width (Feet + Inches)</label>
                <input
                  type="text"
                  value={quickRoomWidth}
                  onChange={(e) => setQuickRoomWidth(e.target.value)}
                  placeholder="e.g. 30'-0&quot; or 30'"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono focus:border-retailfix-red-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-slate-300 font-medium block mb-1">Store Depth / Length (Feet + Inches)</label>
                <input
                  type="text"
                  value={quickRoomDepth}
                  onChange={(e) => setQuickRoomDepth(e.target.value)}
                  placeholder="e.g. 20'-0&quot; or 20'"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono focus:border-retailfix-red-500 focus:outline-none"
                />
              </div>
              <div className="text-[11px] text-slate-400 bg-slate-800/60 p-2.5 rounded-lg border border-slate-800">
                Standard exterior wall thickness: <span className="text-white font-bold font-mono">9 inches</span> (compliant with Indian retail construction).
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setShowQuickRoomModal(false)}
                className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleCreateQuickRoom(quickRoomWidth, quickRoomDepth)}
                className="px-4 py-2 rounded-lg bg-retailfix-red-600 hover:bg-retailfix-red-700 active:bg-retailfix-red-800 text-white text-xs font-bold shadow-md shadow-red-950/40 flex items-center gap-1.5 transition-colors"
              >
                <Square className="w-3.5 h-3.5" />
                <span>Create Store Boundary</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rack Catalogue Modal — Accessible across all screen sizes (Mobile, Tablet, Desktop) */}
      {showRackMenu && (
        <RackCatalogueModal
          isOpen={showRackMenu}
          onClose={() => setShowRackMenu(false)}
          onSelectRack={handleSelectRackForPlacement}
          onQuickAddRack={(prod) => {
            handleAddRack(
              prod.productType || 'Wall Rack',
              prod.width,
              prod.depth,
              prod.height,
              prod.productId,
              prod.productName
            );
          }}
          onOpenCustomRackModal={() => {
            setShowRackMenu(false);
            setSelectedProductForCustom((activeProducts || [])[0] || null);
            setShowCustomRackModal(true);
          }}
          products={activeProducts}
          isLoading={productsLoading}
          error={productsError}
          onRetry={() => ProductModelRegistry.loadProducts(true)}
        />
      )}

      {/* Custom Rack Modal */}
      {showCustomRackModal && (
        <CustomRackModal
          isOpen={showCustomRackModal}
          onClose={() => {
            setShowCustomRackModal(false);
            setSelectedProductForCustom(null);
          }}
          onAddRack={handleAddCustomRack}
          walls={entities.filter((e): e is WallEntity => e.type === 'wall')}
          initialProduct={selectedProductForCustom}
          availableProducts={activeProducts}
        />
      )}

      {/* AI Rack Planner Modal */}
      {showAIPlanner && (
        <AIPlannerModal
          entities={entities}
          roomShapeMode={viewportRef.current.roomShapeMode || 'AUTO'}
          onApply={(racks, dims) => {
            setAiPreviewRacks(racks);
            setAiPreviewDimensions(dims);
          }}
          onClose={handleCloseAIPlanner}
          onApplyFinal={handleApplyAILayout}
        />
      )}

      {/* Customer Share Modal */}
      {showShareModal && (
        <ShareModal
          projectId={projectData?.surveyId || projectId}
          storeName={projectData?.title || 'Retail Store'}
          isOpen={showShareModal}
          onClose={() => setShowShareModal(false)}
        />
      )}

      {/* Unsaved Changes Exit Confirmation Modal */}
      {showExitConfirmDialog && (
        <div id="exit-confirm-dialog" className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Unsaved Changes</h3>
                <p className="text-xs text-slate-400">You have unsaved changes in your layout.</p>
              </div>
            </div>
            <p className="text-sm text-slate-300">
              Exiting now without saving will permanently discard changes made during this session.
            </p>
            <div className="flex flex-col sm:flex-row items-center gap-2 pt-2 border-t border-slate-800">
              <button
                id="btn-exit-save"
                onClick={async () => {
                  await handleManualSave(false);
                  setShowExitConfirmDialog(false);
                  if (onExit) onExit();
                }}
                className="w-full sm:w-auto flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-md shadow-emerald-950/40 touch-manipulation transition-colors"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save & Exit</span>
              </button>
              <button
                id="btn-exit-discard"
                onClick={() => {
                  setShowExitConfirmDialog(false);
                  if (onExit) onExit();
                }}
                className="w-full sm:w-auto py-2 px-3 bg-red-950/60 hover:bg-red-900/60 text-red-200 hover:text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 border border-red-800/40 touch-manipulation transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Discard & Exit</span>
              </button>
              <button
                id="btn-exit-cancel"
                onClick={() => setShowExitConfirmDialog(false)}
                className="w-full sm:w-auto py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold flex items-center justify-center touch-manipulation transition-colors"
              >
                Keep Editing
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile More Tools Bottom Sheet */}
      {showMobileMoreTools && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border-t border-slate-800 rounded-t-2xl p-4 max-h-[75vh] overflow-y-auto pb-safe shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
              <span className="font-bold text-white text-sm">All CAD Tools & Modes</span>
              <button
                onClick={() => setShowMobileMoreTools(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Feature Launchers: AI Planner & 3D Store View */}
            <div className="grid grid-cols-2 gap-2 mb-3">
              <button
                id="btn-more-tools-ai-planner"
                onClick={() => {
                  setShowMobileMoreTools(false);
                  setShowAIPlanner(true);
                }}
                className="flex items-center gap-2 p-2.5 rounded-xl bg-gradient-to-r from-violet-700 to-indigo-700 active:from-violet-600 active:to-indigo-600 text-white font-bold text-xs shadow-md shadow-violet-950/50"
              >
                <Sparkles className="w-4 h-4 text-violet-200 shrink-0" />
                <div className="flex flex-col text-left">
                  <span>AI Rack Planner</span>
                  <span className="text-[9px] text-violet-200 font-normal">Auto placement</span>
                </div>
              </button>

              <button
                id="btn-more-tools-3d-view"
                onClick={() => {
                  setShowMobileMoreTools(false);
                  setViewMode(viewMode === '3D' ? '2D' : '3D');
                }}
                className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-800 active:bg-slate-700 border border-slate-700 text-white font-bold text-xs shadow"
              >
                <Box className="w-4 h-4 text-retailfix-red-400 shrink-0" />
                <div className="flex flex-col text-left">
                  <span>{viewMode === '3D' ? '2D CAD Layout' : '3D Store View'}</span>
                  <span className="text-[9px] text-slate-400 font-normal">Switch perspective</span>
                </div>
              </button>
            </div>

            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Drawing & Entity Tools</div>

            <div className="grid grid-cols-3 gap-2.5">
              {[
                { tool: 'wall', label: 'Wall', icon: Square },
                { tool: 'rack', label: 'Racks', icon: ShoppingBag },
                { tool: 'partition', label: 'Partition', icon: Layers },
                { tool: 'column', label: 'Column', icon: Box },
                { tool: 'door', label: 'Door', icon: DoorOpen },
                { tool: 'window', label: 'Window', icon: Maximize2 },
                { tool: 'shutter', label: 'Shutter', icon: Sliders },
                { tool: 'gate', label: 'Security Gate', icon: Shield },
                { tool: 'glass_gate', label: 'Glass Gate', icon: Sliders },
                { tool: 'text', label: 'Text Note', icon: Type },
                { tool: 'eraser', label: 'Eraser', icon: Trash2 },
              ].map((item) => {
                const Icon = item.icon;
                const isActive = activeTool === item.tool;
                return (
                  <button
                    key={item.tool}
                    onClick={() => {
                      setShowMobileMoreTools(false);
                      if (item.tool === 'rack') {
                        setShowRackMenu(true);
                        setPlacementModeTool(null);
                        return;
                      }
                      setActiveTool(item.tool as ToolType);
                      if (['door', 'window', 'shutter', 'gate', 'glass_gate', 'column'].includes(item.tool)) {
                        setPlacementModeTool(item.tool as ToolType);
                        setShowMobileProps(true);
                        setTabletInspectorOpen(true);
                      } else {
                        setPlacementModeTool(null);
                      }
                      setActiveDrawingPoints([]);
                    }}
                    className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all ${
                      isActive
                        ? 'bg-retailfix-red-600 text-white border-retailfix-red-500 shadow-lg shadow-red-900/40'
                        : 'bg-slate-800/80 text-slate-200 border-slate-700 active:bg-slate-700'
                    }`}
                  >
                    <Icon className="w-5 h-5 mb-1.5" />
                    <span className="text-xs font-semibold text-center">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Mobile More Actions Menu Modal */}
      {showMobileMoreMenu && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border-t border-slate-800 rounded-t-2xl p-4 max-h-[85vh] overflow-y-auto pb-safe shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div>
                <span className="font-extrabold text-white text-sm">Project Actions</span>
                <span className="text-slate-400 text-xs block font-mono">{projectData?.surveyId || projectId} ({revision})</span>
              </div>
              <button
                onClick={() => setShowMobileMoreMenu(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Actions Grid */}
            <div className="grid grid-cols-2 gap-2">
              <button
                id="btn-more-menu-ai-planner"
                onClick={() => {
                  setShowMobileMoreMenu(false);
                  setShowAIPlanner(true);
                }}
                className="p-2.5 rounded-xl bg-gradient-to-r from-violet-700 to-indigo-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow"
              >
                <Sparkles className="w-4 h-4" /> AI Planner
              </button>

              <button
                id="btn-more-menu-3d-view"
                onClick={() => {
                  setShowMobileMoreMenu(false);
                  setViewMode(viewMode === '3D' ? '2D' : '3D');
                }}
                className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow"
              >
                <Box className="w-4 h-4 text-retailfix-red-400" /> {viewMode === '3D' ? '2D CAD' : '3D Store'}
              </button>

              <button
                onClick={() => {
                  setShowMobileMoreMenu(false);
                  setShowShareModal(true);
                }}
                className="p-2.5 rounded-xl bg-emerald-600 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow"
              >
                <Share2 className="w-4 h-4" /> Share
              </button>

              <button
                onClick={() => {
                  setShowMobileMoreMenu(false);
                  handleDownloadPDF();
                }}
                disabled={isExporting}
                className="p-2.5 rounded-xl bg-retailfix-red-600 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow"
              >
                <FileDown className="w-4 h-4" /> Export PDF
              </button>

              <button
                onClick={() => {
                  setShowMobileMoreMenu(false);
                  handleDownloadPNG();
                }}
                disabled={isExporting}
                className="p-2.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 font-bold text-xs flex items-center justify-center gap-1.5"
              >
                <Download className="w-4 h-4" /> Export PNG
              </button>

              <button
                onClick={() => {
                  setShowMobileMoreMenu(false);
                  handleDownloadDXF();
                }}
                className="col-span-2 p-2.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 font-bold text-xs flex items-center justify-center gap-1.5"
              >
                <Download className="w-4 h-4" /> Export DXF
              </button>

              <button
                onClick={() => {
                  setShowMobileMoreMenu(false);
                  handleSelectAllCenterRacks();
                }}
                className="col-span-2 p-2.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 font-bold text-xs flex items-center justify-center gap-1.5"
              >
                Select All Center Racks ({entities.filter(isCenterRackEntity).length})
              </button>

              {isAdmin && (
                <button
                  onClick={() => {
                    setShowMobileMoreMenu(false);
                    const nextRev = `REV ${revisionsList.length + 1}`;
                    handleManualSave(true, nextRev);
                  }}
                  className="col-span-2 p-2.5 rounded-xl bg-slate-800 border border-slate-700 text-retailfix-red-400 font-bold text-xs flex items-center justify-center gap-1.5"
                >
                  + Create New Revision
                </button>
              )}
            </div>

            {/* Overlays & Snaps Toggles */}
            <div className="pt-2 border-t border-slate-800 space-y-2">
              <span className="text-slate-400 text-xs font-bold uppercase tracking-wider block">CAD Display & Snaps</span>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  onClick={() => setShowGrid(!showGrid)}
                  className={`p-2 rounded-lg border text-left font-medium ${showGrid ? 'bg-slate-800 border-retailfix-red-500/50 text-white' : 'bg-slate-900 border-slate-800 text-slate-400'}`}
                >
                  Grid: {showGrid ? 'ON' : 'OFF'}
                </button>
                <button
                  onClick={() => setGridSnap(!gridSnap)}
                  className={`p-2 rounded-lg border text-left font-medium ${gridSnap ? 'bg-slate-800 border-retailfix-red-500/50 text-white' : 'bg-slate-900 border-slate-800 text-slate-400'}`}
                >
                  Snap: {gridSnap ? 'ON' : 'OFF'}
                </button>
                <button
                  onClick={() => setOrthoMode(!orthoMode)}
                  className={`p-2 rounded-lg border text-left font-medium ${orthoMode ? 'bg-slate-800 border-retailfix-red-500/50 text-white' : 'bg-slate-900 border-slate-800 text-slate-400'}`}
                >
                  Ortho: {orthoMode ? 'ON' : 'OFF'}
                </button>
                <button
                  onClick={() => setShowDimensions(!showDimensions)}
                  className={`p-2 rounded-lg border text-left font-medium ${showDimensions ? 'bg-slate-800 border-retailfix-red-500/50 text-white' : 'bg-slate-900 border-slate-800 text-slate-400'}`}
                >
                  Dimensions: {showDimensions ? 'ON' : 'OFF'}
                </button>
              </div>
            </div>

            {onExit && (
              <button
                onClick={() => {
                  setShowMobileMoreMenu(false);
                  onExit();
                }}
                className="w-full py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 font-bold text-xs"
              >
                Exit Project
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
