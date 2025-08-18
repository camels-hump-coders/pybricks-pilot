import type { Mission, MissionPointType, ActionPoint } from "../types/missionPlanner";

/**
 * Arc path segment representing a smooth curved path between two points
 */
export interface ArcPathSegment {
  fromPoint: MissionPointType;
  toPoint: MissionPointType;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  startHeading: number;
  endHeading: number;
  arcCenter?: { x: number; y: number };
  arcRadius?: number;
  arcStartAngle?: number;
  arcEndAngle?: number;
  pathType: "straight" | "arc";
  pathLength: number;
}

/**
 * Normalize angle to -180 to 180 range
 */
function normalizeAngle(angle: number): number {
  let normalized = angle % 360;
  if (normalized > 180) {
    normalized -= 360;
  } else if (normalized < -180) {
    normalized += 360;
  }
  return normalized;
}

/**
 * Calculate the angle between two points
 */
function calculateAngle(x1: number, y1: number, x2: number, y2: number): number {
  return Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
}

/**
 * Calculate distance between two points
 */
function calculateDistance(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Find the circle that passes through three points (entry, waypoint, exit)
 * This guarantees the arc will pass through the waypoint
 */
function findCircleThroughThreePoints(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number }
): { center: { x: number; y: number }; radius: number } | null {
  // Calculate the perpendicular bisectors of two chords
  const mid1 = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
  const mid2 = { x: (p2.x + p3.x) / 2, y: (p2.y + p3.y) / 2 };
  
  // Slopes of the chords
  const slope1 = (p2.y - p1.y) / (p2.x - p1.x);
  const slope2 = (p3.y - p2.y) / (p3.x - p2.x);
  
  // Handle vertical lines
  let perpSlope1, perpSlope2;
  
  if (Math.abs(p2.x - p1.x) < 0.001) {
    // First chord is vertical, perpendicular bisector is horizontal
    perpSlope1 = 0;
  } else if (Math.abs(slope1) < 0.001) {
    // First chord is horizontal, perpendicular bisector is vertical
    return null; // Will handle this case differently
  } else {
    perpSlope1 = -1 / slope1;
  }
  
  if (Math.abs(p3.x - p2.x) < 0.001) {
    // Second chord is vertical, perpendicular bisector is horizontal
    perpSlope2 = 0;
  } else if (Math.abs(slope2) < 0.001) {
    // Second chord is horizontal, perpendicular bisector is vertical
    return null; // Will handle this case differently
  } else {
    perpSlope2 = -1 / slope2;
  }
  
  // Find intersection of perpendicular bisectors (this is the center)
  // Line 1: y - mid1.y = perpSlope1 * (x - mid1.x)
  // Line 2: y - mid2.y = perpSlope2 * (x - mid2.x)
  
  if (Math.abs(perpSlope1 - perpSlope2) < 0.001) {
    // Lines are parallel, points are collinear
    return null;
  }
  
  const centerX = (perpSlope1 * mid1.x - perpSlope2 * mid2.x + mid2.y - mid1.y) / (perpSlope1 - perpSlope2);
  const centerY = perpSlope1 * (centerX - mid1.x) + mid1.y;
  
  const center = { x: centerX, y: centerY };
  const radius = calculateDistance(center.x, center.y, p1.x, p1.y);
  
  return { center, radius };
}

/**
 * Calculate tangent-based arc that smoothly connects incoming and outgoing paths
 * The arc is tangent to both the incoming and outgoing path directions
 */
function calculateTangentBasedArc(
  prevPoint: { x: number; y: number },
  waypoint: { x: number; y: number },
  nextPoint: { x: number; y: number },
  desiredRadius: number
): {
  entryPoint: { x: number; y: number };
  exitPoint: { x: number; y: number };
  arcCenter: { x: number; y: number };
  arcStartAngle: number;
  arcEndAngle: number;
  actualRadius: number;
} | null {
  // Calculate incoming and outgoing direction vectors
  const incomingAngle = calculateAngle(prevPoint.x, prevPoint.y, waypoint.x, waypoint.y);
  const outgoingAngle = calculateAngle(waypoint.x, waypoint.y, nextPoint.x, nextPoint.y);
  
  // Calculate the turn angle
  const turnAngleDiff = normalizeAngle(outgoingAngle - incomingAngle);
  const turnAngle = Math.abs(turnAngleDiff);
  
  // If the turn is very small, don't create an arc
  if (turnAngle < 5) {
    return null;
  }
  
  // Calculate available distances to prevent arc from extending beyond points
  const distToPrev = calculateDistance(prevPoint.x, prevPoint.y, waypoint.x, waypoint.y);
  const distToNext = calculateDistance(waypoint.x, waypoint.y, nextPoint.x, nextPoint.y);
  
  // Calculate the bisector angle (average of incoming and outgoing angles)
  let bisectorAngle = (incomingAngle + outgoingAngle) / 2;
  
  // Handle angle wrapping - ensure we take the interior bisector
  if (Math.abs(turnAngleDiff) > 180) {
    bisectorAngle = normalizeAngle(bisectorAngle + 180);
  }
  
  // Calculate the distance from waypoint to arc center along the bisector
  const halfTurnRad = (turnAngle * Math.PI) / (2 * 180);
  const centerDistance = desiredRadius / Math.sin(halfTurnRad);
  
  // Calculate tangent distance (distance from waypoint to tangent points)
  const tangentDistance = desiredRadius / Math.tan(halfTurnRad);
  
  // Check if we have enough space for the tangent distances
  const maxTangentDistance = Math.min(distToPrev * 0.4, distToNext * 0.4);
  if (tangentDistance > maxTangentDistance) {
    // Scale down the radius to fit available space
    const scaledTangentDistance = maxTangentDistance;
    const scaledRadius = scaledTangentDistance * Math.tan(halfTurnRad);
    const scaledCenterDistance = scaledRadius / Math.sin(halfTurnRad);
    
    return calculateArcWithParameters(
      waypoint, incomingAngle, outgoingAngle, bisectorAngle,
      scaledTangentDistance, scaledRadius, scaledCenterDistance
    );
  }
  
  return calculateArcWithParameters(
    waypoint, incomingAngle, outgoingAngle, bisectorAngle,
    tangentDistance, desiredRadius, centerDistance
  );
}

/**
 * Helper function to calculate arc with given parameters
 */
function calculateArcWithParameters(
  waypoint: { x: number; y: number },
  incomingAngle: number,
  outgoingAngle: number,
  bisectorAngle: number,
  tangentDistance: number,
  radius: number,
  centerDistance: number
): {
  entryPoint: { x: number; y: number };
  exitPoint: { x: number; y: number };
  arcCenter: { x: number; y: number };
  arcStartAngle: number;
  arcEndAngle: number;
  actualRadius: number;
} {
  // Calculate tangent points where the arc touches the incoming/outgoing paths
  const incomingUnitX = Math.cos(incomingAngle * Math.PI / 180);
  const incomingUnitY = Math.sin(incomingAngle * Math.PI / 180);
  const outgoingUnitX = Math.cos(outgoingAngle * Math.PI / 180);
  const outgoingUnitY = Math.sin(outgoingAngle * Math.PI / 180);
  
  const entryPoint = {
    x: waypoint.x - incomingUnitX * tangentDistance,
    y: waypoint.y - incomingUnitY * tangentDistance
  };
  
  const exitPoint = {
    x: waypoint.x + outgoingUnitX * tangentDistance,
    y: waypoint.y + outgoingUnitY * tangentDistance
  };
  
  // Calculate arc center position along the bisector
  const bisectorUnitX = Math.cos(bisectorAngle * Math.PI / 180);
  const bisectorUnitY = Math.sin(bisectorAngle * Math.PI / 180);
  
  const arcCenter = {
    x: waypoint.x + bisectorUnitX * centerDistance,
    y: waypoint.y + bisectorUnitY * centerDistance
  };
  
  // Calculate arc start and end angles
  const arcStartAngle = Math.atan2(entryPoint.y - arcCenter.y, entryPoint.x - arcCenter.x) * 180 / Math.PI;
  const arcEndAngle = Math.atan2(exitPoint.y - arcCenter.y, exitPoint.x - arcCenter.x) * 180 / Math.PI;
  
  return {
    entryPoint,
    exitPoint,
    arcCenter,
    arcStartAngle,
    arcEndAngle,
    actualRadius: radius
  };
}

/**
 * Path segment types for optimal robot movement
 */
export type PathSegmentType = "turn" | "straight" | "arc";

/**
 * Enhanced path segment with turn-straight-arc breakdown
 */
export interface OptimalPathSegment extends ArcPathSegment {
  segmentType: PathSegmentType;
  turnAngle?: number; // For turn segments
  arcSweepAngle?: number; // For arc segments
  subSegments?: OptimalPathSegment[]; // Break down complex paths
}

/**
 * Calculate smooth path segments by connecting between arc entry/exit points
 * Waypoints get arcs, action points get direct connections (hard turns)
 */
function calculateSmoothPathSegments(
  points: MissionPointType[],
  defaultRadius: number
): ArcPathSegment[] {
  if (points.length < 2) return [];
  
  // First pass: Calculate arc entry/exit points for all waypoints
  const arcPoints = new Map<number, {
    entryPoint: { x: number; y: number };
    exitPoint: { x: number; y: number };
    arcCenter: { x: number; y: number };
    arcStartAngle: number;
    arcEndAngle: number;
    radius: number;
  }>();
  
  for (let i = 1; i < points.length - 1; i++) {
    const currentPoint = points[i];
    
    // Only calculate arc points for waypoints (not action/start/end points)
    if (currentPoint.type === "waypoint") {
      const prevPoint = points[i - 1];
      const nextPoint = points[i + 1];
      
      const arcResult = calculateWaypointArcPoints(
        prevPoint,
        currentPoint,
        nextPoint,
        defaultRadius
      );
      
      if (arcResult) {
        arcPoints.set(i, {
          ...arcResult,
          radius: calculateDistance(arcResult.arcCenter.x, arcResult.arcCenter.y, arcResult.entryPoint.x, arcResult.entryPoint.y)
        });
      }
    }
  }
  
  // Second pass: Generate path segments between connection points
  const segments: ArcPathSegment[] = [];
  
  for (let i = 0; i < points.length - 1; i++) {
    const currentPoint = points[i];
    const nextPoint = points[i + 1];
    
    // Determine start point for this segment
    let segmentStart = { x: currentPoint.x, y: currentPoint.y };
    
    // If current point is a waypoint with an arc, start from its exit point
    const currentArc = arcPoints.get(i);
    if (currentArc) {
      segmentStart = currentArc.exitPoint;
    }
    
    // Determine end point for this segment
    let segmentEnd = { x: nextPoint.x, y: nextPoint.y };
    
    // If next point is a waypoint with an arc, end at its entry point
    const nextArc = arcPoints.get(i + 1);
    if (nextArc) {
      segmentEnd = nextArc.entryPoint;
    }
    
    // Create straight line segment between connection points
    const segmentDistance = calculateDistance(segmentStart.x, segmentStart.y, segmentEnd.x, segmentEnd.y);
    
    if (segmentDistance > 1) { // Only create segment if there's meaningful distance
      const segmentAngle = calculateAngle(segmentStart.x, segmentStart.y, segmentEnd.x, segmentEnd.y);
      
      segments.push({
        fromPoint: currentPoint,
        toPoint: nextPoint,
        startX: segmentStart.x,
        startY: segmentStart.y,
        endX: segmentEnd.x,
        endY: segmentEnd.y,
        startHeading: segmentAngle,
        endHeading: segmentAngle,
        pathType: "straight",
        pathLength: segmentDistance
      });
    }
    
    // Add arc segment for waypoints
    if (nextArc) {
      const arcAngle = Math.abs(normalizeAngle(nextArc.arcEndAngle - nextArc.arcStartAngle));
      const arcLength = nextArc.radius * arcAngle * Math.PI / 180;
      
      segments.push({
        fromPoint: nextPoint,
        toPoint: nextPoint, // Arc is centered on the waypoint
        startX: nextArc.entryPoint.x,
        startY: nextArc.entryPoint.y,
        endX: nextArc.exitPoint.x,
        endY: nextArc.exitPoint.y,
        startHeading: calculateAngle(segmentStart.x, segmentStart.y, nextArc.entryPoint.x, nextArc.entryPoint.y),
        endHeading: calculateAngle(nextArc.exitPoint.x, nextArc.exitPoint.y, i + 2 < points.length ? points[i + 2].x : nextArc.exitPoint.x, i + 2 < points.length ? points[i + 2].y : nextArc.exitPoint.y),
        pathType: "arc",
        pathLength: arcLength,
        arcCenter: nextArc.arcCenter,
        arcRadius: nextArc.radius,
        arcStartAngle: nextArc.arcStartAngle,
        arcEndAngle: nextArc.arcEndAngle
      });
    }
  }
  
  return segments;
}


/**
 * Compute arc-based path segments that pass through waypoints for smooth motion
 */
export function computeArcPath(mission: Mission): ArcPathSegment[] {
  if (!mission || mission.points.length < 2) {
    return [];
  }
  
  const defaultRadius = mission.defaultArcRadius || 100; // mm
  return calculateSmoothPathSegments(mission.points, defaultRadius);
}

/**
 * Generate points along an arc path for rendering
 */
export function generateArcPathPoints(
  segment: ArcPathSegment,
  resolution: number = 10 // points per 100mm of path
): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  
  if (segment.pathType === "straight") {
    // Simple straight line
    points.push({ x: segment.startX, y: segment.startY });
    points.push({ x: segment.endX, y: segment.endY });
    return points;
  }
  
  if (!segment.arcCenter || !segment.arcRadius || segment.arcStartAngle === undefined || segment.arcEndAngle === undefined) {
    // Fallback to straight line
    points.push({ x: segment.startX, y: segment.startY });
    points.push({ x: segment.endX, y: segment.endY });
    return points;
  }
  
  // Generate arc points
  const numPoints = Math.max(3, Math.ceil(segment.pathLength * resolution / 100));
  const startAngle = segment.arcStartAngle * Math.PI / 180;
  const endAngle = segment.arcEndAngle * Math.PI / 180;
  
  // Calculate the angle difference and normalize it
  let angleDiff = normalizeAngle((segment.arcEndAngle - segment.arcStartAngle));
  
  // Determine if we should go clockwise or counterclockwise
  // We want to take the shorter arc that passes through the waypoint
  if (Math.abs(angleDiff) > 180) {
    // Take the shorter path in the opposite direction
    angleDiff = angleDiff > 0 ? angleDiff - 360 : angleDiff + 360;
  }
  
  const angleStep = (angleDiff * Math.PI / 180) / (numPoints - 1);
  
  for (let i = 0; i < numPoints; i++) {
    const angle = startAngle + angleStep * i;
    const x = segment.arcCenter.x + segment.arcRadius * Math.cos(angle);
    const y = segment.arcCenter.y + segment.arcRadius * Math.sin(angle);
    points.push({ x, y });
  }
  
  return points;
}

/**
 * Get the total path length for a mission
 */
export function calculateMissionPathLength(mission: Mission): number {
  const segments = computeArcPath(mission);
  return segments.reduce((total, segment) => total + segment.pathLength, 0);
}

/**
 * Get estimated time to complete mission based on arc path
 */
export function estimateMissionTime(
  mission: Mission,
  averageSpeed: number = 200 // mm/s
): number {
  const pathLength = calculateMissionPathLength(mission);
  
  // Add extra time for action points (1 second each)
  const actionPoints = mission.points.filter(p => p.type === "action").length;
  const actionTime = actionPoints * 1000; // ms
  
  // Add extra time for turns (based on heading changes)
  const segments = computeArcPath(mission);
  const turnTime = segments.reduce((total, segment) => {
    if (segment.pathType === "arc") {
      const headingChange = Math.abs(normalizeAngle(segment.endHeading - segment.startHeading));
      return total + (headingChange / 90) * 500; // 500ms per 90° turn
    }
    return total;
  }, 0);
  
  const travelTime = (pathLength / averageSpeed) * 1000; // Convert to ms
  
  return Math.ceil((travelTime + actionTime + turnTime) / 1000); // Return in seconds
}