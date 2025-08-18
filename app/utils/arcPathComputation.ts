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
export function normalizeAngle(angle: number): number {
  let normalized = angle % 360;
  if (normalized > 180) {
    normalized -= 360;
  } else if (normalized < -180) {
    normalized += 360;
  }
  return normalized;
}

/**
 * Calculate the angle between two points in canvas coordinates
 * Returns angle in degrees, 0° = East, 90° = South (canvas Y+ down)
 */
function calculateAngle(x1: number, y1: number, x2: number, y2: number): number {
  return Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
}

/**
 * Convert canvas coordinates and heading to robot coordinates and heading
 * Canvas: Y+ down, 0° = East
 * Robot: Y+ up (North), 0° = North
 */
function canvasToRobotCoords(x: number, y: number, heading: number): {
  x: number; y: number; heading: number;
} {
  return {
    x: x,
    y: -y, // Flip Y axis: Canvas Y+ down → Robot Y+ up
    heading: normalizeAngle(90 - heading) // Convert: Canvas 0°=East → Robot 0°=North
  };
}

/**
 * Calculate tangent direction for an arc at a given point
 * For a circle with center (cx, cy), the tangent at point (px, py) is perpendicular to the radius
 */
function calculateArcTangent(
  pointX: number, 
  pointY: number, 
  centerX: number, 
  centerY: number,
  clockwise: boolean = false
): number {
  // Calculate radius direction (from center to point)
  const radiusAngle = Math.atan2(pointY - centerY, pointX - centerX);
  
  // Tangent is perpendicular to radius (±90°)
  const tangentAngle = radiusAngle + (clockwise ? -Math.PI/2 : Math.PI/2);
  
  return normalizeAngle(tangentAngle * 180 / Math.PI);
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
  // Check if points are collinear using cross product
  const dx1 = p2.x - p1.x;
  const dy1 = p2.y - p1.y;
  const dx2 = p3.x - p1.x;
  const dy2 = p3.y - p1.y;
  const cross = dx1 * dy2 - dy1 * dx2;
  
  if (Math.abs(cross) < 0.001) {
    return null;
  }
  
  // Using the formula for circumcenter
  const ax = p1.x;
  const ay = p1.y;
  const bx = p2.x;
  const by = p2.y;
  const cx = p3.x;
  const cy = p3.y;
  
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  
  if (Math.abs(d) < 0.001) {
    return null;
  }
  
  const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d;
  const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d;
  
  const center = { x: ux, y: uy };
  const radius = calculateDistance(center.x, center.y, p1.x, p1.y);
  
  return { center, radius };
}

/**
 * Identify optimization segments between action points
 * Action points create breaks where we don't optimize across them
 */
function identifyOptimizationSegments(points: MissionPointType[]): Array<{startIndex: number, endIndex: number}> {
  const segments: Array<{startIndex: number, endIndex: number}> = [];
  let segmentStart = 0;
  
  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    
    // Action points create optimization breaks
    if (point.type === "action" || i === points.length - 1) {
      // End current segment if it has at least 3 points (needed for triarc)
      if (i - segmentStart >= 2) {
        segments.push({
          startIndex: segmentStart,
          endIndex: i
        });
      }
      
      // Start new segment after action point
      if (point.type === "action" && i < points.length - 1) {
        segmentStart = i;
      }
    }
  }
  
  return segments;
}

/**
 * Calculate rolling triarc optimization for a segment of points
 * This considers overlapping triplets: A-B-C, B-C-D, C-D-E, etc.
 */
function calculateRollingTriarc(
  points: MissionPointType[],
  startIndex: number,
  endIndex: number
): Map<number, {
  center: { x: number; y: number };
  radius: number;
  startAngle: number;
  endAngle: number;
  startPoint: { x: number; y: number };
  endPoint: { x: number; y: number };
  energy: number;
}> {
  const arcs = new Map();
  
  // If segment is too short for triarc optimization, use simple waypoint arcs
  if (endIndex - startIndex < 2) {
    return arcs;
  }
  
  // Calculate energy for different arc configurations
  const arcCandidates = new Map<number, Array<{
    arc: any;
    energy: number;
    source: string; // Which triarc generated this arc
  }>>();
  
  // Generate arc candidates from overlapping triplets
  for (let i = startIndex; i <= endIndex - 2; i++) {
    const triplet = points.slice(i, i + 3);
    if (triplet.length === 3) {
      const triarc = calculateTriarcForTriplet(triplet, i);
      
      if (triarc) {
        // Add arc candidates for the middle waypoint
        const middleIndex = i + 1;
        if (points[middleIndex].type === "waypoint") {
          if (!arcCandidates.has(middleIndex)) {
            arcCandidates.set(middleIndex, []);
          }
          
          arcCandidates.get(middleIndex)!.push({
            arc: triarc.arc,
            energy: triarc.energy,
            source: `triarc-${i}-${i+1}-${i+2}`
          });
        }
      }
    }
  }
  
  // Select best arc for each waypoint based on minimum energy
  for (const [waypointIndex, candidates] of arcCandidates) {
    if (candidates.length > 0) {
      const bestCandidate = candidates.reduce((best, current) => 
        current.energy < best.energy ? current : best
      );
      
      arcs.set(waypointIndex, {
        ...bestCandidate.arc,
        energy: bestCandidate.energy
      });
    }
  }
  
  return arcs;
}

/**
 * Calculate triarc for a triplet of points, optimizing energy
 */
function calculateTriarcForTriplet(
  triplet: MissionPointType[],
  _baseIndex: number
): {
  arc: {
    center: { x: number; y: number };
    radius: number;
    startAngle: number;
    endAngle: number;
    startPoint: { x: number; y: number };
    endPoint: { x: number; y: number };
  };
  energy: number;
} | null {
  const [p1, p2, p3] = triplet;
  
  // Try to create an arc through all three points
  const arcResult = calculateWaypointArc(p1, p2, p3);
  
  if (!arcResult) {
    return null;
  }
  
  // Calculate energy cost (curvature squared * arc length)
  const curvature = 1 / arcResult.radius; // Higher curvature = sharper turn
  const arcAngle = Math.abs(normalizeAngle(arcResult.endAngle - arcResult.startAngle));
  const arcLength = arcResult.radius * arcAngle * Math.PI / 180;
  const energy = curvature * curvature * arcLength; // Energy = curvature² × length
  
  return {
    arc: arcResult,
    energy
  };
}

/**
 * Calculate a simpler single arc that passes through the waypoint
 * This ensures the arc passes through the waypoint rather than bypassing it
 */
function calculateWaypointArc(
  prevPoint: { x: number; y: number },
  waypoint: { x: number; y: number },
  nextPoint: { x: number; y: number }
): {
  center: { x: number; y: number };
  radius: number;
  startAngle: number;
  endAngle: number;
  startPoint: { x: number; y: number };
  endPoint: { x: number; y: number };
} | null {
  // Use the three-point circle calculation to ensure arc passes through waypoint
  const circleResult = findCircleThroughThreePoints(prevPoint, waypoint, nextPoint);
  
  if (!circleResult) {
    return null;
  }
  
  const { center, radius } = circleResult;
  
  // Check for reasonable radius
  if (radius < 10 || radius > 2000) {
    return null;
  }
  
  // Calculate angles
  const startAngle = Math.atan2(prevPoint.y - center.y, prevPoint.x - center.x) * 180 / Math.PI;
  const endAngle = Math.atan2(nextPoint.y - center.y, nextPoint.x - center.x) * 180 / Math.PI;
  
  return {
    center,
    radius,
    startAngle,
    endAngle,
    startPoint: prevPoint,
    endPoint: nextPoint
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
 * Calculate smooth path segments using rolling triarc optimization
 * Optimizes paths across multiple waypoints while treating action points as breaks
 */
function calculateSmoothPathSegments(
  points: MissionPointType[],
  _defaultRadius: number
): ArcPathSegment[] {
  if (points.length < 2) return [];
  
  // First, identify optimization segments (between action points)
  const optimizationSegments = identifyOptimizationSegments(points);
  
  // Calculate optimized arcs for each segment using rolling triarc approach
  const optimizedArcs = new Map<number, {
    center: { x: number; y: number };
    radius: number;
    startAngle: number;
    endAngle: number;
    startPoint: { x: number; y: number };
    endPoint: { x: number; y: number };
    energy: number; // Energy cost for optimization
  }>();
  
  for (const segment of optimizationSegments) {
    const segmentArcs = calculateRollingTriarc(points, segment.startIndex, segment.endIndex);
    
    // Merge the calculated arcs into our map
    for (const [index, arc] of segmentArcs) {
      optimizedArcs.set(index, arc);
    }
  }
  
  // Second pass: Generate path segments using optimized arcs
  const segments: ArcPathSegment[] = [];
  
  for (let i = 0; i < points.length - 1; i++) {
    const currentPoint = points[i];
    const nextPoint = points[i + 1];
    
    // Check if next point is a waypoint with an optimized arc
    const nextArc = optimizedArcs.get(i + 1);
    
    if (nextArc) {
      // For optimized arcs, we create one arc segment that covers the entire path from prevPoint to nextPoint through the waypoint
      const arcAngle = Math.abs(normalizeAngle(nextArc.endAngle - nextArc.startAngle));
      const arcLength = nextArc.radius * arcAngle * Math.PI / 180;
      
      
      // Calculate proper tangent directions for the arc
      const arcSweep = normalizeAngle(nextArc.endAngle - nextArc.startAngle);
      const clockwise = arcSweep < 0;
      
      const startTangent = calculateArcTangent(
        nextArc.startPoint.x, 
        nextArc.startPoint.y, 
        nextArc.center.x, 
        nextArc.center.y, 
        clockwise
      );
      
      const endTangent = calculateArcTangent(
        nextArc.endPoint.x, 
        nextArc.endPoint.y, 
        nextArc.center.x, 
        nextArc.center.y, 
        clockwise
      );
      
      segments.push({
        fromPoint: currentPoint,
        toPoint: nextPoint,
        startX: nextArc.startPoint.x,
        startY: nextArc.startPoint.y,
        endX: nextArc.endPoint.x,
        endY: nextArc.endPoint.y,
        startHeading: startTangent,
        endHeading: endTangent,
        pathType: "arc",
        pathLength: arcLength,
        arcCenter: nextArc.center,
        arcRadius: nextArc.radius,
        arcStartAngle: nextArc.startAngle,
        arcEndAngle: nextArc.endAngle
      });
      
      // Skip the next iteration since this arc already covers the path to the point after nextPoint
      i++;
      
    } else {
      // No arc - create simple straight line segment
      const segmentDistance = calculateDistance(currentPoint.x, currentPoint.y, nextPoint.x, nextPoint.y);
      
      if (segmentDistance > 1) {
        const segmentAngle = calculateAngle(currentPoint.x, currentPoint.y, nextPoint.x, nextPoint.y);
        
        segments.push({
          fromPoint: currentPoint,
          toPoint: nextPoint,
          startX: currentPoint.x,
          startY: currentPoint.y,
          endX: nextPoint.x,
          endY: nextPoint.y,
          startHeading: segmentAngle,
          endHeading: segmentAngle,
          pathType: "straight",
          pathLength: segmentDistance
        });
      }
    }
  }
  
  return segments;
}


/**
 * Create simple straight line segments between all mission points as fallback
 */
function createFallbackStraightSegments(points: MissionPointType[]): ArcPathSegment[] {
  const segments: ArcPathSegment[] = [];
  
  for (let i = 0; i < points.length - 1; i++) {
    const fromPoint = points[i];
    const toPoint = points[i + 1];
    const distance = calculateDistance(fromPoint.x, fromPoint.y, toPoint.x, toPoint.y);
    const angle = calculateAngle(fromPoint.x, fromPoint.y, toPoint.x, toPoint.y);
    
    segments.push({
      fromPoint,
      toPoint,
      startX: fromPoint.x,
      startY: fromPoint.y,
      endX: toPoint.x,
      endY: toPoint.y,
      startHeading: angle,
      endHeading: angle,
      pathType: "straight",
      pathLength: distance
    });
  }
  
  return segments;
}

/**
 * Compute arc-based path segments that pass through waypoints for smooth motion
 * Falls back to straight line connections if arc calculation fails
 */
export function computeArcPath(mission: Mission): ArcPathSegment[] {
  if (!mission || mission.points.length < 2) {
    return [];
  }
  
  const defaultRadius = mission.defaultArcRadius || 100; // mm
  const segments = calculateSmoothPathSegments(mission.points, defaultRadius);
  
  // If no segments were generated, create fallback straight line segments
  if (segments.length === 0) {
    return createFallbackStraightSegments(mission.points);
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
  
  
  // Calculate the angle difference
  let angleDiff = segment.arcEndAngle - segment.arcStartAngle;
  
  // Normalize to [-180, 180] range
  while (angleDiff > 180) angleDiff -= 360;
  while (angleDiff < -180) angleDiff += 360;
  
  // Convert to radians for interpolation
  const angleDiffRad = angleDiff * Math.PI / 180;
  const angleStep = angleDiffRad / (numPoints - 1);
  
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