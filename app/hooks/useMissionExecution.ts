import { useAtomValue } from "jotai";
import { useCallback, useRef, useState } from "react";
import {
  missionExecutionService,
  type MissionExecutionOptions,
  type RobotCommand,
} from "../services/missionExecution";
import { virtualRobotService } from "../services/virtualRobot";
import { robotConfigAtom } from "../store/atoms/robotConfigSimplified";
import { robotTypeAtom } from "../store/atoms/robotConnection";
import type { Mission } from "../types/missionPlanner";
import { useJotaiPybricksHub } from "./useJotaiPybricksHub";
import { usePositionManager } from "./usePositionManager";

/**
 * Mission execution state
 */
export interface MissionExecutionState {
  isGenerating: boolean;
  isExecuting: boolean;
  isPaused: boolean;
  currentCommands: RobotCommand[];
  error: string | null;
}

/**
 * Hook for executing missions on robots
 */
export function useMissionExecution() {
  const robotConfig = useAtomValue(robotConfigAtom);
  const robotType = useAtomValue(robotTypeAtom);
  const pybricksHub = useJotaiPybricksHub();
  const { positions } = usePositionManager();
  const safePositions = positions || [];

  const [state, setState] = useState<MissionExecutionState>({
    isGenerating: false,
    isExecuting: false,
    isPaused: false,
    currentCommands: [],
    error: null,
  });

  const abortControllerRef = useRef<AbortController | null>(null);

  /**
   * Generate robot commands for a mission
   */
  const generateCommands = useCallback(
    (mission: Mission, options: Partial<MissionExecutionOptions> = {}) => {
      setState((prev) => ({ ...prev, isGenerating: true, error: null }));

      try {
        const commands = missionExecutionService.generateMissionCommands(
          mission,
          safePositions,
          robotConfig || undefined,
          options
        );

        setState((prev) => ({
          ...prev,
          isGenerating: false,
          currentCommands: commands,
          error: null,
        }));

        return commands;
      } catch (error) {
        setState((prev) => ({
          ...prev,
          isGenerating: false,
          error: `Failed to generate commands: ${error instanceof Error ? error.message : String(error)}`,
        }));
        return [];
      }
    },
    [robotConfig, safePositions]
  );

  /**
   * Execute generated commands on the current robot
   */
  const executeCommands = useCallback(
    async (commands?: RobotCommand[]) => {
      const commandsToExecute = commands || state.currentCommands;

      if (commandsToExecute.length === 0) {
        setState((prev) => ({ ...prev, error: "No commands to execute" }));
        return false;
      }

      // Debug: Log the command sequence
      console.log(
        `[Mission Execution] Sending ${commandsToExecute.length} commands to ${robotType} robot:`
      );
      commandsToExecute.forEach((cmd, i) => {
        console.log(`  ${i + 1}. ${cmd.action}:`, cmd);
      });

      // Check robot connection
      const isConnected =
        robotType === "real"
          ? pybricksHub.isConnected()
          : virtualRobotService.isConnected();
      if (!isConnected) {
        setState((prev) => ({ ...prev, error: "Robot not connected" }));
        return false;
      }

      setState((prev) => ({
        ...prev,
        isExecuting: true,
        isPaused: false,
        error: null,
      }));

      // Create abort controller for this execution
      abortControllerRef.current = new AbortController();

      try {
        // Get appropriate robot interface
        const robotInterface =
          robotType === "real"
            ? {
                executeCommandSequence: pybricksHub.executeCommandSequence,
                sendDriveCommand: pybricksHub.sendDriveCommand,
                sendTurnCommand: pybricksHub.sendTurnCommand,
                sendStopCommand: pybricksHub.sendStopCommand,
                sendMotorCommand: pybricksHub.sendMotorCommand,
                turnAndDrive: pybricksHub.turnAndDrive,
                arc: pybricksHub.arc,
              }
            : {
                executeCommandSequence:
                  virtualRobotService.executeCommandSequence.bind(
                    virtualRobotService
                  ),
                sendDriveCommand: async (distance: number, speed: number) => {
                  await virtualRobotService.drive(distance, speed);
                },
                sendTurnCommand: async (angle: number, speed: number) => {
                  await virtualRobotService.turn(angle, speed);
                },
                sendStopCommand: async () => {
                  await virtualRobotService.stop();
                },
                sendMotorCommand: async (
                  motor: string,
                  angle: number,
                  speed: number
                ) => {
                  await virtualRobotService.setMotorAngle(motor, angle, speed);
                },
                turnAndDrive: async (angle: number, distance: number, speed: number) => {
                  await virtualRobotService.turn(angle, speed);
                  await virtualRobotService.drive(distance, speed);
                },
                arc: virtualRobotService.arc.bind(virtualRobotService),
              };

        // Execute the commands
        await missionExecutionService.executeMissionCommands(
          commandsToExecute,
          robotInterface
        );

        setState((prev) => ({
          ...prev,
          isExecuting: false,
        }));

        return true;
      } catch (error) {
        console.error("Execution failed", error);
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

        setState((prev) => ({
          ...prev,
          isExecuting: false,
          error: `Execution failed: ${error instanceof Error ? error.message : String(error)}`,
        }));

        return false;
      }
    },
    [state.currentCommands, robotType, pybricksHub]
  );

  /**
   * Execute a complete mission (generate + execute)
   */
  const executeMission = useCallback(
    async (
      mission: Mission,
      options: Partial<MissionExecutionOptions> = {}
    ) => {
      // Generate commands
      const commands = generateCommands(mission, options);
      if (commands.length === 0) {
        return false;
      }

      // Small delay to let UI update
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Execute commands
      return await executeCommands(commands);
    },
    [generateCommands, executeCommands]
  );

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

    setState((prev) => ({
      ...prev,
      isExecuting: false,
      isPaused: false,
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
      error: null,
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
  };
}
