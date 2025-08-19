/**
 * Utility functions for handling robot heading calculations
 */

/**
 * Normalize heading to -180 to 180 range
 */
export function normalizeHeading(heading: number): number {
  let normalized = heading % 360;
  if (normalized > 180) {
    normalized -= 360;
  } else if (normalized < -180) {
    normalized += 360;
  }
  return normalized;
}
