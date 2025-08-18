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
 * Calculate arc parameters for smooth transition between two points
 */
function calculateArcParameters(
  fromX: number,
  fromY: number,
  fromHeading: number,
  toX: number,
  toY: number,
  toHeading: number,
  maxRadius: number
): {
  center: { x: number; y: number };
  radius: number;
  startAngle: number;
  endAngle: number;
  pathLength: number;
} | null {
  // Convert headings to radians
  const startAngleRad = (fromHeading * Math.PI) / 180;
  const endAngleRad = (toHeading * Math.PI) / 180;
  
  // Calculate perpendicular directions for arc center calculation
  const perpStart = {
    x: Math.cos(startAngleRad + Math.PI / 2),
    y: Math.sin(startAngleRad + Math.PI / 2)
  };
  
  const perpEnd = {
    x: Math.cos(endAngleRad + Math.PI / 2),
    y: Math.sin(endAngleRad + Math.PI / 2)
  };
  
  // Find intersection of perpendicular lines to determine arc center
  const det = perpStart.x * perpEnd.y - perpStart.y * perpEnd.x;
  
  if (Math.abs(det) < 0.001) {
    // Lines are parallel, can't create arc
    return null;
  }
  
  const dx = toX - fromX;
  const dy = toY - fromY;
  
  const t = (dx * perpEnd.y - dy * perpEnd.x) / det;
  
  const centerX = fromX + t * perpStart.x;
  const centerY = fromY + t * perpStart.y;
  
  // Calculate radius
  const radius = Math.sqrt((centerX - fromX) ** 2 + (centerY - fromY) ** 2);
  
  // Check if radius is within acceptable limits
  if (radius > maxRadius) {
    // Scale down to max radius
    const scale = maxRadius / radius;
    const adjustedCenterX = fromX + (centerX - fromX) * scale;
    const adjustedCenterY = fromY + (centerY - fromY) * scale;
    
    return {
      center: { x: adjustedCenterX, y: adjustedCenterY },
      radius: maxRadius,
      startAngle: Math.atan2(fromY - adjustedCenterY, fromX - adjustedCenterX) * 180 / Math.PI,
      endAngle: Math.atan2(toY - adjustedCenterY, toX - adjustedCenterX) * 180 / Math.PI,
      pathLength: maxRadius * Math.abs(normalizeAngle(Math.atan2(toY - adjustedCenterY, toX - adjustedCenterX) * 180 / Math.PI - Math.atan2(fromY - adjustedCenterY, fromX - adjustedCenterX) * 180 / Math.PI)) * Math.PI / 180
    };
  }
  
  const startAngle = Math.atan2(fromY - centerY, fromX - centerX) * 180 / Math.PI;
  const endAngle = Math.atan2(toY - centerY, toX - centerX) * 180 / Math.PI;
  const arcAngle = Math.abs(normalizeAngle(endAngle - startAngle));
  const pathLength = radius * arcAngle * Math.PI / 180;
  
  return {
    center: { x: centerX, y: centerY },
    radius,
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
 * Calculate optimal approach angle for a waypoint given previous and next points
 */
function calculateOptimalApproachAngle(
  prevPoint: MissionPointType | null,
  currentPoint: MissionPointType,
  nextPoint: MissionPointType | null,
  defaultRadius: number
): { approachAngle: number; exitAngle: number } {
  let approachAngle: number;
  let exitAngle: number;

  // If current point is an action point, use its specified heading
  if (currentPoint.type === "action") {
    const actionHeading = (currentPoint as ActionPoint).heading;
    approachAngle = actionHeading;
    exitAngle = actionHeading;
    return { approachAngle, exitAngle };
  }

  // Calculate approach angle from previous point
  if (prevPoint) {
    approachAngle = calculateAngle(prevPoint.x, prevPoint.y, currentPoint.x, currentPoint.y);
  } else {
    // First point - look ahead to next point
    approachAngle = nextPoint ? 
      calculateAngle(currentPoint.x, currentPoint.y, nextPoint.x, nextPoint.y) : 0;
  }

  // Calculate exit angle to next point
  if (nextPoint) {
    exitAngle = calculateAngle(currentPoint.x, currentPoint.y, nextPoint.x, nextPoint.y);
  } else {
    // Last point - use approach angle
    exitAngle = approachAngle;
  }

  // For waypoints, optimize the angle to minimize total turn
  if (currentPoint.type === "waypoint" && prevPoint && nextPoint) {
    const directAngle = calculateAngle(prevPoint.x, prevPoint.y, nextPoint.x, nextPoint.y);
    const distance1 = calculateDistance(prevPoint.x, prevPoint.y, currentPoint.x, currentPoint.y);
    const distance2 = calculateDistance(currentPoint.x, currentPoint.y, nextPoint.x, nextPoint.y);
    
    // If waypoint is close to the direct line, use the direct angle for smoother path
    const waypointOffset = calculateDistance(
      currentPoint.x, currentPoint.y,
      prevPoint.x + (nextPoint.x - prevPoint.x) * (distance1 / (distance1 + distance2)),
      prevPoint.y + (nextPoint.y - prevPoint.y) * (distance1 / (distance1 + distance2))
    );
    
    if (waypointOffset < defaultRadius * 0.5) {
      // Waypoint is close to direct path, use average angle for smoothness
      const avgAngle = (normalizeAngle(approachAngle) + normalizeAngle(exitAngle)) / 2;
      approachAngle = avgAngle;
      exitAngle = avgAngle;
    }
  }

  return { approachAngle, exitAngle };
}

/**
 * Create optimal path segments using turn-straight-arc approach
 */
function createOptimalSegments(
  fromPoint: MissionPointType,
  toPoint: MissionPointType,
  startHeading: number,
  endHeading: number,
  defaultRadius: number
): OptimalPathSegment[] {
  const segments: OptimalPathSegment[] = [];
  const distance = calculateDistance(fromPoint.x, fromPoint.y, toPoint.x, toPoint.y);
  const directAngle = calculateAngle(fromPoint.x, fromPoint.y, toPoint.x, toPoint.y);
  
  const startTurnAngle = normalizeAngle(directAngle - startHeading);
  const endTurnAngle = normalizeAngle(endHeading - directAngle);
  
  const needsStartTurn = Math.abs(startTurnAngle) > 5; // 5 degree tolerance
  const needsEndTurn = Math.abs(endTurnAngle) > 5;
  
  let currentX = fromPoint.x;
  let currentY = fromPoint.y;
  let currentHeading = startHeading;

  // 1. Initial turn if needed
  if (needsStartTurn) {
    segments.push({
      fromPoint,
      toPoint: fromPoint, // Turn in place
      startX: currentX,
      startY: currentY,
      endX: currentX,
      endY: currentY,
      startHeading: currentHeading,
      endHeading: directAngle,
      pathType: "arc",
      segmentType: "turn",
      turnAngle: startTurnAngle,
      pathLength: Math.abs(startTurnAngle) * Math.PI / 180 * (defaultRadius * 0.3), // Small turn radius
      arcCenter: { x: currentX, y: currentY },
      arcRadius: defaultRadius * 0.3,
      arcStartAngle: currentHeading,
      arcEndAngle: directAngle
    });
    currentHeading = directAngle;
  }

  // 2. Main straight segment
  if (distance > defaultRadius * 0.1) {
    let straightDistance = distance;
    let straightEndX = toPoint.x;
    let straightEndY = toPoint.y;
    
    // If we need an end turn, shorten the straight segment to allow for arc approach
    if (needsEndTurn && distance > defaultRadius) {
      const arcApproachDistance = Math.min(defaultRadius * 0.8, distance * 0.3);
      straightDistance = distance - arcApproachDistance;
      straightEndX = fromPoint.x + Math.cos(directAngle * Math.PI / 180) * straightDistance;
      straightEndY = fromPoint.y + Math.sin(directAngle * Math.PI / 180) * straightDistance;
    }

    segments.push({
      fromPoint: { ...fromPoint, x: currentX, y: currentY } as MissionPointType,
      toPoint: { ...toPoint, x: straightEndX, y: straightEndY } as MissionPointType,
      startX: currentX,
      startY: currentY,
      endX: straightEndX,
      endY: straightEndY,
      startHeading: currentHeading,
      endHeading: currentHeading,
      pathType: "straight",
      segmentType: "straight",
      pathLength: straightDistance
    });
    
    currentX = straightEndX;
    currentY = straightEndY;
  }

  // 3. Final arc approach to target if needed
  if (needsEndTurn && distance > defaultRadius * 0.1) {
    const arcParams = calculateArcParameters(
      currentX,
      currentY,
      currentHeading,
      toPoint.x,
      toPoint.y,
      endHeading,
      defaultRadius
    );

    if (arcParams) {
      segments.push({
        fromPoint: { ...fromPoint, x: currentX, y: currentY } as MissionPointType,
        toPoint,
        startX: currentX,
        startY: currentY,
        endX: toPoint.x,
        endY: toPoint.y,
        startHeading: currentHeading,
        endHeading: endHeading,
        pathType: "arc",
        segmentType: "arc",
        arcSweepAngle: Math.abs(normalizeAngle(arcParams.endAngle - arcParams.startAngle)),
        pathLength: arcParams.pathLength,
        arcCenter: arcParams.center,
        arcRadius: arcParams.radius,
        arcStartAngle: arcParams.startAngle,
        arcEndAngle: arcParams.endAngle
      });
    } else {
      // Fallback straight line
      segments.push({
        fromPoint: { ...fromPoint, x: currentX, y: currentY } as MissionPointType,
        toPoint,
        startX: currentX,
        startY: currentY,
        endX: toPoint.x,
        endY: toPoint.y,
        startHeading: currentHeading,
        endHeading: endHeading,
        pathType: "straight",
        segmentType: "straight",
        pathLength: calculateDistance(currentX, currentY, toPoint.x, toPoint.y)
      });
    }
  }

  return segments;
}

/**
 * Compute optimal arc-based path segments for a mission using turn-straight-arc approach
 */
export function computeArcPath(mission: Mission): ArcPathSegment[] {
  if (!mission || mission.points.length < 2) {
    return [];
  }
  
  const segments: ArcPathSegment[] = [];
  const defaultRadius = mission.defaultArcRadius || 100; // mm
  
  for (let i = 0; i < mission.points.length - 1; i++) {
    const prevPoint = i > 0 ? mission.points[i - 1] : null;
    const fromPoint = mission.points[i];
    const toPoint = mission.points[i + 1];
    const nextPoint = i < mission.points.length - 2 ? mission.points[i + 2] : null;
    
    // Calculate optimal approach and exit angles
    const { approachAngle: fromApproachAngle } = calculateOptimalApproachAngle(
      prevPoint, fromPoint, toPoint, defaultRadius
    );
    const { approachAngle: toApproachAngle } = calculateOptimalApproachAngle(
      fromPoint, toPoint, nextPoint, defaultRadius
    );
    
    // Use the calculated optimal angles
    const startHeading = fromApproachAngle;
    const endHeading = toApproachAngle;
    
    // Create optimal path segments for this point-to-point connection
    const optimalSegments = createOptimalSegments(
      fromPoint, toPoint, startHeading, endHeading, defaultRadius
    );
    
    segments.push(...optimalSegments);
  }
  
  return segments;
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