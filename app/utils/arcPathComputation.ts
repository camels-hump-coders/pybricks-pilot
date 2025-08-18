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
 * Calculate arc that passes through a waypoint, connecting incoming and outgoing line segments
 * The arc smoothly connects the path from prevPoint -> waypoint -> nextPoint
 */
function calculatePassThroughArc(
  prevPoint: { x: number; y: number },
  waypoint: { x: number; y: number },
  nextPoint: { x: number; y: number },
  maxRadius: number
): {
  arcStart: { x: number; y: number };
  arcEnd: { x: number; y: number };
  arcCenter: { x: number; y: number };
  radius: number;
  startAngle: number;
  endAngle: number;
  pathLength: number;
} | null {
  // Calculate the incoming and outgoing direction vectors
  const incomingAngle = calculateAngle(prevPoint.x, prevPoint.y, waypoint.x, waypoint.y);
  const outgoingAngle = calculateAngle(waypoint.x, waypoint.y, nextPoint.x, nextPoint.y);
  
  // Calculate the angle bisector at the waypoint
  let bisectorAngle = (incomingAngle + outgoingAngle) / 2;
  
  // Handle angle wrap-around (ensure we take the interior bisector)
  const angleDiff = normalizeAngle(outgoingAngle - incomingAngle);
  if (Math.abs(angleDiff) > 90) {
    bisectorAngle = normalizeAngle(bisectorAngle + 180);
  }
  
  // Calculate the turn angle at the waypoint
  const turnAngle = Math.abs(angleDiff);
  
  // If the turn is too small, don't create an arc
  if (turnAngle < 10) {
    return null;
  }
  
  // Calculate optimal arc radius based on available space and turn angle
  const distToPrev = calculateDistance(prevPoint.x, prevPoint.y, waypoint.x, waypoint.y);
  const distToNext = calculateDistance(waypoint.x, waypoint.y, nextPoint.x, nextPoint.y);
  const minDistance = Math.min(distToPrev, distToNext);
  
  // Limit radius to available space and max radius
  const maxAllowedRadius = Math.min(maxRadius, minDistance * 0.4);
  
  // Calculate radius based on turn angle for smooth motion
  // Sharper turns need smaller radius, gentler turns can use larger radius
  const radiusFactor = Math.max(0.3, 1 - (turnAngle / 180));
  const radius = Math.min(maxAllowedRadius, maxRadius * radiusFactor);
  
  // Calculate how far back from the waypoint to start/end the arc
  const halfTurnRad = (turnAngle * Math.PI) / (2 * 180);
  const chordDistance = radius * Math.tan(halfTurnRad);
  
  // Ensure chord distance doesn't exceed available space
  const maxChordDistance = Math.min(distToPrev * 0.8, distToNext * 0.8);
  const actualChordDistance = Math.min(chordDistance, maxChordDistance);
  
  // Calculate arc start and end points along the line segments
  const incomingUnitX = Math.cos(incomingAngle * Math.PI / 180);
  const incomingUnitY = Math.sin(incomingAngle * Math.PI / 180);
  const outgoingUnitX = Math.cos(outgoingAngle * Math.PI / 180);
  const outgoingUnitY = Math.sin(outgoingAngle * Math.PI / 180);
  
  const arcStart = {
    x: waypoint.x - incomingUnitX * actualChordDistance,
    y: waypoint.y - incomingUnitY * actualChordDistance
  };
  
  const arcEnd = {
    x: waypoint.x + outgoingUnitX * actualChordDistance,
    y: waypoint.y + outgoingUnitY * actualChordDistance
  };
  
  // Calculate arc center position
  const bisectorUnitX = Math.cos(bisectorAngle * Math.PI / 180);
  const bisectorUnitY = Math.sin(bisectorAngle * Math.PI / 180);
  
  // Distance from waypoint to arc center along bisector
  const centerDistance = actualChordDistance / Math.tan(halfTurnRad);
  
  const arcCenter = {
    x: waypoint.x + bisectorUnitX * centerDistance,
    y: waypoint.y + bisectorUnitY * centerDistance
  };
  
  // Calculate arc angles
  const startAngle = Math.atan2(arcStart.y - arcCenter.y, arcStart.x - arcCenter.x) * 180 / Math.PI;
  const endAngle = Math.atan2(arcEnd.y - arcCenter.y, arcEnd.x - arcCenter.x) * 180 / Math.PI;
  
  // Calculate actual radius from center to start point
  const actualRadius = calculateDistance(arcCenter.x, arcCenter.y, arcStart.x, arcStart.y);
  
  // Calculate path length
  const arcAngle = Math.abs(normalizeAngle(endAngle - startAngle));
  const pathLength = actualRadius * arcAngle * Math.PI / 180;
  
  return {
    arcStart,
    arcEnd,
    arcCenter,
    radius: actualRadius,
    startAngle,
    endAngle,
    pathLength
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
 * Calculate path segments that smoothly connect mission points with arcs passing through waypoints
 */
function calculateSmoothPathSegments(
  points: MissionPointType[],
  defaultRadius: number
): ArcPathSegment[] {
  if (points.length < 2) return [];
  
  const segments: ArcPathSegment[] = [];
  
  for (let i = 0; i < points.length - 1; i++) {
    const prevPoint = i > 0 ? points[i - 1] : null;
    const currentPoint = points[i];
    const nextPoint = points[i + 1];
    const followingPoint = i < points.length - 2 ? points[i + 2] : null;
    
    // For the current segment from currentPoint to nextPoint
    if (nextPoint.type === "waypoint" && followingPoint) {
      // Next point is a waypoint - create arc that passes through it
      const arcResult = calculatePassThroughArc(
        currentPoint,
        nextPoint,
        followingPoint,
        defaultRadius
      );
      
      if (arcResult) {
        // Segment 1: Straight line from current point to arc start
        const distToArcStart = calculateDistance(currentPoint.x, currentPoint.y, arcResult.arcStart.x, arcResult.arcStart.y);
        if (distToArcStart > 5) {
          segments.push({
            fromPoint: currentPoint,
            toPoint: nextPoint,
            startX: currentPoint.x,
            startY: currentPoint.y,
            endX: arcResult.arcStart.x,
            endY: arcResult.arcStart.y,
            startHeading: calculateAngle(currentPoint.x, currentPoint.y, arcResult.arcStart.x, arcResult.arcStart.y),
            endHeading: calculateAngle(currentPoint.x, currentPoint.y, arcResult.arcStart.x, arcResult.arcStart.y),
            pathType: "straight",
            pathLength: distToArcStart
          });
        }
        
        // Segment 2: Arc passing through waypoint
        segments.push({
          fromPoint: { ...nextPoint, x: arcResult.arcStart.x, y: arcResult.arcStart.y } as MissionPointType,
          toPoint: { ...nextPoint, x: arcResult.arcEnd.x, y: arcResult.arcEnd.y } as MissionPointType,
          startX: arcResult.arcStart.x,
          startY: arcResult.arcStart.y,
          endX: arcResult.arcEnd.x,
          endY: arcResult.arcEnd.y,
          startHeading: calculateAngle(currentPoint.x, currentPoint.y, nextPoint.x, nextPoint.y),
          endHeading: calculateAngle(nextPoint.x, nextPoint.y, followingPoint.x, followingPoint.y),
          pathType: "arc",
          pathLength: arcResult.pathLength,
          arcCenter: arcResult.arcCenter,
          arcRadius: arcResult.radius,
          arcStartAngle: arcResult.startAngle,
          arcEndAngle: arcResult.endAngle
        });
      } else {
        // Fallback to straight line
        segments.push({
          fromPoint: currentPoint,
          toPoint: nextPoint,
          startX: currentPoint.x,
          startY: currentPoint.y,
          endX: nextPoint.x,
          endY: nextPoint.y,
          startHeading: calculateAngle(currentPoint.x, currentPoint.y, nextPoint.x, nextPoint.y),
          endHeading: calculateAngle(currentPoint.x, currentPoint.y, nextPoint.x, nextPoint.y),
          pathType: "straight",
          pathLength: calculateDistance(currentPoint.x, currentPoint.y, nextPoint.x, nextPoint.y)
        });
      }
    } else {
      // Direct connection for start/end/action points
      const angle = calculateAngle(currentPoint.x, currentPoint.y, nextPoint.x, nextPoint.y);
      segments.push({
        fromPoint: currentPoint,
        toPoint: nextPoint,
        startX: currentPoint.x,
        startY: currentPoint.y,
        endX: nextPoint.x,
        endY: nextPoint.y,
        startHeading: nextPoint.type === "action" ? (nextPoint as ActionPoint).heading : angle,
        endHeading: nextPoint.type === "action" ? (nextPoint as ActionPoint).heading : angle,
        pathType: "straight",
        pathLength: calculateDistance(currentPoint.x, currentPoint.y, nextPoint.x, nextPoint.y)
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
  
  let angleStep = (endAngle - startAngle) / (numPoints - 1);
  
  // Ensure we take the shorter arc
  if (Math.abs(angleStep) > Math.PI) {
    angleStep = angleStep > 0 ? angleStep - 2 * Math.PI : angleStep + 2 * Math.PI;
  }
  
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