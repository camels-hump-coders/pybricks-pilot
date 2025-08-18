import type { Mission } from "../types/missionPlanner";
import type { ArcPathSegment } from "../utils/arcPathComputation";
import { computeArcPath, normalizeAngle } from "../utils/arcPathComputation";

/**
 * Convert canvas heading to robot heading
 * Canvas: 0° = East (right), 90° = South (down)
 * Robot: 0° = North (up), 90° = East (right)
 */
function canvasToRobotHeading(canvasHeading: number): number {
  // Canvas 0°=East needs to become Robot 90°=East
  // Canvas 90°=South needs to become Robot 180°=South  
  // Canvas -90°=North needs to become Robot 0°=North
  return normalizeAngle(canvasHeading + 90);
}
import type { RobotConfig } from "../schemas/RobotConfig";

/**
 * Robot command interface - matches both virtual and real robot command formats
 */
export interface RobotCommand {
  action: "drive" | "turn" | "stop" | "motor" | "pause" | "drive_continuous";
  distance?: number; // mm
  angle?: number; // degrees
  speed?: number; // mm/s for drive, degrees/s for turn
  turn_rate?: number; // degrees/s for continuous drive
  motor?: string;
  duration?: number; // ms for pause
  description?: string; // Human readable description
}

/**
 * Mission execution progress tracking
 */
export interface MissionExecutionProgress {
  currentSegmentIndex: number;
  currentCommandIndex: number;
  totalSegments: number;
  totalCommands: number;
  currentSegment: ArcPathSegment | null;
  currentCommand: RobotCommand | null;
  isRunning: boolean;
  isPaused: boolean;
  completedCommands: number;
  estimatedTimeRemaining: number; // seconds
}

/**
 * Mission execution options
 */
export interface MissionExecutionOptions {
  defaultSpeed: number; // mm/s
  defaultTurnSpeed: number; // degrees/s
  arcApproximationSegments: number; // Number of straight segments to approximate arcs
  pauseAtActions: boolean; // Whether to pause at action points
  actionPauseDuration: number; // ms to pause at action points
}

/**
 * Convert arc path segments to robot commands
 */
export class MissionExecutionService {
  private defaultOptions: MissionExecutionOptions = {
    defaultSpeed: 200, // mm/s
    defaultTurnSpeed: 90, // degrees/s
    arcApproximationSegments: 8, // Break arcs into 8 straight segments
    pauseAtActions: true,
    actionPauseDuration: 2000, // 2 seconds pause at actions
  };

  /**
   * Convert a mission to a sequence of robot commands
   */
  generateMissionCommands(
    mission: Mission,
    robotConfig?: RobotConfig,
    options: Partial<MissionExecutionOptions> = {}
  ): RobotCommand[] {
    const opts = { ...this.defaultOptions, ...options };
    const commands: RobotCommand[] = [];
    
    // Generate optimized arc path segments
    const segments = computeArcPath(mission);
    
    if (segments.length === 0) {
      return commands;
    }

    // Track current robot heading (starts at 0° = North)
    let currentRobotHeading = 0;

    // Convert each segment to robot commands
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const segmentCommands = this.convertSegmentToCommands(segment, opts, i, currentRobotHeading);
      commands.push(...segmentCommands);
      
      // Update current heading after this segment
      if (segmentCommands.length > 0) {
        // Find the last turn command to update our heading
        for (let j = segmentCommands.length - 1; j >= 0; j--) {
          const cmd = segmentCommands[j];
          if (cmd.action === "turn" && cmd.angle !== undefined) {
            currentRobotHeading = normalizeAngle(currentRobotHeading + cmd.angle);
            break;
          }
        }
      }
      
      // Add heading alignment and pause at action points
      if (segment.toPoint.type === "action") {
        // Get the action point's required heading
        const actionPoint = segment.toPoint as any;
        if (actionPoint.heading !== undefined) {
          // Convert canvas heading to robot heading
          const requiredHeading = canvasToRobotHeading(actionPoint.heading);
          const headingChange = normalizeAngle(requiredHeading - currentRobotHeading);
          
          // Turn to action heading if needed
          if (Math.abs(headingChange) > 2) {
            commands.push({
              action: "turn",
              angle: headingChange,
              speed: opts.defaultTurnSpeed,
              description: `Turn to action heading ${requiredHeading.toFixed(1)}°`
            });
            currentRobotHeading = requiredHeading;
          }
        }
        
        // Add pause at action points
        if (opts.pauseAtActions) {
          commands.push({
            action: "pause",
            duration: opts.actionPauseDuration,
            description: `Execute action: ${actionPoint.actionName || "Action"}`
          });
        }
      }
    }

    // Add final stop command
    commands.push({
      action: "stop",
      description: "Mission completed"
    });

    return commands;
  }

  /**
   * Convert a single path segment to robot commands
   */
  private convertSegmentToCommands(
    segment: ArcPathSegment,
    options: MissionExecutionOptions,
    segmentIndex: number,
    currentRobotHeading: number = 0
  ): RobotCommand[] {
    const commands: RobotCommand[] = [];
    
    if (segment.pathType === "straight") {
      // Simple straight line movement
      const distance = Math.sqrt(
        Math.pow(segment.endX - segment.startX, 2) + 
        Math.pow(segment.endY - segment.startY, 2)
      );
      
      if (distance > 1) { // Only move if distance is significant
        // Calculate required heading to reach the target point
        // Canvas coordinates: Y+ down, but we need to think in robot terms
        // Robot coordinates: Y+ up (North), X+ right (East)
        
        // Calculate direction from start to end point in canvas coordinates
        const dx = segment.endX - segment.startX;
        const dy = segment.endY - segment.startY;
        
        // Canvas atan2 gives us angle where 0°=East, 90°=South
        const canvasHeading = Math.atan2(dy, dx) * 180 / Math.PI;
        
        // Convert canvas heading to robot heading
        const targetHeading = canvasToRobotHeading(canvasHeading);
        const headingChange = normalizeAngle(targetHeading - currentRobotHeading);
        
        // Turn if needed
        if (Math.abs(headingChange) > 2) { // 2 degree threshold
          commands.push({
            action: "turn",
            angle: headingChange,
            speed: options.defaultTurnSpeed,
            description: `Turn ${headingChange.toFixed(1)}° for segment ${segmentIndex + 1}`
          });
        }
        
        // Drive straight
        commands.push({
          action: "drive",
          distance: distance,
          speed: options.defaultSpeed,
          description: `Drive ${distance.toFixed(1)}mm (segment ${segmentIndex + 1})`
        });
      }
      
    } else if (segment.pathType === "arc" && segment.arcCenter && segment.arcRadius) {
      // Arc movement - approximate with multiple straight segments
      const arcCommands = this.convertArcToCommands(segment, options, segmentIndex, currentRobotHeading);
      commands.push(...arcCommands);
    }
    
    return commands;
  }

  /**
   * Convert an arc segment to a sequence of straight line approximations
   */
  private convertArcToCommands(
    segment: ArcPathSegment,
    options: MissionExecutionOptions,
    segmentIndex: number,
    currentRobotHeading: number = 0
  ): RobotCommand[] {
    const commands: RobotCommand[] = [];
    
    if (!segment.arcCenter || !segment.arcRadius || 
        segment.arcStartAngle === undefined || segment.arcEndAngle === undefined) {
      console.warn('[MissionExecution] Invalid arc segment data');
      return commands;
    }

    // Calculate total arc angle
    let totalArcAngle = normalizeAngle(segment.arcEndAngle - segment.arcStartAngle);
    
    // Use the number of segments based on arc length and curvature
    const arcLength = Math.abs(totalArcAngle) * Math.PI * segment.arcRadius / 180;
    const numSegments = Math.max(
      3, // Minimum segments
      Math.min(
        options.arcApproximationSegments,
        Math.ceil(arcLength / 50) // One segment per 50mm of arc length
      )
    );
    

    // Generate intermediate points along the arc
    const angleStep = totalArcAngle / numSegments;
    let currentAngle = segment.arcStartAngle;
    let previousX = segment.startX;
    let previousY = segment.startY;
    let previousHeading = currentRobotHeading;

    for (let i = 0; i < numSegments; i++) {
      currentAngle += angleStep;
      
      // Calculate point on arc
      const angleRad = currentAngle * Math.PI / 180;
      const pointX = segment.arcCenter.x + segment.arcRadius * Math.cos(angleRad);
      const pointY = segment.arcCenter.y + segment.arcRadius * Math.sin(angleRad);
      
      // Calculate distance
      const distance = Math.sqrt(
        Math.pow(pointX - previousX, 2) + 
        Math.pow(pointY - previousY, 2)
      );
      
      // Calculate direction from previous to current point
      const dx = pointX - previousX;
      const dy = pointY - previousY;
      
      // Calculate canvas heading and convert to robot heading
      const canvasHeading = Math.atan2(dy, dx) * 180 / Math.PI;
      const targetHeading = canvasToRobotHeading(canvasHeading);
      const headingChange = normalizeAngle(targetHeading - previousHeading);
      
      if (distance > 1) { // Only add meaningful movements
        // Turn to correct heading
        if (Math.abs(headingChange) > 2) {
          commands.push({
            action: "turn",
            angle: headingChange,
            speed: options.defaultTurnSpeed,
            description: `Arc turn ${headingChange.toFixed(1)}° (segment ${segmentIndex + 1}, part ${i + 1}/${numSegments})`
          });
        }
        
        // Drive to next point
        commands.push({
          action: "drive",
          distance: distance,
          speed: options.defaultSpeed,
          description: `Arc drive ${distance.toFixed(1)}mm (segment ${segmentIndex + 1}, part ${i + 1}/${numSegments})`
        });
        
        // Update position for next iteration
        previousX = pointX;
        previousY = pointY;
        previousHeading = targetHeading;
      }
    }

    return commands;
  }

  /**
   * Execute mission commands on a robot interface
   */
  async executeMissionCommands(
    commands: RobotCommand[],
    robotInterface: {
      executeCommandSequence?: (commands: any[]) => Promise<void>;
      sendDriveCommand?: (distance: number, speed: number) => Promise<void>;
      sendTurnCommand?: (angle: number, speed: number) => Promise<void>;
      sendStopCommand?: () => Promise<void>;
      sendMotorCommand?: (motor: string, angle: number, speed: number) => Promise<void>;
    },
    progressCallback?: (progress: MissionExecutionProgress) => void
  ): Promise<void> {
    const progress: MissionExecutionProgress = {
      currentSegmentIndex: 0,
      currentCommandIndex: 0,
      totalSegments: 1, // Will be updated
      totalCommands: commands.length,
      currentSegment: null,
      currentCommand: null,
      isRunning: true,
      isPaused: false,
      completedCommands: 0,
      estimatedTimeRemaining: 0
    };

    try {
      // Check if robot supports command sequences (more efficient)
      if (robotInterface.executeCommandSequence) {
        
        // Convert to robot interface format
        const robotCommands = commands
          .filter(cmd => cmd.action !== "pause") // Remove pause commands for now
          .map(cmd => ({
            action: cmd.action,
            distance: cmd.distance,
            angle: cmd.angle,
            speed: cmd.speed,
            turn_rate: cmd.turn_rate,
            motor: cmd.motor
          }));
        
        progress.currentCommand = commands[0];
        progressCallback?.(progress);
        
        await robotInterface.executeCommandSequence(robotCommands);
        
        progress.completedCommands = commands.length;
        progress.isRunning = false;
        progressCallback?.(progress);
        
      } else {
        // Execute commands one by one
        
        for (let i = 0; i < commands.length; i++) {
          const command = commands[i];
          progress.currentCommandIndex = i;
          progress.currentCommand = command;
          progress.completedCommands = i;
          progressCallback?.(progress);
          
          
          switch (command.action) {
            case "drive":
              if (command.distance !== undefined && command.speed !== undefined && robotInterface.sendDriveCommand) {
                await robotInterface.sendDriveCommand(command.distance, command.speed);
              }
              break;
              
            case "turn":
              if (command.angle !== undefined && command.speed !== undefined && robotInterface.sendTurnCommand) {
                await robotInterface.sendTurnCommand(command.angle, command.speed);
              }
              break;
              
            case "stop":
              if (robotInterface.sendStopCommand) {
                await robotInterface.sendStopCommand();
              }
              break;
              
            case "motor":
              if (command.motor && command.angle !== undefined && command.speed !== undefined && robotInterface.sendMotorCommand) {
                await robotInterface.sendMotorCommand(command.motor, command.angle, command.speed);
              }
              break;
              
            case "pause":
              if (command.duration) {
                await new Promise(resolve => setTimeout(resolve, command.duration));
              }
              break;
              
            default:
              break;
          }
        }
        
        progress.completedCommands = commands.length;
        progress.isRunning = false;
        progressCallback?.(progress);
      }
      
      
    } catch (error) {
      progress.isRunning = false;
      progressCallback?.(progress);
      throw error;
    }
  }

  /**
   * Estimate total execution time for a mission
   */
  estimateExecutionTime(commands: RobotCommand[], options: Partial<MissionExecutionOptions> = {}): number {
    const opts = { ...this.defaultOptions, ...options };
    let totalTime = 0; // seconds
    
    for (const command of commands) {
      switch (command.action) {
        case "drive":
          if (command.distance && command.speed) {
            totalTime += Math.abs(command.distance) / command.speed;
          }
          break;
          
        case "turn":
          if (command.angle && command.speed) {
            totalTime += Math.abs(command.angle) / command.speed;
          }
          break;
          
        case "pause":
          if (command.duration) {
            totalTime += command.duration / 1000;
          }
          break;
          
        case "motor":
          // Estimate 2 seconds for motor actions
          totalTime += 2;
          break;
          
        default:
          // Small buffer for other actions
          totalTime += 0.5;
      }
    }
    
    return totalTime;
  }
}

// Export singleton instance
export const missionExecutionService = new MissionExecutionService();