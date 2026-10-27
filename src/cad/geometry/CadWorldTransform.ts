/**
 * RetailFix CAD - Authoritative 2D <-> 3D Geometric Transform Contract
 * Single source of truth for coordinate conversion, anchor resolution,
 * footprint calculation, and connection normals between 2D CAD and 3D WebGL.
 */

import * as THREE from 'three';
import type { CADEntity, RackEntity, Point2D } from '../types';

export class CadWorldTransform {
  /**
   * Normalizes an angle in degrees to the range [0, 360).
   * Ensures 360 deg is equivalent to 0 deg without accumulation.
   */
  public static normalizeRotation(deg: number): number {
    return ((deg % 360) + 360) % 360;
  }

  /**
   * Converts a 2D CAD rotation angle (degrees, clockwise in screen canvas)
   * to a Three.js right-handed rotation around the Y axis (radians).
   */
  public static cadAngleToThreeY(deg: number): number {
    const norm = this.normalizeRotation(deg);
    return (-norm * Math.PI) / 180;
  }

  /**
   * Converts a Three.js Y-rotation in radians back to 2D CAD angle in degrees.
   */
  public static threeYToCadAngle(rad: number): number {
    const deg = (-rad * 180) / Math.PI;
    return this.normalizeRotation(deg);
  }

  /**
   * Maps 2D CAD coordinates (inches) to 3D Three.js world space coordinates (inches).
   * CAD X -> 3D X
   * Elevation -> 3D Y (0 is floor)
   * CAD Y -> 3D Z
   */
  public static cadToWorld(point: Point2D, elevation: number = 0): THREE.Vector3 {
    return new THREE.Vector3(point.x, elevation, point.y);
  }

  /**
   * Maps 3D Three.js world coordinates back to 2D CAD coordinates.
   * 3D X -> CAD X
   * 3D Z -> CAD Y
   */
  public static worldToCad(pos: THREE.Vector3 | { x: number; y: number; z: number }): Point2D {
    return { x: pos.x, y: pos.z };
  }

  /**
   * Resolves the authoritative anchor point of an entity.
   * - Wall Rack: Back-face center at wall interior face
   * - Center Rack: Centroid along run centerline
   * - Endcap: Back-face connection point touching Center Rack terminal face
   * - Corner Rack: Corner apex touching wall intersection
   * - Column / Openings: Centroid
   */
  public static getEntityAnchor(entity: CADEntity): Point2D {
    if (entity.type === 'wall') {
      const g = entity.geometry;
      return { x: (g.x1 + g.x2) / 2, y: (g.y1 + g.y2) / 2 };
    }

    const g = entity.geometry as any;
    return { x: g.x ?? 0, y: g.y ?? 0 };
  }

  /**
   * Derives the connection face and outward display normal for an entity.
   */
  public static getConnectionFace(rack: RackEntity): {
    connectionPoint: Point2D;
    connectionNormal: Point2D;
    displayNormal: Point2D;
  } {
    const rotDeg = this.normalizeRotation(rack.geometry.rotation || 0);
    const rad = (rotDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    const isEndcap =
      rack.properties.rackType === 'Endcap' ||
      (rack.properties.rackType && rack.properties.rackType.toLowerCase().includes('endcap'));

    if (isEndcap) {
      // For an Endcap:
      // Anchor (geometry.x, geometry.y) is at the back-face connection point.
      // Connection normal points INTO the Center Rack (backward).
      // Display normal points OUTWARD into the aisle (forward).
      return {
        connectionPoint: { x: rack.geometry.x, y: rack.geometry.y },
        connectionNormal: { x: -sin, y: -cos },
        displayNormal: { x: sin, y: cos },
      };
    }

    // Default for wall racks: anchor on back plate
    return {
      connectionPoint: { x: rack.geometry.x, y: rack.geometry.y },
      connectionNormal: { x: -sin, y: -cos },
      displayNormal: { x: sin, y: cos },
    };
  }
}
