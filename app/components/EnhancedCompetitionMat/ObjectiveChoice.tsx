import type { MissionObjectiveChoice as Choice } from "../../schemas/GameMatConfig";

interface ObjectiveChoiceProps {
  choice: Choice;
  isSelected: boolean;
  onToggle: (objectId: string, objectiveId: string, points: number, choiceId: string) => void;
  objectId: string;
  objectiveId: string;
}

export function ObjectiveChoice({ 
  choice, 
  isSelected, 
  onToggle, 
  objectId, 
  objectiveId 
}: ObjectiveChoiceProps) {
  return (
    <button
      onClick={() => onToggle(objectId, objectiveId, choice.points, choice.id)}
      className={`w-full text-left p-2 rounded text-sm transition-colors ${
        isSelected
          ? "bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200"
          : "bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
      }`}
    >
      <span className="flex items-center justify-between">
        <span className="flex items-center gap-2">
          <span className="flex-shrink-0">
            <span
              className={`w-3 h-3 rounded-full border-2 inline-block ${
                isSelected
                  ? "bg-green-600 border-green-600"
                  : "border-gray-400 dark:border-gray-500"
              }`}
            >
              {isSelected && (
                <span className="block w-1 h-1 bg-white rounded-full mx-auto mt-0.5"></span>
              )}
            </span>
          </span>
          <span>{choice.description}</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="text-xs">
            {choice.points}pts
          </span>
          {choice.type === "bonus" && (
            <span className="text-orange-500 text-xs">
              bonus
            </span>
          )}
        </span>
      </span>
    </button>
  );
}