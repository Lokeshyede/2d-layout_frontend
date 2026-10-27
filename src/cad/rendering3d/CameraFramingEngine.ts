import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { StorePresentationMetrics } from './StorePresentationBounds';

export type CameraPreset = 'iso' | 'top' | 'front' | 'side' | 'orbit';

export interface CameraFramingResult {
  position: THREE.Vector3;
  target: THREE.Vector3;
  distance: number;
  fov: number;
  aspect: number;
  preset: CameraPreset;
  paddingFactor: number;
}

export class CameraFramingEngine {
  /** Standard perspective FOV (degrees) for architectural store visualization */
  public static readonly DEFAULT_FOV = 52;

  /**
   * Authoritative Camera Fit-to-Store Framing Algorithm
   * Computes camera distance and target mathematically from actual store presentation bounds,
   * camera FOV, and viewport aspect ratio.
   *
   * Projects all 8 corners of the store bounding box onto the camera frame
   * to guarantee the store occupies a prominent, useful portion of the viewport
   * on desktop, tablet, and mobile, with ZERO cropping and NO excessive empty background.
   */
  public static fitCameraToStore(
    camera: THREE.PerspectiveCamera,
    controls: OrbitControls,
    metrics: StorePresentationMetrics,
    preset: CameraPreset,
    aspect: number
  ): CameraFramingResult {
    const { bounds, center, target: defaultTarget, frontVector, sideVector } = metrics;

    camera.fov = this.DEFAULT_FOV;
    camera.aspect = aspect;

    // Camera FOV in radians
    const fovV = (camera.fov * Math.PI) / 180;
    const tanV = Math.tan(fovV / 2);
    const tanH = tanV * aspect;

    // Determine target based on preset
    let target: THREE.Vector3;
    if (preset === 'top') {
      // In Top View, target is at floor level (Y = 0) directly below center of store footprint
      target = new THREE.Vector3(center.x, 0, center.z);
    } else {
      // In Perspective Views, target is at fixture/merchandise mid-height
      target = defaultTarget.clone();
    }

    // 8 Bounding Box Corners of physical store architecture
    const corners: THREE.Vector3[] = [];
    const minX = bounds.min.x, maxX = bounds.max.x;
    const minY = 0, maxY = Math.max(bounds.max.y, 120);
    const minZ = bounds.min.z, maxZ = bounds.max.z;

    for (const x of [minX, maxX]) {
      for (const y of [minY, maxY]) {
        for (const z of [minZ, maxZ]) {
          corners.push(new THREE.Vector3(x, y, z));
        }
      }
    }

    // Direction vector from target to camera (normalized u)
    let u: THREE.Vector3;
    let vFwd: THREE.Vector3;
    let vRight: THREE.Vector3;
    let vUp: THREE.Vector3;

    if (preset === 'top') {
      // Controlled perspective top view: looking straight down at the floor plan
      // Camera up points in -Z direction so top of screen corresponds to top wall (Z = minZ),
      // matching 2D CAD layout orientation exactly.
      camera.up.set(0, 0, -1);
      controls.maxPolarAngle = Math.PI;

      u = new THREE.Vector3(0, 1, 0).normalize();
      vFwd = new THREE.Vector3(0, -1, 0);
      vRight = new THREE.Vector3(1, 0, 0);
      vUp = new THREE.Vector3(0, 0, -1);
    } else {
      camera.up.set(0, 1, 0);
      controls.maxPolarAngle = Math.PI / 2 - 0.02; // prevent camera clipping beneath floor

      if (preset === 'front') {
        // Front elevation view: camera aligned to store entrance/front direction
        // Slight 8-degree elevation angle so wall heights and internal aisle depth are both readable
        const phi = (8 * Math.PI) / 180;
        const horizDir = frontVector.clone().normalize();
        u = new THREE.Vector3(
          horizDir.x * Math.cos(phi),
          Math.sin(phi),
          horizDir.z * Math.cos(phi)
        ).normalize();
        vFwd = u.clone().negate();
        vRight = new THREE.Vector3().crossVectors(vFwd, new THREE.Vector3(0, 1, 0)).normalize();
        vUp = new THREE.Vector3().crossVectors(vRight, vFwd).normalize();
      } else if (preset === 'side') {
        // Side elevation view: perpendicular to front vector
        const phi = (8 * Math.PI) / 180;
        const horizDir = sideVector.clone().normalize();
        u = new THREE.Vector3(
          horizDir.x * Math.cos(phi),
          Math.sin(phi),
          horizDir.z * Math.cos(phi)
        ).normalize();
        vFwd = u.clone().negate();
        vRight = new THREE.Vector3().crossVectors(vFwd, new THREE.Vector3(0, 1, 0)).normalize();
        vUp = new THREE.Vector3().crossVectors(vRight, vFwd).normalize();
      } else {
        // Isometric View: 3/4 axonometric perspective (Elevation = 34 deg, Azimuth = 45 deg)
        const phi = (34 * Math.PI) / 180;
        const psi = (45 * Math.PI) / 180;
        u = new THREE.Vector3(
          Math.sin(psi) * Math.cos(phi),
          Math.sin(phi),
          Math.cos(psi) * Math.cos(phi)
        ).normalize();
        vFwd = u.clone().negate();
        vRight = new THREE.Vector3().crossVectors(vFwd, new THREE.Vector3(0, 1, 0)).normalize();
        vUp = new THREE.Vector3().crossVectors(vRight, vFwd).normalize();
      }
    }

    // Project each bounding corner along camera frame to determine exact required distance
    let maxRequiredDist = 0;
    for (const pt of corners) {
      const d = pt.clone().sub(target);
      const xProj = Math.abs(d.dot(vRight));
      const yProj = Math.abs(d.dot(vUp));
      const zProj = d.dot(vFwd);

      const distH = xProj / tanH - zProj;
      const distV = yProj / tanV - zProj;
      const distCorner = Math.max(distH, distV);

      if (distCorner > maxRequiredDist) {
        maxRequiredDist = distCorner;
      }
    }

    // Professional padding: 15% margin on desktop/landscape, 18% on mobile portrait
    const paddingFactor = aspect < 1.0 ? 1.18 : 1.15;
    const optimalDistance = Math.max(maxRequiredDist * paddingFactor, 80);

    // Position camera & target
    controls.target.copy(target);
    camera.position.copy(target).add(u.clone().multiplyScalar(optimalDistance));
    camera.lookAt(target);

    // Dynamic depth clipping planes
    camera.near = 1.0;
    camera.far = Math.max(optimalDistance * 8, 15000);
    camera.updateProjectionMatrix();

    // OrbitControls distance limits
    controls.minDistance = 10;
    controls.maxDistance = Math.max(optimalDistance * 5, 25000);
    controls.update();

    return {
      position: camera.position.clone(),
      target: target.clone(),
      distance: optimalDistance,
      fov: camera.fov,
      aspect,
      preset,
      paddingFactor,
    };
  }

  /**
   * Refits the camera to the store from the current viewing angle without altering azimuth/elevation.
   * Useful when user clicks 'FIT' during free orbit mode.
   */
  public static fitCameraFromCurrentAngle(
    camera: THREE.PerspectiveCamera,
    controls: OrbitControls,
    metrics: StorePresentationMetrics,
    aspect: number
  ): CameraFramingResult {
    const { bounds, target: defaultTarget } = metrics;

    camera.fov = this.DEFAULT_FOV;
    camera.aspect = aspect;

    const fovV = (camera.fov * Math.PI) / 180;
    const tanV = Math.tan(fovV / 2);
    const tanH = tanV * aspect;

    const target = defaultTarget.clone();

    // Current unit vector from target to camera
    const u = camera.position.clone().sub(controls.target);
    if (u.lengthSq() < 0.001) {
      u.set(1, 1, 1);
    }
    u.normalize();

    const vFwd = u.clone().negate();
    const vRight = new THREE.Vector3().crossVectors(vFwd, camera.up).normalize();
    const vUp = new THREE.Vector3().crossVectors(vRight, vFwd).normalize();

    // 8 Bounding Box Corners
    const corners: THREE.Vector3[] = [];
    const minX = bounds.min.x, maxX = bounds.max.x;
    const minY = 0, maxY = Math.max(bounds.max.y, 120);
    const minZ = bounds.min.z, maxZ = bounds.max.z;

    for (const x of [minX, maxX]) {
      for (const y of [minY, maxY]) {
        for (const z of [minZ, maxZ]) {
          corners.push(new THREE.Vector3(x, y, z));
        }
      }
    }

    let maxRequiredDist = 0;
    for (const pt of corners) {
      const d = pt.clone().sub(target);
      const xProj = Math.abs(d.dot(vRight));
      const yProj = Math.abs(d.dot(vUp));
      const zProj = d.dot(vFwd);

      const distH = xProj / tanH - zProj;
      const distV = yProj / tanV - zProj;
      const distCorner = Math.max(distH, distV);

      if (distCorner > maxRequiredDist) {
        maxRequiredDist = distCorner;
      }
    }

    const paddingFactor = aspect < 1.0 ? 1.18 : 1.15;
    const optimalDistance = Math.max(maxRequiredDist * paddingFactor, 80);

    controls.target.copy(target);
    camera.position.copy(target).add(u.clone().multiplyScalar(optimalDistance));
    camera.lookAt(target);

    camera.near = 1.0;
    camera.far = Math.max(optimalDistance * 8, 15000);
    camera.updateProjectionMatrix();

    controls.minDistance = 10;
    controls.maxDistance = Math.max(optimalDistance * 5, 25000);
    controls.update();

    return {
      position: camera.position.clone(),
      target: target.clone(),
      distance: optimalDistance,
      fov: camera.fov,
      aspect,
      preset: 'orbit',
      paddingFactor,
    };
  }
}
