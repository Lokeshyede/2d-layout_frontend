import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { CADEntity } from '../types';
import { CADTo3DConverter, type Converted3DScene } from '../converters/CADTo3DConverter';
import { ProductModelRegistry } from '../services/ProductModelRegistry';
import { type ModelDiagnostics } from './GLBCache';
import { formatFeetInches } from '../geometry/FeetInches';
import { WalkController, type WalkDiagnostics } from './walk/WalkController';
import { TouchControlsOverlay } from './walk/TouchControlsOverlay';
import { CameraFramingEngine, type CameraPreset, type CameraFramingResult } from './CameraFramingEngine';
import { worldUnitsToFeet } from './PhysicalScale';
import {
  Maximize,
  Eye,
  Compass,
  Layers,
  Box,
  Loader2,
  Activity,
  Terminal,
  X,
  Footprints,
  MousePointer2,
  Video,
  Camera,
  RefreshCw,
  Shield,
} from 'lucide-react';
import { ExportWalkthroughModal } from './walkthrough/ExportWalkthroughModal';

interface Store3DViewerProps {
  entities: CADEntity[];
  onBackTo2D?: () => void;
  projectId?: string;
  storeName?: string;
  isCustomerMode?: boolean;
  initialViewMode?: 'orbit' | 'walk';
  allowVideoExport?: boolean;
  onSceneReady?: () => void;
}

export type ViewMode = 'orbit' | 'walk';
export type { CameraPreset };

export interface SelectedRackInfo {
  entityId?: string;
  productName: string;
  sku: string;
  rackType: string;
  width: number;
  depth: number;
  height: number;
  isCustom?: boolean;
  isWallMounted?: boolean;
}

export const Store3DViewer: React.FC<Store3DViewerProps> = ({
  entities,
  onBackTo2D,
  projectId = 'Store',
  storeName = 'Retail Store',
  isCustomerMode = false,
  initialViewMode = 'orbit',
  allowVideoExport = true,
  onSceneReady,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const convertedSceneRef = useRef<Converted3DScene | null>(null);
  const animationFrameIdRef = useRef<number | null>(null);

  // View Preset & Mode
  const [activePreset, setActivePreset] = useState<CameraPreset>('iso');
  const activePresetRef = useRef<CameraPreset>('iso');
  const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode);
  const viewModeRef = useRef<ViewMode>(initialViewMode);
  const [webglError, setWebglError] = useState<string | null>(null);

  const toggleFullscreen = () => {
    const el = containerRef.current?.parentElement || containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  // Walk Controller & Saved Camera State (Section 29 & 30)
  const walkControllerRef = useRef<WalkController | null>(null);
  const savedOrbitStateRef = useRef<{
    position: THREE.Vector3;
    target: THREE.Vector3;
    fov: number;
  } | null>(null);
  const [isPointerLocked, setIsPointerLocked] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);

  // Collision Debug State (Section 37 & 38)
  const [showCollisionDebug, setShowCollisionDebug] = useState(false);
  const showCollisionDebugRef = useRef(false);
  const [walkDiagnostics, setWalkDiagnostics] = useState<WalkDiagnostics | null>(null);
  const collisionDebugGroupRef = useRef<THREE.Group | null>(null);

  // Camera Framing Diagnostic State (Section 27: Camera Debug Mode)
  const [showCameraDebug, setShowCameraDebug] = useState(false);
  const [cameraDebugInfo, setCameraDebugInfo] = useState<{
    storeFt: string;
    worldDimensions: string;
    cameraPosition: string;
    cameraTarget: string;
    cameraDistance: string;
    fov: number;
    aspect: string;
    bounds: string;
    padding: string;
    preset: string;
    ratio: string;
  } | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState<{
    racksCount: number;
    wallsCount: number;
    openingsCount: number;
    columnsCount: number;
  }>({
    racksCount: 0,
    wallsCount: 0,
    openingsCount: 0,
    columnsCount: 0,
  });

  const [showAttachmentDebug, setShowAttachmentDebug] = useState(false);
  const [showCeiling, setShowCeiling] = useState(false);
  const [showGLBDiagnostics, setShowGLBDiagnostics] = useState(false);
  const [selectedRackDiagnostics, setSelectedRackDiagnostics] = useState<ModelDiagnostics | null>(null);
  const [selectedRackInfo, setSelectedRackInfo] = useState<SelectedRackInfo | null>(null);
  const highlightBoxRef = useRef<THREE.BoxHelper | null>(null);

  // Check if device supports touch
  const isTouchDevice =
    typeof window !== 'undefined' &&
    ('ontouchstart' in window || navigator.maxTouchPoints > 0);

  /**
   * Updates development diagnostic HUD state (Section 27: Camera Debug Mode)
   */
  const updateDiagnostics = useCallback((res: CameraFramingResult, converted: Converted3DScene) => {
    const size = converted.metrics.size;
    const bounds = converted.metrics.bounds;
    const storeW_ft = worldUnitsToFeet(size.x).toFixed(1);
    const storeL_ft = worldUnitsToFeet(size.z).toFixed(1);
    const storeH_ft = worldUnitsToFeet(size.y).toFixed(1);

    setCameraDebugInfo({
      storeFt: `${storeW_ft}' × ${storeL_ft}'`,
      worldDimensions: `W = ${size.x.toFixed(0)}" (${storeW_ft}'), L = ${size.z.toFixed(0)}" (${storeL_ft}'), H = ${size.y.toFixed(0)}" (${storeH_ft}')`,
      cameraPosition: `(${res.position.x.toFixed(0)}, ${res.position.y.toFixed(0)}, ${res.position.z.toFixed(0)})`,
      cameraTarget: `(${res.target.x.toFixed(0)}, ${res.target.y.toFixed(0)}, ${res.target.z.toFixed(0)})`,
      cameraDistance: `${res.distance.toFixed(0)}" (${(res.distance / 12).toFixed(1)} ft)`,
      fov: res.fov,
      aspect: res.aspect.toFixed(2),
      bounds: `[${bounds.min.x.toFixed(0)}, ${bounds.min.z.toFixed(0)}] to [${bounds.max.x.toFixed(0)}, ${bounds.max.z.toFixed(0)}]`,
      padding: `${Math.round((res.paddingFactor - 1) * 100)}%`,
      preset: res.preset,
      ratio: (size.z / size.x).toFixed(2),
    });
  }, []);

  /**
   * Centralized Camera Framing: Fits camera to the actual visible store bounds
   * for any requested preset (iso, top, front, side, or orbit).
   */
  const fitCameraToStore = useCallback(
    (targetPreset: CameraPreset = 'iso') => {
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      const converted = convertedSceneRef.current;
      const container = containerRef.current;
      if (!camera || !controls || !converted) return;

      const width = container?.clientWidth || window.innerWidth;
      const height = container?.clientHeight || window.innerHeight;
      const aspect = width / height;

      const res = CameraFramingEngine.fitCameraToStore(
        camera,
        controls,
        converted.metrics,
        targetPreset,
        aspect
      );

      activePresetRef.current = targetPreset;
      setActivePreset(targetPreset);
      updateDiagnostics(res, converted);
    },
    [updateDiagnostics]
  );

  /**
   * AUTO FIT / FIT STORE (Section 11)
   * Recalculates actual visible store bounds and refits camera with zero distortion
   * and professional padding without altering the active preset or viewing angle.
   */
  const autoFitStore = useCallback(() => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    const converted = convertedSceneRef.current;
    const container = containerRef.current;
    if (!camera || !controls || !converted) return;

    const width = container?.clientWidth || window.innerWidth;
    const height = container?.clientHeight || window.innerHeight;
    const aspect = width / height;

    if (activePresetRef.current === 'orbit') {
      const res = CameraFramingEngine.fitCameraFromCurrentAngle(
        camera,
        controls,
        converted.metrics,
        aspect
      );
      updateDiagnostics(res, converted);
    } else {
      fitCameraToStore(activePresetRef.current);
    }
  }, [fitCameraToStore, updateDiagnostics]);

  /**
   * RESET VIEW (Section 12)
   * Restores initial 3/4 axonometric isometric view with store bounds auto-framing.
   */
  const resetView = useCallback(() => {
    if (viewModeRef.current === 'walk') {
      walkControllerRef.current?.disable();
      setIsPointerLocked(false);
      viewModeRef.current = 'orbit';
      setViewMode('orbit');
      if (controlsRef.current) {
        controlsRef.current.enabled = true;
      }
    }
    fitCameraToStore('iso');
  }, [fitCameraToStore]);

  /**
   * Switches view preset (3D, Isometric, Top, Front, Side)
   */
  const switchPreset = useCallback(
    (newPreset: CameraPreset) => {
      if (viewModeRef.current === 'walk') {
        walkControllerRef.current?.disable();
        setIsPointerLocked(false);
        viewModeRef.current = 'orbit';
        setViewMode('orbit');
        if (controlsRef.current) {
          controlsRef.current.enabled = true;
        }
        if (cameraRef.current) {
          cameraRef.current.fov = CameraFramingEngine.DEFAULT_FOV;
          cameraRef.current.near = 1;
          cameraRef.current.far = 50000;
          cameraRef.current.updateProjectionMatrix();
        }
        if (collisionDebugGroupRef.current && sceneRef.current) {
          sceneRef.current.remove(collisionDebugGroupRef.current);
          collisionDebugGroupRef.current = null;
        }
      }

      if (newPreset === 'orbit') {
        activePresetRef.current = 'orbit';
        setActivePreset('orbit');
        if (cameraRef.current) {
          cameraRef.current.up.set(0, 1, 0);
          if (controlsRef.current) {
            controlsRef.current.maxPolarAngle = Math.PI / 2 - 0.02;
          }
        }
      } else {
        fitCameraToStore(newPreset);
      }
    },
    [fitCameraToStore]
  );

  // Switch between Walk and Orbit views (Section 29 & 30)
  const switchViewMode = useCallback(
    (newMode: ViewMode) => {
      if (newMode === viewModeRef.current) return;

      if (newMode === 'walk') {
        // 1. Save Orbit camera state before entering Walk (Section 29 & 30)
        if (cameraRef.current && controlsRef.current) {
          savedOrbitStateRef.current = {
            position: cameraRef.current.position.clone(),
            target: controlsRef.current.target.clone(),
            fov: cameraRef.current.fov,
          };
        }

        // 2. Disable OrbitControls
        if (controlsRef.current) {
          controlsRef.current.enabled = false;
        }

        // 3. Initialize or Enable WalkController
        if (!walkControllerRef.current && cameraRef.current && containerRef.current) {
          walkControllerRef.current = new WalkController({
            camera: cameraRef.current,
            domElement: containerRef.current,
            entities,
            roomPolygon: convertedSceneRef.current?.roomPolygon || [],
            racksGroup: convertedSceneRef.current?.racksGroup,
            eyeHeight: 66.0,
            onPointerLockChange: (locked) => setIsPointerLocked(locked),
          });
        }

        // Calculate preferred orientation & spawn from current Orbit view
        let preferredYaw: number | undefined;
        let preferredPos: { x: number; y: number } | undefined;
        if (controlsRef.current && cameraRef.current) {
          const dx = controlsRef.current.target.x - cameraRef.current.position.x;
          const dz = controlsRef.current.target.z - cameraRef.current.position.z;
          preferredYaw = Math.atan2(-dx, -dz);
          preferredPos = { x: controlsRef.current.target.x, y: controlsRef.current.target.z };
        }

        walkControllerRef.current?.enable(entities, preferredPos, preferredYaw);
        viewModeRef.current = 'walk';
        setViewMode('walk');

        // If collision debug is active, refresh the debug visualization
        if (showCollisionDebugRef.current && sceneRef.current && walkControllerRef.current && cameraRef.current) {
          if (collisionDebugGroupRef.current) {
            sceneRef.current.remove(collisionDebugGroupRef.current);
          }
          const dbg = walkControllerRef.current.collisionEngine.createDebugVisualization({
            x: cameraRef.current.position.x,
            y: cameraRef.current.position.z,
          });
          collisionDebugGroupRef.current = dbg;
          sceneRef.current.add(dbg);
          setWalkDiagnostics(walkControllerRef.current.getDiagnostics());
        }
      } else {
        // Leaving walk mode (Section 30)
        if (viewModeRef.current === 'walk') {
          walkControllerRef.current?.disable();
          setIsPointerLocked(false);
        }

        // Remove collision debug if active
        if (collisionDebugGroupRef.current && sceneRef.current) {
          sceneRef.current.remove(collisionDebugGroupRef.current);
          collisionDebugGroupRef.current = null;
        }
        setShowCollisionDebug(false);
        showCollisionDebugRef.current = false;
        setWalkDiagnostics(null);

        // Re-enable OrbitControls
        if (controlsRef.current) {
          controlsRef.current.enabled = true;
        }

        // Restore previous Orbit camera state
        if (savedOrbitStateRef.current && cameraRef.current && controlsRef.current) {
          cameraRef.current.position.copy(savedOrbitStateRef.current.position);
          controlsRef.current.target.copy(savedOrbitStateRef.current.target);
          cameraRef.current.fov = savedOrbitStateRef.current.fov;
          cameraRef.current.near = 1;
          cameraRef.current.far = 50000;
          cameraRef.current.updateProjectionMatrix();
          controlsRef.current.update();
        } else {
          if (cameraRef.current) {
            cameraRef.current.fov = CameraFramingEngine.DEFAULT_FOV;
            cameraRef.current.near = 1;
            cameraRef.current.far = 50000;
            cameraRef.current.updateProjectionMatrix();
          }
          fitCameraToStore(activePresetRef.current);
        }

        viewModeRef.current = 'orbit';
        setViewMode('orbit');
      }
    },
    [entities, fitCameraToStore]
  );

  const switchViewModeRef = useRef(switchViewMode);
  switchViewModeRef.current = switchViewMode;
  const fitCameraToStoreRef = useRef(fitCameraToStore);
  fitCameraToStoreRef.current = fitCameraToStore;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // 1. Setup Three.js Scene, Camera, Renderer
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0x0f172a); // dark slate (slate-900)

    const width = container.clientWidth;
    const height = container.clientHeight;

    const camera = new THREE.PerspectiveCamera(52, width / height, 1, 50000);
    cameraRef.current = camera;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: true,
      });
    } catch (err: any) {
      console.error('[Store3DViewer] WebGL initialization failed:', err);
      setWebglError(
        'WebGL 3D graphics hardware acceleration could not be initialized on this device or browser. Please ensure WebGL is enabled in your browser settings.'
      );
      setIsLoading(false);
      return;
    }

    rendererRef.current = renderer;
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    container.appendChild(renderer.domElement);

    // 2. Setup OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controlsRef.current = controls;
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 - 0.02; // prevent clipping beneath floor
    controls.minDistance = 10;
    controls.maxDistance = 25000;

    // Rack selection subtle visual highlight helper (Section 23)
    const highlightBox = new THREE.BoxHelper(new THREE.Mesh(), 0x10b981);
    highlightBox.name = 'RackSelectionHighlight';
    highlightBox.visible = false;
    scene.add(highlightBox);
    highlightBoxRef.current = highlightBox;

    // When user orbits manually, update activePreset to 'orbit'
    controls.addEventListener('start', () => {
      if (activePresetRef.current !== 'orbit' && activePresetRef.current !== 'top') {
        activePresetRef.current = 'orbit';
        setActivePreset('orbit');
      }
    });

    // 3. Lighting Setup
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
    scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x475569, 0.5);
    hemiLight.position.set(0, 500, 0);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(300, 600, 400);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 50;
    dirLight.shadow.camera.far = 3000;
    dirLight.shadow.bias = -0.0005;
    scene.add(dirLight);

    // Subtle fill light
    const fillLight = new THREE.DirectionalLight(0x93c5fd, 0.4);
    fillLight.position.set(-300, 300, -300);
    scene.add(fillLight);

    // 4. Build 3D Store from CAD Entities
    let isCancelled = false;

    const buildStore = async () => {
      setIsLoading(true);
      try {
        await ProductModelRegistry.loadProducts();
        const converted = await CADTo3DConverter.convertTo3D(entities);
        if (isCancelled) return;

        convertedSceneRef.current = converted;

        scene.add(converted.wallsGroup);
        scene.add(converted.columnsGroup);
        scene.add(converted.openingsGroup);
        scene.add(converted.partitionsGroup);
        scene.add(converted.racksGroup);
        scene.add(converted.debugGroup);
        converted.debugGroup.visible = showAttachmentDebug;
        scene.add(converted.floorMesh);
        scene.add(converted.ceilingMesh);
        converted.ceilingMesh.visible = showCeiling;

        // Evaluate Corner Shelf Connections and add Debug Markers
        converted.racksGroup.children.forEach(rack => {
          if (rack.userData?.connectedRun) {

             if (rack.userData?.rackType === 'Corner Rack' || (rack.userData?.productName && rack.userData.productName.toLowerCase().includes('corner'))) {
                // We previously had dynamic gap correction here, but it caused entire rack runs
                // to be incorrectly translated outside the room due to disconnected adjacent racks.
                // Dynamic translation has been removed. Connection boundaries must be resolved at 
                // the CAD Engine source (CornerRackEngine).
             }
             
             // Hide native red brackets in Corner Rack to prevent floating blocks
             rack.traverse((child: any) => {
                 if (child.isMesh && child.material) {
                     const mats = Array.isArray(child.material) ? child.material : [child.material];
                     if (mats.some((m: any) => m.name && (m.name.includes('C05') || m.name.includes('red') || m.name.includes('Red')))) {
                         child.visible = false;
                     }
                 }
             });
          }
        });

        // Adjust shadow camera frustum based on scene bounds
        const size = converted.size;
        const radius = Math.max(size.x, size.z, 200) * 1.2;
        dirLight.shadow.camera.left = -radius;
        dirLight.shadow.camera.right = radius;
        dirLight.shadow.camera.top = radius;
        dirLight.shadow.camera.bottom = -radius;
        dirLight.shadow.camera.updateProjectionMatrix();

        setStats({
          racksCount: converted.racksGroup.children.length,
          wallsCount: converted.wallsGroup.children.length,
          openingsCount: converted.openingsGroup.children.length,
          columnsCount: converted.columnsGroup.children.length,
        });

        // Pre-select first rack diagnostics if available
        if (converted.racksGroup.children.length > 0) {
          const first = converted.racksGroup.children[0];
          if (first.userData?.diagnostics) {
            setSelectedRackDiagnostics(first.userData.diagnostics as ModelDiagnostics);
          }
        }

        fitCameraToStoreRef.current('iso');
      } catch (err) {
        console.error('[Store3DViewer] Error building 3D store scene:', err);
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
          onSceneReady?.();
        }
      }
    };

    buildStore();

    // 5. Interactive rack selection & subtle highlight (Section 22 & 23)
    let pointerDownPos = { x: 0, y: 0 };
    const handlePointerDown = (e: MouseEvent) => {
      pointerDownPos = { x: e.clientX, y: e.clientY };
    };

    const handlePointerUp = (e: MouseEvent) => {
      if (viewModeRef.current === 'walk') return;
      const dragDist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
      if (dragDist > 6) return; // Ignore orbit/pan drag gestures

      if (!container || !cameraRef.current || !convertedSceneRef.current) return;
      const rect = container.getBoundingClientRect();
      const mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const mouseY = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), cameraRef.current);

      const racks = convertedSceneRef.current.racksGroup;
      if (!racks || racks.children.length === 0) {
        setSelectedRackInfo(null);
        setSelectedRackDiagnostics(null);
        if (highlightBoxRef.current) highlightBoxRef.current.visible = false;
        return;
      }

      const intersects = raycaster.intersectObjects(racks.children, true);
      const validHit = intersects.find((hit) => {
        const n = (hit.object.name || '').toLowerCase();
        return !n.includes('debug') && !n.includes('helper') && !n.includes('plane');
      });

      if (validHit) {
        let curr: THREE.Object3D | null = validHit.object;
        let foundRack: THREE.Group | null = null;
        while (curr && curr !== racks) {
          if (curr.userData?.type === 'rack' || curr.userData?.entityId || curr.userData?.diagnostics) {
            foundRack = curr as THREE.Group;
            break;
          }
          curr = curr.parent;
        }

        if (foundRack) {
          const u = foundRack.userData;
          const diag = u.diagnostics as ModelDiagnostics | undefined;
          setSelectedRackInfo({
            entityId: u.entityId,
            productName: u.productName || diag?.productName || 'Retail Rack',
            sku: u.sku || diag?.sku || 'WR-7X3',
            rackType: u.rackType || (u.isWallMounted ? 'Wall Rack' : 'Center Rack'),
            width: u.width || diag?.targetDimensions?.width || 36,
            depth: u.depth || diag?.targetDimensions?.depth || 24,
            height: u.height || diag?.targetDimensions?.height || 84,
            isCustom: u.isCustom,
            isWallMounted: u.isWallMounted,
          });
          if (diag) {
            setSelectedRackDiagnostics(diag);
          }

          if (highlightBoxRef.current) {
            highlightBoxRef.current.setFromObject(foundRack);
            highlightBoxRef.current.visible = true;
          }
          return;
        }
      }

      // Clicked on empty space / floor: deselect (Section 23)
      setSelectedRackInfo(null);
      setSelectedRackDiagnostics(null);
      setShowGLBDiagnostics(false);
      if (highlightBoxRef.current) {
        highlightBoxRef.current.visible = false;
      }
    };

    container.addEventListener('mousedown', handlePointerDown);
    container.addEventListener('mouseup', handlePointerUp);

    // 6. Global Escape Key Handler to exit Walk Mode
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && viewModeRef.current === 'walk') {
        switchViewModeRef.current('orbit');
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);

    // 7. Animation Loop
    let lastTime = performance.now();
    let lastDiagUpdate = 0;
    const animate = () => {
      animationFrameIdRef.current = requestAnimationFrame(animate);
      const now = performance.now();
      const deltaTime = (now - lastTime) / 1000;
      lastTime = now;

      if (viewModeRef.current === 'walk' && walkControllerRef.current) {
        walkControllerRef.current.update(deltaTime);
        if (showCollisionDebugRef.current) {
          if (collisionDebugGroupRef.current && cameraRef.current) {
            walkControllerRef.current.collisionEngine.updatePlayerDebugPosition(
              collisionDebugGroupRef.current,
              { x: cameraRef.current.position.x, y: cameraRef.current.position.z }
            );
          }
          if (now - lastDiagUpdate > 100) {
            lastDiagUpdate = now;
            setWalkDiagnostics(walkControllerRef.current.getDiagnostics());
          }
        }
      } else if (controlsRef.current && controlsRef.current.enabled) {
        controlsRef.current.update();
      }

      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    };
    animate();

    // 8. Handle Resize and Fullscreen Change via ResizeObserver
    const handleResize = () => {
      if (!container || !renderer || !camera || !convertedSceneRef.current) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w <= 0 || h <= 0) return;

      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);

      if (viewModeRef.current !== 'walk') {
        fitCameraToStoreRef.current(activePresetRef.current);
      }
    };

    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });
    resizeObserver.observe(container);

    window.addEventListener('resize', handleResize);
    document.addEventListener('fullscreenchange', handleResize);

    // Cleanup
    return () => {
      isCancelled = true;
      resizeObserver.disconnect();
      window.removeEventListener('keydown', handleGlobalKeyDown);
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('fullscreenchange', handleResize);
      walkControllerRef.current?.disable();
      walkControllerRef.current = null;
      container.removeEventListener('mousedown', handlePointerDown);
      container.removeEventListener('mouseup', handlePointerUp);
      if (highlightBoxRef.current && sceneRef.current) {
        sceneRef.current.remove(highlightBoxRef.current);
      }
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
      }
      // Traverse and dispose instance geometries and materials to prevent WebGL VRAM leaks (RF-PERF-001)
      if (sceneRef.current) {
        sceneRef.current.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            if (mesh.geometry) {
              mesh.geometry.dispose();
            }
            if (mesh.material) {
              const disposeMat = (m: THREE.Material) => {
                const matAny = m as any;
                if (matAny.map) matAny.map.dispose();
                if (matAny.normalMap) matAny.normalMap.dispose();
                if (matAny.roughnessMap) matAny.roughnessMap.dispose();
                m.dispose();
              };
              if (Array.isArray(mesh.material)) {
                mesh.material.forEach(disposeMat);
              } else {
                disposeMat(mesh.material);
              }
            }
          }
        });
        sceneRef.current.clear();
      }

      controls.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [entities]);

  return (
    <div className="relative w-full h-full bg-slate-950 flex flex-col select-none overflow-hidden font-sans">
      {/* 3D Canvas Body — renders first so overlays stack above */}
      <div ref={containerRef} className="absolute inset-0 cursor-default z-0" />

      {/* WebGL Error Overlay */}
      {webglError && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/95 backdrop-blur-md p-6 text-center">
          <div className="max-w-md bg-slate-900 border border-red-500/30 rounded-2xl p-6 shadow-2xl flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-red-600/20 text-red-400 flex items-center justify-center">
              <Activity className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold text-white">WebGL 3D Graphics Unavailable</h3>
            <p className="text-xs text-slate-300 leading-relaxed">{webglError}</p>
            <div className="flex items-center gap-2 mt-2">
              {onBackTo2D && (
                <button
                  id="btn-error-back-to-2d"
                  onClick={onBackTo2D}
                  className="px-4 py-2 bg-retailfix-red-600 hover:bg-retailfix-red-700 text-white rounded-xl text-xs font-bold transition-all shadow"
                >
                  Return to 2D Layout
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 3D Viewport Header Bar */}
      <div className="absolute top-2 sm:top-4 left-2 sm:left-4 right-2 sm:right-4 z-20 flex items-center justify-between pointer-events-none gap-2 max-w-[calc(100%-1rem)] sm:max-w-[calc(100%-2rem)] overflow-x-auto scrollbar-hide">
        {/* Left: Return to 2D / Mode Badge */}
        <div className="flex items-center gap-1.5 pointer-events-auto bg-slate-900/90 backdrop-blur-md border border-slate-700/80 p-1 sm:p-1.5 rounded-xl shadow-2xl shrink-0">
          <button
            id="btn-3d-back-to-2d"
            onClick={onBackTo2D}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold text-slate-200 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors shadow-sm"
          >
            <Layers className="w-4 h-4 text-retailfix-red-400" />
            <span className="hidden sm:inline">2D CAD Layout</span>
            <span className="sm:hidden">2D CAD</span>
          </button>
          <div className="h-4 w-px bg-slate-700" />
          <div className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 bg-retailfix-red-600/20 text-retailfix-red-400 rounded-lg text-xs font-bold border border-retailfix-red-500/30">
            <Box className="w-4 h-4 text-retailfix-red-400" />
            <span className="hidden sm:inline">3D Store View</span>
            <span className="sm:hidden">3D</span>
          </div>
        </div>

        {/* Center: Authoritative 3D View Modes & Presets */}
        <div className="flex items-center gap-1 pointer-events-auto bg-slate-900/95 backdrop-blur-md border border-slate-700/80 p-1 rounded-xl shadow-2xl overflow-x-auto scrollbar-hide shrink-0">
          {/* Primary View Modes & Presets: [ ORBIT ] [ WALK ] [ TOP ] [ FRONT ] [ ISOMETRIC ] */}
          <div className="flex items-center p-0.5 bg-slate-950/70 rounded-lg border border-slate-800/80">
            <button
              id="btn-view-orbit"
              onClick={() => {
                if (viewMode === 'walk') switchViewMode('orbit');
                switchPreset('orbit');
              }}
              title="Free Interactive 3D Orbit View"
              className={`px-2 sm:px-2.5 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1 sm:gap-1.5 ${
                activePreset === 'orbit' && viewMode === 'orbit'
                  ? 'bg-retailfix-red-600 text-white shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Compass className="w-3.5 h-3.5" />
              ORBIT
            </button>

            <button
              id="btn-view-walk"
              onClick={() => switchViewMode(viewMode === 'walk' ? 'orbit' : 'walk')}
              title="First-Person Walkthrough View (Human Eye Level 5′6″)"
              className={`px-2 sm:px-2.5 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1 sm:gap-1.5 ${
                viewMode === 'walk'
                  ? 'bg-emerald-600 text-white shadow-sm ring-1 ring-emerald-400/50'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Footprints className="w-3.5 h-3.5 text-emerald-300" />
              WALK
            </button>

            <button
              id="btn-view-top"
              onClick={() => {
                if (viewMode === 'walk') switchViewMode('orbit');
                switchPreset('top');
              }}
              title="Top Floor Plan View"
              className={`hidden sm:flex px-2 sm:px-2.5 py-1.5 rounded-md text-xs font-semibold transition-all items-center gap-1 ${
                activePreset === 'top' && viewMode === 'orbit'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Eye className="w-3.5 h-3.5 text-sky-400" />
              TOP
            </button>

            <button
              id="btn-view-front"
              onClick={() => {
                if (viewMode === 'walk') switchViewMode('orbit');
                switchPreset('front');
              }}
              title="Front Eye-Level Elevation View"
              className={`hidden md:flex px-2 sm:px-2.5 py-1.5 rounded-md text-xs font-semibold transition-all items-center gap-1 ${
                activePreset === 'front' && viewMode === 'orbit'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-indigo-400" />
              FRONT
            </button>

            <button
              id="btn-view-isometric"
              onClick={() => {
                if (viewMode === 'walk') switchViewMode('orbit');
                switchPreset('iso');
              }}
              title="3/4 Axonometric Isometric View"
              className={`hidden sm:flex px-2 sm:px-2.5 py-1.5 rounded-md text-xs font-bold transition-all items-center gap-1.5 ${
                activePreset === 'iso' && viewMode === 'orbit'
                  ? 'bg-retailfix-red-600 text-white shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Box className="w-3.5 h-3.5 text-retailfix-red-400" />
              ISO
            </button>
          </div>

          <div className="h-4 w-px bg-slate-700 mx-0.5" />

          {/* Framing Action Buttons: [ Fit ] [ Reset ] */}
          <div className="flex items-center gap-1">
            <button
              id="btn-fit-store"
              onClick={autoFitStore}
              title="Auto Fit Store to Viewport"
              className="px-2 sm:px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 hover:text-white text-slate-200 border border-slate-700 rounded-lg text-xs font-bold transition-all flex items-center gap-1"
            >
              <Maximize className="w-3.5 h-3.5 text-emerald-400" />
              Fit
            </button>

            <button
              id="btn-reset-view"
              onClick={resetView}
              title="Reset View to Initial Framing"
              className="px-2 sm:px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 hover:text-white text-slate-200 border border-slate-700 rounded-lg text-xs font-bold transition-all flex items-center gap-1"
            >
              <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
              Reset
            </button>
          </div>

          {/* Developer Tool Toggles (Desktop only, hidden below xl to preserve mobile/tablet layout) */}
          {!isCustomerMode && (
            <div className="hidden xl:flex items-center gap-1">
              <div className="h-4 w-px bg-slate-700 mx-0.5" />
              <button
                onClick={() => {
                  const next = !showCeiling;
                  setShowCeiling(next);
                  if (convertedSceneRef.current?.ceilingMesh) {
                    convertedSceneRef.current.ceilingMesh.visible = next;
                  }
                }}
                title="Toggle Store Ceiling"
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                  showCeiling
                    ? 'bg-sky-600/30 text-sky-300 border border-sky-500/40'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Layers className="w-3.5 h-3.5 text-sky-400" />
                Ceiling
              </button>

              <button
                onClick={() => {
                  const next = !showAttachmentDebug;
                  setShowAttachmentDebug(next);
                  if (convertedSceneRef.current?.debugGroup) {
                    convertedSceneRef.current.debugGroup.visible = next;
                  }
                }}
                title="Toggle Wall Attachment Alignment Debugger"
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                  showAttachmentDebug
                    ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/40'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Activity className="w-3.5 h-3.5 text-emerald-400" />
                Wall Align
              </button>

              <button
                id="btn-toggle-colliders"
                onClick={() => {
                  const next = !showCollisionDebug;
                  setShowCollisionDebug(next);
                  showCollisionDebugRef.current = next;
                  if (next && walkControllerRef.current && sceneRef.current) {
                    if (collisionDebugGroupRef.current) {
                      sceneRef.current.remove(collisionDebugGroupRef.current);
                    }
                    const dbg = walkControllerRef.current.collisionEngine.createDebugVisualization(
                      cameraRef.current ? { x: cameraRef.current.position.x, y: cameraRef.current.position.z } : undefined
                    );
                    collisionDebugGroupRef.current = dbg;
                    sceneRef.current.add(dbg);
                    setWalkDiagnostics(walkControllerRef.current.getDiagnostics());
                  } else if (!next && collisionDebugGroupRef.current && sceneRef.current) {
                    sceneRef.current.remove(collisionDebugGroupRef.current);
                    collisionDebugGroupRef.current = null;
                    setWalkDiagnostics(null);
                  }
                }}
                title="Toggle Collision Geometry Debugger (Section 37)"
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                  showCollisionDebug
                    ? 'bg-cyan-600/30 text-cyan-300 border border-cyan-500/40'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Shield className="w-3.5 h-3.5 text-cyan-400" />
                Colliders
              </button>

              <button
                onClick={() => setShowGLBDiagnostics(!showGLBDiagnostics)}
                title="Toggle GLB Transformation Diagnostic Inspector"
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                  showGLBDiagnostics
                    ? 'bg-amber-600/30 text-amber-300 border border-amber-500/40'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Terminal className="w-3.5 h-3.5 text-amber-400" />
                GLB Inspector
              </button>

              <button
                onClick={() => setShowCameraDebug(!showCameraDebug)}
                title="Toggle Camera Framing Diagnostics (Section 27: Camera Debug Mode)"
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                  showCameraDebug
                    ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/40'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Camera className="w-3.5 h-3.5 text-indigo-400" />
                Cam Info
              </button>
            </div>
          )}

          {/* Fullscreen Button */}
          <button
            onClick={toggleFullscreen}
            title="Toggle Fullscreen"
            className="px-2 sm:px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 transition-colors flex items-center gap-1 shrink-0"
          >
            <Maximize className="w-3.5 h-3.5 text-slate-400" />
            <span className="hidden sm:inline">Fullscreen</span>
          </button>

          {/* Export Walkthrough Video Button */}
          {allowVideoExport && (
            <button
              onClick={() => setShowExportModal(true)}
              title="Export Cinematic Walkthrough Video (MP4 / H.264)"
              className="hidden sm:flex px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-all items-center gap-1.5 bg-gradient-to-r from-retailfix-red-600 to-rose-600 hover:from-retailfix-red-500 hover:to-rose-500 text-white shadow-md shadow-red-900/40 shrink-0"
            >
              <Video className="w-3.5 h-3.5 text-white" />
              <span>Export Video</span>
            </button>
          )}
        </div>

        {/* Right: Scene Info Badge (Hidden on mobile/tablet portrait to prevent overflow) */}
        <div className="hidden lg:flex pointer-events-auto items-center gap-3 bg-slate-900/90 backdrop-blur-md border border-slate-700/80 px-3.5 py-1.5 rounded-xl text-xs shadow-2xl text-slate-300 shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-semibold text-white">{stats.racksCount}</span>
            <span className="text-slate-400">Racks</span>
          </div>
          <div className="h-3 w-px bg-slate-700" />
          <div className="text-slate-400">
            <span className="font-semibold text-white">{stats.wallsCount}</span> Walls
          </div>
          <div className="h-3 w-px bg-slate-700" />
          <div className="text-slate-400">
            <span className="font-semibold text-white">{stats.openingsCount}</span> Openings
          </div>
          <div className="h-3 w-px bg-slate-700" />
          <div className="text-slate-400">
            <span className="font-semibold text-white">{stats.columnsCount}</span> Cols
          </div>
        </div>
      </div>

      {/* WALK VIEW ACTIVE HUD BANNER */}
      {viewMode === 'walk' && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 bg-slate-900/95 backdrop-blur-md border border-slate-700/80 px-4 py-2 rounded-xl text-xs shadow-2xl text-slate-200">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-bold text-emerald-400 tracking-wide">WALK MODE (5′6″)</span>
          </div>
          <div className="hidden md:flex items-center gap-2.5 text-slate-300 font-mono text-[11px]">
            <span><strong className="text-white bg-slate-800 px-1 py-0.5 rounded border border-slate-700">W A S D</strong> Move</span>
            <span>•</span>
            <span><strong className="text-white bg-slate-800 px-1 py-0.5 rounded border border-slate-700">Mouse</strong> Look</span>
            <span>•</span>
            <span><strong className="text-white bg-slate-800 px-1 py-0.5 rounded border border-slate-700">Shift</strong> Run</span>
            <span>•</span>
            <span><strong className="text-white bg-slate-800 px-1 py-0.5 rounded border border-slate-700">ESC</strong> Exit</span>
          </div>
          <div className="flex md:hidden items-center gap-1.5 text-slate-300 text-[10px] font-medium">
            <span>Left joystick to Move • Drag screen to Look</span>
          </div>
          <div className="h-4 w-px bg-slate-700" />
          <button
            id="btn-exit-walk"
            onClick={() => switchViewMode('orbit')}
            className="px-2.5 py-1 bg-red-600/30 hover:bg-red-600/50 text-red-200 border border-red-500/40 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1"
          >
            <X className="w-3.5 h-3.5" />
            Exit Walk View
          </button>
        </div>
      )}

      {/* Pointer Lock Prompt on Desktop in Walk View */}
      {viewMode === 'walk' && !isPointerLocked && !isTouchDevice && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-20 pointer-events-none bg-slate-900/95 backdrop-blur-md border border-slate-700/80 px-4 py-2 rounded-xl text-xs text-slate-300 shadow-2xl flex items-center gap-2">
          <MousePointer2 className="w-4 h-4 text-emerald-400 animate-pulse" />
          <span>Click anywhere in store to enter mouse-look mode</span>
        </div>
      )}

      {/* Mobile Touch Controls in Walk View (Mobile/Touch only) */}
      {viewMode === 'walk' && isTouchDevice && (
        <TouchControlsOverlay
          onMove={(x, y) => walkControllerRef.current?.setTouchMovement(x, y)}
          onLook={(dx, dy) => walkControllerRef.current?.addTouchLook(dx, dy)}
          onToggleSprint={(sprinting) => {
            if (walkControllerRef.current) {
              walkControllerRef.current.walkSpeed = sprinting ? 96 : 54;
            }
          }}
        />
      )}

      {/* Product Selection Info Card (Section 22 & 23) */}
      {selectedRackInfo && (
        <div className="absolute top-20 left-4 z-20 w-72 bg-slate-900/95 backdrop-blur-md border border-emerald-500/50 rounded-2xl p-4 shadow-2xl text-xs text-slate-300 pointer-events-auto">
          <div className="flex items-center justify-between pb-2.5 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Box className="w-4 h-4 text-emerald-400" />
              <span className="font-bold text-slate-100 uppercase tracking-wider text-[11px] font-sans">
                {selectedRackInfo.isCustom ? 'CUSTOM RACK' : selectedRackInfo.rackType.toUpperCase()}
              </span>
            </div>
            <button
              onClick={() => {
                setSelectedRackInfo(null);
                setSelectedRackDiagnostics(null);
                setShowGLBDiagnostics(false);
                if (highlightBoxRef.current) highlightBoxRef.current.visible = false;
              }}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title="Deselect"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="mt-3 space-y-2.5 font-mono text-[11px]">
            <div>
              <div className="text-[10px] text-slate-400 font-sans uppercase tracking-wider font-semibold">Product Name</div>
              <div className="text-white font-bold text-sm font-sans">{selectedRackInfo.productName}</div>
            </div>

            <div className="bg-slate-950/70 p-2 rounded-xl border border-slate-800/80 grid grid-cols-2 gap-2">
              <div>
                <span className="text-[10px] text-slate-400 font-sans block">SKU</span>
                <span className="text-amber-400 font-semibold">{selectedRackInfo.sku}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-sans block">Type</span>
                <span className="text-slate-200">{selectedRackInfo.rackType}</span>
              </div>
            </div>

            <div className="bg-slate-950/70 p-2.5 rounded-xl border border-slate-800/80">
              <span className="text-emerald-400 font-bold block uppercase tracking-wider text-[9px] font-sans mb-1.5">
                Physical Dimensions
              </span>
              <div className="grid grid-cols-3 gap-2 text-slate-200">
                <div className="bg-slate-900/80 p-1.5 rounded border border-slate-800">
                  <span className="text-[9px] text-slate-400 block font-sans">Width</span>
                  <span className="font-bold text-slate-100">{formatFeetInches(selectedRackInfo.width)}</span>
                </div>
                <div className="bg-slate-900/80 p-1.5 rounded border border-slate-800">
                  <span className="text-[9px] text-slate-400 block font-sans">Depth</span>
                  <span className="font-bold text-slate-100">{formatFeetInches(selectedRackInfo.depth)}</span>
                </div>
                <div className="bg-slate-900/80 p-1.5 rounded border border-slate-800">
                  <span className="text-[9px] text-slate-400 block font-sans">Height</span>
                  <span className="font-bold text-slate-100">{formatFeetInches(selectedRackInfo.height)}</span>
                </div>
              </div>
            </div>

            {selectedRackDiagnostics && (
              <button
                onClick={() => setShowGLBDiagnostics((prev) => !prev)}
                className="w-full py-1.5 bg-slate-800 hover:bg-slate-700/80 text-emerald-300 border border-emerald-500/30 rounded-lg text-center font-sans text-[11px] font-medium transition-colors flex items-center justify-center gap-1.5"
              >
                <Terminal className="w-3.5 h-3.5" />
                {showGLBDiagnostics ? 'Hide GLB Diagnostics' : 'Inspect GLB Details'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* GLB Transformation Diagnostic Inspector Card */}
      {showGLBDiagnostics && selectedRackDiagnostics && (
        <div className="absolute top-20 right-4 z-30 w-84 max-h-[82vh] bg-slate-900/95 backdrop-blur-xl border border-slate-700/80 rounded-2xl p-4 shadow-2xl overflow-y-auto text-xs font-mono select-text text-slate-300">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-amber-400" />
              <span className="font-bold text-slate-100 font-sans">GLB Transformation Diagnostic</span>
            </div>
            <button
              onClick={() => setShowGLBDiagnostics(false)}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="mt-3 space-y-2">
            <div>
              <div className="text-[10px] text-slate-400 font-sans uppercase tracking-wider font-semibold">Product</div>
              <div className="text-white font-bold font-sans text-sm">{selectedRackDiagnostics.productName}</div>
              {selectedRackDiagnostics.sku && <div className="text-slate-400 text-[11px]">SKU: {selectedRackDiagnostics.sku}</div>}
            </div>

            <div>
              <div className="text-[10px] text-slate-400 font-sans uppercase tracking-wider font-semibold">Model GLB</div>
              <div className="text-slate-300 break-all bg-slate-950/70 p-1.5 rounded-lg border border-slate-800 text-[11px]">
                {selectedRackDiagnostics.glbFileName}
              </div>
            </div>

            {/* GLB NATIVE */}
            <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800 space-y-1">
              <span className="text-amber-400 font-bold block uppercase tracking-wider text-[9px] font-sans">
                GLB NATIVE
              </span>
              <div className="text-[10px] text-slate-300 space-y-0.5">
                <div className="text-slate-400 font-sans">Native Axis:</div>
                <div className="text-slate-200">
                  X = <span className="text-amber-300 font-semibold">{selectedRackDiagnostics.nativeAxis.x}</span>,{' '}
                  Y = <span className="text-amber-300 font-semibold">{selectedRackDiagnostics.nativeAxis.y}</span>,{' '}
                  Z = <span className="text-amber-300 font-semibold">{selectedRackDiagnostics.nativeAxis.z}</span>
                </div>
                <div className="text-slate-400 font-sans mt-0.5">Native Size:</div>
                <div className="text-slate-200">
                  X = {selectedRackDiagnostics.nativeSize.x}″, Y = {selectedRackDiagnostics.nativeSize.y}″, Z = {selectedRackDiagnostics.nativeSize.z}″
                </div>
              </div>
            </div>

            {/* PRODUCT BASE */}
            <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800">
              <span className="text-blue-400 font-bold block uppercase tracking-wider text-[9px] font-sans">
                PRODUCT BASE
              </span>
              <div className="grid grid-cols-3 gap-1 mt-0.5 text-slate-200 text-[10px]">
                <div>W: {formatFeetInches(selectedRackDiagnostics.baseDimensions.width)}</div>
                <div>D: {formatFeetInches(selectedRackDiagnostics.baseDimensions.depth)}</div>
                <div>H: {formatFeetInches(selectedRackDiagnostics.baseDimensions.height)}</div>
              </div>
            </div>

            {/* CURRENT TARGET */}
            <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800">
              <span className="text-purple-400 font-bold block uppercase tracking-wider text-[9px] font-sans">
                CURRENT TARGET
              </span>
              <div className="grid grid-cols-3 gap-1 mt-0.5 text-slate-200 text-[10px]">
                <div>W: {formatFeetInches(selectedRackDiagnostics.targetDimensions.width)}</div>
                <div>D: {formatFeetInches(selectedRackDiagnostics.targetDimensions.depth)}</div>
                <div>H: {formatFeetInches(selectedRackDiagnostics.targetDimensions.height)}</div>
              </div>
            </div>

            {/* NORMALIZED MODEL */}
            <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800">
              <span className="text-emerald-400 font-bold block uppercase tracking-wider text-[9px] font-sans">
                NORMALIZED MODEL
              </span>
              <div className="grid grid-cols-3 gap-1 mt-0.5 text-slate-200 text-[10px]">
                <div>W: {formatFeetInches(selectedRackDiagnostics.normalizedDimensions.width)}</div>
                <div>D: {formatFeetInches(selectedRackDiagnostics.normalizedDimensions.depth)}</div>
                <div>H: {formatFeetInches(selectedRackDiagnostics.normalizedDimensions.height)}</div>
              </div>
            </div>

            {/* FINAL MODEL */}
            <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800">
              <span className="text-cyan-400 font-bold block uppercase tracking-wider text-[9px] font-sans">
                FINAL MODEL
              </span>
              <div className="grid grid-cols-3 gap-1 mt-0.5 text-cyan-300 font-bold text-[10px]">
                <div>W: {formatFeetInches(selectedRackDiagnostics.finalDimensions.width)}</div>
                <div>D: {formatFeetInches(selectedRackDiagnostics.finalDimensions.depth)}</div>
                <div>H: {formatFeetInches(selectedRackDiagnostics.finalDimensions.height)}</div>
              </div>
            </div>

            {/* TRANSFORMS */}
            <div className="p-2 bg-slate-950/60 rounded-lg border border-slate-800 space-y-1 text-[10px] text-slate-300">
              <div>
                <span className="text-slate-400 font-sans block">Correction Rotation:</span>
                <span className="text-amber-300">
                  X = {selectedRackDiagnostics.correctionRotation.x}°, Y = {selectedRackDiagnostics.correctionRotation.y}°, Z = {selectedRackDiagnostics.correctionRotation.z}°
                </span>
              </div>
              <div>
                <span className="text-slate-400 font-sans block">CAD Rotation:</span>
                <span className="text-slate-200">{selectedRackDiagnostics.cadRotationDeg}°</span>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800 flex justify-between text-[11px] text-slate-400 font-sans">
              <span>Meshes: <strong className="text-slate-200">{selectedRackDiagnostics.meshCount}</strong></span>
              <span>Materials: <strong className="text-slate-200">{selectedRackDiagnostics.materials.length}</strong></span>
              <span className="text-emerald-400 font-medium">{selectedRackDiagnostics.isParametric ? 'Parametric' : 'Fixed GLB'}</span>
            </div>
          </div>
        </div>
      )}

      {/* Camera Framing Diagnostic HUD (Section 19: Camera Debug Mode) */}
      {showCameraDebug && cameraDebugInfo && (
        <div className="absolute top-20 right-4 z-20 w-84 bg-slate-900/95 backdrop-blur-md border border-indigo-500/50 rounded-xl p-4 shadow-2xl text-xs text-slate-300 pointer-events-auto">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Camera className="w-4 h-4 text-indigo-400" />
              <span className="font-bold text-slate-100 font-sans">Camera Framing Diagnostics</span>
            </div>
            <button
              onClick={() => setShowCameraDebug(false)}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="mt-3 space-y-2.5 font-mono text-[11px]">
            <div>
              <div className="text-[10px] text-slate-400 font-sans uppercase tracking-wider font-semibold">Store Footprint</div>
              <div className="text-emerald-400 font-bold text-sm">{cameraDebugInfo.storeFt}</div>
            </div>

            <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800 space-y-1">
              <span className="text-indigo-400 font-bold block uppercase tracking-wider text-[9px] font-sans">3D Bounds (1 Unit = 1 Inch)</span>
              <div className="text-slate-200">{cameraDebugInfo.worldDimensions}</div>
            </div>

            <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800 space-y-1">
              <span className="text-cyan-400 font-bold block uppercase tracking-wider text-[9px] font-sans">Camera State ({cameraDebugInfo.preset.toUpperCase()})</span>
              <div className="text-slate-300">Pos: <span className="text-cyan-300">{cameraDebugInfo.cameraPosition}</span></div>
              <div className="text-slate-300">Target: <span className="text-cyan-300">{cameraDebugInfo.cameraTarget}</span></div>
              <div className="text-slate-300">Distance: <span className="text-amber-300 font-bold">{cameraDebugInfo.cameraDistance}</span></div>
              <div className="text-slate-300">FOV: <span className="text-white font-bold">{cameraDebugInfo.fov}°</span> | Aspect: <span className="text-white">{cameraDebugInfo.aspect}</span></div>
            </div>

            <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800 space-y-1">
              <span className="text-purple-400 font-bold block uppercase tracking-wider text-[9px] font-sans">Presentation Bounds</span>
              <div className="text-slate-300 break-all">{cameraDebugInfo.bounds}</div>
              <div className="text-slate-400 text-[10px]">Framing Padding: <span className="text-emerald-400 font-bold">{cameraDebugInfo.padding}</span></div>
            </div>

            <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800 space-y-1">
              <span className="text-emerald-400 font-bold block uppercase tracking-wider text-[9px] font-sans">World Scale Verification</span>
              <div className="text-slate-200">1 ft = <span className="text-white font-bold">12 world units</span> (1 unit = 1″)</div>
              <div className="text-slate-300 text-[10px]">Aspect Ratio (L/W): <span className="text-emerald-300 font-bold">{cameraDebugInfo.ratio}</span></div>
            </div>

            <div className="pt-2 border-t border-slate-800 flex justify-between text-[10px] text-slate-400 font-sans">
              <span>Projection: <strong>8-Corner Frustum</strong></span>
              <span className="text-emerald-400 font-semibold">CAD Geometry Intact</span>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 38: WALK MODE DIAGNOSTICS (DEV ONLY) */}
      {showCollisionDebug && viewMode === 'walk' && walkDiagnostics && (
        <div className="absolute top-20 right-4 z-30 w-80 bg-slate-900/95 backdrop-blur-md border border-cyan-500/50 rounded-xl p-4 shadow-2xl text-xs text-slate-300 pointer-events-auto">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-cyan-400" />
              <span className="font-bold text-slate-100 font-sans">Walk Collision Diagnostics</span>
            </div>
            <button
              onClick={() => setShowCollisionDebug(false)}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="mt-3 space-y-2 font-mono text-[11px]">
            <div>
              <div className="text-[10px] text-slate-400 font-sans uppercase tracking-wider font-semibold">Player Position (3D ground)</div>
              <div className="text-cyan-300 font-bold">
                X: {walkDiagnostics.position.x}″, Y: {walkDiagnostics.position.y}″, Z: {walkDiagnostics.position.z}″
              </div>
            </div>

            <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800 grid grid-cols-2 gap-2">
              <div>
                <span className="text-[10px] text-slate-400 font-sans block">Eye Height</span>
                <span className="text-emerald-400 font-semibold">{walkDiagnostics.eyeHeight}″ (5′6″)</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-sans block">Speed</span>
                <span className="text-amber-400 font-semibold">
                  {walkDiagnostics.speed} in/s ({(walkDiagnostics.speed / 12).toFixed(1)} ft/s)
                </span>
              </div>
            </div>

            <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800 grid grid-cols-2 gap-2">
              <div>
                <span className="text-[10px] text-slate-400 font-sans block">Obstacles</span>
                <span className="text-white font-semibold">{walkDiagnostics.collisionObstaclesCount} cached</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-sans block">Movement</span>
                <span className={walkDiagnostics.isMoving ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                  {walkDiagnostics.isMoving ? (walkDiagnostics.isSprinting ? 'RUNNING' : 'WALKING') : 'STATIONARY'}
                </span>
              </div>
            </div>

            <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800 grid grid-cols-2 gap-2">
              <div>
                <span className="text-[10px] text-slate-400 font-sans block">Yaw / Pitch</span>
                <span className="text-slate-200">{walkDiagnostics.yawDeg}° / {walkDiagnostics.pitchDeg}°</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-sans block">Mouse Look</span>
                <span className={walkDiagnostics.isPointerLocked ? 'text-emerald-400' : 'text-amber-400'}>
                  {walkDiagnostics.isPointerLocked ? 'POINTER LOCKED' : 'FREE CURSOR'}
                </span>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800 flex justify-between text-[10px] text-slate-400 font-sans">
              <span>Collision Mode: <strong>Continuous Slide</strong></span>
              <span className="text-cyan-400 font-semibold">Physical CAD Geometry</span>
            </div>
          </div>
        </div>
      )}

      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-sm text-white">
          <Loader2 className="w-10 h-10 text-retailfix-red-500 animate-spin mb-3" />
          <p className="text-base font-bold">Constructing 3D Store Scene...</p>
          <p className="text-xs text-slate-400 mt-1">Generating walls, columns, openings, and instantiating authentic GLB racks</p>
        </div>
      )}

      {/* Export Walkthrough Video Modal */}
      {convertedSceneRef.current && sceneRef.current && cameraRef.current && rendererRef.current && (
        <ExportWalkthroughModal
          isOpen={showExportModal}
          onClose={() => setShowExportModal(false)}
          scene={sceneRef.current}
          camera={cameraRef.current}
          renderer={rendererRef.current}
          controls={controlsRef.current}
          entities={entities}
          roomPolygon={convertedSceneRef.current.roomPolygon}
          bounds={convertedSceneRef.current.bounds}
          center={convertedSceneRef.current.center}
          size={convertedSceneRef.current.size}
          projectId={projectId}
          storeName={storeName}
        />
      )}
    </div>
  );
};
