import type { CADEntity, RackEntity, Point2D } from '../types';
import { distance, degreesToRadians, isPointInPolygon } from '../geometry/GeometryMath';
import type { GondolaRun } from './CenterGondolaEngine';

export interface EndcapConnectionResult {
  alignedPosition: Point2D;
  rotationY: number;
  debugInfo: {
    terminalPoint: Point2D;
    endcapPoint: Point2D;
    frontDirection: Point2D;
    runDirection: Point2D;
    terminalRackId: string;
    connectionGap: number;
    aisleDirection: Point2D;
    connectionNormal: Point2D;
    terminalBayName: string;
  };
}

export class EndcapEngine {
  public static readonly CONNECTION_TOLERANCE_INCHES = 24.0; // Tolerance to snap it to the end

  public static isEndcap(entity: CADEntity): boolean {
    if (entity.type !== 'rack') return false;
    const rack = entity as RackEntity;
    const type = rack.properties.rackType || '';
    const name = rack.properties.productName || '';
    return (
      type === 'Endcap' ||
      type.toLowerCase().includes('endcap') ||
      type.toLowerCase().includes('end cap') ||
      name.toLowerCase().includes('endcap') ||
      name.toLowerCase().includes('end cap') ||
      name.toLowerCase().includes('end')
    );
  }

  public static detectEndcapConnection(
    endcap: RackEntity,
    runs: GondolaRun[],
    roomPolygon?: Point2D[]
  ): EndcapConnectionResult | null {
    // If not an endcap, return null
    if (!this.isEndcap(endcap)) return null;

    for (const run of runs) {
      if (run.racks.length === 0) continue;
      
      const firstRack = run.racks[0];
      const lastRack = run.racks[run.racks.length - 1];
      
      const runRotDeg = firstRack.geometry.rotation || 0;
      const runRotRad = degreesToRadians(runRotDeg);
      const rightVec = { x: Math.cos(runRotRad), y: Math.sin(runRotRad) };

      // Look at distance to first rack's left side
      const firstPos = run.alignedPositions.get(firstRack.id) || { x: firstRack.geometry.x, y: firstRack.geometry.y };
      const firstW = firstRack.geometry.width || 36;
      const firstLeft: Point2D = {
        x: firstPos.x - (firstW / 2) * rightVec.x,
        y: firstPos.y - (firstW / 2) * rightVec.y,
      };

      // Look at distance to last rack's right side
      const lastPos = run.alignedPositions.get(lastRack.id) || { x: lastRack.geometry.x, y: lastRack.geometry.y };
      const lastW = lastRack.geometry.width || 36;
      const lastRight: Point2D = {
        x: lastPos.x + (lastW / 2) * rightVec.x,
        y: lastPos.y + (lastW / 2) * rightVec.y,
      };

      const endcapCenter: Point2D = { x: endcap.geometry.x, y: endcap.geometry.y };
      
      const distToLeft = distance(endcapCenter, firstLeft);
      const distToRight = distance(endcapCenter, lastRight);

      if (distToLeft < this.CONNECTION_TOLERANCE_INCHES && distToLeft <= distToRight) {
        // Snap to left of run


        // Step 3: Find oriented terminal face
        const terminalFace = firstLeft;
        const terminalNormal = { x: -rightVec.x, y: -rightVec.y }; // points out from left end

        // Step 4: Define endcap connection face (Local space)
        // Since GLBCache now correctly anchors the Endcap back panel at Z=0 (CAD Y=0),
        // the local connection point is exactly (0, 0).
        const connectionLocalPoint = { x: 0, y: 0 };
        
        // Step 5 & 6: Determine rotation
        // targetConnectionNormal points INTO the Center Rack (used for anchor only).
        const targetConnectionNormal = { x: -terminalNormal.x, y: -terminalNormal.y };
        
        // GLBCache anchors the Endcap with its back face at local Z=0.
        // Therefore local +Z is the DISPLAY/FRONT direction.
        // We need local +Z to point OUTWARD from the terminal = in terminalNormal direction.
        // Formula: angle to rotate canonical local +Z (0,1 in 2D) to terminalNormal.
        //   atan2(terminalNormal.x, terminalNormal.y) achieves this for Three.js Y-rotation.
        // Verified: RIGHT terminal → rotY=+π/2 → local+Z=world+X (outward) ✓
        //           LEFT  terminal → rotY=-π/2 → local+Z=world-X (outward) ✓
        const rotationY = Math.atan2(terminalNormal.x, terminalNormal.y);
        
        // rotatedLocal = Local * Rotation
        const rotatedLocalPoint = {
          x: connectionLocalPoint.x * Math.cos(rotationY) + connectionLocalPoint.y * Math.sin(rotationY),
          y: -connectionLocalPoint.x * Math.sin(rotationY) + connectionLocalPoint.y * Math.cos(rotationY)
        };
        
        // Step 7 & 8: Solve Root Position
        // rootPosition = terminalFace - rotatedLocal
        const snapPos: Point2D = {
          x: terminalFace.x - rotatedLocalPoint.x,
          y: terminalFace.y - rotatedLocalPoint.y,
        };
        const endcapConnectionWorld = {
          x: snapPos.x + rotatedLocalPoint.x,
          y: snapPos.y + rotatedLocalPoint.y,
        };

        // Front direction (Display) is opposite of connection
        const displayDirection = { x: -targetConnectionNormal.x, y: -targetConnectionNormal.y };

        const gap = 0;
        const penetration = 0;
        const normalDot = -1;
        const floorDifference = 0;

        console.log(`[ENDCAP CONNECTION]
productId: ${endcap.properties.productModelId || 'unknown'}
terminalBayId: ${firstRack.id}
runDirection: ${rightVec.x.toFixed(3)} ${rightVec.y.toFixed(3)} 0
terminalFace: ${terminalFace.x.toFixed(3)} 0 ${terminalFace.y.toFixed(3)}
terminalNormal: ${terminalNormal.x.toFixed(3)} 0 ${terminalNormal.y.toFixed(3)}
endcapConnectionLocal: ${connectionLocalPoint.x.toFixed(3)} 0 ${connectionLocalPoint.y.toFixed(3)}
endcapConnectionWorld: ${endcapConnectionWorld.x.toFixed(3)} 0 ${endcapConnectionWorld.y.toFixed(3)}
endcapDisplayDirection: ${displayDirection.x.toFixed(3)} 0 ${displayDirection.y.toFixed(3)}
finalRotationY: ${rotationY.toFixed(3)}
connectionGap: ${gap} inches
penetration: ${penetration} inches
normalDot: ${normalDot}
floorDifference: ${floorDifference} inches`);

        let aisleDir = displayDirection;
        if (roomPolygon && roomPolygon.length > 2) {
          const testPt = { x: snapPos.x + displayDirection.x * 30, y: snapPos.y + displayDirection.y * 30 };
          if (!isPointInPolygon(testPt, roomPolygon)) {
            // Aisle obstructed
          }
        }

        return {
          alignedPosition: snapPos,
          rotationY,
          debugInfo: {
            terminalPoint: terminalFace,
            endcapPoint: snapPos,
            frontDirection: displayDirection,
            runDirection: rightVec,
            terminalRackId: firstRack.id,
            connectionGap: gap,
            aisleDirection: aisleDir,
            connectionNormal: terminalNormal,
            terminalBayName: firstRack.properties.productName || 'BAY-1',
          }
        };
      } else if (distToRight < this.CONNECTION_TOLERANCE_INCHES) {
        // Snap to right of run


        const terminalFace = lastRight;
        const terminalNormal = { x: rightVec.x, y: rightVec.y }; // points out from right end

        const connectionLocalPoint = { x: 0, y: 0 };
        
        // targetConnectionNormal points INTO the Center Rack (used for anchor only).
        const targetConnectionNormal = { x: -terminalNormal.x, y: -terminalNormal.y };
        
        // GLBCache anchors the Endcap with its back face at local Z=0.
        // Therefore local +Z is the DISPLAY/FRONT direction.
        // We need local +Z to point OUTWARD from the terminal = in terminalNormal direction.
        // Verified: RIGHT terminal → rotY=+π/2 → local+Z=world+X (outward) ✓
        //           LEFT  terminal → rotY=-π/2 → local+Z=world-X (outward) ✓
        const rotationY = Math.atan2(terminalNormal.x, terminalNormal.y);
        
        const rotatedLocalPoint = {
          x: connectionLocalPoint.x * Math.cos(rotationY) + connectionLocalPoint.y * Math.sin(rotationY),
          y: -connectionLocalPoint.x * Math.sin(rotationY) + connectionLocalPoint.y * Math.cos(rotationY)
        };
        
        const snapPos: Point2D = {
          x: terminalFace.x - rotatedLocalPoint.x,
          y: terminalFace.y - rotatedLocalPoint.y,
        };
        const endcapConnectionWorld = {
          x: snapPos.x + rotatedLocalPoint.x,
          y: snapPos.y + rotatedLocalPoint.y,
        };
        
        const displayDirection = { x: -targetConnectionNormal.x, y: -targetConnectionNormal.y };

        const gap = 0;
        const penetration = 0;
        const normalDot = -1;
        const floorDifference = 0;

        console.log(`[ENDCAP CONNECTION]
productId: ${endcap.properties.productModelId || 'unknown'}
terminalBayId: ${lastRack.id}
runDirection: ${rightVec.x.toFixed(3)} ${rightVec.y.toFixed(3)} 0
terminalFace: ${terminalFace.x.toFixed(3)} 0 ${terminalFace.y.toFixed(3)}
terminalNormal: ${terminalNormal.x.toFixed(3)} 0 ${terminalNormal.y.toFixed(3)}
endcapConnectionLocal: ${connectionLocalPoint.x.toFixed(3)} 0 ${connectionLocalPoint.y.toFixed(3)}
endcapConnectionWorld: ${endcapConnectionWorld.x.toFixed(3)} 0 ${endcapConnectionWorld.y.toFixed(3)}
endcapDisplayDirection: ${displayDirection.x.toFixed(3)} 0 ${displayDirection.y.toFixed(3)}
finalRotationY: ${rotationY.toFixed(3)}
connectionGap: ${gap} inches
penetration: ${penetration} inches
normalDot: ${normalDot}
floorDifference: ${floorDifference} inches`);

        let aisleDir = displayDirection;
        if (roomPolygon && roomPolygon.length > 2) {
          const testPt = { x: snapPos.x + displayDirection.x * 30, y: snapPos.y + displayDirection.y * 30 };
          if (!isPointInPolygon(testPt, roomPolygon)) {
            // Aisle obstructed
          }
        }
        
        return {
          alignedPosition: snapPos,
          rotationY,
          debugInfo: {
            terminalPoint: terminalFace,
            endcapPoint: snapPos,
            frontDirection: displayDirection,
            runDirection: rightVec,
            terminalRackId: lastRack.id,
            connectionGap: gap,
            aisleDirection: aisleDir,
            connectionNormal: terminalNormal,
            terminalBayName: lastRack.properties.productName || 'BAY-L',
          }
        };
      }
    }

    return null; // Not connected to any run or too far
  }
}
