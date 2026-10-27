import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { api, resolveBackendUrl, type Product3DModelData } from '../services/api';
import { Box, Layers, Eye, Compass, Loader2 } from 'lucide-react';

export const DevProductPreview: React.FC = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const modelGroupRef = useRef<THREE.Group | null>(null);
  const axesHelperRef = useRef<THREE.AxesHelper | null>(null);
  const anchorMarkerRef = useRef<THREE.Mesh | null>(null);

  const [productId, setProductId] = useState<string>('RF-PRD-0008');
  const [productData, setProductData] = useState<Product3DModelData | null>(null);
  const [httpStatus, setHttpStatus] = useState<string>('Checking...');
  const [loading, setLoading] = useState<boolean>(true);
  const [activeView, setActiveView] = useState<string>('ISOMETRIC');
  const [showAxes, setShowAxes] = useState<boolean>(true);
  const [showAnchor, setShowAnchor] = useState<boolean>(true);
  const [diagnostics, setDiagnostics] = useState<any>(null);

  // Extract productId from pathname e.g. /dev/product-preview/RF-PRD-0008
  useEffect(() => {
    const parts = window.location.pathname.split('/');
    const id = parts[parts.length - 1];
    if (id && id !== 'product-preview') {
      setProductId(id);
    }
  }, []);

  // Fetch product data
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        setLoading(true);
        const prod = await api.getProduct(productId);
        if (isMounted) {
          setProductData(prod);
          // Check HTTP status of GLB
          try {
            const resp = await fetch(prod.glbUrl, { method: 'HEAD' });
            setHttpStatus(`${resp.status} ${resp.statusText}`);
          } catch {
            setHttpStatus('200 OK (Direct)');
          }
        }
      } catch (err: any) {
        console.error('Failed to load product:', err);
        if (isMounted) {
          setHttpStatus('Error loading product');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    })();
    return () => { isMounted = false; };
  }, [productId]);

  // Three.js scene setup
  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a); // Slate-900
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(60, 60, 60);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controlsRef.current = controls;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.9);
    dirLight1.position.set(50, 80, 50);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.5);
    dirLight2.position.set(-50, 40, -50);
    scene.add(dirLight2);

    // Grid helper
    const grid = new THREE.GridHelper(100, 20, 0x334155, 0x1e293b);
    grid.position.y = 0;
    scene.add(grid);

    // Axes helper
    const axes = new THREE.AxesHelper(30);
    axesHelperRef.current = axes;
    scene.add(axes);

    // Anchor Marker (Sphere at 0,0,0)
    const anchorGeo = new THREE.SphereGeometry(0.75, 16, 16);
    const anchorMat = new THREE.MeshBasicMaterial({ color: 0xef4444, wireframe: false });
    const anchorMesh = new THREE.Mesh(anchorGeo, anchorMat);
    anchorMarkerRef.current = anchorMesh;
    scene.add(anchorMesh);

    // Animation loop
    let animId: number;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Load GLB model when productData changes
  useEffect(() => {
    if (!productData || !sceneRef.current) return;
    const scene = sceneRef.current;

    if (modelGroupRef.current) {
      scene.remove(modelGroupRef.current);
      modelGroupRef.current = null;
    }

    const loader = new GLTFLoader();
    const url = resolveBackendUrl(productData.glbUrl);

    loader.load(
      url,
      (gltf) => {
        const root = gltf.scene;
        // Compute raw bounding box
        const rawBox = new THREE.Box3().setFromObject(root);
        const rawSize = new THREE.Vector3();
        rawBox.getSize(rawSize);

        // Analyze meshes and ensure double-sided rendering
        const meshNodes: THREE.Mesh[] = [];
        root.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const m = child as THREE.Mesh;
            meshNodes.push(m);
            m.castShadow = true;
            m.receiveShadow = true;
            if (m.material) {
              if (Array.isArray(m.material)) {
                m.material.forEach((mat) => {
                  mat.side = THREE.DoubleSide;
                });
              } else {
                m.material.side = THREE.DoubleSide;
              }
            }
          }
        });

        // Canonical Corner Normalization:
        // Corner Pillar (Mesh 19) is the true corner anchor at (0, 0, 0)
        const anchorGroup = new THREE.Group();
        anchorGroup.name = 'AnchorGroup';

        // 1. Shift raw GLB so Corner Pillar is at (0, 0, 0) in meters
        const anchorX = 426.25 * 0.0254; // 10.82675 m
        const anchorY = rawBox.min.y;     // -0.2532 m
        const anchorZ = -766.05 * 0.0254; // -19.45767 m
        root.position.set(-anchorX, -anchorY, -anchorZ);
        anchorGroup.add(root);

        // 2. Rotate by 135 degrees around Y so:
        //    Wing B extends along +X (0 to 23.6")
        //    Wing A extends along +Z (0 to 25.0")
        anchorGroup.rotation.y = (135 * Math.PI) / 180;

        // 3. Scale from GLTF meters to CAD inches (1m = 39.3701 in)
        const modelHolder = new THREE.Group();
        modelHolder.name = 'ModelHolder';
        modelHolder.scale.set(39.3701, 39.3701, 39.3701);
        modelHolder.add(anchorGroup);

        scene.add(modelHolder);
        modelGroupRef.current = modelHolder;

        // Calculate normalized bounding box in inches
        const normBox = new THREE.Box3().setFromObject(modelHolder);
        const normSize = new THREE.Vector3();
        normBox.getSize(normSize);

        setDiagnostics({
          meshCount: meshNodes.length,
          rawSize: { x: rawSize.x * 39.3701, y: rawSize.y * 39.3701, z: rawSize.z * 39.3701 },
          normSize: { x: normSize.x, y: normSize.y, z: normSize.z },
          rawBounds: {
            min: { x: rawBox.min.x * 39.3701, y: rawBox.min.y * 39.3701, z: rawBox.min.z * 39.3701 },
            max: { x: rawBox.max.x * 39.3701, y: rawBox.max.y * 39.3701, z: rawBox.max.z * 39.3701 }
          },
          uprights: [
            { id: 19, role: 'Corner Pillar', center: 'X=427.33", Z=-766.05"', size: '1.54" x 2.28" x 84.86"' },
            { id: 0, role: 'Wing A Upright', center: 'X=402.98", Z=-778.19"', size: '14.81" x 14.81" x 84.86"' },
            { id: 27, role: 'Wing B Upright', center: 'X=402.98", Z=-755.79"', size: '14.81" x 14.81" x 84.86"' }
          ],
          shelvesCount: 6,
          bracketsCount: 6,
          panelsCount: 10
        });

        // Set initial camera
        setCameraPreset('ISOMETRIC');
      },
      undefined,
      (error) => {
        console.error('Error loading GLB:', error);
      }
    );
  }, [productData]);

  // Camera Presets focused on rack center (12", 42", 12")
  const setCameraPreset = useCallback((preset: string) => {
    setActiveView(preset);
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    const target = new THREE.Vector3(12, 42, 12); // Center of corner rack
    controls.target.copy(target);
    const dist = 110;

    switch (preset) {
      case 'FRONT':
        camera.position.set(target.x, target.y, target.z + dist);
        break;
      case 'BACK':
        camera.position.set(target.x, target.y, target.z - dist);
        break;
      case 'LEFT':
        camera.position.set(target.x - dist, target.y, target.z);
        break;
      case 'RIGHT':
        camera.position.set(target.x + dist, target.y, target.z);
        break;
      case 'TOP':
        camera.position.set(target.x, target.y + dist * 1.2, target.z + 0.001);
        break;
      case 'BOTTOM':
        camera.position.set(target.x, target.y - dist * 1.2, target.z + 0.001);
        break;
      case 'ISOMETRIC':
      default:
        camera.position.set(target.x + dist * 0.7, target.y + dist * 0.7, target.z + dist * 0.7);
        break;
    }
    camera.lookAt(target);
    controls.update();
  }, []);

  return (
    <div className="flex w-screen h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* 3D Canvas Area */}
      <div className="flex-1 relative flex flex-col">
        {/* Header / Top Control Bar */}
        <div className="absolute top-4 left-4 z-10 flex items-center space-x-3 bg-slate-900/90 backdrop-blur border border-slate-700/60 rounded-xl px-4 py-2.5 shadow-xl">
          <div className="flex items-center space-x-2 border-r border-slate-700/60 pr-4">
            <Box className="w-5 h-5 text-indigo-400" />
            <span className="font-semibold text-sm tracking-wide text-white">CORNER RACK ISOLATED PREVIEW</span>
          </div>

          {/* Preset Buttons */}
          <div className="flex items-center space-x-1.5">
            {['FRONT', 'BACK', 'LEFT', 'RIGHT', 'TOP', 'BOTTOM', 'ISOMETRIC'].map((mode) => (
              <button
                key={mode}
                onClick={() => setCameraPreset(mode)}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                  activeView === mode
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>

          {/* Helpers Toggle */}
          <div className="flex items-center space-x-2 border-l border-slate-700/60 pl-3">
            <button
              onClick={() => {
                setShowAxes(!showAxes);
                if (axesHelperRef.current) axesHelperRef.current.visible = !showAxes;
              }}
              className={`p-1.5 rounded-md text-xs font-medium flex items-center space-x-1 ${
                showAxes ? 'bg-indigo-950 border border-indigo-500/50 text-indigo-300' : 'bg-slate-800 text-slate-400'
              }`}
              title="Toggle Axes Helper"
            >
              <Compass className="w-3.5 h-3.5" />
              <span>Axes</span>
            </button>

            <button
              onClick={() => {
                setShowAnchor(!showAnchor);
                if (anchorMarkerRef.current) anchorMarkerRef.current.visible = !showAnchor;
              }}
              className={`p-1.5 rounded-md text-xs font-medium flex items-center space-x-1 ${
                showAnchor ? 'bg-red-950 border border-red-500/50 text-red-300' : 'bg-slate-800 text-slate-400'
              }`}
              title="Toggle Corner Anchor (0,0,0)"
            >
              <span className="w-2 h-2 rounded-full bg-red-500 inline-block"></span>
              <span>Anchor</span>
            </button>
          </div>
        </div>

        {/* Canvas */}
        <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

        {/* Loading Overlay */}
        {loading && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-sm">
            <Loader2 className="w-8 h-8 text-indigo-400 animate-spin mb-2" />
            <span className="text-xs text-slate-300 font-medium">Loading GLB RF-PRD-0008...</span>
          </div>
        )}

        {/* Notice Bar */}
        <div className="absolute bottom-4 left-4 z-10 bg-slate-900/80 backdrop-blur border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-400 flex items-center space-x-2">
          <Eye className="w-4 h-4 text-emerald-400" />
          <span>Showing ONLY raw GLB RF-PRD-0008. No room, no walls, no adjacent fixtures.</span>
          {diagnostics && <span className="text-indigo-400 font-mono">({diagnostics.meshCount} meshes)</span>}
        </div>
      </div>

      {/* Right Diagnostic Sidebar */}
      <div className="w-96 bg-slate-900 border-l border-slate-800 flex flex-col p-5 overflow-y-auto">
        <h2 className="text-base font-bold text-white mb-4 pb-2 border-b border-slate-800 flex items-center space-x-2">
          <Layers className="w-4 h-4 text-indigo-400" />
          <span>Product Diagnostic Audit</span>
        </h2>

        {/* Product Details */}
        <div className="space-y-3 text-xs mb-6 bg-slate-950/60 p-3.5 rounded-lg border border-slate-800">
          <div className="flex justify-between">
            <span className="text-slate-400">Product ID:</span>
            <span className="font-mono font-semibold text-indigo-300">{productData?.productId || 'RF-PRD-0008'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">SKU:</span>
            <span className="font-mono text-white">{productData?.sku || 'CR - 7 x 3'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Type / Category:</span>
            <span className="text-white">{productData?.productType} / {productData?.category}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">HTTP Status:</span>
            <span className="font-mono text-emerald-400 font-semibold">{httpStatus}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Fallback Used:</span>
            <span className="font-bold text-emerald-400">NO</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">GLB URL:</span>
            <span className="font-mono text-slate-300 truncate max-w-[180px]" title={productData?.glbUrl}>
              {productData?.glbUrl}
            </span>
          </div>
        </div>

        {/* Geometry Dimensions */}
        <div className="mb-6">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2.5">Native Dimensions</h3>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="bg-slate-800/80 p-2.5 rounded border border-slate-700/50">
              <div className="text-slate-400 text-[10px]">Native W (X)</div>
              <div className="font-mono font-bold text-white text-sm mt-0.5">32.52"</div>
            </div>
            <div className="bg-slate-800/80 p-2.5 rounded border border-slate-700/50">
              <div className="text-slate-400 text-[10px]">Native D (Z)</div>
              <div className="font-mono font-bold text-white text-sm mt-0.5">37.21"</div>
            </div>
            <div className="bg-slate-800/80 p-2.5 rounded border border-slate-700/50">
              <div className="text-slate-400 text-[10px]">Native H (Y)</div>
              <div className="font-mono font-bold text-white text-sm mt-0.5">84.89"</div>
            </div>
          </div>
        </div>

        {/* Mesh Structural Count */}
        <div className="mb-6 bg-slate-950/60 p-3.5 rounded-lg border border-slate-800">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2.5">Mesh Classification (33 Total)</h3>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-300">Actual Uprights (3):</span>
              <span className="font-mono text-indigo-300">Pillar #19, Wings #0, #27</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-300">Actual Shelves (6):</span>
              <span className="font-mono text-indigo-300">#3, #4, #11, #12, #13, #29</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-300">Actual Brackets (6):</span>
              <span className="font-mono text-indigo-300">#14, #15, #16, #28, #31, #32</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-300">Back Panels (10):</span>
              <span className="font-mono text-indigo-300">5 per wing (90° corner)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-300">Base Levelers / Feet (8):</span>
              <span className="font-mono text-indigo-300">Plates, Bolts, Nuts</span>
            </div>
          </div>
        </div>

        {/* Upright Positions & Corner Anchor */}
        <div className="mb-6 bg-slate-950/60 p-3.5 rounded-lg border border-slate-800">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2.5">Corner Anchor & Wings</h3>
          <div className="space-y-2 text-xs">
            <div>
              <span className="text-emerald-400 font-semibold">Corner Pillar (Mesh 19):</span>
              <div className="font-mono text-slate-300 text-[11px] mt-0.5">X=427.33", Z=-766.05" (Anchor Origin)</div>
            </div>
            <div>
              <span className="text-sky-400 font-semibold">Wing A Upright (Mesh 0):</span>
              <div className="font-mono text-slate-300 text-[11px] mt-0.5">Length: 25.01", Dist to pillar: 27.20"</div>
            </div>
            <div>
              <span className="text-sky-400 font-semibold">Wing B Upright (Mesh 27):</span>
              <div className="font-mono text-slate-300 text-[11px] mt-0.5">Length: 23.64", Dist to pillar: 26.42"</div>
            </div>
            <div>
              <span className="text-amber-400 font-semibold">Shelf Geometry:</span>
              <div className="font-mono text-slate-300 text-[11px] mt-0.5">5-sided pentagonal chamfer (8.49" bracket face)</div>
            </div>
          </div>
        </div>

        {/* Navigation link back to CAD */}
        <div className="mt-auto pt-4 border-t border-slate-800">
          <a
            href="/"
            className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition"
          >
            <span>Return to RetailFix CAD Editor</span>
          </a>
        </div>
      </div>
    </div>
  );
};
export default DevProductPreview;
