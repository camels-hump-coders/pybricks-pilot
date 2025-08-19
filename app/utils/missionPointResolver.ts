import type { 
  MissionPointType, 
  ResolvedMissionPoint, 
  StartPoint, 
  EndPoint,
  Waypoint,
  ActionPoint
} from "../types/missionPlanner";
import type { NamedPosition } from "../store/atoms/positionManagement";

/**
 * Resolve a mission point by computing coordinates from position references
 * for start/end points or using existing coordinates for waypoints/actions
 */
function resolveMissionPoint(
  point: MissionPointType,
  positions: NamedPosition[]
): ResolvedMissionPoint {
  if (point.type === "start" || point.type === "end") {
    const referencedPoint = point as StartPoint | EndPoint;
    
    // Ensure positions is an array
    const safePositions = Array.isArray(positions) ? positions : [];
    
    // Find the referenced position
    const position = safePositions.find(p => p.id === referencedPoint.referenceId);
    if (!position) {
      console.warn(`Position ${referencedPoint.referenceId} not found, using default coordinates`);
      return {
        id: point.id,
        x: 0,
        y: 0,
        heading: 0,
        type: point.type,
        referenceType: referencedPoint.referenceType,
        referenceId: referencedPoint.referenceId,
      };
    }

    return {
      id: point.id,
      x: position.x,
      y: position.y,
      heading: position.heading,
      type: point.type,
      referenceType: referencedPoint.referenceType,
      referenceId: referencedPoint.referenceId,
    };
  }

  // For waypoints and actions, use existing coordinates
  const pointWithCoords = point as { x: number; y: number; heading?: number };
  return {
    id: point.id,
    x: pointWithCoords.x,
    y: pointWithCoords.y,
    heading: pointWithCoords.heading || 0, // waypoints don't have heading, use 0
    type: point.type,
    // Include additional properties for actions
    ...(point.type === "action" && {
      actionName: (point as any).actionName,
      pauseDuration: (point as any).pauseDuration,
    }),
  };
}

/**
 * Resolve all points in a mission to include computed coordinates
 */
export function resolveMissionPoints(
  points: MissionPointType[],
  positions: NamedPosition[]
): ResolvedMissionPoint[] {
  // Ensure positions is an array
  const safePositions = Array.isArray(positions) ? positions : [];
  return points.map(point => resolveMissionPoint(point, safePositions));
}

/**
 * Check if a point needs coordinate resolution (is a start/end point)
 */
function isReferencedPoint(point: MissionPointType): point is StartPoint | EndPoint {
  return point.type === "start" || point.type === "end";
}

/**
 * Check if a point has explicit coordinates (is a waypoint/action)
 */
function hasExplicitCoordinates(point: MissionPointType): point is Waypoint | ActionPoint {
  return point.type === "waypoint" || point.type === "action";
}