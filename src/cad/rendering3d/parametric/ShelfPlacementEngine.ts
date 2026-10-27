/**
 * RetailFix CAD - Phase 6
 * ShelfPlacementEngine
 *
 * Deterministic engine for calculating exact shelf placements (positions, clearances,
 * spacings, thicknesses) within the physical bounds of a RetailFix rack.
 *
 * All inputs and outputs are in physical inches.
 */

export interface ShelfPlacementInput {
  rackWidth: number;          // Total outer rack width (inches)
  rackDepth: number;          // Total outer rack depth (inches)
  rackHeight: number;         // Total outer rack height (inches)
  shelfCount: number;         // Number of visible shelves (e.g. 3 to 10)
  shelfSpacing?: number | 'auto'; // 'auto' for even distribution, or numeric inches
  shelfThickness?: number;    // Shelf thickness in inches (default: 1.0")
  topClearance?: number;      // Clearance from top of frame to top shelf (default: ~10-12")
  bottomClearance?: number;   // Clearance from ground to bottom deck shelf (default: ~3.15")
  sideFrameThickness?: number;// Thickness of each side upright frame (default: ~1.0")
  backClearance?: number;     // Inset from rear wall / back panel (default: ~0.5")
  minShelves?: number;        // Minimum allowed shelves (default: 1)
  maxShelves?: number;        // Maximum allowed shelves (default: 12)
}

export interface ShelfPlacement {
  tierIndex: number;          // 0 = bottom base deck, 1, 2, ...
  y: number;                  // Local height in inches from rack ground (Y = 0)
  width: number;              // Usable physical shelf width (inches)
  depth: number;              // Usable physical shelf depth (inches)
  thickness: number;          // Physical thickness (inches)
  spacingBelow: number;       // Clear vertical distance to previous shelf / deck
  isBaseDeck: boolean;        // Whether this is the ground deck/kickplate shelf
  isTopShelf: boolean;        // Whether this is the uppermost shelf
}

export interface ShelfPlacementResult {
  placements: ShelfPlacement[];
  usableHeight: number;       // Distance between bottom deck and top boundary
  effectiveSpacing: number;   // Spacing in inches between adjacent shelves
  bottomBoundary: number;     // Lowest valid shelf Y (inches)
  topBoundary: number;        // Highest valid shelf Y (inches)
  isValid: boolean;
  validationMessage?: string;
}

export class ShelfPlacementEngine {
  // RetailFix standard physical clearances (derived from actual GLB measurements)
  public static readonly DEFAULT_BOTTOM_CLEARANCE = 3.1574; // inches from floor to top of bottom shelf deck
  public static readonly DEFAULT_TOP_CLEARANCE = 11.0624;    // inches from top of rack to top shelf
  public static readonly DEFAULT_SHELF_THICKNESS = 1.0;     // inches
  public static readonly DEFAULT_SIDE_FRAME_THICKNESS = 1.0;// inches per side
  public static readonly MIN_USABLE_SPACING = 3.0;          // minimum allowable gap between shelves

  /**
   * Deterministically calculates vertical placement of every shelf tier.
   * ShelfPlacementEngine is the SINGLE SOURCE OF TRUTH for shelf vertical distribution.
   */
  public static calculatePlacements(input: ShelfPlacementInput): ShelfPlacementResult {
    const minCount = input.minShelves ?? 1;
    const maxCount = input.maxShelves ?? 12;
    const clampedCount = Math.max(minCount, Math.min(maxCount, Math.round(input.shelfCount || 5)));

    const rackH = Math.max(12, input.rackHeight || 84);
    const rackW = Math.max(12, input.rackWidth || 36);
    const rackD = Math.max(6, input.rackDepth || 24);

    const thickness = Math.max(0.25, Math.min(4.0, input.shelfThickness ?? this.DEFAULT_SHELF_THICKNESS));
    const bottomClearance = input.bottomClearance ?? this.DEFAULT_BOTTOM_CLEARANCE;

    // Scale top clearance proportionally if rack is unusually short, but keep minimum 4"
    const standardTopClearance = input.topClearance ?? this.DEFAULT_TOP_CLEARANCE;
    const topClearance = Math.min(standardTopClearance, Math.max(4.0, rackH * 0.14));

    const bottomBoundary = bottomClearance;
    const topBoundary = Math.max(bottomBoundary + 6.0, rackH - topClearance);
    const usableHeight = topBoundary - bottomBoundary;

    // Usable shelf width: rack width minus side upright frame allowance
    const sideAllowance = (input.sideFrameThickness ?? this.DEFAULT_SIDE_FRAME_THICKNESS) * 2;
    const usableWidth = Math.max(6.0, rackW - sideAllowance);

    // Usable shelf depth: slightly inset from outer depth (e.g. 85-90% of rack depth for upper shelves)
    const usableDepth = Math.max(4.0, rackD - (input.backClearance ?? 1.5));

    const placements: ShelfPlacement[] = [];

    if (clampedCount === 1) {
      placements.push({
        tierIndex: 0,
        y: Math.round(bottomBoundary * 10000) / 10000,
        width: Math.round(usableWidth * 1000) / 1000,
        depth: Math.round(usableDepth * 1000) / 1000,
        thickness,
        spacingBelow: bottomBoundary,
        isBaseDeck: true,
        isTopShelf: true,
      });

      return {
        placements,
        usableHeight: Math.round(usableHeight * 10000) / 10000,
        effectiveSpacing: usableHeight,
        bottomBoundary: Math.round(bottomBoundary * 10000) / 10000,
        topBoundary: Math.round(topBoundary * 10000) / 10000,
        isValid: true,
      };
    }

    const isAuto = !input.shelfSpacing || input.shelfSpacing === 'auto';
    let effectiveSpacing: number;

    if (isAuto) {
      // Authoritative AUTO distribution: equal vertical intervals across total usable rack height
      effectiveSpacing = usableHeight / (clampedCount - 1);
    } else {
      const requested = typeof input.shelfSpacing === 'number' ? input.shelfSpacing : parseFloat(String(input.shelfSpacing));
      if (!isNaN(requested) && requested > 0) {
        effectiveSpacing = requested;
      } else {
        effectiveSpacing = usableHeight / (clampedCount - 1);
      }
    }

    // Validate that shelves do not overlap or exceed physical rack bounds
    let isValid = true;
    let validationMessage: string | undefined;

    if (effectiveSpacing < this.MIN_USABLE_SPACING) {
      isValid = false;
      validationMessage = `Shelf spacing (${effectiveSpacing.toFixed(1)}″) is too tight for ${clampedCount} shelves in a ${rackH}″ rack. Minimum spacing is ${this.MIN_USABLE_SPACING}″.`;
    }

    for (let i = 0; i < clampedCount; i++) {
      let yPos: number;
      if (isAuto) {
        yPos = bottomBoundary + i * effectiveSpacing;
      } else {
        yPos = bottomBoundary + i * effectiveSpacing;
        if (yPos > topBoundary) {
          // Clamp to top boundary for manual spacing
          yPos = topBoundary;
        }
      }

      // All shelf levels have identical physical depth
      const tierDepth = usableDepth;

      placements.push({
        tierIndex: i,
        y: Math.round(yPos * 10000) / 10000,
        width: Math.round(usableWidth * 1000) / 1000,
        depth: Math.round(tierDepth * 1000) / 1000,
        thickness,
        spacingBelow: i === 0 ? bottomBoundary : Math.round(effectiveSpacing * 10000) / 10000,
        isBaseDeck: i === 0,
        isTopShelf: i === clampedCount - 1,
      });
    }

    return {
      placements,
      usableHeight: Math.round(usableHeight * 10000) / 10000,
      effectiveSpacing: Math.round(effectiveSpacing * 10000) / 10000,
      bottomBoundary: Math.round(bottomBoundary * 10000) / 10000,
      topBoundary: Math.round(topBoundary * 10000) / 10000,
      isValid,
      validationMessage,
    };
  }

  /**
   * Section 24: Engineering validation for shelf vertical spacing.
   * Asserts that center-to-center distances between adjacent shelves are equal within tolerance.
   */
  public static validateShelfSpacing(
    placements: ShelfPlacement[],
    tolerance: number = 0.05
  ): {
    shelfCount: number;
    positions: number[];
    centerToCenterGaps: number[];
    minGap: number;
    maxGap: number;
    maxDeviation: number;
    valid: boolean;
  } {
    const shelfCount = placements.length;
    const positions = placements.map((p) => p.y);
    const centerToCenterGaps: number[] = [];

    for (let i = 1; i < shelfCount; i++) {
      const gap = Math.round((positions[i] - positions[i - 1]) * 1000) / 1000;
      centerToCenterGaps.push(gap);
    }

    if (centerToCenterGaps.length === 0) {
      return {
        shelfCount,
        positions,
        centerToCenterGaps,
        minGap: 0,
        maxGap: 0,
        maxDeviation: 0,
        valid: true,
      };
    }

    const minGap = Math.min(...centerToCenterGaps);
    const maxGap = Math.max(...centerToCenterGaps);
    const maxDeviation = Math.round((maxGap - minGap) * 1000) / 1000;
    const valid = maxDeviation <= tolerance;

    return {
      shelfCount,
      positions,
      centerToCenterGaps,
      minGap,
      maxGap,
      maxDeviation,
      valid,
    };
  }

  /**
   * Section 25: Visible shelf gap validation.
   * visibleGap = centerToCenterGap - shelfThickness.
   * Asserts that visible vertical clearance between shelf surfaces is uniform.
   */
  public static validateVisibleGaps(
    placements: ShelfPlacement[],
    shelfThickness: number = 1.0,
    tolerance: number = 0.05
  ): {
    shelfCount: number;
    thickness: number;
    visibleGaps: number[];
    minVisibleGap: number;
    maxVisibleGap: number;
    isUniform: boolean;
  } {
    const spacingVal = this.validateShelfSpacing(placements, tolerance);
    const visibleGaps = spacingVal.centerToCenterGaps.map((gap) =>
      Math.round((gap - shelfThickness) * 1000) / 1000
    );

    const minVisibleGap = visibleGaps.length > 0 ? Math.min(...visibleGaps) : 0;
    const maxVisibleGap = visibleGaps.length > 0 ? Math.max(...visibleGaps) : 0;
    const isUniform = (maxVisibleGap - minVisibleGap) <= tolerance;

    return {
      shelfCount: placements.length,
      thickness: shelfThickness,
      visibleGaps,
      minVisibleGap,
      maxVisibleGap,
      isUniform,
    };
  }

  /**
   * Section 35: Shelf dimensions uniformity validation.
   * Asserts that all shelves have identical width, depth, and thickness across tiers.
   */
  public static validateShelfDimensions(
    placements: ShelfPlacement[],
    tolerance: number = 0.01
  ): {
    valid: boolean;
    uniformWidth: boolean;
    uniformDepth: boolean;
    uniformThickness: boolean;
    expectedWidth: number;
    expectedDepth: number;
    expectedThickness: number;
  } {
    if (placements.length === 0) {
      return {
        valid: true,
        uniformWidth: true,
        uniformDepth: true,
        uniformThickness: true,
        expectedWidth: 0,
        expectedDepth: 0,
        expectedThickness: 0,
      };
    }

    const first = placements[0];
    const uniformWidth = placements.every((p) => Math.abs(p.width - first.width) <= tolerance);
    const uniformDepth = placements.every((p) => Math.abs(p.depth - first.depth) <= tolerance);
    const uniformThickness = placements.every((p) => Math.abs(p.thickness - first.thickness) <= tolerance);

    return {
      valid: uniformWidth && uniformDepth && uniformThickness,
      uniformWidth,
      uniformDepth,
      uniformThickness,
      expectedWidth: first.width,
      expectedDepth: first.depth,
      expectedThickness: first.thickness,
    };
  }
}

