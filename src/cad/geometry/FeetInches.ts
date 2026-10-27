/**
 * Architectural Feet + Inches Formatting and Parsing Engine
 * Strictly produces formats like 50'-0", 24'-6", 2'-0", 1'-6"
 * Never decimal feet (e.g. 50.5 ft)
 */

export function formatFeetInches(totalInches: number, includeFractions = false): string {
  if (isNaN(totalInches)) return "0'-0\"";

  const sign = totalInches < 0 ? '-' : '';
  const absInches = Math.abs(totalInches);

  if (!includeFractions) {
    const roundedInches = Math.round(absInches);
    const feet = Math.floor(roundedInches / 12);
    const inches = roundedInches % 12;
    return `${sign}${feet}'-${inches}"`;
  }

  // With fractional precision to nearest 1/8"
  const feet = Math.floor(absInches / 12);
  const remInches = absInches % 12;
  const wholeInches = Math.floor(remInches);
  const frac = remInches - wholeInches;

  const eighths = Math.round(frac * 8);
  let fracStr = '';

  let finalWholeInches = wholeInches;
  let finalFeet = feet;

  if (eighths === 8) {
    finalWholeInches += 1;
  } else if (eighths > 0) {
    if (eighths === 4) fracStr = ' 1/2';
    else if (eighths === 2) fracStr = ' 1/4';
    else if (eighths === 6) fracStr = ' 3/4';
    else fracStr = ` ${eighths}/8`;
  }

  if (finalWholeInches === 12) {
    finalFeet += 1;
    finalWholeInches = 0;
  }

  return `${sign}${finalFeet}'-${finalWholeInches}${fracStr}"`;
}

export function parseFeetInches(input: string): number {
  if (!input || typeof input !== 'string') return 0;
  const trimmed = input.trim().toLowerCase();

  // Pure number assumes inches unless specified
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return parseFloat(trimmed);
  }

  // Matches patterns like: 24'-6", 24' 6", 24'6, 24ft 6in, 24'
  const ftInMatch = trimmed.match(/^(-?\d+)(?:'|ft|\s*feet)?(?:\s*-\s*|\s+)?(?:(\d+(?:\.\d+)?)(?:"|in|\s*inch)?)?$/);
  if (ftInMatch) {
    const sign = trimmed.startsWith('-') ? -1 : 1;
    const feet = Math.abs(parseInt(ftInMatch[1], 10) || 0);
    const inches = parseFloat(ftInMatch[2] || '0');
    return sign * (feet * 12 + inches);
  }

  // Fallback float
  const parsed = parseFloat(trimmed);
  return isNaN(parsed) ? 0 : parsed;
}

export function feetToInches(feet: number, inches = 0): number {
  return feet * 12 + inches;
}

export function inchesToFeetDecimal(inches: number): number {
  return inches / 12;
}

/**
 * Formats a single rack dimension part according to RetailFix CAD standards:
 * - When inches is 0: e.g. 7' or 3' or 2'
 * - When inches > 0: e.g. 3'-6" or 4'-8" or 2'-6" or 1'-8"
 */
export function formatRackDimensionPart(totalInches: number): string {
  const rounded = Math.round(Math.abs(totalInches));
  const feet = Math.floor(rounded / 12);
  const inches = rounded % 12;
  if (inches === 0) {
    return `${feet}'`;
  }
  return `${feet}'-${inches}"`;
}

/**
 * Formats full rack dimension label in standard RetailFix notation:
 * HEIGHT × WIDTH × DEPTH
 * Example: 7' × 3'-6" × 2'
 * Compact format: 7'×3'-6"×2'
 */
export function formatCustomRackLabel(
  heightInches: number,
  widthInches: number,
  depthInches: number,
  compact = false
): string {
  const h = formatRackDimensionPart(heightInches);
  const w = formatRackDimensionPart(widthInches);
  const d = formatRackDimensionPart(depthInches);
  return compact ? `${h}×${w}×${d}` : `${h} × ${w} × ${d}`;
}
