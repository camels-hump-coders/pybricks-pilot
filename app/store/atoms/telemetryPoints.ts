import { atom } from "jotai";
import type { TelemetryPoint, TelemetryPath } from "../../services/telemetryHistory";

// Atom for all telemetry points (combined from all paths)
export const allTelemetryPointsAtom = atom<TelemetryPoint[]>([]);

// Atom for all telemetry paths
export const telemetryPathsAtom = atom<TelemetryPath[]>([]);

// Atom for current recording path
export const currentTelemetryPathAtom = atom<TelemetryPath | null>(null);

// Derived atom for total duration
export const telemetryTotalDurationAtom = atom((get) => {
  const points = get(allTelemetryPointsAtom);
  if (points.length === 0) return 0;
  
  const firstTime = points[0].timestamp;
  const lastTime = points[points.length - 1].timestamp;
  return lastTime - firstTime;
});

// Derived atom for statistics
export const telemetryStatisticsAtom = atom((get) => {
  const allPoints = get(allTelemetryPointsAtom);
  const paths = get(telemetryPathsAtom);
  const currentPath = get(currentTelemetryPathAtom);
  
  const totalPoints = allPoints.length;
  const totalPaths = paths.length + (currentPath ? 1 : 0);
  const currentPathPoints = currentPath?.points.length || 0;
  
  // Rough memory estimate (each point is roughly 350 bytes)
  const avgBytesPerPoint = 350;
  const estimatedBytes = totalPoints * avgBytesPerPoint;
  const memoryUsageEstimate =
    estimatedBytes > 1024 * 1024
      ? `${(estimatedBytes / (1024 * 1024)).toFixed(1)} MB`
      : `${(estimatedBytes / 1024).toFixed(1)} KB`;
  
  return {
    totalPoints,
    totalPaths,
    currentPathPoints,
    memoryUsageEstimate,
  };
});

// Write atom to update all telemetry data at once
export const updateTelemetryDataAtom = atom(
  null,
  (get, set, update: { paths: TelemetryPath[], currentPath: TelemetryPath | null }) => {
    // Update paths
    set(telemetryPathsAtom, update.paths);
    set(currentTelemetryPathAtom, update.currentPath);
    
    // Combine all points and sort by timestamp
    const allPoints: TelemetryPoint[] = [];
    
    update.paths.forEach(path => {
      allPoints.push(...path.points);
    });
    
    if (update.currentPath && update.currentPath.points.length > 0) {
      allPoints.push(...update.currentPath.points);
    }
    
    // Sort by timestamp
    allPoints.sort((a, b) => a.timestamp - b.timestamp);
    
    set(allTelemetryPointsAtom, allPoints);
  }
);

// Atom for clearing all telemetry history
export const clearTelemetryHistoryAtom = atom(
  null,
  (get, set) => {
    set(allTelemetryPointsAtom, []);
    set(telemetryPathsAtom, []);
    set(currentTelemetryPathAtom, null);
  }
);