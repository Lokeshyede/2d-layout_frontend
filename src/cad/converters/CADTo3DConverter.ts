import * as THREE from 'three';
import type { CADEntity, WallEntity, Point2D } from '../types';
import { ProductModelRegistry } from '../services/ProductModelRegistry';
import { buildRoomPolygon } from '../geometry/GeometryMath';
import { Entity3DRegistry, type Entity3DContext } from '../rendering3d/entities/Entity3DRegistry';
import { FloorCeiling3DBuilder } from '../rendering3d/entities/FloorCeiling3DBuilder';
import { STANDARD_WALL_HEIGHT } from '../rendering3d/entities/Wall3DBuilder';
import { calculateStorePresentationMetrics, type StorePresentationMetrics } from '../rendering3d/StorePresentationBounds';

export interface Converted3DScene {
  wallsGroup: THREE.Group;
  columnsGroup: THREE.Group;
  openingsGroup: THREE.Group;
  partitionsGroup: THREE.Group;
  racksGroup: THREE.Group;
  debugGroup: THREE.Group;
  floorMesh: THREE.Group;
  ceilingMesh: THREE.Group;
  bounds: THREE.Box3;
  center: THREE.Vector3;
  size: THREE.Vector3;
  roomPolygon: Point2D[];
  metrics: StorePresentationMetrics;
}

export const WALL_HEIGHT_INCHES = STANDARD_WALL_HEIGHT; // 120 inches (10 feet) standard store wall height

export class CADTo3DConverter {
  /**
   * Converts 2D CAD entities into a complete, physically realistic 3D retail store.
   * Coordinate system:
   * 2D CAD X (inches) -> 3D X (inches)
   * 2D CAD Y (inches) -> 3D Z (inches)
   * Ground plane is at Y = 0; vertical up is +Y.
   */
  public static async convertTo3D(entities: CADEntity[]): Promise<Converted3DScene> {
    // 1. Ensure ProductModelRegistry is loaded
    await ProductModelRegistry.loadProducts();

    const wallsGroup = new THREE.Group();
    wallsGroup.name = 'WallsGroup';

    const columnsGroup = new THREE.Group();
    columnsGroup.name = 'ColumnsGroup';

    const openingsGroup = new THREE.Group();
    openingsGroup.name = 'OpeningsGroup';

    const partitionsGroup = new THREE.Group();
    partitionsGroup.name = 'PartitionsGroup';

    const racksGroup = new THREE.Group();
    racksGroup.name = 'RacksGroup';

    const debugGroup = new THREE.Group();
    debugGroup.name = 'RackWallAttachmentDebugGroup';

    // 2. Extract walls and construct polygon for irregular rooms
    const walls = entities.filter((e): e is WallEntity => e.type === 'wall');
    const roomPolygon = buildRoomPolygon(walls);

    const context: Entity3DContext = {
      entities,
      walls,
      roomPolygon,
      wallHeight: WALL_HEIGHT_INCHES,
      defaultWallThickness: 9,
    };

    // 3. Centralized Entity Conversion via Entity3DRegistry
    // IMPORTANT: Each entity is wrapped in its own try/catch.
    // A single failing entity (e.g. a bad Endcap GLB) must NEVER crash the entire scene.
    // Failed entities are shown as a red wireframe error indicator and the loop continues.
    let convertedCount = 0;
    let failedCount = 0;

    for (const ent of entities) {
      let obj: THREE.Object3D | null = null;

      try {
        obj = await Entity3DRegistry.convertEntity(ent, context);
      } catch (err: any) {
        failedCount++;
        console.error(
          `[CADTo3DConverter] Entity conversion FAILED — continuing scene build.\n` +
          `  Entity ID  : ${ent.id}\n` +
          `  Type       : ${ent.type}\n` +
          `  ProductId  : ${(ent as any).properties?.productModelId || 'none'}\n` +
          `  Error      : ${err?.message || String(err)}`
        );

        // Show an explicit red wireframe error placeholder at the entity position.
        // This is clearly visible so the user knows exactly which entity failed.
        const errW = (ent as any).geometry?.width || 36;
        const errH = (ent as any).geometry?.height || 60;
        const errD = (ent as any).geometry?.depth || 24;
        const errGeom = new THREE.BoxGeometry(errW, errH, errD);
        const errMat = new THREE.MeshBasicMaterial({ color: 0xff2222, wireframe: true });
        const errMesh = new THREE.Mesh(errGeom, errMat);
        const ex = (ent as any).geometry?.x || 0;
        const ey = (ent as any).geometry?.y || 0;
        errMesh.position.set(ex, errH / 2, ey);
        errMesh.name = `ERROR_${ent.type}_${ent.id}`;
        // Add to the racksGroup so it appears in the scene
        racksGroup.add(errMesh);
        continue;
      }

      if (!obj) continue;
      convertedCount++;

      switch (ent.type) {
        case 'wall':
          wallsGroup.add(obj);
          break;
        case 'column':
          columnsGroup.add(obj);
          break;
        case 'door':
        case 'window':
        case 'shutter':
        case 'glass_gate':
          openingsGroup.add(obj);
          break;
        case 'partition':
          partitionsGroup.add(obj);
          break;
        case 'rack': {
          racksGroup.add(obj);

          const isCornerRack = obj.userData?.isCornerRack || obj.userData?.cornerResult;
          if (isCornerRack && obj.userData?.cornerResult?.isValid) {
            const cr = obj.userData.cornerResult;
            // [CORNER DEBUG] suite
            // 1. Pivot Marker (Red Sphere)
            const pGeom = new THREE.SphereGeometry(1.8, 8, 8);
            const pMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
            const pMesh = new THREE.Mesh(pGeom, pMat);
            pMesh.position.set(obj.position.x, 4, obj.position.z);
            debugGroup.add(pMesh);

            // 2. Wing Directions (Arrows) & Integration Gaps
            const wA = cr.wallA;
            const wB = cr.wallB;
            if (wA && wB) {
              const cPt = cr.cornerPoint;
              const ptA = (Math.hypot(cPt.x - wA.geometry.x1, cPt.y - wA.geometry.y1) > 1) ? {x: wA.geometry.x1, y: wA.geometry.y1} : {x: wA.geometry.x2, y: wA.geometry.y2};
              const ptB = (Math.hypot(cPt.x - wB.geometry.x1, cPt.y - wB.geometry.y1) > 1) ? {x: wB.geometry.x1, y: wB.geometry.y1} : {x: wB.geometry.x2, y: wB.geometry.y2};

              const lenA = Math.hypot(ptA.x - cPt.x, ptA.y - cPt.y);
              const lenB = Math.hypot(ptB.x - cPt.x, ptB.y - cPt.y);
              
              if (lenA > 0 && lenB > 0) {
                const dA = new THREE.Vector3((ptA.x - cPt.x) / lenA, 0, (ptA.y - cPt.y) / lenA);
                const dB = new THREE.Vector3((ptB.x - cPt.x) / lenB, 0, (ptB.y - cPt.y) / lenB);

                const arrowA = new THREE.ArrowHelper(dA, new THREE.Vector3(obj.position.x, 4, obj.position.z), 36, 0xff00ff, 5, 3);
                const arrowB = new THREE.ArrowHelper(dB, new THREE.Vector3(obj.position.x, 4, obj.position.z), 36, 0x00ffff, 5, 3);
                debugGroup.add(arrowA);
                debugGroup.add(arrowB);

                // 3. Boundary / Gap markers
                // Using 24" footprint (could also get from diag)
                const footprint = 24.0;
                const bA = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial({color: 0xffffff}));
                bA.position.set(obj.position.x + dA.x * footprint, 4, obj.position.z + dA.z * footprint);
                debugGroup.add(bA);

                const bB = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial({color: 0xffffff}));
                bB.position.set(obj.position.x + dB.x * footprint, 4, obj.position.z + dB.z * footprint);
                debugGroup.add(bB);
              }
            }
          }

          // If rack is wall-mounted, populate 5-element alignment debug visualization
          const rackTransform = obj.userData?.wallAttachment;
          if (rackTransform && obj.userData?.isWallMounted !== false && rackTransform.debugInfo) {
            const dbg = rackTransform.debugInfo;

            // 1. Wall centerline marker (blue sphere)
            const clGeom = new THREE.SphereGeometry(1.2, 8, 8);
            const clMat = new THREE.MeshBasicMaterial({ color: 0x3b82f6 });
            const clMesh = new THREE.Mesh(clGeom, clMat);
            clMesh.position.set(dbg.centerlinePoint.x, 2, dbg.centerlinePoint.z);
            debugGroup.add(clMesh);

            // 2. Wall interior face marker (emerald sphere)
            const ifGeom = new THREE.SphereGeometry(1.2, 8, 8);
            const ifMat = new THREE.MeshBasicMaterial({ color: 0x10b981 });
            const ifMesh = new THREE.Mesh(ifGeom, ifMat);
            ifMesh.position.set(dbg.interiorFacePoint.x, 2, dbg.interiorFacePoint.z);
            debugGroup.add(ifMesh);

            // 3. Rack pivot marker (amber sphere at floor level)
            const pivGeom = new THREE.SphereGeometry(0.8, 8, 8);
            const pivMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b });
            const pivMesh = new THREE.Mesh(pivGeom, pivMat);
            pivMesh.position.set(obj.position.x, 1, obj.position.z);
            debugGroup.add(pivMesh);

            // 4. Inward direction normal arrow (emerald)
            const arrowDir = new THREE.Vector3(dbg.forwardVector.x, 0, dbg.forwardVector.z);
            const arrow = new THREE.ArrowHelper(
              arrowDir,
              new THREE.Vector3(dbg.interiorFacePoint.x, 2, dbg.interiorFacePoint.z),
              10,
              0x10b981,
              3.0,
              1.5
            );
            debugGroup.add(arrow);

            // 5. Rack physical back-face plane (cyan wireframe rectangle)
            const planeGeom = new THREE.PlaneGeometry(dbg.rackWidth || 36, dbg.rackHeight || 84);
            const planeMat = new THREE.MeshBasicMaterial({
              color: 0x38bdf8,
              wireframe: true,
              side: THREE.DoubleSide,
            });
            const planeMesh = new THREE.Mesh(planeGeom, planeMat);
            planeMesh.position.set(obj.position.x, (dbg.rackHeight || 84) / 2, obj.position.z);
            planeMesh.rotation.y = obj.rotation.y;
            debugGroup.add(planeMesh);
          }
          break;
        }
        default:
          // Any other entity type or future registered tool
          if (ent.type === ('gate' as any)) {
            openingsGroup.add(obj);
          }
          break;
      }
    }

    if (failedCount > 0) {
      console.warn(`[CADTo3DConverter] ${failedCount} entity/entities failed to convert. ${convertedCount} succeeded. Scene is still rendered with error placeholders.`);
    }

    // 4. Generate Polygon Floor & Optional Ceiling for Irregular / Angled Rooms
    const floorMesh = FloorCeiling3DBuilder.buildFloor(roomPolygon);
    const ceilingMesh = FloorCeiling3DBuilder.buildCeiling(roomPolygon, WALL_HEIGHT_INCHES);

    // 5. Compute authoritative physical store presentation bounds & metrics
    // Measures the actual store architecture (walls, columns, openings, partitions, racks, and room polygon)
    // strictly excluding exterior ground aprons, environment planes, and background grids.
    const metrics = calculateStorePresentationMetrics(
      {
        wallsGroup,
        columnsGroup,
        openingsGroup,
        partitionsGroup,
        racksGroup,
      },
      roomPolygon,
      entities,
      WALL_HEIGHT_INCHES
    );

    return {
      wallsGroup,
      columnsGroup,
      openingsGroup,
      partitionsGroup,
      racksGroup,
      debugGroup,
      floorMesh,
      ceilingMesh,
      bounds: metrics.bounds,
      center: metrics.center,
      size: metrics.size,
      roomPolygon,
      metrics,
    };
  }
}
