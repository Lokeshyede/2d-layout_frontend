import type { Point2D, BoundingBox2D } from '../types';

export function distance(p1: Point2D, p2: Point2D): number {
  return Math.hypot(p2.x - p1.x, p2.y - p1.y);
}

export function midpoint(p1: Point2D, p2: Point2D): Point2D {
  return {
    x: (p1.x + p2.x) / 2,
    y: (p1.y + p2.y) / 2,
  };
}

export function angleBetween(p1: Point2D, p2: Point2D): number {
  return Math.atan2(p2.y - p1.y, p2.x - p1.x);
}

export function degreesToRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function radiansToDegrees(rad: number): number {
  return (rad * 180) / Math.PI;
}

export function normalizeAngle(rad: number): number {
  let a = rad % (2 * Math.PI);
  if (a < 0) a += 2 * Math.PI;
  return a;
}

export function projectPointOntoLine(p: Point2D, lineStart: Point2D, lineEnd: Point2D): { point: Point2D; t: number; distance: number } {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    return { point: { ...lineStart }, t: 0, distance: distance(p, lineStart) };
  }

  let t = ((p.x - lineStart.x) * dx + (p.y - lineStart.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const projX = lineStart.x + t * dx;
  const projY = lineStart.y + t * dy;
  const projPoint = { x: projX, y: projY };

  return {
    point: projPoint,
    t,
    distance: distance(p, projPoint),
  };
}

export function lineIntersection(
  p1: Point2D,
  p2: Point2D,
  p3: Point2D,
  p4: Point2D
): Point2D | null {
  const denom = (p4.y - p3.y) * (p2.x - p1.x) - (p4.x - p3.x) * (p2.y - p1.y);
  if (Math.abs(denom) < 1e-6) return null;

  const ua = ((p4.x - p3.x) * (p1.y - p3.y) - (p4.y - p3.y) * (p1.x - p3.x)) / denom;
  const ub = ((p2.x - p1.x) * (p1.y - p3.y) - (p2.y - p1.y) * (p1.x - p3.x)) / denom;

  if (ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1) {
    return {
      x: p1.x + ua * (p2.x - p1.x),
      y: p1.y + ua * (p2.y - p1.y),
    };
  }

  return null;
}

export function perpendicularVector(p1: Point2D, p2: Point2D, length = 1): Point2D {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return { x: 0, y: -length };
  return {
    x: (-dy / len) * length,
    y: (dx / len) * length,
  };
}

export function rotatePoint(p: Point2D, center: Point2D, angleRad: number): Point2D {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const dx = p.x - center.x;
  const dy = p.y - center.y;
  return {
    x: center.x + (dx * cos - dy * sin),
    y: center.y + (dx * sin + dy * cos),
  };
}

export function doBoundingBoxesOverlap(b1: BoundingBox2D, b2: BoundingBox2D, padding = 0): boolean {
  return !(
    b1.maxX + padding < b2.minX - padding ||
    b1.minX - padding > b2.maxX + padding ||
    b1.maxY + padding < b2.minY - padding ||
    b1.minY - padding > b2.maxY + padding
  );
}

export function isPointInBox(p: Point2D, box: BoundingBox2D): boolean {
  return p.x >= box.minX && p.x <= box.maxX && p.y >= box.minY && p.y <= box.maxY;
}

export function snapAngleOrtho(p1: Point2D, p2: Point2D): Point2D {
  const dx = Math.abs(p2.x - p1.x);
  const dy = Math.abs(p2.y - p1.y);

  if (dx > dy) {
    return { x: p2.x, y: p1.y };
  } else {
    return { x: p1.x, y: p2.y };
  }
}

/**
 * Constructs an ordered, closed cyclic polygon from an unordered list of wall segments.
 * Snaps connected wall endpoints within CAD tolerance (e.g. 3.0 inches).
 */
export function buildRoomPolygon(
  walls: { geometry: { x1: number; y1: number; x2: number; y2: number } }[]
): Point2D[] {
  if (!Array.isArray(walls) || walls.length === 0) return [];
  const validWalls = walls.filter((w) => {
    return w?.geometry && Math.hypot(w.geometry.x2 - w.geometry.x1, w.geometry.y2 - w.geometry.y1) >= 1;
  });

  if (validWalls.length === 0) return [];
  if (validWalls.length === 1) {
    return [
      { x: validWalls[0].geometry.x1, y: validWalls[0].geometry.y1 },
      { x: validWalls[0].geometry.x2, y: validWalls[0].geometry.y2 },
    ];
  }

  const TOL = 3.0; // Snapping tolerance in inches

  interface Seg {
    p1: Point2D;
    p2: Point2D;
    used: boolean;
  }

  const segments: Seg[] = validWalls.map((w) => ({
    p1: { x: w.geometry.x1, y: w.geometry.y1 },
    p2: { x: w.geometry.x2, y: w.geometry.y2 },
    used: false,
  }));

  // Start with the first segment
  segments[0].used = true;
  const poly: Point2D[] = [segments[0].p1, segments[0].p2];
  let curr = segments[0].p2;

  for (let step = 1; step < segments.length; step++) {
    let bestDist = Infinity;
    let bestIdx = -1;
    let flip = false;

    for (let i = 0; i < segments.length; i++) {
      if (segments[i].used) continue;
      const d1 = distance(curr, segments[i].p1);
      const d2 = distance(curr, segments[i].p2);

      if (d1 < bestDist) {
        bestDist = d1;
        bestIdx = i;
        flip = false;
      }
      if (d2 < bestDist) {
        bestDist = d2;
        bestIdx = i;
        flip = true;
      }
    }

    if (bestIdx === -1 || bestDist > 24.0) {
      // No reasonably connected segment found, stop chaining
      break;
    }

    const nextSeg = segments[bestIdx];
    nextSeg.used = true;
    const nextPt = flip ? nextSeg.p1 : nextSeg.p2;
    poly.push(nextPt);
    curr = nextPt;

    // If we looped back to start within tolerance, we closed the cycle
    if (distance(curr, poly[0]) < TOL && poly.length >= 3) {
      break;
    }
  }

  // Remove redundant closing point if nearly identical to first point
  if (poly.length > 3 && distance(poly[poly.length - 1], poly[0]) < TOL) {
    poly.pop();
  }

  return poly;
}

/**
 * Tests whether a point lies strictly inside (or on the boundary of) a 2D polygon
 * using the standard ray-casting algorithm.
 */
export function isPointInPolygon(pt: Point2D, polygon: Point2D[], includeBoundary = true): boolean {
  if (!polygon || polygon.length < 3) return false;
  const n = polygon.length;
  let inside = false;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const p1 = polygon[i];
    const p2 = polygon[j];

    // Check if point is on the segment
    if (includeBoundary) {
      const proj = projectPointOntoLine(pt, p1, p2);
      if (proj.distance < 0.25 && proj.t >= -1e-4 && proj.t <= 1 + 1e-4) {
        return true;
      }
    }

    const intersect =
      p1.y > pt.y !== p2.y > pt.y &&
      pt.x < ((p2.x - p1.x) * (pt.y - p1.y)) / (p2.y - p1.y) + p1.x;
    if (intersect) inside = !inside;
  }

  return inside;
}

/**
 * Calculates the inward and exterior normals for a wall segment based on actual closed room geometry.
 * Uses robust multi-step point-in-polygon classification.
 *
 * For segment A -> B:
 *   d = normalize(B - A)
 *   n1 = (-d.y,  d.x)
 *   n2 = ( d.y, -d.x)
 *
 * Checks test points along n1 and n2 inside the polygon.
 * Inward normal points INTO the room. Exterior normal points OUT of the room.
 */
export function calculateWallInwardNormal(
  p1: Point2D,
  p2: Point2D,
  roomPolygon: Point2D[]
): {
  inwardNormal: Point2D;
  exteriorNormal: Point2D;
  wallDirection: Point2D;
} {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy);

  const dir: Point2D = len > 0 ? { x: dx / len, y: dy / len } : { x: 1, y: 0 };

  const n1: Point2D = { x: -dir.y, y: dir.x };
  const n2: Point2D = { x: dir.y, y: -dir.x };

  const mid: Point2D = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };

  if (!roomPolygon || roomPolygon.length < 3) {
    return {
      inwardNormal: n1,
      exteriorNormal: n2,
      wallDirection: dir,
    };
  }

  // Multi-step sampling along normals to avoid boundary false-positives
  const testSteps = [3, 6, 12, 20];
  let n1Score = 0;
  let n2Score = 0;

  for (const s of testSteps) {
    const t1 = { x: mid.x + n1.x * s, y: mid.y + n1.y * s };
    const t2 = { x: mid.x + n2.x * s, y: mid.y + n2.y * s };
    if (isPointInPolygon(t1, roomPolygon, false)) n1Score++;
    if (isPointInPolygon(t2, roomPolygon, false)) n2Score++;
  }

  let inward: Point2D;

  if (n1Score > n2Score) {
    inward = n1;
  } else if (n2Score > n1Score) {
    inward = n2;
  } else {
    // Fallback: use vector towards polygon centroid
    let cx = 0,
      cy = 0;
    for (const v of roomPolygon) {
      cx += v.x;
      cy += v.y;
    }
    cx /= roomPolygon.length;
    cy /= roomPolygon.length;

    const toCenter = { x: cx - mid.x, y: cy - mid.y };
    const dot1 = n1.x * toCenter.x + n1.y * toCenter.y;
    const dot2 = n2.x * toCenter.x + n2.y * toCenter.y;
    inward = dot1 >= dot2 ? n1 : n2;
  }

  const exterior: Point2D = { x: -inward.x, y: -inward.y };

  return {
    inwardNormal: inward,
    exteriorNormal: exterior,
    wallDirection: dir,
  };
}

/**
 * Checks whether two open line segments (p1-p2) and (p3-p4) strictly intersect
 * (excluding endpoints, within CAD tolerance).
 */
export function segmentsIntersectStrict(
  p1: Point2D,
  p2: Point2D,
  p3: Point2D,
  p4: Point2D
): boolean {
  const ccw = (a: Point2D, b: Point2D, c: Point2D) => {
    return (c.y - a.y) * (b.x - a.x) - (b.y - a.y) * (c.x - a.x);
  };

  const eps = 1e-4;
  const cp1 = ccw(p1, p2, p3);
  const cp2 = ccw(p1, p2, p4);
  const cp3 = ccw(p3, p4, p1);
  const cp4 = ccw(p3, p4, p2);

  return (
    ((cp1 > eps && cp2 < -eps) || (cp1 < -eps && cp2 > eps)) &&
    ((cp3 > eps && cp4 < -eps) || (cp3 < -eps && cp4 > eps))
  );
}

/**
 * Tests whether an entire inner polygon is strictly contained within an outer room polygon.
 * Verifies:
 * 1. Centroid is inside outer polygon.
 * 2. Every vertex is inside (or on boundary of) outer polygon.
 * 3. No edge of inner polygon strictly intersects any edge of outer polygon.
 */
export function isPolygonInsidePolygon(innerPoly: Point2D[], outerPoly: Point2D[]): boolean {
  if (!innerPoly || innerPoly.length < 3 || !outerPoly || outerPoly.length < 3) return false;

  // 1. Check centroid
  let cx = 0,
    cy = 0;
  for (const p of innerPoly) {
    cx += p.x;
    cy += p.y;
  }
  const centroid = { x: cx / innerPoly.length, y: cy / innerPoly.length };
  if (!isPointInPolygon(centroid, outerPoly, false)) {
    return false;
  }

  // 2. Check all vertices
  for (const p of innerPoly) {
    if (!isPointInPolygon(p, outerPoly, true)) {
      return false;
    }
  }

  // 3. Check for edge intersections with outer polygon
  const nIn = innerPoly.length;
  const nOut = outerPoly.length;

  for (let i = 0; i < nIn; i++) {
    const ip1 = innerPoly[i];
    const ip2 = innerPoly[(i + 1) % nIn];

    for (let j = 0; j < nOut; j++) {
      const op1 = outerPoly[j];
      const op2 = outerPoly[(j + 1) % nOut];

      if (segmentsIntersectStrict(ip1, ip2, op1, op2)) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Tests whether two convex or oriented polygons overlap using the Separating Axis Theorem (SAT).
 */
export function doPolygonsOverlap(polyA: Point2D[], polyB: Point2D[], pad = 0): boolean {
  const polys = [polyA, polyB];

  for (let i = 0; i < polys.length; i++) {
    const polygon = polys[i];
    const n = polygon.length;

    for (let i1 = 0; i1 < n; i1++) {
      const i2 = (i1 + 1) % n;
      const p1 = polygon[i1];
      const p2 = polygon[i2];

      const normal = { x: -(p2.y - p1.y), y: p2.x - p1.x };
      const len = Math.hypot(normal.x, normal.y);
      if (len === 0) continue;
      normal.x /= len;
      normal.y /= len;

      let minA = Infinity,
        maxA = -Infinity;
      for (const p of polyA) {
        const proj = normal.x * p.x + normal.y * p.y;
        if (proj < minA) minA = proj;
        if (proj > maxA) maxA = proj;
      }

      let minB = Infinity,
        maxB = -Infinity;
      for (const p of polyB) {
        const proj = normal.x * p.x + normal.y * p.y;
        if (proj < minB) minB = proj;
        if (proj > maxB) maxB = proj;
      }

      // If separated along this axis, no overlap
      if (maxA + pad < minB - pad || maxB + pad < minA - pad) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Tests whether two wall direction vectors form a true 90-degree corner
 * within strict engineering tolerance (default 0.5 degree, i.e. 89.5° to 90.5°).
 * v1 and v2 must be directed away from the shared corner vertex.
 */
export function isCorner90Degrees(v1: Point2D, v2: Point2D, toleranceDeg = 0.5): boolean {
  const len1 = Math.hypot(v1.x, v1.y);
  const len2 = Math.hypot(v2.x, v2.y);
  if (len1 === 0 || len2 === 0) return false;

  const u1 = { x: v1.x / len1, y: v1.y / len1 };
  const u2 = { x: v2.x / len2, y: v2.y / len2 };

  // dot product is 0 for 90 degrees
  const dot = u1.x * u2.x + u1.y * u2.y;
  const tolRad = (toleranceDeg * Math.PI) / 180;
  const maxDot = Math.sin(tolRad); // for 0.5 deg ~ 0.008726

  return Math.abs(dot) <= maxDot;
}

/**
 * Computes the valid interior X intervals where a horizontal line at height Y intersects a polygon.
 * Correctly handles concave, L-shaped, and irregular polygons.
 */
export function getPolygonScanIntervals(polygon: Point2D[], y: number): { minX: number; maxX: number }[] {
  if (!polygon || polygon.length < 3) return [];
  const n = polygon.length;
  const xIntersects: number[] = [];

  for (let i = 0; i < n; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % n];

    // Check if horizontal line crosses this edge
    if ((p1.y <= y && p2.y > y) || (p2.y <= y && p1.y > y)) {
      const dy = p2.y - p1.y;
      if (Math.abs(dy) > 1e-6) {
        const t = (y - p1.y) / dy;
        const x = p1.x + t * (p2.x - p1.x);
        xIntersects.push(x);
      }
    }
  }

  xIntersects.sort((a, b) => a - b);
  const intervals: { minX: number; maxX: number }[] = [];

  for (let i = 0; i < xIntersects.length - 1; i += 2) {
    const minX = xIntersects[i];
    const maxX = xIntersects[i + 1];
    if (maxX - minX > 1) {
      intervals.push({ minX, maxX });
    }
  }

  return intervals;
}
