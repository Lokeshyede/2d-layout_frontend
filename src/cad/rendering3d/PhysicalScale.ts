/**
 * Authoritative RetailFix CAD Physical 3D Scale System
 *
 * Physical Scale Definition:
 * 1 CAD unit = 1 inch
 * 1 3D World Unit = 1 inch
 * 1 foot = 12 3D World Units
 *
 * Both 2D CAD and 3D visualization share the identical physical world-unit base.
 * Racks, walls, openings, columns, partitions, floors, and ceilings all adhere
 * strictly to this single source of truth.
 */

export const WORLD_UNITS_PER_INCH = 1.0;
export const INCHES_PER_FOOT = 12.0;
export const WORLD_UNITS_PER_FOOT = 12.0;

/**
 * Authoritative Human Walk Physical Constants (Phase 3)
 * 1 3D World Unit = 1.0 inch
 */
export const DEFAULT_WALK_EYE_HEIGHT = 66.0; // 5'6" (approx 1.68m) human eye height above floor
export const DEFAULT_PLAYER_RADIUS = 12.0; // 12.0 inches (~0.30m) human shoulder/body radius
export const DEFAULT_COLLISION_BUFFER = 2.0; // 2.0 inches clearance buffer to prevent visual clipping
export const DEFAULT_TOTAL_COLLIDER_RADIUS = DEFAULT_PLAYER_RADIUS + DEFAULT_COLLISION_BUFFER; // 14.0 inches (~0.35m)
export const DEFAULT_WALK_SPEED = 54.0; // 4.5 ft/sec = 54 in/sec (~3.1 mph)
export const DEFAULT_RUN_SPEED = 96.0; // 8.0 ft/sec = 96 in/sec (~5.5 mph)

/**
 * Converts inches to 3D world units.
 * 1 inch = 1 world unit.
 */
export function inchesToWorldUnits(inches: number): number {
  return inches * WORLD_UNITS_PER_INCH;
}

/**
 * Converts feet (+ optional inches) to 3D world units.
 * E.g. feetToWorldUnits(10) = 120 world units.
 * feetToWorldUnits(10, 6) = 126 world units.
 */
export function feetToWorldUnits(feet: number, inches: number = 0): number {
  return (feet * INCHES_PER_FOOT + inches) * WORLD_UNITS_PER_INCH;
}

/**
 * Converts 3D world units to inches.
 */
export function worldUnitsToInches(worldUnits: number): number {
  return worldUnits / WORLD_UNITS_PER_INCH;
}

/**
 * Converts 3D world units to decimal feet.
 * E.g. worldUnitsToFeet(120) = 10.0 feet.
 */
export function worldUnitsToFeet(worldUnits: number): number {
  return worldUnits / WORLD_UNITS_PER_FOOT;
}

/**
 * Formats 3D world units as architectural feet and inches string.
 * E.g. 120 -> 10'-0", 126 -> 10'-6"
 */
export function formatWorldUnits(worldUnits: number): string {
  const totalInches = Math.round(worldUnitsToInches(worldUnits));
  const sign = totalInches < 0 ? '-' : '';
  const absInches = Math.abs(totalInches);
  const feet = Math.floor(absInches / 12);
  const inches = absInches % 12;
  return `${sign}${feet}'-${inches}"`;
}
