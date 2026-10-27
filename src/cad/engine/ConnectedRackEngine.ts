import type { CADEntity, RackEntity, Point2D, WallEntity } from '../types';
import { CenterGondolaEngine } from './CenterGondolaEngine';
import { CornerRackEngine } from './CornerRackEngine';
import { distance } from '../geometry/GeometryMath';

export interface ConnectedRackRun {
  runId: string;
  racks: RackEntity[];
}

export class ConnectedRackEngine {
  /**
   * Detects continuous runs of racks (Center Racks, Wall Racks, Corner Racks).
   * Generates lightweight runtime groups for visual/structural connection tracking.
   */
  public static detectRuns(entities: CADEntity[], roomPolygon: Point2D[]): ConnectedRackRun[] {
    const runs: ConnectedRackRun[] = [];
    
    // 1. Center Gondola Runs
    const centerRuns = CenterGondolaEngine.detectRuns(entities);
    for (const cr of centerRuns) {
      runs.push({
        runId: cr.runId,
        racks: cr.racks
      });
    }

    // 2. Wall & Corner Rack Runs
    const wallRacks = entities.filter(e => e.type === 'rack' && !this.isCenterRack(e) && !this.isCornerRack(e)) as RackEntity[];
    const cornerRacks = entities.filter(e => e.type === 'rack' && this.isCornerRack(e)) as RackEntity[];

    
    const visited = new Set<string>();

    // Start runs from corner racks
    for (const cornerRack of cornerRacks) {
      if (visited.has(cornerRack.id)) continue;
      
      const currentRun: RackEntity[] = [cornerRack];
      visited.add(cornerRack.id);

      const crResult = CornerRackEngine.detectCornerConnection(cornerRack, entities, roomPolygon);
      if (crResult.isValid) {
        // Find wall racks connected to Wall A and Wall B
        const attachedToA = wallRacks.filter(wr => wr.properties.attachedWallId === crResult.wallA?.id);
        const attachedToB = wallRacks.filter(wr => wr.properties.attachedWallId === crResult.wallB?.id);
        
        // Find the closest wall rack on Wall A that touches the corner footprint
        if (attachedToA.length > 0) {
           // We can just add all adjacent wall racks on this wall
           const sortedA = this.sortWallRacksByDistanceFromPoint(attachedToA, crResult.wallA!, crResult.cornerPoint!);
           for (const wr of sortedA) {
             currentRun.push(wr);
             visited.add(wr.id);
           }
        }
        
        if (attachedToB.length > 0) {
           const sortedB = this.sortWallRacksByDistanceFromPoint(attachedToB, crResult.wallB!, crResult.cornerPoint!);
           for (const wr of sortedB) {
             currentRun.push(wr);
             visited.add(wr.id);
           }
        }
      }

      runs.push({
        runId: `run_corner_${cornerRack.id}`,
        racks: currentRun
      });
    }

    // Isolated wall racks
    for (const wr of wallRacks) {
      if (!visited.has(wr.id)) {
        runs.push({
          runId: `run_isolated_${wr.id}`,
          racks: [wr]
        });
        visited.add(wr.id);
      }
    }

    return runs;
  }

  private static sortWallRacksByDistanceFromPoint(racks: RackEntity[], wall: WallEntity, pt: Point2D): RackEntity[] {
    const wStart = { x: wall.geometry.x1, y: wall.geometry.y1 };
    const wEnd = { x: wall.geometry.x2, y: wall.geometry.y2 };
    const otherPt = (distance(pt, wStart) > 1) ? wStart : wEnd;
    const wDir = { x: otherPt.x - pt.x, y: otherPt.y - pt.y };
    const wLen = Math.hypot(wDir.x, wDir.y);
    if (wLen < 0.01) return racks;
    const wUnit = { x: wDir.x / wLen, y: wDir.y / wLen };

    return racks.sort((a, b) => {
       const aDist = (a.geometry.x - pt.x) * wUnit.x + (a.geometry.y - pt.y) * wUnit.y;
       const bDist = (b.geometry.x - pt.x) * wUnit.x + (b.geometry.y - pt.y) * wUnit.y;
       return aDist - bDist;
    });
  }

  private static isCenterRack(entity: CADEntity): boolean {
    const rack = entity as RackEntity;
    const type = (rack.properties.rackType || '').toLowerCase();
    const name = (rack.properties.productName || '').toLowerCase();
    return type.includes('center') || type.includes('gondola') || name.includes('center') || name.includes('gondola');
  }

  private static isCornerRack(entity: CADEntity): boolean {
    const rack = entity as RackEntity;
    const type = (rack.properties.rackType || '').toLowerCase();
    const name = (rack.properties.productName || '').toLowerCase();
    return type.includes('corner') || name.includes('corner');
  }
}
