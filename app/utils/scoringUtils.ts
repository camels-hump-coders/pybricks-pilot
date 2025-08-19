import type { Mission } from "../schemas/GameMatConfig";

export interface ObjectiveState {
  completed: boolean;
  points: number;
  selectedChoiceId?: string;
}

export interface ScoringState {
  [objectId: string]: {
    objectives: {
      [objectiveId: string]: ObjectiveState;
    };
  };
}

/**
 * Calculate total points for a mission state
 */
function getTotalPointsForMissionState(
  state: { objectives: { [key: string]: ObjectiveState } } | undefined
): number {
  if (!state?.objectives) return 0;

  return Object.values(state.objectives).reduce((sum, objState) => {
    if (objState.completed) {
      return sum + objState.points;
    }
    return sum;
  }, 0);
}

/**
 * Get maximum possible points for a mission
 */
export function getMaxPointsForMission(mission: Mission): number {
  return mission.objectives.reduce((sum, objective) => {
    // All objectives now have choices, so max is the highest choice
    return sum + Math.max(...objective.choices.map((choice) => choice.points));
  }, 0);
}

/**
 * Get total points earned for a mission
 */
export function getTotalPointsForMission(
  mission: Mission,
  scoringState: ScoringState
): number {
  const state = scoringState[mission.id];
  if (!state?.objectives) return 0;

  return Object.values(state.objectives).reduce((sum, objState) => {
    return sum + (objState.completed ? objState.points : 0);
  }, 0);
}

/**
 * Check if a mission has been scored
 */
export function isMissionScored(
  mission: Mission,
  scoringState: ScoringState
): boolean {
  const state = scoringState[mission.id];
  if (!state?.objectives) return false;

  return Object.values(state.objectives).some((objState) => objState.completed);
}
