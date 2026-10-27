import * as THREE from 'three';
import type { CADEntity, Point2D, RackEntity } from '../../types';
import { WalkCollisionEngine } from '../walk/WalkCollisionEngine';

export interface CameraFrame {
  position: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
}

export interface PathGeneratorOptions {
  entities: CADEntity[];
  roomPolygon: Point2D[];
  bounds: THREE.Box3;
  center: THREE.Vector3;
  size: THREE.Vector3;
  eyeHeightInches?: number; // default 66 inches (5'6")
}

export class WalkthroughPathGenerator {
  private posCurve: THREE.CatmullRomCurve3;
  private targetCurve: THREE.CatmullRomCurve3;
  private collisionEngine: WalkCollisionEngine;
  private eyeHeight: number;
  private isSmallStore: boolean;

  constructor(options: PathGeneratorOptions) {
    const { entities, roomPolygon, eyeHeightInches = 66, size } = options;
    this.eyeHeight = eyeHeightInches;

    // Check store footprint: <= 360 inches (30 ft) in max dimension or <= 180 inches in min dimension
    this.isSmallStore = Math.max(size.x, size.z) <= 360 || Math.min(size.x, size.z) <= 180;

    // Initialize collision engine for safety validation
    this.collisionEngine = new WalkCollisionEngine(entities, roomPolygon);

    // Compute keyframe waypoints
    const { posWaypoints, targetWaypoints } = this.buildCinematicWaypoints(options);

    // Create smooth centripetal Catmull-Rom splines (centripetal avoids cusps & overshooting)
    this.posCurve = new THREE.CatmullRomCurve3(posWaypoints, false, 'centripetal', 0.25);
    this.targetCurve = new THREE.CatmullRomCurve3(targetWaypoints, false, 'centripetal', 0.25);
  }

  /**
   * Builds an adaptive sequence of waypoints tailored specifically to the CAD layout:
   * 1. Overview Approach: Elevated viewpoint facing the store entrance.
   * 2. Entrance Threshold: Enters store doorway at human eye level (5'6").
   * 3. Main Aisle: Smooth walk along primary corridor with eye-level look at perimeter wall racks.
   * 4. Fixture Zone / Gondolas: Gliding view of center racks, gondola runs, and shelf merchandise.
   * 5. Opposite Aisle / Rear Vantage: Perspective across store depth.
   * 6. Grand Elevation: Smooth concluding vista highlighting full store organization.
   */
  private buildCinematicWaypoints(options: PathGeneratorOptions): {
    posWaypoints: THREE.Vector3[];
    targetWaypoints: THREE.Vector3[];
  } {
    const { entities, bounds, center, size } = options;

    // 1. Locate entrance / opening in CAD entities
    const openingEntities = entities.filter(
      (e) => e.type === 'door' || e.type === 'glass_gate' || e.type === 'shutter'
    );

    let entrancePos: THREE.Vector3;
    let inwardDir: THREE.Vector3;

    if (openingEntities.length > 0) {
      const mainOpening = openingEntities[0];
      const g = mainOpening.geometry as any;
      const x1 = g.x1 ?? g.x ?? 0;
      const y1 = g.y1 ?? g.y ?? 0;
      const x2 = g.x2 ?? (g.x ? g.x + (g.width || 36) : 0);
      const y2 = g.y2 ?? (g.y ? g.y : 0);

      const midX = (x1 + x2) / 2;
      const midZ = (y1 + y2) / 2; // CAD Y -> 3D Z
      entrancePos = new THREE.Vector3(midX, this.eyeHeight, midZ);

      // Inward direction pointing toward store center
      const toCenter = new THREE.Vector3(center.x - midX, 0, center.z - midZ).normalize();
      inwardDir = toCenter.lengthSq() > 0.001 ? toCenter : new THREE.Vector3(0, 0, 1);
    } else {
      // Default to front edge (min Z) looking inward toward +Z
      entrancePos = new THREE.Vector3(center.x, this.eyeHeight, bounds.min.z + 18);
      inwardDir = new THREE.Vector3(0, 0, 1);
    }

    // 2. Identify rack clusters and aisles
    const racks = entities.filter((e): e is RackEntity => e.type === 'rack');

    const posWaypoints: THREE.Vector3[] = [];
    const targetWaypoints: THREE.Vector3[] = [];

    // WAYPOINT 0: Elevated Exterior / Storefront Approach (t = 0.0)
    const exteriorDist = this.isSmallStore ? 80 : 150;
    const exteriorElev = this.isSmallStore ? 100 : 135;
    const wp0Pos = entrancePos.clone().sub(inwardDir.clone().multiplyScalar(exteriorDist));
    wp0Pos.y = exteriorElev;
    const wp0Target = entrancePos.clone().add(inwardDir.clone().multiplyScalar(40));
    wp0Target.y = 50;

    posWaypoints.push(wp0Pos);
    targetWaypoints.push(wp0Target);

    // WAYPOINT 1: Just outside doorway threshold (t ~ 0.12)
    const wp1Pos = entrancePos.clone().sub(inwardDir.clone().multiplyScalar(24));
    wp1Pos.y = this.eyeHeight + 10;
    const wp1Target = entrancePos.clone().add(inwardDir.clone().multiplyScalar(80));
    wp1Target.y = this.eyeHeight;

    posWaypoints.push(wp1Pos);
    targetWaypoints.push(wp1Target);

    // WAYPOINT 2: Crossing Threshold into Store at Exact Human Eye Level (t ~ 0.22)
    const wp2Pos = entrancePos.clone().add(inwardDir.clone().multiplyScalar(28));
    wp2Pos.y = this.eyeHeight;
    const wp2Target = center.clone();
    wp2Target.y = 52; // viewing mid-shelf level

    posWaypoints.push(this.clampPointToSafeZone(wp2Pos));
    targetWaypoints.push(wp2Target);

    if (this.isSmallStore || racks.length < 4) {
      // ----------------------------------------------------
      // SPECIALIZED PATH FOR SMALL SHOPS (e.g. 10x20 ft)
      // ----------------------------------------------------
      // In a small 10x20 ft store, racks line perimeter walls and aisle is down the center.
      // We glide down the central aisle, pan left to inspect wall racks, pan right to inspect opposite racks,
      // and gently pivot at the rear counter.

      const aisleDepth = Math.max(size.z * 0.6, 60);

      // WP 3: Down main aisle, looking left toward perimeter wall racks
      const wp3Pos = wp2Pos.clone().add(inwardDir.clone().multiplyScalar(aisleDepth * 0.4));
      wp3Pos.y = this.eyeHeight;
      const leftVector = new THREE.Vector3(-inwardDir.z, 0, inwardDir.x).normalize();
      const wp3Target = wp3Pos.clone().add(leftVector.clone().multiplyScalar(size.x * 0.35));
      wp3Target.y = 48; // mid-shelf height

      posWaypoints.push(this.clampPointToSafeZone(wp3Pos));
      targetWaypoints.push(wp3Target);

      // WP 4: Deep aisle point, smoothly panning to right wall racks
      const wp4Pos = wp2Pos.clone().add(inwardDir.clone().multiplyScalar(aisleDepth * 0.8));
      wp4Pos.y = this.eyeHeight;
      const rightVector = leftVector.clone().negate();
      const wp4Target = wp4Pos.clone().add(rightVector.clone().multiplyScalar(size.x * 0.35));
      wp4Target.y = 48;

      posWaypoints.push(this.clampPointToSafeZone(wp4Pos));
      targetWaypoints.push(wp4Target);

      // WP 5: Rear corner vantage point looking back across entire shop
      const wp5Pos = wp4Pos.clone().add(rightVector.clone().multiplyScalar(size.x * 0.15));
      wp5Pos.y = this.eyeHeight + 6;
      const wp5Target = entrancePos.clone().add(new THREE.Vector3(0, 20, 0));

      posWaypoints.push(this.clampPointToSafeZone(wp5Pos));
      targetWaypoints.push(wp5Target);

      // WP 6: Final panoramic vista slightly elevated
      const wp6Pos = center.clone();
      wp6Pos.y = Math.min(size.y * 0.8, 110);
      wp6Pos.z = bounds.max.z - 30;
      const wp6Target = center.clone();
      wp6Target.y = 40;

      posWaypoints.push(this.clampPointToSafeZone(wp6Pos));
      targetWaypoints.push(wp6Target);
    } else {
      // ----------------------------------------------------
      // PATH FOR STANDARD & LARGE STORES / SUPERMARKETS
      // ----------------------------------------------------
      // Identify key rack locations
      const centerRacks = racks.filter((r) => r.properties.rackType?.includes('center') || !r.properties.attachedWallId);
      const wallRacks = racks.filter((r) => r.properties.attachedWallId || r.properties.rackType?.includes('wall'));

      // WP 3: Traversal through primary entrance aisle (t ~ 0.38)
      const wp3Pos = wp2Pos.clone().add(inwardDir.clone().multiplyScalar(Math.min(size.z * 0.28, 140)));
      wp3Pos.y = this.eyeHeight;
      // Look toward nearest wall rack cluster
      const refWallRack = wallRacks[0] || racks[0];
      const wp3Target = new THREE.Vector3(
        refWallRack.geometry.x,
        48,
        refWallRack.geometry.y // CAD Y -> 3D Z
      );

      posWaypoints.push(this.clampPointToSafeZone(wp3Pos));
      targetWaypoints.push(wp3Target);

      // WP 4: Cross-aisle navigation between center gondolas (t ~ 0.54)
      const crossAisleX = center.x + (size.x * 0.15);
      const crossAisleZ = center.z;
      const wp4Pos = new THREE.Vector3(crossAisleX, this.eyeHeight, crossAisleZ);
      // Look toward center rack display
      const refCenterRack = centerRacks[0] || racks[Math.floor(racks.length / 2)];
      const wp4Target = new THREE.Vector3(
        refCenterRack.geometry.x,
        50,
        refCenterRack.geometry.y
      );

      posWaypoints.push(this.clampPointToSafeZone(wp4Pos));
      targetWaypoints.push(wp4Target);

      // WP 5: Secondary aisle deep store exploration (t ~ 0.70)
      const wp5Pos = new THREE.Vector3(
        center.x - (size.x * 0.18),
        this.eyeHeight,
        center.z + (size.z * 0.22)
      );
      const wp5Target = new THREE.Vector3(
        center.x,
        52,
        center.z + (size.z * 0.3)
      );

      posWaypoints.push(this.clampPointToSafeZone(wp5Pos));
      targetWaypoints.push(wp5Target);

      // WP 6: Rear aisle transition viewing endcaps and aisle depth (t ~ 0.85)
      const wp6Pos = new THREE.Vector3(
        center.x - (size.x * 0.1),
        this.eyeHeight + 4,
        bounds.max.z - Math.min(size.z * 0.15, 60)
      );
      const wp6Target = center.clone();
      wp6Target.y = 48;

      posWaypoints.push(this.clampPointToSafeZone(wp6Pos));
      targetWaypoints.push(wp6Target);

      // WP 7: Grand Concluding Vantage Point (t = 1.0)
      const wp7Pos = new THREE.Vector3(
        bounds.min.x + (size.x * 0.2),
        Math.min(130, size.y * 0.95),
        bounds.min.z + (size.z * 0.25)
      );
      const wp7Target = center.clone();
      wp7Target.y = 42;

      posWaypoints.push(this.clampPointToSafeZone(wp7Pos));
      targetWaypoints.push(wp7Target);
    }

    return { posWaypoints, targetWaypoints };
  }

  /**
   * Ensures an interior waypoint is safely inside the room polygon and does not penetrate
   * any rack or wall obstacle.
   */
  private clampPointToSafeZone(point: THREE.Vector3): THREE.Vector3 {
    const cur = { x: point.x, y: point.z };
    const resolved = this.collisionEngine.resolvePosition(cur, cur, 12);
    return new THREE.Vector3(resolved.x, point.y, resolved.y);
  }

  /**
   * Samples the camera frame at a given frame index k out of totalFrames.
   * Interpolates position, target, and dynamic FOV smoothly with safety clearance.
   */
  public getFrame(frameIndex: number, totalFrames: number): CameraFrame {
    const t = Math.max(0, Math.min(1, frameIndex / (totalFrames - 1)));

    // Sample from Catmull-Rom splines
    const rawPos = this.posCurve.getPoint(t);
    const rawTarget = this.targetCurve.getPoint(t);

    // If camera is at human walking height inside the store, verify collision
    let finalPos = rawPos;
    if (rawPos.y <= 85) {
      const cur = { x: rawPos.x, y: rawPos.z };
      const resolved = this.collisionEngine.resolvePosition(cur, cur, 10);
      finalPos = new THREE.Vector3(resolved.x, rawPos.y, resolved.y);
    }

    // Dynamic FOV: slightly wider (62 deg) in tight aisles, 55 deg during overview
    const fov = rawPos.y > 90 ? 54 : 62;

    return {
      position: finalPos,
      target: rawTarget,
      fov,
    };
  }
}
