import type { MissionObjective as Objective } from "../../schemas/GameMatConfig";
import type { ObjectiveState } from "../../utils/scoringUtils";
import { ObjectiveChoice } from "./ObjectiveChoice";

interface MissionObjectiveProps {
  objective: Objective;
  objectiveState: ObjectiveState | undefined;
  objectId: string;
  isLastObjective: boolean;
  onToggleObjective: (
    objectId: string,
    objectiveId: string,
    points: number,
    choiceId: string,
  ) => void;
}

export function MissionObjective({
  objective,
  objectiveState,
  objectId,
  isLastObjective,
  onToggleObjective,
}: MissionObjectiveProps) {
  const isCompleted = objectiveState?.completed || false;

  return (
    <div className="space-y-1">
      {objective.description && (
        <div className="text-xs font-medium text-gray-600 dark:text-gray-400">
          {objective.description}
        </div>
      )}
      {objective.choices.map((choice) => {
        const isChoiceSelected =
          isCompleted && objectiveState?.selectedChoiceId === choice.id;

        return (
          <ObjectiveChoice
            key={choice.id}
            choice={choice}
            isSelected={isChoiceSelected}
            onToggle={onToggleObjective}
            objectId={objectId}
            objectiveId={objective.id}
          />
        );
      })}
      {/* Add dividing line between objectives (except after the last one) */}
      {!isLastObjective && (
        <div className="border-t border-gray-200 dark:border-gray-600 my-2"></div>
      )}
    </div>
  );
}
