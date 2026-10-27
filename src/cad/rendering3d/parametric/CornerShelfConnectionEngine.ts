import * as THREE from 'three';
import { Box3, Vector3 } from 'three';

export interface ShelfConnectionResult {
  gapLeft: number;
  gapRight: number;
  leftShelfEnd: Vector3;
  cornerLeftConnectionPoint: Vector3;
  cornerRightConnectionPoint: Vector3;
  rightShelfStart: Vector3;
  requiresCorrection: boolean;
}

export class CornerShelfConnectionEngine {
  private static readonly MAX_CONNECTION_GAP = 0.5; // inches

  /**
   * Calculates the physical connection gaps between a Corner Rack and its adjacent Wall Racks
   * by measuring actual world-space shelf geometry endpoints.
   */
  public static evaluateConnection(
    cornerRack: THREE.Object3D,
    leftWallRack: THREE.Object3D | null,
    rightWallRack: THREE.Object3D | null
  ): ShelfConnectionResult {
    
    // Ensure world matrices are fully up to date
    cornerRack.updateMatrixWorld(true);
    if (leftWallRack) leftWallRack.updateMatrixWorld(true);
    if (rightWallRack) rightWallRack.updateMatrixWorld(true);

    const cornerBounds = this.calculateShelfBounds(cornerRack);
    const leftBounds = leftWallRack ? this.calculateShelfBounds(leftWallRack) : null;
    const rightBounds = rightWallRack ? this.calculateShelfBounds(rightWallRack) : null;

    let gapLeft = 0;
    let gapRight = 0;

    const cornerLeftConnectionPoint = new Vector3();
    const cornerRightConnectionPoint = new Vector3();
    const leftShelfEnd = new Vector3();
    const rightShelfStart = new Vector3();

    // The Corner Rack sits at the origin of its own local space.
    // Wing A typically extends along +Z, Wing B along +X (or vice versa).
    // In world space, we find the closest points between the bounding boxes.

    if (leftWallRack && leftBounds && cornerBounds) {
      // Find the endpoint of the Left Wall Rack closest to the Corner Rack
      // Wall racks are oriented along their X axis. The end closest to the corner is typically max X or min X.
      // We will project the corner center onto the wall rack's local X axis to find which end is closest.
      const leftLocalCenter = cornerRack.position.clone().applyMatrix4(leftWallRack.matrixWorld.clone().invert());
      const isRightEnd = leftLocalCenter.x > 0; // if corner is to the right in wall rack's local space
      
      const leftEdgeLocalX = isRightEnd ? leftBounds.localMax.x : leftBounds.localMin.x;
      leftShelfEnd.set(leftEdgeLocalX, leftBounds.localCenter.y, 0).applyMatrix4(leftWallRack.matrixWorld);

      // Find the closest point on the corner rack's shelf bounds to the leftShelfEnd
      const cornerLocalP = leftShelfEnd.clone().applyMatrix4(cornerRack.matrixWorld.clone().invert());
      cornerLeftConnectionPoint.copy(cornerBounds.box.clampPoint(cornerLocalP, new Vector3())).applyMatrix4(cornerRack.matrixWorld);
      
      gapLeft = leftShelfEnd.distanceTo(cornerLeftConnectionPoint);
    }

    if (rightWallRack && rightBounds && cornerBounds) {
      const rightLocalCenter = cornerRack.position.clone().applyMatrix4(rightWallRack.matrixWorld.clone().invert());
      const isRightEnd = rightLocalCenter.x > 0;
      
      const rightEdgeLocalX = isRightEnd ? rightBounds.localMax.x : rightBounds.localMin.x;
      rightShelfStart.set(rightEdgeLocalX, rightBounds.localCenter.y, 0).applyMatrix4(rightWallRack.matrixWorld);

      const cornerLocalP = rightShelfStart.clone().applyMatrix4(cornerRack.matrixWorld.clone().invert());
      cornerRightConnectionPoint.copy(cornerBounds.box.clampPoint(cornerLocalP, new Vector3())).applyMatrix4(cornerRack.matrixWorld);
      
      gapRight = rightShelfStart.distanceTo(cornerRightConnectionPoint);
    }

    const requiresCorrection = gapLeft > this.MAX_CONNECTION_GAP || gapRight > this.MAX_CONNECTION_GAP;

    return {
      gapLeft,
      gapRight,
      leftShelfEnd,
      cornerLeftConnectionPoint,
      cornerRightConnectionPoint,
      rightShelfStart,
      requiresCorrection
    };
  }

  public static applyCorrection(
    scene: THREE.Scene,
    result: ShelfConnectionResult,
    _cornerRack: THREE.Object3D,
    leftWallRack: THREE.Object3D | null,
    rightWallRack: THREE.Object3D | null
  ) {
    // We must shift the entire connected run, not just the one rack.
    // However, since CADTo3DConverter outputs independent THREE.Groups for each rack,
    // we can just translate the group of any rack on that "side" of the run.

    if (leftWallRack && result.gapLeft > this.MAX_CONNECTION_GAP) {
      // Vector from the wall rack's shelf end to the corner's connection point
      const shiftVec = new Vector3().subVectors(result.cornerLeftConnectionPoint, result.leftShelfEnd);
      
      // We must shift all racks that are part of the left run.
      // We can identify the left run by finding all racks that are co-linear with leftWallRack.
      const leftDir = new Vector3(1, 0, 0).applyQuaternion(leftWallRack.quaternion).normalize();
      
      scene.children.find(c => c.name === 'RacksGroup')?.children.forEach(rack => {
         if (rack.userData?.rackType && rack.userData.rackType.toLowerCase().includes('wall')) {
             // Check if it's parallel to the left wall rack
             const dir = new Vector3(1, 0, 0).applyQuaternion(rack.quaternion).normalize();
             if (Math.abs(dir.dot(leftDir)) > 0.99) {
                 // Check if it's on the same line
                 const toRack = new Vector3().subVectors(rack.position, leftWallRack.position);
                 toRack.y = 0;
                 if (toRack.length() < 0.1 || Math.abs(toRack.normalize().dot(leftDir)) > 0.99) {
                     // It is in the same run! Shift it.
                     rack.position.add(shiftVec);
                     rack.updateMatrixWorld(true);
                 }
             }
         }
      });
    }

    if (rightWallRack && result.gapRight > this.MAX_CONNECTION_GAP) {
      const shiftVec = new Vector3().subVectors(result.cornerRightConnectionPoint, result.rightShelfStart);
      
      const rightDir = new Vector3(1, 0, 0).applyQuaternion(rightWallRack.quaternion).normalize();
      
      scene.children.find(c => c.name === 'RacksGroup')?.children.forEach(rack => {
         if (rack.userData?.rackType && rack.userData.rackType.toLowerCase().includes('wall')) {
             const dir = new Vector3(1, 0, 0).applyQuaternion(rack.quaternion).normalize();
             if (Math.abs(dir.dot(rightDir)) > 0.99) {
                 const toRack = new Vector3().subVectors(rack.position, rightWallRack.position);
                 toRack.y = 0;
                 if (toRack.length() < 0.1 || Math.abs(toRack.normalize().dot(rightDir)) > 0.99) {
                     rack.position.add(shiftVec);
                     rack.updateMatrixWorld(true);
                 }
             }
         }
      });
    }
  }

  private static calculateShelfBounds(rack: THREE.Object3D): { box: Box3, localMin: Vector3, localMax: Vector3, localCenter: Vector3 } | null {
    const box = new Box3();
    let hasShelves = false;

    // Clone the rack to measure its shelves without affecting the scene
    const clone = rack.clone();
    clone.position.set(0, 0, 0);
    clone.rotation.set(0, 0, 0);
    clone.scale.set(1, 1, 1);
    clone.updateMatrixWorld(true);

    clone.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        // Only include actual shelf meshes
        const isShelf = child.name.toLowerCase().includes('shelf') || 
                        child.userData.isShelf || 
                        child.userData.isShelfParent ||
                        (child.parent && child.parent.userData.isShelfParent);
                        
        // In RetailFix, meshes 3,4,11,12,13,29 are corner shelves. Wall racks use standard generated shelves.
        const isCornerShelfMesh = ['3', '4', '11', '12', '13', '29'].some(id => child.name.includes(`3DGeom-${id}`));

        if (isShelf || isCornerShelfMesh) {
          child.updateMatrixWorld(true);
          const childBox = new Box3().setFromObject(child);
          box.union(childBox);
          hasShelves = true;
        }
      }
    });

    if (!hasShelves) {
      // Fallback to full bounding box if specific shelves aren't tagged
      box.setFromObject(clone);
    }

    const localMin = box.min.clone();
    const localMax = box.max.clone();
    const localCenter = box.getCenter(new Vector3());

    return { box, localMin, localMax, localCenter };
  }

  public static addVisualDebugMarkers(
    scene: THREE.Scene, 
    result: ShelfConnectionResult
  ) {
    // Remove old markers
    const oldMarkers = scene.getObjectByName('CornerShelfDebugMarkers');
    if (oldMarkers) scene.remove(oldMarkers);

    const markerGroup = new THREE.Group();
    markerGroup.name = 'CornerShelfDebugMarkers';

    const createDot = (pos: Vector3, color: number) => {
      const geo = new THREE.SphereGeometry(1.5, 16, 16);
      const mat = new THREE.MeshBasicMaterial({ color, depthTest: false });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(pos);
      mesh.renderOrder = 999;
      return mesh;
    };

    if (result.gapLeft > 0) {
      markerGroup.add(createDot(result.leftShelfEnd, 0x00ff00)); // Green: Left Shelf End
      markerGroup.add(createDot(result.cornerLeftConnectionPoint, 0x0000ff)); // Blue: Corner Left
    }

    if (result.gapRight > 0) {
      markerGroup.add(createDot(result.rightShelfStart, 0xff0000)); // Red: Right Shelf Start
      markerGroup.add(createDot(result.cornerRightConnectionPoint, 0x0000ff)); // Blue: Corner Right
    }

    scene.add(markerGroup);
  }
}
