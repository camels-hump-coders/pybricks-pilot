/**
 * Mission Planner types and interfaces
 */

// Base point interface for waypoints and actions (have explicit coordinates)
export interface MissionPoint {
  id: string;
  x: number; // mm from left edge of mat
  y: number; // mm from top edge of mat (0 = top, positive = downward)
  type: "waypoint" | "action" | "start" | "end";
}

// Base interface for points that reference positions (start/end points)
export interface ReferencedPoint {
  id: string;
  type: "start" | "end";
  referenceType: "position" | "mission";
  referenceId: string; // position ID or mission ID
  // Note: x, y, heading are computed dynamically from the referenced position
}

// Waypoint - robot passes through but angle is determined by surrounding points
export interface Waypoint extends MissionPoint {
  type: "waypoint";
}

// Action point - robot must arrive at specific position and heading
export interface ActionPoint extends MissionPoint {
  type: "action";
  heading: number; // degrees clockwise from north (0 = north, 90 = east)
  actionName?: string; // optional description of what action to perform
  pauseDuration?: number; // optional pause time in seconds
}

// Start point - references a position or another mission
export interface StartPoint extends ReferencedPoint {
  type: "start";
}

// End point - references a position or another mission  
export interface EndPoint extends ReferencedPoint {
  type: "end";
}

// Union type for all point types
export type MissionPointType = Waypoint | ActionPoint | StartPoint | EndPoint;

// Resolved point type that includes computed coordinates for start/end points
export interface ResolvedMissionPoint {
  id: string;
  x: number; // mm from left edge of mat
  y: number; // mm from top edge of mat (0 = top, positive = downward)
  heading: number; // degrees clockwise from north (0 = north, 90 = east)
  type: "waypoint" | "action" | "start" | "end";
  // Additional properties for context
  referenceType?: "position" | "mission"; // only for start/end points
  referenceId?: string; // only for start/end points
  actionName?: string; // only for action points
  pauseDuration?: number; // only for action points
}

// Arc configuration for smooth movement between points
export interface ArcConfig {
  radius: number; // mm - radius of the arc
  clockwise: boolean; // direction of the arc
}

// Segment between two points
export interface MissionSegment {
  fromPoint: MissionPointType;
  toPoint: MissionPointType;
  arcConfig?: ArcConfig; // optional arc configuration for smooth movement
}

// Complete mission definition
export interface Mission {
  id: string;
  name: string;
  description?: string;
  points: MissionPointType[];
  segments: MissionSegment[];
  defaultArcRadius: number; // default arc radius for segments without specific config
  created: string; // ISO date string
  modified: string; // ISO date string
}

// Mission execution command types
export type DrivebaseCommand = 
  | { type: "straight"; distance: number; speed?: number }
  | { type: "turn"; angle: number; speed?: number } 
  | { type: "arc"; radius: number; angle: number; speed?: number }
  | { type: "pause"; duration: number }
  | { type: "action"; name: string; parameters?: Record<string, any> };

// Compiled mission ready for execution
export interface CompiledMission {
  mission: Mission;
  commands: DrivebaseCommand[];
  totalDistance: number; // mm
  estimatedDuration: number; // seconds
}

// Mission validation result
export interface MissionValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

// File format for missions.json
export interface MissionsFileData {
  version: string;
  missions: Mission[];
  lastModified: string;
}

// Mission execution status
export type MissionStatus = "idle" | "running" | "paused" | "completed" | "error";

// Mission execution state
export interface MissionExecution {
  mission: Mission;
  compiledMission: CompiledMission;
  status: MissionStatus;
  currentCommandIndex: number;
  currentCommand?: DrivebaseCommand;
  startTime?: string;
  completedTime?: string;
  error?: string;
}