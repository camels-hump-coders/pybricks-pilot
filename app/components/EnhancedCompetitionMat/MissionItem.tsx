import type { Mission } from "../../schemas/GameMatConfig";
import type { ScoringState } from "../../utils/scoringUtils";
import { MissionObjective } from "./MissionObjective";

interface MissionItemProps {
  mission: Mission;
  scoringState: ScoringState;
  onToggleObjective: (
    objectId: string,
    objectiveId: string,
    points: number,
    choiceId: string,
  ) => void;
  getTotalPointsForMission: (mission: Mission, state: ScoringState) => number;
  getMaxPointsForMission: (mission: Mission) => number;
}

export function MissionItem({
  mission,
  scoringState,
  onToggleObjective,
  getTotalPointsForMission,
  getMaxPointsForMission,
}: MissionItemProps) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-2 sm:p-3">
      <div className="flex items-center justify-between mb-2">
        <h5 className="text-sm sm:text-base font-medium text-gray-800 dark:text-gray-200">
          {mission.name}
        </h5>
        <span className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
          {getTotalPointsForMission(mission, scoringState)}/
          {getMaxPointsForMission(mission)}pts
        </span>
      </div>
      {mission.description && (
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
          {mission.description}
        </p>
      )}
      <div className="space-y-3">
        {mission.objectives.map((objective, index) => {
          const objectiveState =
            scoringState[mission.id]?.objectives?.[objective.id];

          return (
            <MissionObjective
              key={objective.id}
              objective={objective}
              objectiveState={objectiveState}
              objectId={mission.id}
              isLastObjective={index === mission.objectives.length - 1}
              onToggleObjective={onToggleObjective}
            />
          );
        })}
      </div>
    </div>
  );
}
