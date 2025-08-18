import { useCallback, useState, useRef } from "react";
import { useAtomValue } from "jotai";
import type { Mission } from "../types/missionPlanner";
import { 
  missionExecutionService, 
  type RobotCommand, 
  type MissionExecutionProgress,
  type MissionExecutionOptions 
} from "../services/missionExecution";
import { robotConfigAtom } from "../store/atoms/robotConfigSimplified";
import { robotTypeAtom } from "../store/atoms/robotConnection";
import { useJotaiPybricksHub } from "./useJotaiPybricksHub";
import { virtualRobotService } from "../services/virtualRobot";

/**
 * Mission execution state
 */
export interface MissionExecutionState {
  isGenerating: boolean;
  isExecuting: boolean;
  isPaused: boolean;
  currentCommands: RobotCommand[];
  progress: MissionExecutionProgress | null;
  error: string | null;
  estimatedDuration: number; // seconds
}

/**
 * Hook for executing missions on robots
 */
export function useMissionExecution() {
  const robotConfig = useAtomValue(robotConfigAtom);
  const robotType = useAtomValue(robotTypeAtom);
  const pybricksHub = useJotaiPybricksHub();
  
  const [state, setState] = useState<MissionExecutionState>({
    isGenerating: false,
    isExecuting: false,
    isPaused: false,
    currentCommands: [],
    progress: null,
    error: null,
    estimatedDuration: 0
  });
  
  const abortControllerRef = useRef<AbortController | null>(null);

  /**
   * Generate robot commands for a mission
   */
  const generateCommands = useCallback((
    mission: Mission, 
    options: Partial<MissionExecutionOptions> = {}
  ) => {
    setState(prev => ({ ...prev, isGenerating: true, error: null }));
    
    try {
      const commands = missionExecutionService.generateMissionCommands(
        mission,
        robotConfig || undefined,
        options
      );
      
      const estimatedDuration = missionExecutionService.estimateExecutionTime(commands, options);
      
      setState(prev => ({
        ...prev,
        isGenerating: false,
        currentCommands: commands,
        estimatedDuration,
        error: null
      }));
      
      return commands;
      
    } catch (error) {
      setState(prev => ({
        ...prev,
        isGenerating: false,
        error: `Failed to generate commands: ${error instanceof Error ? error.message : String(error)}`
      }));
      return [];
    }
  }, [robotConfig]);

  /**
   * Execute generated commands on the current robot
   */
  const executeCommands = useCallback(async (commands?: RobotCommand[]) => {
    const commandsToExecute = commands || state.currentCommands;
    
    if (commandsToExecute.length === 0) {
      setState(prev => ({ ...prev, error: "No commands to execute" }));
      return false;
    }

    // Check robot connection
    const isConnected = robotType === "real" ? pybricksHub.isConnected() : virtualRobotService.isConnected();
    if (!isConnected) {
      setState(prev => ({ ...prev, error: "Robot not connected" }));
      return false;
    }

    setState(prev => ({
      ...prev,
      isExecuting: true,
      isPaused: false,
      error: null,
      progress: {
        currentSegmentIndex: 0,
        currentCommandIndex: 0,
        totalSegments: 1,
        totalCommands: commandsToExecute.length,
        currentSegment: null,
        currentCommand: null,
        isRunning: true,
        isPaused: false,
        completedCommands: 0,
        estimatedTimeRemaining: state.estimatedDuration
      }
    }));

    // Create abort controller for this execution
    abortControllerRef.current = new AbortController();
    
    try {
      
      // Get appropriate robot interface
      const robotInterface = robotType === "real" ? {
        executeCommandSequence: pybricksHub.executeCommandSequence,
        sendDriveCommand: pybricksHub.sendDriveCommand,
        sendTurnCommand: pybricksHub.sendTurnCommand,
        sendStopCommand: pybricksHub.sendStopCommand,
        sendMotorCommand: pybricksHub.sendMotorCommand
      } : {
        executeCommandSequence: virtualRobotService.executeCommandSequence.bind(virtualRobotService),
        sendDriveCommand: async (distance: number, speed: number) => {
          await virtualRobotService.drive(distance, speed);
        },
        sendTurnCommand: async (angle: number, speed: number) => {
          await virtualRobotService.turn(angle, speed);
        },
        sendStopCommand: async () => {
          await virtualRobotService.stop();
        },
        sendMotorCommand: async (motor: string, angle: number, speed: number) => {
          await virtualRobotService.setMotorAngle(motor, angle, speed);
        }
      };

      // Progress callback
      const onProgress = (progress: MissionExecutionProgress) => {
        setState(prev => ({
          ...prev,
          progress: {
            ...progress,
            estimatedTimeRemaining: Math.max(0, 
              state.estimatedDuration * (1 - progress.completedCommands / progress.totalCommands)
            )
          }
        }));
      };

      // Execute the commands
      await missionExecutionService.executeMissionCommands(
        commandsToExecute,
        robotInterface,
        onProgress
      );

      setState(prev => ({
        ...prev,
        isExecuting: false,
        progress: prev.progress ? { ...prev.progress, isRunning: false } : null
      }));
      
      return true;
      
    } catch (error) {
      // Try to stop the robot
      try {
        if (robotType === "real") {
          await pybricksHub.sendStopCommand();
        } else {
          await virtualRobotService.stop();
        }
      } catch (stopError) {
        // Ignore stop errors
      }
      
      setState(prev => ({
        ...prev,
        isExecuting: false,
        error: `Execution failed: ${error instanceof Error ? error.message : String(error)}`,
        progress: prev.progress ? { ...prev.progress, isRunning: false } : null
      }));
      
      return false;
    }
  }, [state.currentCommands, state.estimatedDuration, robotType, pybricksHub]);

  /**
   * Execute a complete mission (generate + execute)
   */
  const executeMission = useCallback(async (
    mission: Mission, 
    options: Partial<MissionExecutionOptions> = {}
  ) => {
    // Generate commands
    const commands = generateCommands(mission, options);
    if (commands.length === 0) {
      return false;
    }
    
    // Small delay to let UI update
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Execute commands
    return await executeCommands(commands);
  }, [generateCommands, executeCommands]);

  /**
   * Stop mission execution
   */
  const stopExecution = useCallback(async () => {
    // Abort the execution
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    // Stop the robot
    try {
      if (robotType === "real") {
        await pybricksHub.sendStopCommand();
      } else {
        await virtualRobotService.stop();
      }
    } catch (error) {
      // Ignore stop errors
    }
    
    setState(prev => ({
      ...prev,
      isExecuting: false,
      isPaused: false,
      progress: prev.progress ? { ...prev.progress, isRunning: false } : null
    }));
  }, [robotType, pybricksHub]);

  /**
   * Clear execution state
   */
  const clearState = useCallback(() => {
    setState({
      isGenerating: false,
      isExecuting: false,
      isPaused: false,
      currentCommands: [],
      progress: null,
      error: null,
      estimatedDuration: 0
    });
  }, []);

  return {
    // State
    ...state,
    
    // Actions
    generateCommands,
    executeCommands,
    executeMission,
    stopExecution,
    clearState,
    
    // Computed properties
    canExecute: !state.isExecuting && state.currentCommands.length > 0,
    hasCommands: state.currentCommands.length > 0,
    progressPercentage: state.progress ? 
      (state.progress.completedCommands / Math.max(1, state.progress.totalCommands)) * 100 : 0
  };
}