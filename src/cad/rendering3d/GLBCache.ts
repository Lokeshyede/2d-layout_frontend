import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { ParametricRackBuilder } from './parametric/ParametricRackBuilder.ts';
import { type ShelfPlacement } from './parametric/ShelfPlacementEngine.ts';
import { resolveBackendUrl } from '../../services/api';

export interface ModelNormalizationOptions {
  targetWidth: number;   // requested inches in CAD
  targetHeight: number;  // requested inches in CAD
  targetDepth: number;   // requested inches in CAD
  baseWidth?: number;    // base GLB physical width (inches)
  baseHeight?: number;   // base GLB physical height (inches)
  baseDepth?: number;    // base GLB physical depth (inches)
  localWidthAxis?: 'X' | 'Y' | 'Z';
  localHeightAxis?: 'X' | 'Y' | 'Z';
  localDepthAxis?: 'X' | 'Y' | 'Z';
  correctionRotation?: { x: number; y: number; z: number }; // degrees
  scalingMode?: string;  // 'stretch' (default) or 'fit'
  shelves?: number;      // target shelf count (legacy / backwards compatibility)
  shelfCount?: number;   // authoritative target shelf count
  shelfSpacing?: number | 'auto'; // 'auto' or numeric inches
  shelfThickness?: number; // physical thickness in inches (default 1.0)
  supportsParametricShelves?: boolean;
  isWallMounted?: boolean;
  productName?: string;
  sku?: string;
  hideLeftPost?: boolean;
  isCornerRack?: boolean;
  isEndcap?: boolean;
  isCenterRack?: boolean;
  cornerAnchor?: { x: number; y: number; z: number };
  hideRightPost?: boolean;
}

export interface ModelDiagnostics {
  productName: string;
  sku: string;
  glbFileName: string;
  glbUrl: string;

  // GLB NATIVE
  nativeAxis: { x: string; y: string; z: string };
  nativeSize: { x: number; y: number; z: number };

  // PRODUCT BASE
  baseDimensions: { width: number; depth: number; height: number };

  // CURRENT TARGET
  targetDimensions: { width: number; depth: number; height: number };

  // NORMALIZED MODEL (Stage 1 result at base dimensions)
  normalizedDimensions: { width: number; depth: number; height: number };

  // FINAL MODEL (Stage 2 scaled result)
  finalDimensions: { width: number; depth: number; height: number };

  // TRANSFORMS
  correctionRotation: { x: number; y: number; z: number };
  cadRotationDeg: number;

  stage1Scale: { width: number; depth: number; height: number };
  stage2Scale: { width: number; depth: number; height: number };
  scaleRatios: { width: number; depth: number; height: number };

  // Backwards compatibility with previous interfaces
  currentDimensions: { width: number; depth: number; height: number };
  nativeExtents: { width: number; height: number; depth: number };
  axes: { width: string; height: string; depth: string };

  meshCount: number;
  totalMeshCount: number;
  materials: string[];
  isParametric: boolean;
  shelfCount?: number;
  bracketCount?: number;
  shelfSpacing?: number | 'auto';
  shelfThickness?: number;
  effectiveShelfSpacing?: number;
  shelfPlacements?: ShelfPlacement[];
}

interface CachedModelEntry {
  originalScene: THREE.Group;
  nativeProductBox: THREE.Box3;
  nativeProductSize: THREE.Vector3;
  nativeProductCenter: THREE.Vector3;
  nativeUnitScale: number; // conversion from raw file units to inches
  nativeAxis: { x: string; y: string; z: string };
  defaultRotationDeg: number;
  productMeshCount: number;
  totalMeshCount: number;
  materials: string[];
  cornerAnalysis?: { cornerRotDeg: number; outerCornerLocal: THREE.Vector3 };
}

class GLBCacheService {
  private loader: GLTFLoader = new GLTFLoader();
  private cache: Map<string, Promise<CachedModelEntry>> = new Map();
  private failedUrls: Set<string> = new Set();

  /**
   * Resolves full URL (prepends backend origin if relative path e.g. /uploads/...)
   */
  public resolveUrl(url: string): string {
    if (!url) return '';
    return resolveBackendUrl(url);
  }

  /**
   * Clears a previously-failed URL from the session blacklist so it can be retried.
   * Call this before loading an Endcap (or any critical product) so a prior transient
   * failure does not permanently block the asset for the lifetime of the browser tab.
   */
  public clearFailed(url: string): void {
    const fullUrl = this.resolveUrl(url);
    if (this.failedUrls.has(fullUrl)) {
      this.failedUrls.delete(fullUrl);
      this.cache.delete(fullUrl); // also evict stale cache promise if any
      console.log(`[GLBCache] Cleared failed-URL blacklist for: ${fullUrl}`);
    }
  }


  /**
   * Loads a GLB once, analyzes product bounds and native orientation,
   * caches the original unmodified template scene.
   */
  public async loadModel(url: string): Promise<CachedModelEntry> {
    if (!url || !url.trim()) {
      throw new Error('[GLBCache] Empty GLB URL: model is not available.');
    }

    const fullUrl = this.resolveUrl(url);

    if (this.failedUrls.has(fullUrl)) {
      throw new Error(`[GLBCache] Model ${fullUrl} previously failed to load in this session.`);
    }

    if (this.cache.has(fullUrl)) {
      return this.cache.get(fullUrl)!;
    }

    const loadPromise = new Promise<CachedModelEntry>((resolve, reject) => {
      this.loader.load(
        fullUrl,
        (gltf) => {
          try {
            const scene = gltf.scene;

            // 1. Isolate genuine product meshes from auxiliary room/building meshes
            const {
              totalMeshCount,
              productMeshCount,
              materials,
              productBox,
              estimatedNativeUnitScale,
            } = this.analyzeSceneProductBounds(scene);

            const rawSize = new THREE.Vector3();
            productBox.getSize(rawSize);
            const rawCenter = new THREE.Vector3();
            productBox.getCenter(rawCenter);

            // 2. Use detected native unit scale (meters vs mm vs inches)
            const nativeUnitScale = estimatedNativeUnitScale;

            // 3. Determine native axis mapping from the actual rack geometry:
            // Native Height is along Y (shelves stack vertically along Y, uprights span Y from 0 to 2.16m).
            // Between X and Z:
            // In commercial retail rack GLBs, the shelf run spans along native Z.
            // Even in double-sided gondolas where depth (X) is slightly larger than width (Z)
            // (e.g. 38.99" depth vs 37.75" width), the shelf span is along Z!
            let zShelfSpanCount = 0;
            let xShelfSpanCount = 0;
            scene.traverse((obj) => {
              if ((obj as THREE.Mesh).isMesh) {
                const b = new THREE.Box3().setFromObject(obj as THREE.Mesh);
                const s = new THREE.Vector3();
                b.getSize(s);
                const maxHoriz = Math.max(s.x, s.z);
                const minHoriz = Math.min(s.x, s.z);
                if (maxHoriz >= 0.4 && maxHoriz <= 3.5 && s.y <= 0.15 && maxHoriz > minHoriz * 1.2) {
                  if (s.z > s.x) zShelfSpanCount++;
                  else if (s.x > s.z) xShelfSpanCount++;
                }
              }
            });

            const isShelfSpanAlongZ = zShelfSpanCount > 0
              ? (zShelfSpanCount >= xShelfSpanCount)
              : (rawSize.z >= rawSize.x * 0.85);

            let nativeAxis: { x: string; y: string; z: string };
            let defaultRotationDeg = 0;

            if (isShelfSpanAlongZ) {
              // Native Z is Width (shelf span), Native X is Depth (front/back), Native Y is Height
              nativeAxis = { x: 'Depth', y: 'Height', z: 'Width' };
              // +90 deg around Y maps native Z to CAD X (Width) and native -X to CAD +Z (Depth front)
              defaultRotationDeg = 90;
            } else {
              nativeAxis = { x: 'Width', y: 'Height', z: 'Depth' };
              defaultRotationDeg = 0;
            }

            let cornerAnalysis: { cornerRotDeg: number; outerCornerLocal: THREE.Vector3 } | undefined;
            // Identify if this is a Corner Rack by product category or meshes (we will just calculate for all and use if needed)
            cornerAnalysis = this.analyzeCornerGeometry(scene);

            const entry: CachedModelEntry = {
              originalScene: scene,
              nativeProductBox: productBox,
              nativeProductSize: rawSize,
              nativeProductCenter: rawCenter,
              nativeUnitScale,
              nativeAxis,
              defaultRotationDeg,
              productMeshCount,
              totalMeshCount,
              materials,
              cornerAnalysis,
            };

            resolve(entry);
          } catch (err) {
            reject(err);
          }
        },
        undefined,
        (error) => {
          console.warn(`[GLBCache] Model asset unavailable at ${fullUrl}:`, error);
          this.failedUrls.add(fullUrl);
          this.cache.delete(fullUrl);
          reject(error);
        }
      );
    });

    this.cache.set(fullUrl, loadPromise);
    return loadPromise;
  }

  /**
   * Deterministically identifies the outer corner and required rotation for a Corner Rack
   * by analyzing its L-shaped native footprint.
   */
  private analyzeCornerGeometry(scene: THREE.Group): { cornerRotDeg: number, outerCornerLocal: THREE.Vector3 } | undefined {
     const pts: THREE.Vector3[] = [];
     scene.updateMatrixWorld(true);
     scene.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
           const mesh = obj as THREE.Mesh;
           const pos = mesh.geometry.attributes.position;
           if (!pos) return;
           const mat = mesh.matrixWorld;
           // Sample vertices (stride to avoid huge processing)
           const step = Math.max(1, Math.floor(pos.count / 1000));
           for (let i = 0; i < pos.count; i += step) {
               const p = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
               p.applyMatrix4(mat);
               pts.push(p);
           }
        }
     });

     if (pts.length === 0) return undefined;

     let minY = Infinity;
     for (const p of pts) {
         if (p.y < minY) minY = p.y;
     }

     // Find OBB by sweeping 0 to 90 degrees to minimize bounding box area
     let bestArea = Infinity;
     let bestTheta = 0;
     let bestBounds = { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };

     for (let deg = 0; deg < 90; deg++) {
         const theta = deg * Math.PI / 180;
         const cos = Math.cos(theta);
         const sin = Math.sin(theta);
         
         let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
         for (const p of pts) {
             const rx = p.x * cos + p.z * sin;
             const rz = -p.x * sin + p.z * cos;
             if (rx < minX) minX = rx;
             if (rx > maxX) maxX = rx;
             if (rz < minZ) minZ = rz;
             if (rz > maxZ) maxZ = rz;
         }
         const area = (maxX - minX) * (maxZ - minZ);
         if (area < bestArea) {
             bestArea = area;
             bestTheta = theta;
             bestBounds = { minX, maxX, minZ, maxZ };
         }
     }

     const rotCorners = [
         new THREE.Vector2(bestBounds.minX, bestBounds.minZ),
         new THREE.Vector2(bestBounds.maxX, bestBounds.minZ),
         new THREE.Vector2(bestBounds.maxX, bestBounds.maxZ),
         new THREE.Vector2(bestBounds.minX, bestBounds.maxZ)
     ];

     let maxDist = -1;
     let emptyCornerIdx = -1;

     // The empty aisle corner is the one furthest from any vertex
     for (let i = 0; i < 4; i++) {
         const c = rotCorners[i];
         let minDist = Infinity;
         for (const p of pts) {
             const rx = p.x * Math.cos(bestTheta) + p.z * Math.sin(bestTheta);
             const rz = -p.x * Math.sin(bestTheta) + p.z * Math.cos(bestTheta);
             const dx = rx - c.x;
             const dz = rz - c.y;
             const dist = dx*dx + dz*dz;
             if (dist < minDist) minDist = dist;
         }
         if (minDist > maxDist) {
             maxDist = minDist;
             emptyCornerIdx = i;
         }
     }

     if (emptyCornerIdx === -1) return undefined;

     const outerCornerIdx = (emptyCornerIdx + 2) % 4;
     const rotOuterCorner = rotCorners[outerCornerIdx];
     const rotEmptyCorner = rotCorners[emptyCornerIdx];

     // Rotate back to original native frame
     const cosBack = Math.cos(-bestTheta);
     const sinBack = Math.sin(-bestTheta);
     
     const outerCorner2D = new THREE.Vector2(
         rotOuterCorner.x * cosBack + rotOuterCorner.y * sinBack,
         -rotOuterCorner.x * sinBack + rotOuterCorner.y * cosBack
     );
     
     const emptyCorner2D = new THREE.Vector2(
         rotEmptyCorner.x * cosBack + rotEmptyCorner.y * sinBack,
         -rotEmptyCorner.x * sinBack + rotEmptyCorner.y * cosBack
     );

     const outerCornerLocal = new THREE.Vector3(outerCorner2D.x, minY, outerCorner2D.y);
     const bisector = new THREE.Vector2(emptyCorner2D.x - outerCorner2D.x, emptyCorner2D.y - outerCorner2D.y).normalize();
     
     // In Three.js, positive rotation.y rotates from +Z to +X.
     // Math.atan2(z, x) measures angle from +X to +Z.
     // To rotate from currentAngle to targetAngle in XZ plane, rotation.y must be -(targetAngle - currentAngle)
     const currentAngle = Math.atan2(bisector.y, bisector.x);
     const targetAngle = Math.PI / 4;
     let cornerRotDeg = -((targetAngle - currentAngle) * 180 / Math.PI);

     return { cornerRotDeg, outerCornerLocal };
  }

  /**
   * Analyzes scene to compute bounding box of genuine product components,
   * filtering out composite CAD auxiliary geometry (e.g. 28m room shell, limestone floor tile quad).
   * Does NOT mutate the original scene.
   */
  private analyzeSceneProductBounds(scene: THREE.Group): {
    totalMeshCount: number;
    productMeshCount: number;
    materials: string[];
    productBox: THREE.Box3;
    estimatedNativeUnitScale: number;
  } {
    const productBox = new THREE.Box3();
    const materialsSet = new Set<string>();
    let totalMeshCount = 0;
    let productMeshCount = 0;

    scene.updateMatrixWorld(true);

    // Scan all meshes and collect geometry metadata
    const meshes: { mesh: THREE.Mesh; box: THREE.Box3; size: THREE.Vector3; maxDim: number }[] = [];
    scene.traverse((obj) => {
      // Ignore camera helpers / viewport auxiliary nodes
      if (obj.name && obj.name.toLowerCase().includes('active_view')) {
        return;
      }

      if ((obj as THREE.Mesh).isMesh) {
        totalMeshCount++;
        const mesh = obj as THREE.Mesh;
        const mBox = new THREE.Box3().setFromObject(mesh);
        const mSize = new THREE.Vector3();
        mBox.getSize(mSize);
        const maxDim = Math.max(mSize.x, mSize.y, mSize.z);

        if (mesh.material) {
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach((m) => m.name && materialsSet.add(m.name));
          } else if (mesh.material.name) {
            materialsSet.add(mesh.material.name);
          }
        }

        meshes.push({ mesh, box: mBox, size: mSize, maxDim });
      }
    });

    // Detect native unit scale robustly:
    // If largest component > 500: unit is MM (nativeUnitScale = 1/25.4, aux threshold = 5000 mm).
    // If largest component <= 500:
    //   Compare meshes in typical retail rack component ranges:
    //   - Meter range: 0.3m to 3.5m (rack shelves and uprights in glTF standard meters)
    //   - Inch range: 12" to 120" (rack shelves and uprights in raw inches)
    const largestDim = meshes.reduce((acc, m) => Math.max(acc, m.maxDim), 0);
    let estimatedNativeUnitScale = 39.37007874;
    let auxThresholdNative = 5.0; // 5 meters

    if (largestDim > 500) {
      estimatedNativeUnitScale = 1.0 / 25.4;
      auxThresholdNative = 5000.0;
    } else {
      const inchCount = meshes.filter((m) => m.maxDim >= 15 && m.maxDim <= 150).length;
      const meterCount = meshes.filter((m) => m.maxDim >= 0.3 && m.maxDim <= 3.5).length;
      if (meterCount >= inchCount && meterCount > 0) {
        estimatedNativeUnitScale = 39.37007874;
        auxThresholdNative = 5.0;
      } else {
        estimatedNativeUnitScale = 1.0;
        auxThresholdNative = 200.0;
      }
    }

    // PHASE B: Build productBox from genuine product components (<= auxThresholdNative).
    // Any mesh > auxThresholdNative is an external room shell, floor plane, or building wall.
    for (const m of meshes) {
      if (m.maxDim <= auxThresholdNative) {
        productBox.union(m.box);
        productMeshCount++;
      }
    }

    // If no mesh passed the threshold, fallback to entire scene bounds
    if (productMeshCount === 0) {
      productBox.setFromObject(scene);
      productMeshCount = totalMeshCount;
    }

    return {
      totalMeshCount,
      productMeshCount,
      materials: Array.from(materialsSet),
      productBox,
      estimatedNativeUnitScale,
    };
  }


  /**
   * Instantiates a clean 3D rack model preserving 100% of the uploaded GLB's internal hierarchy,
   * meshes, geometries, and materials.
   *
   * Authoritative Transformation Pipeline:
   *
   *   RackInstance (Outer CAD transform: position & CAD rotation)
   *       ↓
   *   ModelRoot (Authoritative two-stage scale)
   *       ↓
   *   ModelAnchor (Correction rotation: +90° around Y)
   *       ↓
   *   UploadedGLB (Original cloned GLTF scene with exact anchor offset)
   */
  public async createInstance(
    url: string,
    options: ModelNormalizationOptions
  ): Promise<THREE.Group> {
    try {
      const entry = await this.loadModel(url);

      // 1. Deep clone the scene without modifying any child meshes or materials
      const uploadedGLB = SkeletonUtils.clone(entry.originalScene) as THREE.Group;
      uploadedGLB.name = 'UploadedGLB';
      uploadedGLB.updateMatrixWorld(true);

      // ENDCAP GLB VERIFICATION LOG
      // Proves the exact Admin-uploaded GLB is being used — not a fallback, not another product's GLB.
      if (options.isEndcap) {
        const verifiedFilename = url.split('/').pop() || url;
        console.log(
          `[ENDCAP GLB VERIFIED]\n` +
          `DB GLB URL      : ${url}\n` +
          `Loaded filename : ${verifiedFilename}\n` +
          `Mesh count      : ${entry.productMeshCount} (product) / ${entry.totalMeshCount} (total)\n` +
          `ParametricShelves: DISABLED (isEndcap=true — child meshes preserved)\n` +
          `Fallback used   : NO`
        );
      }

      // CENTER RACK GLB VERIFICATION & DIAGNOSTIC LOG (Section 11)
      if (options.isCenterRack) {
        const verifiedFilename = url.split('/').pop() || url;
        const pSize = entry.nativeProductSize;
        const pCenter = entry.nativeProductCenter;
        console.log(
          `[CENTER RACK 3D DIAGNOSTICS]\n` +
          `CAD:\n` +
          `  target dimensions = ${options.targetWidth || 36}" W × ${options.targetDepth || 36}" D × ${options.targetHeight || 60}" H\n` +
          `GLB:\n` +
          `  raw size = [${(pSize.x * entry.nativeUnitScale).toFixed(2)}" X, ${(pSize.y * entry.nativeUnitScale).toFixed(2)}" Y, ${(pSize.z * entry.nativeUnitScale).toFixed(2)}" Z]\n` +
          `  raw center = [${pCenter.x.toFixed(3)}, ${pCenter.y.toFixed(3)}, ${pCenter.z.toFixed(3)}]\n` +
          `NORMALIZED:\n` +
          `  width axis = ${entry.nativeAxis.z} (GLB Z)\n` +
          `  depth axis = ${entry.nativeAxis.x} (GLB X)\n` +
          `  up axis    = ${entry.nativeAxis.y} (GLB Y)\n` +
          `  default rotation = ${entry.defaultRotationDeg}°\n` +
          `  mesh count = ${entry.productMeshCount} of ${entry.totalMeshCount}\n` +
          `  file = ${verifiedFilename}`
        );
      }

      // Safe detachment of genuine external architectural auxiliary meshes (e.g. 28-meter building shells/floors)
      // Unit-aware check: meshes exceeding 5.0 meters (or 200 inches / 5000 mm) are external building shells.
      // Functional rack meshes (shelves, uprights, back panels, base decks, side panels, brackets, posts) are NEVER pruned.
      const nativeAuxThreshold = entry.nativeUnitScale === 1.0 ? 200.0 : (entry.nativeUnitScale < 1.0 ? 5000.0 : 5.0);

      const auxiliaryMeshes: THREE.Object3D[] = [];
      uploadedGLB.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const m = child as THREE.Mesh;
          const mBox = new THREE.Box3().setFromObject(m);
          const mSize = new THREE.Vector3();
          mBox.getSize(mSize);
          const maxDim = Math.max(mSize.x, mSize.y, mSize.z);

          if (maxDim > nativeAuxThreshold) {
            auxiliaryMeshes.push(child);
          } else {
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
        }
      });

      for (const aux of auxiliaryMeshes) {
        aux.removeFromParent();
      }

      // Base physical product dimensions (inches)
      const baseW = options.baseWidth && options.baseWidth > 0 ? options.baseWidth : 36;
      const baseH = options.baseHeight && options.baseHeight > 0 ? options.baseHeight : 84;
      const baseD = options.baseDepth && options.baseDepth > 0 ? options.baseDepth : 24;

      // 2. MODEL ANCHOR LAYER
      // Applies correction rotation so native Width aligns with CAD X, Native Height with CAD Y,
      // and Native Depth with CAD Z.
      const modelAnchor = new THREE.Group();
      modelAnchor.name = 'ModelAnchor';

      // Use correctionRotation.y if specified and non-zero; otherwise default to entry.defaultRotationDeg (e.g. 90)
      let rotDegY = entry.defaultRotationDeg;
      if (options.correctionRotation?.y !== undefined && options.correctionRotation.y !== 0) {
        rotDegY = options.correctionRotation.y;
      }

      if (options.isCornerRack && entry.cornerAnalysis) {
        // OVERRIDE FOR DETERMINISTIC CORNER ALIGNMENT
        rotDegY = entry.cornerAnalysis.cornerRotDeg;
      }

      const rotDegX = options.correctionRotation?.x ?? 0;
      const rotDegZ = options.correctionRotation?.z ?? 0;

      const rotRadX = (rotDegX * Math.PI) / 180;
      const rotRadY = (rotDegY * Math.PI) / 180;
      const rotRadZ = (rotDegZ * Math.PI) / 180;

      modelAnchor.rotation.set(rotRadX, rotRadY, rotRadZ);
      modelAnchor.add(uploadedGLB);

      // 3. ANCHOR ALIGNMENT OFFSET ON UPLOADED GLB
      const pBox = entry.nativeProductBox;
      const pCenter = entry.nativeProductCenter;
      const pSize = entry.nativeProductSize;

      let unscaledRotWidth: number;
      let unscaledRotHeight: number;
      let unscaledRotDepth: number;

      if (options.isCornerRack && entry.cornerAnalysis) {
        // DETERMINISTIC CORNER ANCHORING
        // Align outer corner of the native GLB to (0,0,0) locally so it stays at the origin when rotated
        const anchor = entry.cornerAnalysis.outerCornerLocal;
        uploadedGLB.position.set(-anchor.x, -anchor.y, -anchor.z);

        // Compute unscaled dimensions based on the new rotated bounding box
        const rotatedBox = new THREE.Box3().setFromObject(modelAnchor);
        const rotSize = new THREE.Vector3();
        rotatedBox.getSize(rotSize);
        unscaledRotWidth = rotSize.x;
        unscaledRotHeight = rotSize.y;
        unscaledRotDepth = rotSize.z;
      } else if (rotDegY === 90 || rotDegY === -270) {
        unscaledRotWidth = pSize.z;
        unscaledRotHeight = pSize.y;
        unscaledRotDepth = pSize.x;

        uploadedGLB.position.y = -pBox.min.y;
        uploadedGLB.position.z = -pCenter.z;
        if (options.isWallMounted || options.isEndcap) {
          uploadedGLB.position.x = -pBox.max.x;
        } else {
          uploadedGLB.position.x = -pCenter.x;
        }
      } else if (rotDegY === 180 || rotDegY === -180) {
        unscaledRotWidth = pSize.x;
        unscaledRotHeight = pSize.y;
        unscaledRotDepth = pSize.z;

        uploadedGLB.position.y = -pBox.min.y;
        uploadedGLB.position.x = -pCenter.x;
        if (options.isWallMounted || options.isEndcap) {
          uploadedGLB.position.z = -pBox.max.z;
        } else {
          uploadedGLB.position.z = -pCenter.z;
        }
      } else if (rotDegY === 270 || rotDegY === -90) {
        unscaledRotWidth = pSize.z;
        unscaledRotHeight = pSize.y;
        unscaledRotDepth = pSize.x;

        uploadedGLB.position.y = -pBox.min.y;
        uploadedGLB.position.z = -pCenter.z;
        if (options.isWallMounted || options.isEndcap) {
          uploadedGLB.position.x = -pBox.min.x;
        } else {
          uploadedGLB.position.x = -pCenter.x;
        }
      } else {
        unscaledRotWidth = pSize.x;
        unscaledRotHeight = pSize.y;
        unscaledRotDepth = pSize.z;

        uploadedGLB.position.y = -pBox.min.y;
        uploadedGLB.position.x = -pCenter.x;
        if (options.isWallMounted || options.isEndcap) {
          uploadedGLB.position.z = -pBox.min.z;
        } else {
          uploadedGLB.position.z = -pCenter.z;
        }
      }

      // 4. MODEL ROOT (Authoritative Two-Stage Scaling)
      const modelRoot = new THREE.Group();
      modelRoot.name = 'ModelRoot';
      modelRoot.add(modelAnchor);

      const targetW = options.targetWidth && options.targetWidth > 0 ? options.targetWidth : baseW;
      const targetH = options.targetHeight && options.targetHeight > 0 ? options.targetHeight : baseH;
      const targetD = options.targetDepth && options.targetDepth > 0 ? options.targetDepth : baseD;

      // STAGE 1: Native GLB -> Base Dimensions
      const nativeInchesW = unscaledRotWidth * entry.nativeUnitScale;
      const nativeInchesH = unscaledRotHeight * entry.nativeUnitScale;
      const nativeInchesD = unscaledRotDepth * entry.nativeUnitScale;

      let stage1ScaleX = nativeInchesW > 0 ? (baseW / nativeInchesW) * entry.nativeUnitScale : 1;
      let stage1ScaleY = nativeInchesH > 0 ? (baseH / nativeInchesH) * entry.nativeUnitScale : 1;
      let stage1ScaleZ = nativeInchesD > 0 ? (baseD / nativeInchesD) * entry.nativeUnitScale : 1;

      // STAGE 2: Base Dimensions -> Current Requested CAD Dimensions
      let stage2ScaleX = targetW / baseW;
      let stage2ScaleY = targetH / baseH;
      let stage2ScaleZ = targetD / baseD;

      if (options.isCornerRack) {
        const uniformStage1 = Math.min(stage1ScaleX, stage1ScaleZ);
        stage1ScaleX = uniformStage1;
        stage1ScaleZ = uniformStage1;
        
        const uniformStage2 = Math.min(stage2ScaleX, stage2ScaleZ);
        stage2ScaleX = uniformStage2;
        stage2ScaleZ = uniformStage2;
      }

      // 4b. PARAMETRIC SHELF SYSTEM
      const effectiveShelfCount = options.shelfCount ?? options.shelves;
      let parametricResult = {
        appliedShelfCount: effectiveShelfCount || 6,
        shelfPlacements: [] as ShelfPlacement[],
        shelfLevels: [] as any[],
        effectiveSpacing: 0,
        shelfThickness: options.shelfThickness || 1.0,
        bracketCount: 0,
        isParametric: false,
      };

      if (options.supportsParametricShelves !== false && effectiveShelfCount !== undefined) {
        const nativeHeightInches = entry.nativeProductSize.y * entry.nativeUnitScale;
        const innerNodeScaleY = targetH / (nativeHeightInches > 0 ? nativeHeightInches : baseH);

        parametricResult = ParametricRackBuilder.configureParametricShelves(uploadedGLB, {
          targetWidth: targetW,
          targetHeight: targetH,
          targetDepth: targetD,
          baseWidth: baseW,
          baseHeight: baseH,
          baseDepth: baseD,
          shelfCount: effectiveShelfCount,
          shelfSpacing: options.shelfSpacing,
          shelfThickness: options.shelfThickness,
          stage2ScaleY,
          totalScaleY: innerNodeScaleY,
          stage1ScaleY,
          isWallMounted: options.isWallMounted,
          hideLeftPost: options.hideLeftPost,
          hideRightPost: options.hideRightPost,
        });
      }

      const mode = options.scalingMode || (options.isEndcap ? 'fit' : 'stretch');
      if (mode === 'fit') {
        const uniformRatio = Math.min(stage2ScaleX, stage2ScaleY, stage2ScaleZ);
        modelRoot.scale.set(
          stage1ScaleX * uniformRatio,
          stage1ScaleY * uniformRatio,
          stage1ScaleZ * uniformRatio
        );
      } else {
        modelRoot.scale.set(
          stage1ScaleX * stage2ScaleX,
          stage1ScaleY * stage2ScaleY,
          stage1ScaleZ * stage2ScaleZ
        );
      }
      modelRoot.updateMatrixWorld(true);

      // 5. RACK INSTANCE (Outer CAD Container)
      const rackInstance = new THREE.Group();
      rackInstance.name = `RackInstance_${Math.random().toString(36).substring(2, 8)}`;
      rackInstance.add(modelRoot);

      // Diagnostics matching the required diagnostic pipeline:
      const fileName = url.split('/').pop() || url;
      const nativeInchesX = Math.round(pSize.x * entry.nativeUnitScale * 100) / 100;
      const nativeInchesY = Math.round(pSize.y * entry.nativeUnitScale * 100) / 100;
      const nativeInchesZ = Math.round(pSize.z * entry.nativeUnitScale * 100) / 100;

      const diagnostics: ModelDiagnostics = {
        productName: options.productName || 'Rack',
        sku: options.sku || '',
        glbFileName: fileName,
        glbUrl: url,

        // GLB NATIVE
        nativeAxis: entry.nativeAxis,
        nativeSize: { x: nativeInchesX, y: nativeInchesY, z: nativeInchesZ },

        // PRODUCT BASE
        baseDimensions: {
          width: Math.round(baseW * 100) / 100,
          depth: Math.round(baseD * 100) / 100,
          height: Math.round(baseH * 100) / 100,
        },

        // CURRENT TARGET
        targetDimensions: {
          width: Math.round(targetW * 100) / 100,
          depth: Math.round(targetD * 100) / 100,
          height: Math.round(targetH * 100) / 100,
        },

        // NORMALIZED MODEL (Stage 1 result)
        normalizedDimensions: {
          width: Math.round(baseW * 100) / 100,
          depth: Math.round(baseD * 100) / 100,
          height: Math.round(baseH * 100) / 100,
        },

        // FINAL MODEL (Stage 2 scaled result)
        finalDimensions: {
          width: Math.round(targetW * 100) / 100,
          depth: Math.round(targetD * 100) / 100,
          height: Math.round(targetH * 100) / 100,
        },

        // TRANSFORMS
        correctionRotation: {
          x: rotDegX,
          y: rotDegY,
          z: rotDegZ,
        },
        cadRotationDeg: 0,

        stage1Scale: {
          width: Math.round(stage1ScaleX * 1000) / 1000,
          depth: Math.round(stage1ScaleZ * 1000) / 1000,
          height: Math.round(stage1ScaleY * 1000) / 1000,
        },
        stage2Scale: {
          width: Math.round(stage2ScaleX * 1000) / 1000,
          depth: Math.round(stage2ScaleZ * 1000) / 1000,
          height: Math.round(stage2ScaleY * 1000) / 1000,
        },
        scaleRatios: {
          width: Math.round(stage2ScaleX * 1000) / 1000,
          depth: Math.round(stage2ScaleZ * 1000) / 1000,
          height: Math.round(stage2ScaleY * 1000) / 1000,
        },

        currentDimensions: {
          width: Math.round(targetW * 100) / 100,
          depth: Math.round(targetD * 100) / 100,
          height: Math.round(targetH * 100) / 100,
        },
        nativeExtents: {
          width: nativeInchesZ,
          height: nativeInchesY,
          depth: nativeInchesX,
        },
        axes: {
          width: options.localWidthAxis || (entry.defaultRotationDeg === 90 ? 'Z' : 'X'),
          height: options.localHeightAxis || 'Y',
          depth: options.localDepthAxis || (entry.defaultRotationDeg === 90 ? 'X' : 'Z'),
        },

        meshCount: entry.productMeshCount,
        totalMeshCount: entry.totalMeshCount,
        materials: entry.materials,
        isParametric: parametricResult.isParametric,
        shelfCount: parametricResult.appliedShelfCount,
        bracketCount: parametricResult.bracketCount,
        shelfSpacing: options.shelfSpacing,
        shelfThickness: parametricResult.shelfThickness,
        effectiveShelfSpacing: parametricResult.effectiveSpacing,
        shelfPlacements: parametricResult.shelfPlacements,
      };

      rackInstance.userData = {
        type: 'rack_model',
        diagnostics,
        isWallMounted: options.isWallMounted,
        productModelRoot: modelRoot,
        modelRoot,
        modelAnchor,
        uploadedGLB,
        shelfCount: parametricResult.appliedShelfCount,
        bracketCount: parametricResult.bracketCount,
        shelfSpacing: options.shelfSpacing,
        shelfThickness: parametricResult.shelfThickness,
        shelfPlacements: parametricResult.shelfPlacements,
      };

      return rackInstance;
    } catch (err: any) {
      // For Endcaps, re-throw so Entity3DRegistry's strict error handler is reached.
      // An Endcap must NEVER silently fall back to a generic box — it must show
      // an explicit error instead of silently masquerading as another product.
      if (options.isEndcap) {
        console.error(
          `[ENDCAP GLB LOAD FAILURE]\n` +
          `  GLB URL : ${url}\n` +
          `  Error   : ${err.message}\n` +
          `  Action  : Re-throwing — no silent fallback for Endcaps.`
        );
        throw err;
      }
      console.warn(`[GLBCache] Model unavailable for ${url}, showing fallback indicator:`, err);
      return this.createUnavailableFallback(options, err.message);
    }
  }

  /**
   * Fallback only used when GLB fails to load or does not exist.
   * Clearly flags the model failure instead of silently masquerading as the product.
   */
  public createUnavailableFallback(options: ModelNormalizationOptions, errorMessage?: string): THREE.Group {
    const group = new THREE.Group();
    group.name = 'UnavailableRackFallback';

    const w = options.targetWidth;
    const h = options.targetHeight;
    const d = options.targetDepth;

    // Semi-transparent alert box
    const geom = new THREE.BoxGeometry(w, h, d);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      transparent: true,
      opacity: 0.25,
      roughness: 0.8,
    });
    const boxMesh = new THREE.Mesh(geom, mat);
    boxMesh.position.set(0, h / 2, options.isWallMounted ? d / 2 : 0);
    group.add(boxMesh);

    // Wireframe edges
    const edges = new THREE.EdgesGeometry(geom);
    const lineMat = new THREE.LineBasicMaterial({ color: 0xef4444, linewidth: 2 });
    const wireframe = new THREE.LineSegments(edges, lineMat);
    wireframe.position.copy(boxMesh.position);
    group.add(wireframe);

    const diagnostics: ModelDiagnostics = {
      productName: options.productName || 'Unavailable Model',
      sku: options.sku || '',
      glbFileName: 'Unavailable',
      glbUrl: '',
      nativeAxis: { x: 'X', y: 'Y', z: 'Z' },
      nativeSize: { x: w, y: h, z: d },
      baseDimensions: { width: options.baseWidth || w, depth: options.baseDepth || d, height: options.baseHeight || h },
      targetDimensions: { width: w, depth: d, height: h },
      normalizedDimensions: { width: options.baseWidth || w, depth: options.baseDepth || d, height: options.baseHeight || h },
      finalDimensions: { width: w, depth: d, height: h },
      correctionRotation: { x: 0, y: 0, z: 0 },
      cadRotationDeg: 0,
      stage1Scale: { width: 1, depth: 1, height: 1 },
      stage2Scale: { width: 1, depth: 1, height: 1 },
      scaleRatios: { width: 1, depth: 1, height: 1 },
      currentDimensions: { width: w, depth: d, height: h },
      nativeExtents: { width: w, height: h, depth: d },
      axes: { width: 'X', height: 'Y', depth: 'Z' },
      meshCount: 0,
      totalMeshCount: 0,
      materials: ['Unavailable (Fallback)'],
      isParametric: false,
    };

    group.userData = {
      type: 'rack_model',
      isUnavailable: true,
      status: errorMessage || 'Model load failure',
      diagnostics,
      isWallMounted: options.isWallMounted,
    };

    return group;
  }

  /**
   * Invalidates a cached GLB model so that updated assets reload fresh from server.
   */
  public invalidate(url?: string): void {
    if (!url) {
      this.clear();
      return;
    }
    const fullUrl = this.resolveUrl(url);
    this.cache.delete(fullUrl);
    this.failedUrls.delete(fullUrl);
    const cleanUrl = fullUrl.split('?')[0];
    this.cache.delete(cleanUrl);
    this.failedUrls.delete(cleanUrl);
  }

  /**
   * Clears the entire GLB cache.
   */
  public clear(): void {
    this.cache.clear();
    this.failedUrls.clear();
  }

  public clearAll(): void {
    this.clear();
  }
}

export const GLBCache = new GLBCacheService();
