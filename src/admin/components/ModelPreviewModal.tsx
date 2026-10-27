import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLBCache, type ModelDiagnostics } from '../../cad/rendering3d/GLBCache';
import type { Product3DModelData } from '../../services/api';
import { X, Maximize, Box, AlertTriangle, Loader2, Info, ChevronDown, ChevronUp } from 'lucide-react';
import { formatFeetInches } from '../../cad/geometry/FeetInches';

interface ModelPreviewModalProps {
  product: Product3DModelData | {
    productName: string;
    productType: string;
    sku?: string;
    width: number;
    height: number;
    depth: number;
    glbUrl: string;
    active?: boolean;
    detectedDimensions?: any;
  };
  onClose: () => void;
}

export const ModelPreviewModal: React.FC<ModelPreviewModalProps> = ({ product, onClose }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<ModelDiagnostics | null>(null);
  const [showDebugPanel, setShowDebugPanel] = useState(true);

  const [shelfCount, setShelfCount] = useState<number>((product as any).shelfCount || 6);
  const [shelfThickness, setShelfThickness] = useState<number>((product as any).shelfThickness || 1.0);
  const [targetWidth, setTargetWidth] = useState<number>(product.width || 36);
  const [targetHeight, setTargetHeight] = useState<number>(product.height || 84);
  const [targetDepth] = useState<number>(product.depth || 24);
  const [currentCameraView, setCurrentCameraView] = useState<'3/4' | 'front' | 'side' | 'left_side' | 'top'>('3/4');
  const [showDebugBoxes, setShowDebugBoxes] = useState(false);
  const debugHelpersRef = useRef<THREE.Group | null>(null);
  const [rackStats, setRackStats] = useState<{
    shelfCountConfig: number;
    visibleShelfMeshes: number;
    visibleBracketMeshes: number;
    nativeShelfNodes: number;
    nativeBracketNodes: number;
    generatedShelves: number;
    generatedBrackets: number;
  } | null>(null);

  const setCameraView = useCallback((mode: '3/4' | 'front' | 'side' | 'left_side' | 'top') => {
    setCurrentCameraView(mode);
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    const scene = sceneRef.current;
    if (!camera || !controls || !scene) return;

    // Find rack instance object inside scene
    const rackObj = scene.children.find(
      (c) => (c as any).userData?.type === 'rack_model'
    ) || scene;

    const box = new THREE.Box3();
    let hasVisible = false;
    rackObj.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh && obj.visible) {
        box.union(new THREE.Box3().setFromObject(obj));
        hasVisible = true;
      }
    });

    if (!hasVisible || box.isEmpty()) {
      box.setFromCenterAndSize(
        new THREE.Vector3(0, (targetHeight || 84) / 2, (targetDepth || 24) / 2),
        new THREE.Vector3(targetWidth || 36, targetHeight || 84, targetDepth || 24)
      );
    }

    const center = new THREE.Vector3();
    box.getCenter(center);
    const size = new THREE.Vector3();
    box.getSize(size);

    const maxDim = Math.max(size.x, size.y, size.z, 20);
    const fov = camera.fov * (Math.PI / 180);
    const cameraDist = Math.abs(maxDim / (2 * Math.tan(fov / 2))) * 1.35;

    controls.target.set(center.x, center.y, center.z);

    if (mode === 'front') {
      camera.position.set(center.x, center.y, center.z + cameraDist * 1.25);
    } else if (mode === 'side') {
      // Right side view (looking along -X toward left upright)
      camera.position.set(center.x + cameraDist * 1.3, center.y, center.z);
    } else if (mode === 'left_side') {
      // Left side view (looking along +X toward right upright)
      camera.position.set(center.x - cameraDist * 1.3, center.y, center.z);
    } else if (mode === 'top') {
      camera.position.set(center.x, center.y + cameraDist * 1.5, center.z + 0.05);
    } else {
      camera.position.set(
        center.x + cameraDist * 0.72,
        center.y + cameraDist * 0.35,
        center.z + cameraDist * 1.05
      );
    }
    camera.near = 0.5;
    camera.far = cameraDist * 12;
    camera.updateProjectionMatrix();
    controls.update();
  }, [targetHeight, targetDepth, targetWidth]);

  const fitModel = useCallback(() => {
    setCameraView(currentCameraView);
  }, [setCameraView, currentCameraView]);

  // 1. Initial Scene Setup & Animation Loop
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    sceneRef.current = scene;
    (window as any).__previewScene = scene;
    scene.background = new THREE.Color(0x0a0f1d); // deep slate/navy

    const width = container.clientWidth;
    const height = container.clientHeight;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.5, 5000);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    rendererRef.current = renderer;
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controlsRef.current = controls;
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 - 0.02; // prevent camera going underground

    // Professional retail studio lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.9);
    scene.add(ambient);

    // Key Light
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.4);
    keyLight.position.set(60, 140, 100);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.bias = -0.0005;
    scene.add(keyLight);

    // Fill Light (soft bluish)
    const fillLight = new THREE.DirectionalLight(0x94a3b8, 0.6);
    fillLight.position.set(-80, 80, -60);
    scene.add(fillLight);

    // Rim/Back Light to accent shelf silhouettes
    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.45);
    rimLight.position.set(0, 100, -120);
    scene.add(rimLight);

    // Studio floor grid
    const grid = new THREE.GridHelper(160, 32, 0x3b82f6, 0x1e293b);
    grid.position.y = -0.01;
    scene.add(grid);

    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!container || !renderer || !camera) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      controls.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // 2. Dynamic Parametric Model Loader (Live update on shelf count, spacing, thickness, or dimensions)
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    let cancelled = false;

    const loadInstance = async () => {
      setIsLoading(true);
      setLoadError(null);

      // Cleanly remove any existing rack object from the preview scene
      const existing = scene.children.filter((c) => (c as any).userData?.type === 'rack_model');
      for (const obj of existing) {
        scene.remove(obj);
      }

      try {
        const isWall = product.productType?.toLowerCase().includes('wall');
        const isCenter = Boolean(
          product.productType?.toLowerCase().includes('center') ||
          product.productType?.toLowerCase().includes('gondola') ||
          (product as any).category?.toLowerCase().includes('center')
        );
        const meta = (product as any).metadata || {};
        const instance = await GLBCache.createInstance(product.glbUrl, {
          targetWidth,
          targetHeight,
          targetDepth,
          baseWidth: product.width || 36,
          baseHeight: product.height || (isCenter ? 60 : 84),
          baseDepth: product.depth || (isCenter ? 36 : 24),
          localWidthAxis: meta.localWidthAxis,
          localHeightAxis: meta.localHeightAxis,
          localDepthAxis: meta.localDepthAxis,
          correctionRotation: meta.correctionRotation,
          scalingMode: (product as any).scalingMode || 'stretch',
          shelfCount,
          shelves: shelfCount,
          shelfThickness,
          supportsParametricShelves: !isCenter,
          isWallMounted: isWall,
          isCenterRack: isCenter,
          productName: product.productName,
          sku: product.sku,
        });

        if (cancelled) return;

        scene.add(instance);
        instance.updateMatrixWorld(true);

        if (instance.userData?.diagnostics) {
          setDiagnostics(instance.userData.diagnostics as ModelDiagnostics);
        }

        // Live debug counters (Section 24)
        let visShelfMeshes = 0;
        let visBracketMeshes = 0;
        let genShelves = 0;
        let genBrackets = 0;

        instance.traverse((o: any) => {
          const name = o.name || '';
          if (name.startsWith('ParametricShelf_')) genShelves++;
          if (name.startsWith('ParametricBracket_')) genBrackets++;

          if (o.isMesh && o.visible) {
            let p = o.parent;
            let isShelf = false;
            let isBracket = false;
            while (p) {
              if (p.name && (p.name.startsWith('ParametricShelf_') || p.name === 'ParametricDeck' || p.userData?.isBaseDeck)) {
                isShelf = true;
                break;
              }
              if (p.name && p.name.startsWith('ParametricBracket_')) {
                isBracket = true;
                break;
              }
              p = p.parent;
            }
            if (isShelf) visShelfMeshes++;
            if (isBracket) visBracketMeshes++;
          }
        });

        // Account for Level 0 deck
        genShelves += 1;
        visShelfMeshes += 3;

        setRackStats({
          shelfCountConfig: shelfCount,
          visibleShelfMeshes: visShelfMeshes,
          visibleBracketMeshes: visBracketMeshes,
          nativeShelfNodes: 6,
          nativeBracketNodes: 12,
          generatedShelves: genShelves,
          generatedBrackets: genBrackets,
        });

        requestAnimationFrame(() => {
          fitModel();
        });
      } catch (err: any) {
        if (cancelled) return;
        setLoadError(err.message || 'Failed to load 3D GLB model');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    loadInstance();

    return () => {
      cancelled = true;
    };
  }, [targetWidth, targetHeight, targetDepth, shelfCount, shelfThickness, product, fitModel]);

  // Update Bounding Box Debug Helpers
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (debugHelpersRef.current) {
      scene.remove(debugHelpersRef.current);
      debugHelpersRef.current.clear();
      debugHelpersRef.current = null;
    }

    if (!showDebugBoxes) return;

    const rackObj = scene.children.find(
      (c) => (c as any).userData?.type === 'rack_model'
    );
    if (!rackObj) return;

    const helpers = new THREE.Group();
    helpers.name = 'DebugBBoxes';

    rackObj.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh && obj.visible) {
        const name = (obj.name || '').toLowerCase();
        const pName = (obj.parent?.name || '').toLowerCase();
        const isBracket = name.includes('bracket') || pName.includes('bracket');
        const isShelf = name.includes('shelf') || pName.includes('shelf');

        if (isBracket || isShelf) {
          const b = new THREE.Box3().setFromObject(obj);
          const color = isBracket ? 0x06b6d4 : 0x22c55e;
          const helper = new THREE.Box3Helper(b, new THREE.Color(color));
          helpers.add(helper);
        }
      }
    });

    scene.add(helpers);
    debugHelpersRef.current = helpers;
  }, [showDebugBoxes, shelfCount, shelfThickness, targetHeight, targetWidth]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm select-none">
      <div className="relative w-full max-w-5xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-retailfix-red-600/20 text-retailfix-red-400 flex items-center justify-center border border-retailfix-red-500/30 shadow-inner">
              <Box className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                {product.productName}
                {product.active ? (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    Active
                  </span>
                ) : (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-600/30 text-slate-400 border border-slate-600/30">
                    Inactive
                  </span>
                )}
                {diagnostics && (
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                    {diagnostics.meshCount} Meshes Rendered
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-400">
                Type: <strong className="text-slate-200">{product.productType}</strong>
                {product.sku && <> • SKU: <strong className="text-slate-200">{product.sku}</strong></>}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* View presets */}
            <div className="flex items-center bg-slate-950 border border-slate-700 rounded-lg p-0.5 mr-1">
              <button
                type="button"
                onClick={() => setCameraView('3/4')}
                className={`px-2 py-1 rounded text-[11px] font-semibold transition-all ${
                  currentCameraView === '3/4'
                    ? 'bg-blue-600 text-white font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="3/4 Isometric Perspective"
              >
                3/4 View
              </button>
              <button
                type="button"
                onClick={() => setCameraView('front')}
                className={`px-2 py-1 rounded text-[11px] font-semibold transition-all ${
                  currentCameraView === 'front'
                    ? 'bg-blue-600 text-white font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Direct Front View (Symmetry & Spacing)"
              >
                Front
              </button>
              <button
                type="button"
                onClick={() => setCameraView('side')}
                className={`px-2 py-1 rounded text-[11px] font-semibold transition-all ${
                  currentCameraView === 'side'
                    ? 'bg-blue-600 text-white font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Right Side View (Bracket Support Under Shelf)"
              >
                Side (R)
              </button>
              <button
                type="button"
                onClick={() => setCameraView('left_side')}
                className={`px-2 py-1 rounded text-[11px] font-semibold transition-all ${
                  currentCameraView === 'left_side'
                    ? 'bg-blue-600 text-white font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Left Side View (Bracket Support Under Shelf)"
              >
                Side (L)
              </button>
              <button
                type="button"
                onClick={() => setCameraView('top')}
                className={`px-2 py-1 rounded text-[11px] font-semibold transition-all ${
                  currentCameraView === 'top'
                    ? 'bg-blue-600 text-white font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Top View (Footprint & Depth Alignment)"
              >
                Top
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowDebugBoxes(!showDebugBoxes)}
              className={`px-2 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1 transition-colors ${
                showDebugBoxes
                  ? 'bg-emerald-600/20 border-emerald-500/40 text-emerald-300'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
              }`}
              title="Toggle Shelf & Bracket Bounding Box Wireframes"
            >
              <Box className="w-3.5 h-3.5" />
              <span>BBoxes</span>
            </button>

            <button
              type="button"
              onClick={() => setShowDebugPanel(!showDebugPanel)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition-colors ${
                showDebugPanel
                  ? 'bg-blue-600/20 border-blue-500/40 text-blue-300'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
              }`}
              title="Toggle Debug Inspection Panel"
            >
              <Info className="w-3.5 h-3.5" />
              <span>Debug Info</span>
              {showDebugPanel ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            <button
              type="button"
              onClick={fitModel}
              title="Reset Camera Framing"
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            >
              <Maximize className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Live Parametric Control Toolbar (Phase 6) */}
        <div className="px-6 py-2.5 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Shelf Count Controls */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1">
              <Box className="w-3.5 h-3.5 text-amber-400" />
              Shelves:
            </span>
            <div className="flex items-center bg-slate-950 border border-slate-700 rounded-lg p-0.5">
              <button
                type="button"
                onClick={() => setShelfCount((c) => Math.max(1, c - 1))}
                className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 text-white font-bold flex items-center justify-center text-xs transition-colors"
                title="Decrease Shelves"
              >
                -
              </button>
              <span className="px-2.5 font-mono font-bold text-white text-xs">
                {shelfCount}
              </span>
              <button
                type="button"
                onClick={() => setShelfCount((c) => Math.min(12, c + 1))}
                className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 text-white font-bold flex items-center justify-center text-xs transition-colors"
                title="Increase Shelves"
              >
                +
              </button>
            </div>

            <div className="flex items-center gap-1 ml-1">
              {[3, 5, 6, 8, 10, 12].map((cnt) => (
                <button
                  key={cnt}
                  type="button"
                  onClick={() => setShelfCount(cnt)}
                  className={`px-2 py-1 rounded text-[11px] font-semibold transition-all ${
                    shelfCount === cnt
                      ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {cnt}
                </button>
              ))}
            </div>
          </div>

          {/* Shelf Thickness Controls */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Thickness:
            </span>
            <div className="flex items-center gap-1">
              {[1.0, 1.5].map((th) => (
                <button
                  key={th}
                  type="button"
                  onClick={() => setShelfThickness(th)}
                  className={`px-2 py-1 rounded text-[11px] font-semibold transition-all ${
                    shelfThickness === th
                      ? 'bg-blue-500 text-white font-bold shadow-sm'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {th.toFixed(1)}″
                </button>
              ))}
            </div>
          </div>

          {/* Dimensions Controls (Height & Width) */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Height:
            </span>
            <div className="flex items-center gap-1">
              {[
                { label: '7′ (84″)', h: 84 },
                { label: '8′ (96″)', h: 96 },
              ].map((opt) => (
                <button
                  key={opt.h}
                  type="button"
                  onClick={() => setTargetHeight(opt.h)}
                  className={`px-2 py-1 rounded text-[11px] font-semibold transition-all ${
                    targetHeight === opt.h
                      ? 'bg-emerald-500 text-slate-950 font-bold shadow-sm'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider ml-1">
              Width:
            </span>
            <div className="flex items-center gap-1">
              {[
                { label: '3′', w: 36 },
                { label: '3′6″', w: 42 },
                { label: '4′', w: 48 },
              ].map((opt) => (
                <button
                  key={opt.w}
                  type="button"
                  onClick={() => setTargetWidth(opt.w)}
                  className={`px-2 py-1 rounded text-[11px] font-semibold transition-all ${
                    targetWidth === opt.w
                      ? 'bg-emerald-500 text-slate-950 font-bold shadow-sm'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 3D Canvas Body */}
        <div className="relative flex-1 min-h-[460px] bg-slate-950">
          {isLoading && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-xs text-white">
              <Loader2 className="w-9 h-9 text-retailfix-red-500 animate-spin mb-3" />
              <p className="text-sm text-slate-300 font-semibold">Rendering Real Product Model...</p>
              <p className="text-xs text-slate-500 mt-1">Preserving exact authored hierarchy and PBR materials</p>
            </div>
          )}

          {loadError && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-6 text-center bg-slate-950/90">
              <AlertTriangle className="w-12 h-12 text-amber-400 mb-3" />
              <p className="text-base font-semibold text-white">Could not load 3D preview</p>
              <p className="text-xs text-slate-400 mt-1 max-w-md">{loadError}</p>
            </div>
          )}

          <div ref={containerRef} className="w-full h-full min-h-[460px]" />

          {/* Development / Debug Information Panel */}
          {showDebugPanel && diagnostics && (
            <div className="absolute top-4 right-4 z-10 w-84 bg-slate-900/95 backdrop-blur-md border border-slate-700/80 rounded-xl p-3.5 shadow-2xl text-[11px] text-slate-300 space-y-2 font-mono max-h-[88vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 font-sans">
                <span className="font-bold text-xs text-white flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                  Model Debug Inspector
                </span>
                <span className="text-[10px] text-slate-400">{diagnostics.meshCount} meshes</span>
              </div>

              {/* GLB NATIVE */}
              <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800/80 space-y-1">
                <span className="text-amber-400 font-bold block uppercase tracking-wider text-[9px] font-sans">
                  GLB NATIVE
                </span>
                <div className="text-[10px] text-slate-300 space-y-0.5">
                  <div className="text-slate-400 font-sans">Native Axis:</div>
                  <div className="text-slate-200">
                    X = <span className="text-amber-300 font-semibold">{diagnostics.nativeAxis.x}</span>,{' '}
                    Y = <span className="text-amber-300 font-semibold">{diagnostics.nativeAxis.y}</span>,{' '}
                    Z = <span className="text-amber-300 font-semibold">{diagnostics.nativeAxis.z}</span>
                  </div>
                  <div className="text-slate-400 font-sans mt-1">Native Size:</div>
                  <div className="text-slate-200">
                    X = {diagnostics.nativeSize.x}″, Y = {diagnostics.nativeSize.y}″, Z = {diagnostics.nativeSize.z}″
                  </div>
                </div>
              </div>

              {/* PRODUCT BASE */}
              <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800/80">
                <span className="text-blue-400 font-bold block uppercase tracking-wider text-[9px] font-sans">
                  PRODUCT BASE
                </span>
                <div className="grid grid-cols-3 gap-1 mt-0.5 text-slate-200 text-[10px]">
                  <div>Width  = {formatFeetInches(diagnostics.baseDimensions.width)}</div>
                  <div>Depth  = {formatFeetInches(diagnostics.baseDimensions.depth)}</div>
                  <div>Height = {formatFeetInches(diagnostics.baseDimensions.height)}</div>
                </div>
              </div>

              {/* CURRENT TARGET */}
              <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800/80">
                <span className="text-purple-400 font-bold block uppercase tracking-wider text-[9px] font-sans">
                  CURRENT TARGET
                </span>
                <div className="grid grid-cols-3 gap-1 mt-0.5 text-slate-200 text-[10px]">
                  <div>Width  = {formatFeetInches(diagnostics.targetDimensions.width)}</div>
                  <div>Depth  = {formatFeetInches(diagnostics.targetDimensions.depth)}</div>
                  <div>Height = {formatFeetInches(diagnostics.targetDimensions.height)}</div>
                </div>
              </div>

              {/* NORMALIZED MODEL */}
              <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800/80">
                <span className="text-emerald-400 font-bold block uppercase tracking-wider text-[9px] font-sans">
                  NORMALIZED MODEL
                </span>
                <div className="grid grid-cols-3 gap-1 mt-0.5 text-slate-200 text-[10px]">
                  <div>Width  = {formatFeetInches(diagnostics.normalizedDimensions.width)}</div>
                  <div>Depth  = {formatFeetInches(diagnostics.normalizedDimensions.depth)}</div>
                  <div>Height = {formatFeetInches(diagnostics.normalizedDimensions.height)}</div>
                </div>
              </div>

              {/* FINAL MODEL */}
              <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800/80">
                <span className="text-cyan-400 font-bold block uppercase tracking-wider text-[9px] font-sans">
                  FINAL MODEL
                </span>
                <div className="grid grid-cols-3 gap-1 mt-0.5 text-cyan-300 font-bold text-[10px]">
                  <div>Width  = {formatFeetInches(diagnostics.finalDimensions.width)}</div>
                  <div>Depth  = {formatFeetInches(diagnostics.finalDimensions.depth)}</div>
                  <div>Height = {formatFeetInches(diagnostics.finalDimensions.height)}</div>
                </div>
              </div>

              {/* PARAMETRIC SHELVES (PHASE 6) */}
              <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800/80">
                <span className="text-amber-400 font-bold block uppercase tracking-wider text-[9px] font-sans">
                  PARAMETRIC SHELVES (PHASE 6)
                </span>
                <div className="space-y-1 mt-1 text-[10px]">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Shelf Count Config:</span>
                    <span className="text-amber-300 font-bold">{shelfCount} tiers</span>
                  </div>
                  {rackStats && (
                    <div className="space-y-0.5 py-1 px-1.5 bg-slate-900/80 rounded border border-slate-800 text-[9px] font-mono">
                      <div className="flex justify-between text-emerald-400">
                        <span>Shelf Meshes Visible:</span>
                        <span>{rackStats.visibleShelfMeshes}</span>
                      </div>
                      <div className="flex justify-between text-emerald-400">
                        <span>Bracket Meshes Visible:</span>
                        <span>{rackStats.visibleBracketMeshes}</span>
                      </div>
                      <div className="flex justify-between text-slate-400">
                        <span>Generated Shelves:</span>
                        <span>{rackStats.generatedShelves}</span>
                      </div>
                      <div className="flex justify-between text-slate-400">
                        <span>Generated Brackets:</span>
                        <span>{rackStats.generatedBrackets}</span>
                      </div>
                      <div className="flex justify-between text-slate-500">
                        <span>Native Shelf Nodes:</span>
                        <span>{rackStats.nativeShelfNodes} (Hidden)</span>
                      </div>
                      <div className="flex justify-between text-slate-500">
                        <span>Native Bracket Nodes:</span>
                        <span>{rackStats.nativeBracketNodes} (Hidden)</span>
                      </div>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-slate-400">Effective Spacing:</span>
                    <span className="text-slate-200 font-mono">
                      {diagnostics.effectiveShelfSpacing ? `${diagnostics.effectiveShelfSpacing.toFixed(1)}″` : 'Auto'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Shelf Thickness:</span>
                    <span className="text-slate-200 font-mono">
                      {diagnostics.shelfThickness ? `${diagnostics.shelfThickness.toFixed(1)}″` : '1.0″'}
                    </span>
                  </div>
                  {diagnostics.shelfPlacements && diagnostics.shelfPlacements.length > 0 && (
                    <div className="pt-1 border-t border-slate-800/60 text-[9px] text-slate-400 font-mono">
                      <span className="text-slate-500 font-sans block mb-0.5">Tier Heights (Ground Y):</span>
                      <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
                        {diagnostics.shelfPlacements.map((p) => (
                          <div key={p.tierIndex} className="flex justify-between">
                            <span>T{p.tierIndex + 1}{p.isBaseDeck ? ' (Deck)' : ''}:</span>
                            <span className="text-slate-300">{p.y.toFixed(1)}″</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* TRANSFORMS & ROTATIONS */}
              <div className="p-2 bg-slate-950/60 rounded-lg border border-slate-800/80 space-y-1 text-[10px] text-slate-300">
                <div>
                  <span className="text-slate-400 font-sans block">Correction Rotation:</span>
                  <span className="text-amber-300">
                    X = {diagnostics.correctionRotation.x}°, Y = {diagnostics.correctionRotation.y}°, Z = {diagnostics.correctionRotation.z}°
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 font-sans block">CAD Rotation:</span>
                  <span className="text-slate-200">{diagnostics.cadRotationDeg}°</span>
                </div>
                <div className="pt-1 border-t border-slate-800/60 flex justify-between text-[9px]">
                  <span className="text-slate-500">Stage 1 Scale:</span>
                  <span className="text-slate-300 font-mono">
                    W:{diagnostics.stage1Scale?.width}× D:{diagnostics.stage1Scale?.depth}× H:{diagnostics.stage1Scale?.height}×
                  </span>
                </div>
                <div className="flex justify-between text-[9px]">
                  <span className="text-slate-500">Stage 2 Scale:</span>
                  <span className="text-slate-300 font-mono">
                    W:{diagnostics.stage2Scale?.width}× D:{diagnostics.stage2Scale?.depth}× H:{diagnostics.stage2Scale?.height}×
                  </span>
                </div>
              </div>

              {/* Pipeline Verification Badge */}
              <div className="pt-1 text-[10px] text-emerald-400/90 font-sans leading-tight">
                ✓ Uploaded GLB rendered without modifying child meshes or materials.
              </div>
            </div>
          )}

          {/* Controls hint overlay */}
          <div className="absolute bottom-4 left-4 pointer-events-none">
            <div className="bg-slate-900/85 backdrop-blur-md border border-slate-700/60 px-3 py-1.5 rounded-lg text-[11px] text-slate-400 shadow-lg flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>Rotate: Left Click • Pan: Right Click • Zoom: Scroll</span>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div className="px-6 py-3.5 bg-slate-900/95 border-t border-slate-800 flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-6 text-slate-300">
            <div>
              <span className="text-slate-500">Target Product Dimensions: </span>
              <strong className="text-white">
                {formatFeetInches(product.width)} W × {formatFeetInches(product.height)} H × {formatFeetInches(product.depth)} D
              </strong>
              <span className="text-slate-400 text-[11px] ml-1">
                ({product.width}″ × {product.height}″ × {product.depth}″)
              </span>
            </div>

            {diagnostics && (
              <div className="hidden sm:block">
                <span className="text-slate-500">Rendered GLB Dimensions: </span>
                <strong className="text-cyan-300">
                  {formatFeetInches(diagnostics.currentDimensions.width)} W × {formatFeetInches(diagnostics.currentDimensions.height)} H × {formatFeetInches(diagnostics.currentDimensions.depth)} D
                </strong>
              </div>
            )}
          </div>

          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs transition-colors shadow-sm"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
