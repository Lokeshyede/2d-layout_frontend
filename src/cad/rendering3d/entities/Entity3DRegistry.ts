import * as THREE from 'three';
import type {
  CADEntity,
  WallEntity,
  ColumnEntity,
  DoorEntity,
  WindowEntity,
  ShutterEntity,
  GlassGateEntity,
  PartitionEntity,
  RackEntity,
  Point2D,
} from '../../types';
import { Wall3DBuilder, STANDARD_WALL_HEIGHT } from './Wall3DBuilder';
import { Door3DBuilder } from './Door3DBuilder';
import { Window3DBuilder } from './Window3DBuilder';
import { Shutter3DBuilder } from './Shutter3DBuilder';
import { Gate3DBuilder } from './Gate3DBuilder';
import { GlassGate3DBuilder } from './GlassGate3DBuilder';
import { Column3DBuilder } from './Column3DBuilder';
import { Partition3DBuilder } from './Partition3DBuilder';
import { ProductModelRegistry } from '../../services/ProductModelRegistry';
import { GLBCache } from '../GLBCache';
import { getWallRackTransform } from '../../converters/WallAttachmentUtils';
import { CenterGondolaEngine } from '../../engine/CenterGondolaEngine';
import { CornerRackEngine } from '../../engine/CornerRackEngine';
import { ConnectedRackEngine } from '../../engine/ConnectedRackEngine';
import { EndcapEngine, type EndcapConnectionResult } from '../../engine/EndcapEngine';
import { calculateWallInwardNormal, isPointInPolygon } from '../../geometry/GeometryMath';

export interface Entity3DContext {
  entities: CADEntity[];
  walls: WallEntity[];
  roomPolygon: Point2D[];
  wallHeight?: number;
  defaultWallThickness?: number;
}

export type Entity3DBuilderFn<T extends CADEntity = CADEntity> = (
  entity: T,
  context: Entity3DContext
) => Promise<THREE.Object3D | null> | THREE.Object3D | null;

/**
 * Centralized 3D Entity Registry & Dispatcher.
 * Maps every CAD entity type to its authoritative 3D representation.
 *
 * Supports procedural architectural generation by default, and allows
 * registering real uploaded GLB models for any entity type in the future.
 */
export class Entity3DRegistry {
  private static builders = new Map<string, Entity3DBuilderFn>();
  private static isInitialized = false;

  public static initialize(): void {
    if (this.isInitialized) return;

    // 1. WALL
    this.register('wall', (entity: CADEntity, ctx: Entity3DContext) => {
      const wall = entity as WallEntity;
      return Wall3DBuilder.buildWall(wall, ctx.entities, ctx.wallHeight || STANDARD_WALL_HEIGHT);
    });

    // 2. COLUMN
    this.register('column', (entity: CADEntity, ctx: Entity3DContext) => {
      const col = entity as ColumnEntity;
      const attachedWall = col.properties.attachedWallId
        ? ctx.walls.find((w) => w.id === col.properties.attachedWallId)
        : undefined;
      return Column3DBuilder.buildColumn(col, attachedWall, ctx.wallHeight || STANDARD_WALL_HEIGHT);
    });

    // 3. DOOR
    this.register('door', (entity: CADEntity, ctx: Entity3DContext) => {
      const door = entity as DoorEntity;
      const attachedWall = door.properties.attachedWallId
        ? ctx.walls.find((w) => w.id === door.properties.attachedWallId)
        : undefined;
      const thickness = attachedWall?.properties.thickness || ctx.defaultWallThickness || 9;
      return Door3DBuilder.buildDoor(door, thickness);
    });

    // 4. WINDOW
    this.register('window', (entity: CADEntity, ctx: Entity3DContext) => {
      const win = entity as WindowEntity;
      const attachedWall = win.properties.attachedWallId
        ? ctx.walls.find((w) => w.id === win.properties.attachedWallId)
        : undefined;
      const thickness = attachedWall?.properties.thickness || ctx.defaultWallThickness || 9;
      return Window3DBuilder.buildWindow(win, thickness);
    });

    // 5. SHUTTER
    this.register('shutter', (entity: CADEntity, ctx: Entity3DContext) => {
      const shutter = entity as ShutterEntity;
      const attachedWall = shutter.properties.attachedWallId
        ? ctx.walls.find((w) => w.id === shutter.properties.attachedWallId)
        : undefined;
      const thickness = attachedWall?.properties.thickness || ctx.defaultWallThickness || 9;
      return Shutter3DBuilder.buildShutter(shutter, thickness);
    });

    // 6. GATE
    this.register('gate', (entity: CADEntity) => {
      return Gate3DBuilder.buildGate(entity);
    });

    // 7. GLASS GATE
    this.register('glass_gate', (entity: CADEntity) => {
      const gg = entity as GlassGateEntity;
      return GlassGate3DBuilder.buildGlassGate(gg);
    });

    // 8. PARTITION
    this.register('partition', (entity: CADEntity) => {
      const partition = entity as PartitionEntity;
      return Partition3DBuilder.buildPartition(partition);
    });

    // 9. RACK (Dynamic GLB Product Models)
    this.register('rack', async (entity: CADEntity, ctx: Entity3DContext) => {
      const rack = entity as RackEntity;

      const isCornerRack = Boolean(
        rack.properties.rackType === 'corner_rack_2x2x2' ||
        rack.properties.rackType === 'Corner Rack'
      );

      let cornerResult: any;
      if (isCornerRack) {
        cornerResult = CornerRackEngine.detectCornerConnection(rack, ctx.entities, ctx.roomPolygon);
        if (!cornerResult.isValid) {
          console.warn(`[Entity3DRegistry] Corner rack rejected: Not a valid 90-degree corner`);
          return null; // Do not place corner rack at non-90° corner
        }
      }

      const isCustom = Boolean(
        rack.properties.isCustom ||
        rack.properties.rackType === 'CUSTOM' ||
        rack.properties.rackType === 'custom_rack'
      );

      // Resolve registered product model from database / registry
      const product = ProductModelRegistry.resolve(
        rack.properties.productModelId,
        rack.properties.rackType
      );

      const isCenterRack = Boolean(
        rack.properties.rackType === 'center_rack_5x3' ||
        rack.properties.rackType === 'Center Rack' ||
        rack.properties.rackType === 'Center Gondola' ||
        (rack.properties.rackType && rack.properties.rackType.toLowerCase().includes('center')) ||
        (rack.properties.rackType && rack.properties.rackType.toLowerCase().includes('gondola')) ||
        (product?.productType && product.productType.toLowerCase().includes('center')) ||
        (product?.category && product.category.toLowerCase().includes('center'))
      );

      const isEndcap = EndcapEngine.isEndcap(rack);

      let w = rack.geometry.width || product?.width || 36;
      let d = rack.geometry.depth || product?.depth || 24;
      let h = rack.geometry.height || product?.height || (isCenterRack ? 60 : 84);
      

      
      let transformShiftX = 0;
      let transformShiftY = 0;
      let hideLeftPost = false;
      let hideRightPost = false;

      if (!isCornerRack && !isCenterRack && rack.properties.attachedWallId) {
        const attachedWall = ctx.walls.find(wl => wl.id === rack.properties.attachedWallId);
        if (attachedWall) {
          const clampResult = CornerRackEngine.clampWallRack(rack, attachedWall, ctx.entities, ctx.roomPolygon);
          if (clampResult) {
            w = clampResult.width;
            transformShiftX = clampResult.shiftX;
            transformShiftY = clampResult.shiftY;
            // hide posts where they connect to corner rack wings
            hideLeftPost = hideLeftPost || clampResult.hideLeftPost;
            hideRightPost = hideRightPost || clampResult.hideRightPost;
          }
        }
      }

      const isWallMounted = !isCenterRack && !isEndcap && Boolean(
        rack.properties.rackType === 'wall_rack_7x3' ||
        rack.properties.rackType === 'wall_rack_7x4' ||
        rack.properties.rackType === 'Wall Rack' ||
        isCornerRack ||
        (rack.properties.rackType && rack.properties.rackType.toLowerCase().includes('wall')) ||
        (product?.productType && product.productType.toLowerCase().includes('wall')) ||
        (product?.category && product.category.toLowerCase().includes('wall')) ||
        Boolean(rack.properties.attachedWallId)
      );

      const resolvedProductName = isCustom
        ? 'Custom Rack'
        : (product?.productName || rack.properties.rackType || 'Wall Rack');
      const resolvedSku = isCustom
        ? 'CUSTOM'
        : (product?.sku || rack.properties.rackType || 'WR');

      let alignedPos: Point2D | undefined;
      let endcapResult: EndcapConnectionResult | null = null;
      
      if (isCenterRack) {
        // Detect continuous gondola runs
        const runs = CenterGondolaEngine.detectRuns(ctx.entities);
        const myRun = runs.find(r => r.racks.some(rk => rk.id === rack.id));
        if (myRun && myRun.racks.length > 1) {
          alignedPos = myRun.alignedPositions.get(rack.id);
          const myIndex = myRun.racks.findIndex(rk => rk.id === rack.id);
          // If we are not the right-most rack in the run, we hide our right post
          // because the rack to our right will supply its left post at that exact position.
          if (myIndex < myRun.racks.length - 1) {
            hideRightPost = true;
          }
        }
      } else if (isEndcap) {
        const runs = CenterGondolaEngine.detectRuns(ctx.entities);
        endcapResult = EndcapEngine.detectEndcapConnection(rack, runs, ctx.roomPolygon);
      }

      let rackObject: THREE.Group;

      if (product && product.glbUrl) {
        try {
          // For Endcaps: clear any prior session-level failure so a previously broken
          // load (from an old code version) doesn't permanently blacklist the URL.
          if (isEndcap) {
            GLBCache.clearFailed(product.glbUrl);
          }

          rackObject = await GLBCache.createInstance(product.glbUrl, {
            targetWidth: w,
            targetHeight: h,
            targetDepth: d,
            baseWidth: rack.properties.baseWidth || product.width,
            baseHeight: rack.properties.baseHeight || product.height,
            baseDepth: rack.properties.baseDepth || product.depth,
            localWidthAxis: product.metadata?.localWidthAxis,
            localHeightAxis: product.metadata?.localHeightAxis,
            localDepthAxis: product.metadata?.localDepthAxis,
            correctionRotation: product.metadata?.correctionRotation,
            scalingMode: rack.properties.scalingMode || product.scalingMode || (isEndcap ? 'fit' : 'stretch'),
            shelves: rack.properties.shelfCount ?? rack.properties.shelves ?? product.shelfCount ?? 6,
            shelfCount: rack.properties.shelfCount ?? rack.properties.shelves ?? product.shelfCount ?? 6,
            shelfSpacing: rack.properties.shelfSpacing ?? (product.shelfMode === 'AUTO_SPACING' ? 'auto' : 'auto'),
            shelfThickness: rack.properties.shelfThickness ?? (product as any).shelfThickness ?? 1.0,
            supportsParametricShelves: isEndcap || isCenterRack ? false : (product.metadata?.supportsParametricShelves ?? true),
            isWallMounted,
            isCornerRack,
            isEndcap,
            isCenterRack,
            cornerAnchor: product.metadata?.cornerAnchor,
            hideLeftPost,
            hideRightPost,
            productName: resolvedProductName,
            sku: resolvedSku,
          });
        } catch (err) {
          if (isEndcap) {
            const errMsg = `[ENDCAP GLB ERROR]\nProduct: ${product.productId}\nGLB: ${product.glbUrl}\nStatus: FAILED TO LOAD\n${(err as Error).message}\nDo not continue with another model.`;
            console.error(errMsg);
            throw new Error(errMsg);
          }
          rackObject = GLBCache.createUnavailableFallback({
            targetWidth: w,
            targetHeight: h,
            targetDepth: d,
            shelves: rack.properties.shelves,
            isWallMounted,
            productName: resolvedProductName,
            sku: resolvedSku,
          }, (err as Error).message);
        }
      } else {
        if (isEndcap) {
          const errMsg = `[ENDCAP GLB ERROR]\nProduct: ${rack.properties.productModelId || 'Unknown'}\nStatus: FAILED TO LOAD - No Product Model or GLB URL found.\nDo not continue with another model.`;
          console.error(errMsg);
          throw new Error(errMsg);
        }
        rackObject = GLBCache.createUnavailableFallback({
          targetWidth: w,
          targetHeight: h,
          targetDepth: d,
          shelves: rack.properties.shelves,
          isWallMounted,
          productName: resolvedProductName,
          sku: resolvedSku,
        }, 'No 3D GLB model associated with this product');
      }

      // DEV-only overlay footprint
      if (isCenterRack || isEndcap) {
        const devGeo = new THREE.PlaneGeometry(w, d);
        devGeo.rotateX(-Math.PI / 2);
        const devColor = isCenterRack ? 0x0000ff : 0xffa500; // BLUE for Center Rack, ORANGE for Endcap
        const devMat = new THREE.MeshBasicMaterial({ color: devColor, opacity: 0.4, transparent: true, depthWrite: false });
        const devMesh = new THREE.Mesh(devGeo, devMat);
        devMesh.position.y = 1.0; // Slightly above floor
        rackObject.add(devMesh);
      }

      // Endcap Visual Debug Overlays
      if (isEndcap && endcapResult) {
        const { debugInfo } = endcapResult;
        const debugVisuals = new THREE.Group();
        debugVisuals.name = "EndcapDebugVisuals";
        // Since rackObject is rotated by endcapResult.rotationY, we inverse it for the debug group 
        // to place things in world-aligned relative coordinates
        debugVisuals.rotation.y = -endcapResult.rotationY;

        const dX = debugInfo.terminalPoint.x - endcapResult.alignedPosition.x;
        const dZ = debugInfo.terminalPoint.y - endcapResult.alignedPosition.y;

        // BLUE POINT: terminal Center Rack connection point
        const bluePtGeom = new THREE.SphereGeometry(3, 16, 16);
        const bluePtMat = new THREE.MeshBasicMaterial({ color: 0x0000ff, depthTest: false, transparent: true, opacity: 0.8 });
        const bluePt = new THREE.Mesh(bluePtGeom, bluePtMat);
        bluePt.position.set(dX, 20, dZ);
        debugVisuals.add(bluePt);

        // RED POINT: Endcap connection point (origin)
        const redPtGeom = new THREE.SphereGeometry(3, 16, 16);
        const redPtMat = new THREE.MeshBasicMaterial({ color: 0xff0000, depthTest: false, transparent: true, opacity: 0.8 });
        const redPt = new THREE.Mesh(redPtGeom, redPtMat);
        // The Endcap connection point is its back face, which is offset from the center by ecDepth / 2 in the direction of the run.
        // We know snapPos is ecDepth / 2 away from terminalPoint.
        // In local space (relative to snapPos), the connection point is at terminalPoint!
        redPt.position.set(dX, 25, dZ);
        debugVisuals.add(redPt);

        // RED LINE (ARROW): Endcap front/aisle direction
        const redArrow = new THREE.ArrowHelper(
          new THREE.Vector3(debugInfo.frontDirection.x, 0, debugInfo.frontDirection.y).normalize(),
          new THREE.Vector3(0, 30, 0),
          36,
          0xff0000,
          8, 6
        );
        debugVisuals.add(redArrow);



        // BLUE LINE (ARROW): Center Rack run direction
        const blueArrow = new THREE.ArrowHelper(
          new THREE.Vector3(debugInfo.runDirection.x, 0, debugInfo.runDirection.y).normalize(),
          new THREE.Vector3(dX, 30, dZ),
          48,
          0x0000ff,
          8, 6
        );
        debugVisuals.add(blueArrow);

        rackObject.add(debugVisuals);
      }

      // Exact wall interior attachment
      const wall = rack.properties.attachedWallId
        ? ctx.walls.find((wl) => wl.id === rack.properties.attachedWallId)
        : undefined;

      const transform = getWallRackTransform({
        rack,
        wall,
        walls: ctx.walls,
        roomPolygon: ctx.roomPolygon,
        renderingEpsilon: 0.08,
      });

      if (alignedPos) {
        // Use perfectly aligned run position for center racks
        rackObject.position.set(alignedPos.x, transform.position.y, alignedPos.y);
        rackObject.rotation.y = transform.rotationY;
      } else if (isCornerRack && cornerResult && cornerResult.isValid && cornerResult.wallA && cornerResult.wallB) {
        // Use true mathematical corner alignment based strictly on room inward normals
        rackObject.position.set(cornerResult.alignedPosition.x, transform.position.y, cornerResult.alignedPosition.y);
        
        const inwardA = calculateWallInwardNormal(
           {x: cornerResult.wallA.geometry.x1, y: cornerResult.wallA.geometry.y1},
           {x: cornerResult.wallA.geometry.x2, y: cornerResult.wallA.geometry.y2},
           ctx.roomPolygon
        ).inwardNormal;
        
        const inwardB = calculateWallInwardNormal(
           {x: cornerResult.wallB.geometry.x1, y: cornerResult.wallB.geometry.y1},
           {x: cornerResult.wallB.geometry.x2, y: cornerResult.wallB.geometry.y2},
           ctx.roomPolygon
        ).inwardNormal;

        // Map local +Z to inwardB, local +X to inwardA (preserves chirality)
        const cross = inwardA.x * inwardB.y - inwardA.y * inwardB.x;
        let vecZ = cross > 0 ? inwardB : inwardA;
        let trueRotY = Math.atan2(vecZ.x, vecZ.y);

        rackObject.rotation.y = trueRotY;
        
        // Automatic Side Validation via Point-In-Polygon
        // Check if the center of the footprint is inside the room
        // The center of the rack body is approx (width/2, depth/2) from the corner.
        const testLocalPoint = new THREE.Vector3(w * 0.5, 0, d * 0.5);
        const testWorld = testLocalPoint.clone().applyEuler(new THREE.Euler(0, trueRotY, 0));
        const testPt = {
           x: cornerResult.alignedPosition.x + testWorld.x,
           y: cornerResult.alignedPosition.y + testWorld.z
        };

        if (!isPointInPolygon(testPt, ctx.roomPolygon)) {
            // If the primary interior quadrant fails point-in-polygon (e.g. concave/irregular room),
            // flip the orientation into the opposite half-planes.
            trueRotY += Math.PI;
            rackObject.rotation.y = trueRotY;
        }

      } else if (isEndcap && endcapResult) {
        // Snapped endcap to run terminal
        rackObject.position.set(endcapResult.alignedPosition.x, transform.position.y, endcapResult.alignedPosition.y);
        rackObject.rotation.y = endcapResult.rotationY;
      } else {
        rackObject.position.set(transform.position.x + transformShiftX, transform.position.y, transform.position.z + transformShiftY);
        rackObject.rotation.y = transform.rotationY;
      }

      // Update cadRotationDeg in diagnostics
      if (rackObject.userData?.diagnostics) {
        rackObject.userData.diagnostics.cadRotationDeg = Math.round(((rackObject.rotation.y * 180) / Math.PI) * 10) / 10;
        if (isCustom) {
          rackObject.userData.diagnostics.productName = 'Custom Rack';
          rackObject.userData.diagnostics.sku = 'CUSTOM';
        }
        if (isEndcap && endcapResult) {
          rackObject.userData.diagnostics.connectionGap = endcapResult.debugInfo.connectionGap;
          rackObject.userData.diagnostics.aisleDirection = endcapResult.debugInfo.aisleDirection;
          rackObject.userData.diagnostics.terminalRackId = endcapResult.debugInfo.terminalRackId;
          rackObject.userData.diagnostics.runDirection = endcapResult.debugInfo.runDirection;
          rackObject.userData.diagnostics.frontDirection = endcapResult.debugInfo.frontDirection;
        }
      }

      // Connected Run Evaluation
      let connectedRun: any = undefined;
      const allRuns = ConnectedRackEngine.detectRuns(ctx.entities, ctx.roomPolygon);
      const myRun = allRuns.find(r => r.racks.some(rk => rk.id === rack.id));
      if (myRun) {
         connectedRun = {
            runId: myRun.runId,
            connectedRackIds: myRun.racks.map(rk => rk.id),
            isGondolaRun: myRun.racks.length > 1
         };
      }

      rackObject.userData = {
        ...rackObject.userData,
        entityId: rack.id,
        type: 'rack',
        rackType: rack.properties.rackType,
        productModelId: product?.productId || rack.properties.productModelId,
        productName: resolvedProductName,
        sku: resolvedSku,
        width: w,
        depth: d,
        height: h,
        shelfCount: rack.properties.shelfCount ?? rack.properties.shelves ?? product?.shelfCount ?? 6,
        shelfThickness: rack.properties.shelfThickness ?? (product as any)?.shelfThickness ?? 1.0,
        shelfSpacing: rack.properties.shelfSpacing ?? 'auto',
        isCustom,
        isWallMounted,
        wallAttachment: transform,
        cornerResult: isCornerRack ? cornerResult : undefined,
        connectedRun
      };

      return rackObject;
    });

    this.isInitialized = true;
  }

  public static validateCornerRackPlacement(
    _rack: RackEntity,
    _walls: WallEntity[]
  ): { isValid: boolean; angleDeg?: number; reason?: string } {
    return { isValid: false, reason: 'Deprecated: Use CornerRackEngine' };
  }
  /**
   * Registers or overrides a 3D builder for an entity type.
   * Enables future uploaded GLBs or custom tools to be integrated seamlessly.
   */
  public static register<T extends CADEntity>(type: string, builder: Entity3DBuilderFn<T>): void {
    this.builders.set(type, builder as Entity3DBuilderFn);
  }

  /**
   * Converts a CAD entity into its corresponding 3D representation.
   */
  public static async convertEntity(
    entity: CADEntity,
    context: Entity3DContext
  ): Promise<THREE.Object3D | null> {
    this.initialize();
    const builder = this.builders.get(entity.type);
    if (!builder) {
      console.warn(`[Entity3DRegistry] No 3D builder registered for entity type: "${entity.type}"`);
      return null;
    }
    return await builder(entity, context);
  }
}
