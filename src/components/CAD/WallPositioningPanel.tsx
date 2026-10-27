import React, { useState, useEffect, useMemo, useRef } from 'react';
import type {
  CADEntity,
  WallEntity,
  WallPositionAnchor,
  WallPlacementData,
  Point2D,
} from '../../cad/types';
import {
  WallPlacementEngine,
  type WallPlacementCalculationResult,
  type WallOption,
} from '../../cad/engine/WallPlacementEngine';
import { formatFeetInches } from '../../cad/geometry/FeetInches';
import {
  Check,
  X,
  Sliders,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
} from 'lucide-react';

interface WallPositioningPanelProps {
  /** Target entity type to place or edit */
  entityType: string;
  /** Existing entity being edited, if any */
  existingEntity?: CADEntity | null;
  /** All CAD entities currently in the scene */
  entities: CADEntity[];
  /** Manual or auto room polygon */
  roomPolygon?: Point2D[];
  /** Callback when user clicks Apply */
  onApply: (calcResult: WallPlacementCalculationResult) => void;
  /** Callback when user cancels creation mode */
  onCancel?: () => void;
  /** Real-time callback for canvas preview */
  onPreviewChange?: (calcResult: WallPlacementCalculationResult | null) => void;
  /** Optional pre-selected wall ID */
  initialWallId?: string;
  /** Header title override */
  title?: string;
}

export const WallPositioningPanel: React.FC<WallPositioningPanelProps> = ({
  entityType,
  existingEntity,
  entities,
  roomPolygon = [],
  onApply,
  onCancel,
  onPreviewChange,
  initialWallId,
  title,
}) => {
  const wallOptions: WallOption[] = useMemo(() => {
    return WallPlacementEngine.getWallOptions(entities);
  }, [entities]);

  // Determine initial wall ID
  const defaultWallId = useMemo(() => {
    if (initialWallId && wallOptions.some((w) => w.id === initialWallId)) {
      return initialWallId;
    }
    if (existingEntity && (existingEntity as any).properties?.attachedWallId) {
      const attId = (existingEntity as any).properties.attachedWallId;
      if (wallOptions.some((w) => w.id === attId)) return attId;
    }
    return wallOptions.length > 0 ? wallOptions[0].id : '';
  }, [initialWallId, existingEntity, wallOptions]);

  const [selectedWallId, setSelectedWallId] = useState<string>(defaultWallId);
  const [anchor, setAnchor] = useState<WallPositionAnchor>('start');

  // Explicit Feet and Inches state
  // Distance
  const [distFeet, setDistFeet] = useState<number>(8);
  const [distInches, setDistInches] = useState<number>(6);

  // Width (Along Wall)
  const defaultWidth = useMemo(() => {
    if (existingEntity) {
      const geom = (existingEntity as any).geometry;
      if (geom.width) return geom.width;
    }
    if (entityType === 'door') return 36;
    if (entityType === 'window') return 60; // 5'-0" default window
    if (entityType === 'shutter') return 96; // 8'-0"
    if (entityType === 'gate') return 48; // 4'-0"
    if (entityType === 'glass_gate') return 72; // 6'-0"
    if (entityType === 'column') return 24; // 2'-0"
    if (entityType === 'rack') return 36; // 3'-0"
    return 48;
  }, [entityType, existingEntity]);

  const [widthFeet, setWidthFeet] = useState<number>(Math.floor(defaultWidth / 12));
  const [widthInches, setWidthInches] = useState<number>(defaultWidth % 12);

  // Height
  const defaultHeight = useMemo(() => {
    if (existingEntity) {
      const geom = (existingEntity as any).geometry;
      if (geom.height) return geom.height;
    }
    if (entityType === 'door') return 84;
    if (entityType === 'window') return 48;
    if (entityType === 'shutter') return 96;
    if (entityType === 'gate') return 72;
    if (entityType === 'glass_gate') return 42;
    if (entityType === 'column') return 24;
    if (entityType === 'rack') return 84;
    return 84;
  }, [entityType, existingEntity]);

  const [heightFeet, setHeightFeet] = useState<number>(Math.floor(defaultHeight / 12));
  const [heightInches, setHeightInches] = useState<number>(defaultHeight % 12);

  // Depth (Inward projection for column / rack)
  const defaultDepth = useMemo(() => {
    if (existingEntity) {
      const geom = (existingEntity as any).geometry;
      if (entityType === 'column' && geom.height) return geom.height;
      if (geom.depth) return geom.depth;
    }
    if (entityType === 'column') return 24;
    if (entityType === 'rack') return 24;
    return 0;
  }, [entityType, existingEntity]);

  const [depthFeet, setDepthFeet] = useState<number>(Math.floor(defaultDepth / 12));
  const [depthInches, setDepthInches] = useState<number>(defaultDepth % 12);

  // Synchronize when existingEntity or initialWallId changes
  useEffect(() => {
    if (existingEntity) {
      const props = (existingEntity as any).properties || {};
      const geom = (existingEntity as any).geometry || {};
      const wp = props.wallPlacement as WallPlacementData | undefined;

      const targetWall = entities.find(
        (e): e is WallEntity => e.type === 'wall' && e.id === (wp?.wallId || props.attachedWallId)
      );

      if (targetWall) {
        setSelectedWallId(targetWall.id);

        let activeWp: WallPlacementData;
        if (wp && wp.wallId === targetWall.id) {
          activeWp = wp;
        } else {
          activeWp = WallPlacementEngine.derivePlacementFromGeometry(existingEntity, targetWall, 'start');
        }

        setAnchor(activeWp.anchor || 'start');

        const totalDist = activeWp.offsetInches || 0;
        setDistFeet(Math.floor(totalDist / 12));
        setDistInches(Math.round((totalDist % 12) * 8) / 8);

        const totalW = activeWp.widthInches || geom.width || 36;
        setWidthFeet(Math.floor(totalW / 12));
        setWidthInches(Math.round((totalW % 12) * 8) / 8);

        const totalH = activeWp.heightInches || geom.height || 84;
        setHeightFeet(Math.floor(totalH / 12));
        setHeightInches(Math.round((totalH % 12) * 8) / 8);

        const totalD = activeWp.depthInches || geom.depth || (entityType === 'column' ? geom.height : 24);
        setDepthFeet(Math.floor(totalD / 12));
        setDepthInches(Math.round((totalD % 12) * 8) / 8);
      }
    } else if (initialWallId) {
      setSelectedWallId(initialWallId);
    } else if (defaultWallId) {
      setSelectedWallId((prev) => prev || defaultWallId);
    }
  }, [existingEntity?.id, initialWallId, defaultWallId]);

  // Effective selected wall ID
  const effectiveWallId = useMemo(() => {
    if (selectedWallId && wallOptions.some((w) => w.id === selectedWallId)) {
      return selectedWallId;
    }
    return defaultWallId;
  }, [selectedWallId, wallOptions, defaultWallId]);

  // Selected wall entity
  const selectedWall = useMemo(() => {
    return entities.find((e): e is WallEntity => e.type === 'wall' && e.id === effectiveWallId);
  }, [entities, effectiveWallId]);

  // Calculate live placement
  const totalOffset = useMemo(() => {
    return Math.max(0, (distFeet || 0) * 12 + (distInches || 0));
  }, [distFeet, distInches]);

  const totalWidth = useMemo(() => {
    return Math.max(1, (widthFeet || 0) * 12 + (widthInches || 0));
  }, [widthFeet, widthInches]);

  const totalHeight = useMemo(() => {
    return Math.max(1, (heightFeet || 0) * 12 + (heightInches || 0));
  }, [heightFeet, heightInches]);

  const totalDepth = useMemo(() => {
    return Math.max(1, (depthFeet || 0) * 12 + (depthInches || 0));
  }, [depthFeet, depthInches]);

  const calcResult = useMemo<WallPlacementCalculationResult | null>(() => {
    if (!selectedWall) return null;

    return WallPlacementEngine.calculatePlacement({
      wall: selectedWall,
      anchor,
      offsetInches: totalOffset,
      widthInches: totalWidth,
      heightInches: totalHeight,
      depthInches: entityType === 'column' || entityType === 'rack' ? totalDepth : undefined,
      entityType,
      entityId: existingEntity?.id,
      roomPolygon,
      allEntities: entities,
    });
  }, [
    selectedWall,
    anchor,
    totalOffset,
    totalWidth,
    totalHeight,
    totalDepth,
    entityType,
    existingEntity,
    roomPolygon,
    entities,
  ]);

  // Propagate real-time preview to parent/canvas with signature memoization
  const lastEmittedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!onPreviewChange) return;

    if (!calcResult) {
      if (lastEmittedRef.current !== null) {
        lastEmittedRef.current = null;
        onPreviewChange(null);
      }
      return;
    }

    const sig = `${calcResult.isValid}_${calcResult.centerPoint.x}_${calcResult.centerPoint.y}_${calcResult.rotation}_${calcResult.wallPlacement.offsetInches}_${calcResult.wallPlacement.widthInches}_${calcResult.wallPlacement.depthInches}_${calcResult.wallPlacement.wallId}`;

    if (lastEmittedRef.current !== sig) {
      lastEmittedRef.current = sig;
      onPreviewChange(calcResult);
    }
  }, [calcResult, onPreviewChange]);

  useEffect(() => {
    return () => {
      if (onPreviewChange) onPreviewChange(null);
    };
  }, [onPreviewChange]);

  // Quick Preset Handlers
  const handlePresetStart = () => {
    setAnchor('start');
    setDistFeet(0);
    setDistInches(0);
  };

  const handlePresetCenter = () => {
    if (!selectedWall) return;
    const metrics = WallPlacementEngine.getWallMetrics(selectedWall);
    setAnchor('center');
    const centerOff = metrics.length / 2;
    setDistFeet(Math.floor(centerOff / 12));
    setDistInches(Math.round((centerOff % 12) * 8) / 8);
  };

  const handlePresetEnd = () => {
    setAnchor('end');
    setDistFeet(0);
    setDistInches(0);
  };

  // Anchor selection handler with anchor stability
  const handleAnchorChange = (newAnchor: WallPositionAnchor) => {
    if (newAnchor === anchor || !calcResult) {
      setAnchor(newAnchor);
      return;
    }

    // Keep current spatial position stable when toggling anchor
    const { startDist, endDist, centerDist } = calcResult.extents;
    const wallLen = calcResult.metrics.length;

    let newOffset = 0;
    switch (newAnchor) {
      case 'start':
        newOffset = startDist;
        break;
      case 'center':
        newOffset = centerDist;
        break;
      case 'end':
        newOffset = wallLen - endDist;
        break;
    }

    setAnchor(newAnchor);
    setDistFeet(Math.floor(newOffset / 12));
    setDistInches(Math.round((newOffset % 12) * 8) / 8);
  };

  const showDepth = entityType === 'column' || entityType === 'rack';

  const toolDisplayName = useMemo(() => {
    if (title) return title;
    const map: Record<string, string> = {
      door: 'Door',
      window: 'Window',
      shutter: 'Rolling Shutter',
      gate: 'Security Gate',
      glass_gate: 'Glass Gate',
      column: 'Wall Column',
      rack: 'Wall Rack',
    };
    return map[entityType] || entityType.replace('_', ' ').toUpperCase();
  }, [entityType, title]);

  return (
    <div className="bg-slate-900 border border-slate-700/80 rounded-xl p-3.5 space-y-3.5 text-xs text-slate-200 shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-retailfix-red-600 flex items-center justify-center text-white">
            <Sliders className="w-3.5 h-3.5" />
          </div>
          <div>
            <h4 className="font-bold text-white text-xs leading-none">
              {existingEntity ? `Edit ${toolDisplayName}` : `Place ${toolDisplayName}`}
            </h4>
            <span className="text-[10px] text-slate-400">Wall-attached positioning</span>
          </div>
        </div>
        {onCancel && (
          <button
            onClick={onCancel}
            className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800"
            title="Close"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* 1. Wall Dropdown */}
      <div>
        <label className="block text-[11px] font-semibold text-slate-300 mb-1 flex items-center justify-between">
          <span>Target Wall:</span>
          {selectedWall && (
            <span className="text-retailfix-red-400 font-mono text-[10px]">
              {formatFeetInches(WallPlacementEngine.getWallMetrics(selectedWall).length)}
            </span>
          )}
        </label>
        {wallOptions.length === 0 ? (
          <div className="text-amber-400 text-[11px] bg-amber-950/40 p-2 rounded border border-amber-800/50">
            No walls found. Draw walls first.
          </div>
        ) : (
          <div className="relative">
            <select
              value={effectiveWallId}
              onChange={(e) => setSelectedWallId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg py-1.5 px-2.5 text-xs text-white font-medium focus:ring-1 focus:ring-retailfix-red-500 outline-none appearance-none"
            >
              {wallOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        )}
      </div>

      {/* 2. Position Method & Quick Presets */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] font-semibold text-slate-300">Position From:</span>
          {/* Quick Presets */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handlePresetStart}
              className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
              title="Snap to Wall Start"
            >
              Start
            </button>
            <button
              type="button"
              onClick={handlePresetCenter}
              className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
              title="Center on Wall"
            >
              Center
            </button>
            <button
              type="button"
              onClick={handlePresetEnd}
              className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
              title="Snap to Wall End"
            >
              End
            </button>
          </div>
        </div>

        {/* Anchor Selector */}
        <div className="grid grid-cols-3 gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
          <button
            type="button"
            onClick={() => handleAnchorChange('start')}
            className={`py-1 text-[11px] font-medium rounded transition-colors ${
              anchor === 'start'
                ? 'bg-retailfix-red-600 text-white font-bold shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Start
          </button>
          <button
            type="button"
            onClick={() => handleAnchorChange('center')}
            className={`py-1 text-[11px] font-medium rounded transition-colors ${
              anchor === 'center'
                ? 'bg-retailfix-red-600 text-white font-bold shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Center
          </button>
          <button
            type="button"
            onClick={() => handleAnchorChange('end')}
            className={`py-1 text-[11px] font-medium rounded transition-colors ${
              anchor === 'end'
                ? 'bg-retailfix-red-600 text-white font-bold shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            End
          </button>
        </div>
      </div>

      {/* 3. Distance Input (Explicit Feet & Inches) */}
      <div>
        <label className="block text-[11px] font-semibold text-slate-300 mb-1">
          Distance from {anchor === 'start' ? 'Start' : anchor === 'end' ? 'End' : 'Start (Center)'}:
        </label>
        <div className="grid grid-cols-2 gap-2">
          <div className="relative">
            <input
              type="number"
              min={0}
              step={1}
              value={distFeet}
              onChange={(e) => setDistFeet(Math.max(0, parseInt(e.target.value, 10) || 0))}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg py-1.5 pl-2.5 pr-7 text-xs text-white font-mono focus:ring-1 focus:ring-retailfix-red-500 outline-none"
            />
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-[10px] pointer-events-none">
              ft
            </span>
          </div>
          <div className="relative">
            <input
              type="number"
              min={0}
              max={11.875}
              step={0.5}
              value={distInches}
              onChange={(e) => setDistInches(Math.max(0, parseFloat(e.target.value) || 0))}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg py-1.5 pl-2.5 pr-7 text-xs text-white font-mono focus:ring-1 focus:ring-retailfix-red-500 outline-none"
            />
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-[10px] pointer-events-none">
              in
            </span>
          </div>
        </div>
      </div>

      {/* 4. Tool Dimensions (Width, Height, Depth) */}
      <div className="space-y-2.5 pt-1 border-t border-slate-800/80">
        {/* Width Along Wall */}
        <div>
          <label className="block text-[11px] font-semibold text-slate-300 mb-1">
            Width (Along Wall):
          </label>
          <div className="grid grid-cols-2 gap-2">
            <div className="relative">
              <input
                type="number"
                min={0}
                step={1}
                value={widthFeet}
                onChange={(e) => setWidthFeet(Math.max(0, parseInt(e.target.value, 10) || 0))}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg py-1.5 pl-2.5 pr-7 text-xs text-white font-mono focus:ring-1 focus:ring-retailfix-red-500 outline-none"
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-[10px] pointer-events-none">
                ft
              </span>
            </div>
            <div className="relative">
              <input
                type="number"
                min={0}
                max={11.875}
                step={0.5}
                value={widthInches}
                onChange={(e) => setWidthInches(Math.max(0, parseFloat(e.target.value) || 0))}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg py-1.5 pl-2.5 pr-7 text-xs text-white font-mono focus:ring-1 focus:ring-retailfix-red-500 outline-none"
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-[10px] pointer-events-none">
                in
              </span>
            </div>
          </div>
        </div>

        {/* Height */}
        <div>
          <label className="block text-[11px] font-semibold text-slate-300 mb-1">Height:</label>
          <div className="grid grid-cols-2 gap-2">
            <div className="relative">
              <input
                type="number"
                min={0}
                step={1}
                value={heightFeet}
                onChange={(e) => setHeightFeet(Math.max(0, parseInt(e.target.value, 10) || 0))}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg py-1.5 pl-2.5 pr-7 text-xs text-white font-mono focus:ring-1 focus:ring-retailfix-red-500 outline-none"
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-[10px] pointer-events-none">
                ft
              </span>
            </div>
            <div className="relative">
              <input
                type="number"
                min={0}
                max={11.875}
                step={0.5}
                value={heightInches}
                onChange={(e) => setHeightInches(Math.max(0, parseFloat(e.target.value) || 0))}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg py-1.5 pl-2.5 pr-7 text-xs text-white font-mono focus:ring-1 focus:ring-retailfix-red-500 outline-none"
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-[10px] pointer-events-none">
                in
              </span>
            </div>
          </div>
        </div>

        {/* Depth (Only for Column and Rack) */}
        {showDepth && (
          <div>
            <label className="block text-[11px] font-semibold text-slate-300 mb-1">
              Depth (Into Room):
            </label>
            <div className="grid grid-cols-2 gap-2">
              <div className="relative">
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={depthFeet}
                  onChange={(e) => setDepthFeet(Math.max(0, parseInt(e.target.value, 10) || 0))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg py-1.5 pl-2.5 pr-7 text-xs text-white font-mono focus:ring-1 focus:ring-retailfix-red-500 outline-none"
                />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-[10px] pointer-events-none">
                  ft
                </span>
              </div>
              <div className="relative">
                <input
                  type="number"
                  min={0}
                  max={11.875}
                  step={0.5}
                  value={depthInches}
                  onChange={(e) => setDepthInches(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg py-1.5 pl-2.5 pr-7 text-xs text-white font-mono focus:ring-1 focus:ring-retailfix-red-500 outline-none"
                />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-[10px] pointer-events-none">
                  in
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 5. Live Validation / Status Banner */}
      {calcResult && (
        <div className="pt-1">
          {!calcResult.isValid && calcResult.errorMessage && (
            <div className="bg-red-950/50 border border-red-800/80 rounded-lg p-2 flex items-start gap-2 text-red-300 text-[11px]">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div>
                <strong className="block text-red-200">Invalid Placement</strong>
                <span>{calcResult.errorMessage}</span>
              </div>
            </div>
          )}

          {calcResult.isValid && calcResult.warningMessage && (
            <div className="bg-amber-950/50 border border-amber-800/80 rounded-lg p-2 flex items-start gap-2 text-amber-300 text-[11px]">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <strong className="block text-amber-200">Warning</strong>
                <span>{calcResult.warningMessage}</span>
              </div>
            </div>
          )}

          {calcResult.isValid && !calcResult.warningMessage && (
            <div className="bg-emerald-950/40 border border-emerald-800/60 rounded-lg p-2 flex items-center justify-between text-emerald-300 text-[11px]">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>
                  Span: {formatFeetInches(calcResult.extents.startDist)} →{' '}
                  {formatFeetInches(calcResult.extents.endDist)}
                </span>
              </div>
              <span className="text-[10px] text-emerald-400/80 font-mono">
                Wall {selectedWall ? wallOptions.find((w) => w.id === selectedWall.id)?.index : ''}
              </span>
            </div>
          )}
        </div>
      )}

      {/* 6. Action Buttons */}
      <div className="flex items-center gap-2 pt-1 border-t border-slate-800">
        <button
          type="button"
          onClick={() => {
            if (calcResult && calcResult.isValid) {
              onApply(calcResult);
            }
          }}
          disabled={!calcResult || !calcResult.isValid}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-md ${
            calcResult && calcResult.isValid
              ? 'bg-retailfix-red-600 hover:bg-retailfix-red-500 text-white cursor-pointer hover:shadow-red-900/40'
              : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/50'
          }`}
        >
          <Check className="w-3.5 h-3.5" />
          {existingEntity ? 'Apply' : 'Place on Wall'}
        </button>

        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="py-2 px-3 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors border border-slate-700"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
};
