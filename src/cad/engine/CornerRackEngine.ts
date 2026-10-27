import { distance, calculateWallInwardNormal } from '../geometry/GeometryMath';
import type { CADEntity, RackEntity, WallEntity, Point2D } from '../types';
import { ProductModelRegistry } from '../services/ProductModelRegistry';

export interface CornerConnectionResult {
  isValid: boolean;
  cornerPoint?: Point2D;
  wallA?: WallEntity;
  wallB?: WallEntity;
  angleDeg?: number;
  rotationY?: number; // radians
  alignedPosition?: Point2D;
  interiorNormal?: Point2D; // bisecting angle inside room
}

export class CornerRackEngine {
  // engineering tolerance
  private static readonly CORNER_ANGLE_TOLERANCE_DEG = 0.5;
  private static readonly CORNER_SNAP_DISTANCE_INCHES = 36.0;
  
  public static detectCornerConnection(rack: RackEntity, entities: CADEntity[], roomPolygon: Point2D[]): CornerConnectionResult {
    const isCornerRack = 
      rack.properties.rackType === 'corner_rack_2x2x2' || 
      rack.properties.rackType === 'Corner Rack' || 
      (rack.properties.productName && rack.properties.productName.toLowerCase().includes('corner'));
      
    if (!isCornerRack) {
      return { isValid: false };
    }

    const walls = entities.filter((e): e is WallEntity => e.type === 'wall');
    
    let bestResult: CornerConnectionResult = { isValid: false };
    let minDistance = this.CORNER_SNAP_DISTANCE_INCHES;

    for (let i = 0; i < walls.length; i++) {
      for (let j = i + 1; j < walls.length; j++) {
        const wa = walls[i];
        const wb = walls[j];
        
        const pt = this.getSharedEndpoint(wa, wb);
        if (!pt) continue;
        
        const rackCenter = { x: rack.geometry.x, y: rack.geometry.y };
        const dist = distance(rackCenter, pt);
        
        if (dist < minDistance) {
          const angle = this.calculateCornerAngle(wa, wb, pt);
          
          if (Math.abs(angle - 90) <= this.CORNER_ANGLE_TOLERANCE_DEG) {
            const inwardA = calculateWallInwardNormal({x: wa.geometry.x1, y: wa.geometry.y1}, {x: wa.geometry.x2, y: wa.geometry.y2}, roomPolygon).inwardNormal;
            const inwardB = calculateWallInwardNormal({x: wb.geometry.x1, y: wb.geometry.y1}, {x: wb.geometry.x2, y: wb.geometry.y2}, roomPolygon).inwardNormal;
            const ptA = (distance(pt, {x: wa.geometry.x1, y: wa.geometry.y1}) > 1) ? {x: wa.geometry.x1, y: wa.geometry.y1} : {x: wa.geometry.x2, y: wa.geometry.y2};
            const ptB = (distance(pt, {x: wb.geometry.x1, y: wb.geometry.y1}) > 1) ? {x: wb.geometry.x1, y: wb.geometry.y1} : {x: wb.geometry.x2, y: wb.geometry.y2};
            
            const vA = { x: ptA.x - pt.x, y: ptA.y - pt.y };
            const vB = { x: ptB.x - pt.x, y: ptB.y - pt.y };
            
            const lenA = Math.hypot(vA.x, vA.y);
            const lenB = Math.hypot(vB.x, vB.y);
            
            const dirA = { x: vA.x / lenA, y: vA.y / lenA };
            const dirB = { x: vB.x / lenB, y: vB.y / lenB };
            
            const cross = dirA.x * dirB.y - dirA.y * dirB.x;
            
            let vecZ: Point2D;
            
            if (cross > 0) {
              vecZ = dirB;
            } else {
              vecZ = dirA;
            }
            
            // +Z aligns with vecZ. rotY = atan2(x, y) because in 3D, z=cos, x=sin.
            // Wait, if Z is (0,1), atan2(0, 1) = 0.
            const rotY = Math.atan2(vecZ.x, vecZ.y);
            
            // The intersection of the interior faces (Inner Corner)
            const thkA = wa.properties?.thickness || 9;
            const thkB = wb.properties?.thickness || 9;
            
            // Move from centerline corner point into the room by half wall thickness of both walls
            const interiorCornerPoint = {
              x: pt.x + inwardA.x * (thkA / 2) + inwardB.x * (thkB / 2),
              y: pt.y + inwardA.y * (thkA / 2) + inwardB.y * (thkB / 2)
            };

            minDistance = dist;
            bestResult = {
              isValid: true,
              cornerPoint: pt,
              wallA: wa,
              wallB: wb,
              angleDeg: angle,
              rotationY: rotY,
              alignedPosition: interiorCornerPoint
            };
          }
        }
      }
    }
    
    return bestResult;
  }
  
  private static getSharedEndpoint(wa: WallEntity, wb: WallEntity): Point2D | null {
    const eps = 0.5; // inches
    if (distance({x: wa.geometry.x1, y: wa.geometry.y1}, {x: wb.geometry.x1, y: wb.geometry.y1}) < eps) return {x: wa.geometry.x1, y: wa.geometry.y1};
    if (distance({x: wa.geometry.x1, y: wa.geometry.y1}, {x: wb.geometry.x2, y: wb.geometry.y2}) < eps) return {x: wa.geometry.x1, y: wa.geometry.y1};
    if (distance({x: wa.geometry.x2, y: wa.geometry.y2}, {x: wb.geometry.x1, y: wb.geometry.y1}) < eps) return {x: wa.geometry.x2, y: wa.geometry.y2};
    if (distance({x: wa.geometry.x2, y: wa.geometry.y2}, {x: wb.geometry.x2, y: wb.geometry.y2}) < eps) return {x: wa.geometry.x2, y: wa.geometry.y2};
    return null;
  }

  private static calculateCornerAngle(wa: WallEntity, wb: WallEntity, sharedPt: Point2D): number {
    const ptA = (distance(sharedPt, {x: wa.geometry.x1, y: wa.geometry.y1}) > 1) ? {x: wa.geometry.x1, y: wa.geometry.y1} : {x: wa.geometry.x2, y: wa.geometry.y2};
    const ptB = (distance(sharedPt, {x: wb.geometry.x1, y: wb.geometry.y1}) > 1) ? {x: wb.geometry.x1, y: wb.geometry.y1} : {x: wb.geometry.x2, y: wb.geometry.y2};
    
    const vecA = { x: ptA.x - sharedPt.x, y: ptA.y - sharedPt.y };
    const vecB = { x: ptB.x - sharedPt.x, y: ptB.y - sharedPt.y };
    
    const lenA = Math.hypot(vecA.x, vecA.y);
    const lenB = Math.hypot(vecB.x, vecB.y);
    
    if (lenA === 0 || lenB === 0) return 0;
    
    const dot = (vecA.x * vecB.x + vecA.y * vecB.y) / (lenA * lenB);
    return Math.acos(Math.max(-1, Math.min(1, dot))) * (180 / Math.PI);
  }

  public static clampWallRack(
    wallRack: RackEntity,
    wall: WallEntity,
    entities: CADEntity[],
    roomPolygon: Point2D[]
  ): { width: number; shiftX: number; shiftY: number; hideLeftPost: boolean; hideRightPost: boolean } | null {
    const isCornerRack = 
      wallRack.properties.rackType === 'corner_rack_2x2x2' || 
      wallRack.properties.rackType === 'Corner Rack' || 
      (wallRack.properties.productName && wallRack.properties.productName.toLowerCase().includes('corner'));
    if (isCornerRack) return null;

    let targetWidth = wallRack.geometry.width || 36;
    let shiftX = 0;
    let shiftY = 0;
    let hideLeftPost = false;
    let hideRightPost = false;

    const cornerRacks = entities.filter(e => 
      e.type === 'rack' && 
      (e.properties.rackType === 'corner_rack_2x2x2' || e.properties.rackType === 'Corner Rack' || (e.properties.productName && e.properties.productName.toLowerCase().includes('corner')))
    ) as RackEntity[];

    for (const cr of cornerRacks) {
      const crResult = this.detectCornerConnection(cr, entities, roomPolygon);
      if (!crResult.isValid) continue;

      if (crResult.wallA?.id === wall.id || crResult.wallB?.id === wall.id) {
        // This corner rack is on our wall.
        const cPt = crResult.cornerPoint!;
        
        // Find distance from corner point to wall rack center
        const wrCenter = { x: wallRack.geometry.x, y: wallRack.geometry.y };
        
        // Find the wall direction from the corner
        const wStart = { x: wall.geometry.x1, y: wall.geometry.y1 };
        const wEnd = { x: wall.geometry.x2, y: wall.geometry.y2 };
        const otherPt = (distance(cPt, wStart) > 1) ? wStart : wEnd;
        const wDir = { x: otherPt.x - cPt.x, y: otherPt.y - cPt.y };
        const wLen = Math.hypot(wDir.x, wDir.y);
        if (wLen < 0.01) continue;
        const wUnit = { x: wDir.x / wLen, y: wDir.y / wLen };

        // Project wall rack center onto wall direction to get signed distance
        const wrVec = { x: wrCenter.x - cPt.x, y: wrCenter.y - cPt.y };
        const signedDistCenter = wrVec.x * wUnit.x + wrVec.y * wUnit.y;

        // Fetch accurate physical footprint from product metadata
        const product = ProductModelRegistry.resolve(cr.properties.productModelId, cr.properties.rackType);
        const wingA = product?.metadata?.cornerGeometry?.wingA?.shelfDepth || 17.0; // aligns with local +Z
        const wingB = product?.metadata?.cornerGeometry?.wingB?.shelfDepth || 17.0; // aligns with local +X
        
        let footprint = 24.0;

        // Re-evaluate cross product to know which wall is X and which is Z
        const ptA = (distance(cPt, {x: crResult.wallA!.geometry.x1, y: crResult.wallA!.geometry.y1}) > 1) ? {x: crResult.wallA!.geometry.x1, y: crResult.wallA!.geometry.y1} : {x: crResult.wallA!.geometry.x2, y: crResult.wallA!.geometry.y2};
        const ptB = (distance(cPt, {x: crResult.wallB!.geometry.x1, y: crResult.wallB!.geometry.y1}) > 1) ? {x: crResult.wallB!.geometry.x1, y: crResult.wallB!.geometry.y1} : {x: crResult.wallB!.geometry.x2, y: crResult.wallB!.geometry.y2};
        const vA = { x: ptA.x - cPt.x, y: ptA.y - cPt.y };
        const vB = { x: ptB.x - cPt.x, y: ptB.y - cPt.y };
        const cross = vA.x * vB.y - vA.y * vB.x;

        if (cross > 0) {
            // vecZ = dirB. So Z is Wall B, X is Wall A.
            if (wall.id === crResult.wallA?.id) footprint = wingB; // Wall A gets Wing B
            else if (wall.id === crResult.wallB?.id) footprint = wingA; // Wall B gets Wing A
        } else {
            // vecZ = dirA. So Z is Wall A, X is Wall B.
            if (wall.id === crResult.wallA?.id) footprint = wingA; // Wall A gets Wing A
            else if (wall.id === crResult.wallB?.id) footprint = wingB; // Wall B gets Wing B
        }
        
        const wrStart = signedDistCenter - targetWidth / 2;
        const wrEnd = signedDistCenter + targetWidth / 2;

        if (wrStart < footprint && wrEnd > footprint) {
          // Overlap! We need to trim the wall rack so its start is at `footprint`.
          const overlap = footprint - wrStart;
          targetWidth -= overlap;
          // Shift the center away from corner by overlap / 2
          const shiftDist = overlap / 2;
          shiftX += wUnit.x * shiftDist;
          shiftY += wUnit.y * shiftDist;
          
          // Determine which post to hide based on wall normal
          const inwardNormal = calculateWallInwardNormal({x: wall.geometry.x1, y: wall.geometry.y1}, {x: wall.geometry.x2, y: wall.geometry.y2}, roomPolygon).inwardNormal;
          const cross2D = wUnit.x * inwardNormal.y - wUnit.y * inwardNormal.x;
          if (cross2D > 0) {
              hideLeftPost = true;
          } else {
              hideRightPost = true;
          }
        } else if (wrEnd <= footprint) {
          // Wall rack is completely inside the corner rack footprint!
          // We should ideally hide it.
          targetWidth = 0.01; // Hide it
        }
      }
    }

    return { width: targetWidth, shiftX, shiftY, hideLeftPost, hideRightPost };
  }
}
