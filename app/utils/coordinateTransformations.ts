/**
 * Coordinate transformation utilities for Pybricks Pilot
 *
 * This file provides centralized functions for converting between different coordinate systems
 * used throughout the application.
 */

/**
 * Apply coordinate transformation to telemetry data
 *
 * This function takes raw telemetry data from the robot and applies
 * any necessary coordinate transformations. Currently, no transformations
 * are needed since we handle coordinate system differences in the
 * movement calculation itself.
 */
export function transformTelemetryData<
  T extends {
    hub?: { imu?: { heading?: number } };
    drivebase?: {
      distance?: number;
      angle?: number;
      state?: { distance?: number; angle?: number };
    };
  },
>(telemetryData: T): T {
  // Create a deep copy to avoid mutating the original data
  const transformed = JSON.parse(JSON.stringify(telemetryData));

  // NOTE: We do NOT transform distance values here because:
  // 1. Our movement calculation already handles the coordinate system conversion
  // 2. The movement calculation flips the Y component: newY = -distance * Math.cos(heading)
  // 3. This ensures that:
  //    - North-facing robot: positive distance moves UP (decreases Y)
  //    - South-facing robot: positive distance moves DOWN (increases Y)
  //    - East-facing robot: positive distance moves RIGHT (increases X)
  //    - West-facing robot: positive distance moves LEFT (decreases X)

  // The telemetry data is passed through unchanged
  // The movement calculation handles the coordinate system conversion

  return transformed;
}
