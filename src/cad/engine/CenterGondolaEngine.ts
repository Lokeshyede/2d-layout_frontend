import type { CADEntity, RackEntity, Point2D } from '../types';
import { distance, degreesToRadians } from '../geometry/GeometryMath';

export interface GondolaRun {
  runId: string;
  racks: RackEntity[];
  alignedPositions: Map<string, Point2D>;
}

export class CenterGondolaEngine {
  public static readonly ADJACENCY_TOLERANCE_INCHES = 1.0;

  /**
   * Detects continuous runs of Center Racks.
   * Racks that form a run are returned grouped.
   * Racks that do not connect to any other rack form a run of length 1.
   */
  public static detectRuns(entities: CADEntity[]): GondolaRun[] {
    const centerRacks = entities.filter(this.isCenterRack) as RackEntity[];
    const runs: GondolaRun[] = [];
    const visited = new Set<string>();

    for (const rack of centerRacks) {
      if (visited.has(rack.id)) continue;

      const currentRun: RackEntity[] = [];
      const queue: RackEntity[] = [rack];
      visited.add(rack.id);

      while (queue.length > 0) {
        const current = queue.shift()!;
        currentRun.push(current);

        for (const other of centerRacks) {
          if (visited.has(other.id)) continue;
          if (this.areAdjacent(current, other)) {
            visited.add(other.id);
            queue.push(other);
          }
        }
      }

      // Sort racks within the run visually from left to right
      currentRun.sort((a, b) => this.getProjectedPosition(a) - this.getProjectedPosition(b));

      const alignedPositions = new Map<string, Point2D>();
      if (currentRun.length > 0) {
        const first = currentRun[0];
        const rotRad = degreesToRadians(first.geometry.rotation || 0);
        const rightVec = { x: Math.cos(rotRad), y: Math.sin(rotRad) };
        
        let currentPos = { x: first.geometry.x, y: first.geometry.y };
        alignedPositions.set(first.id, { ...currentPos });

        for (let i = 1; i < currentRun.length; i++) {
          const prev = currentRun[i - 1];
          const curr = currentRun[i];
          const prevW = prev.geometry.width || 36;
          const currW = curr.geometry.width || 36;
          
          const dist = prevW / 2 + currW / 2;
          currentPos = {
            x: currentPos.x + rightVec.x * dist,
            y: currentPos.y + rightVec.y * dist,
          };
          alignedPositions.set(curr.id, { ...currentPos });
        }
      }

      runs.push({
        runId: `run_${currentRun[0].id}`,
        racks: currentRun,
        alignedPositions,
      });
    }

    return runs;
  }

  private static isCenterRack(entity: CADEntity): boolean {
    if (entity.type !== 'rack') return false;
    const rack = entity as RackEntity;
    const type = rack.properties.rackType || '';
    const name = rack.properties.productName || '';
    
    // Explicitly exclude wall racks, corner racks, endcaps
    if (type.toLowerCase().includes('wall') || name.toLowerCase().includes('wall')) return false;
    if (type.toLowerCase().includes('corner') || name.toLowerCase().includes('corner')) return false;
    if (type.toLowerCase().includes('endcap') || type.toLowerCase().includes('end cap') || name.toLowerCase().includes('end')) return false;
    if (rack.properties.attachedWallId) return false;

    // Must be center rack
    return (
      type === 'center_rack_5x3' ||
      type === 'Center Rack' ||
      type === 'Center Gondola' ||
      type.toLowerCase().includes('center') ||
      type.toLowerCase().includes('gondola') ||
      name.toLowerCase().includes('center') ||
      name.toLowerCase().includes('gondola')
    );
  }

  private static areAdjacent(a: RackEntity, b: RackEntity): boolean {
    // Basic compatibility: same rotation, depth, height, shelves
    const rotA = (a.geometry.rotation || 0) % 360;
    const rotB = (b.geometry.rotation || 0) % 360;
    
    // Normalize rotations (must be identical or exactly 180 opposite? No, must be identical to be same run alignment)
    if (Math.abs(rotA - rotB) > 0.5) return false;

    // Height & Depth should match for a perfect structural run
    const depthA = a.geometry.depth || a.properties.depth || 24;
    const depthB = b.geometry.depth || b.properties.depth || 24;
    if (Math.abs(depthA - depthB) > 0.5) return false;

    const heightA = a.geometry.height || a.properties.height || 60;
    const heightB = b.geometry.height || b.properties.height || 60;
    if (Math.abs(heightA - heightB) > 0.5) return false;

    const shelvesA = a.properties.shelfCount ?? a.properties.shelves ?? 6;
    const shelvesB = b.properties.shelfCount ?? b.properties.shelves ?? 6;
    if (shelvesA !== shelvesB) return false;

    // Check physical adjacency
    const rotRad = degreesToRadians(rotA);
    const rightVec = { x: Math.cos(rotRad), y: Math.sin(rotRad) };
    
    const wA = a.geometry.width || 36;
    const wB = b.geometry.width || 36;

    // A right to B left
    const aRight: Point2D = {
      x: a.geometry.x + (wA / 2) * rightVec.x,
      y: a.geometry.y + (wA / 2) * rightVec.y,
    };
    const bLeft: Point2D = {
      x: b.geometry.x - (wB / 2) * rightVec.x,
      y: b.geometry.y - (wB / 2) * rightVec.y,
    };

    if (distance(aRight, bLeft) <= this.ADJACENCY_TOLERANCE_INCHES) return true;

    // B right to A left
    const bRight: Point2D = {
      x: b.geometry.x + (wB / 2) * rightVec.x,
      y: b.geometry.y + (wB / 2) * rightVec.y,
    };
    const aLeft: Point2D = {
      x: a.geometry.x - (wA / 2) * rightVec.x,
      y: a.geometry.y - (wA / 2) * rightVec.y,
    };

    if (distance(bRight, aLeft) <= this.ADJACENCY_TOLERANCE_INCHES) return true;

    return false;
  }

  private static getProjectedPosition(rack: RackEntity): number {
    const rotRad = degreesToRadians(rack.geometry.rotation || 0);
    const rightVec = { x: Math.cos(rotRad), y: Math.sin(rotRad) };
    // Project center point onto the right vector
    return rack.geometry.x * rightVec.x + rack.geometry.y * rightVec.y;
  }
}
