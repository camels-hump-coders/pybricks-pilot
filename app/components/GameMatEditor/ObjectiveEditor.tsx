import type {
  MissionObjective,
  MissionObjectiveChoice,
} from "../../schemas/GameMatConfig";
import { ChoiceEditor } from "./ChoiceEditor";

interface ObjectiveEditorProps {
  objective: MissionObjective;
  index: number;
  onUpdateObjective: (
    objectiveId: string,
    updates: Partial<MissionObjective>,
  ) => void;
  onRemoveObjective: (objectiveId: string) => void;
}

export function ObjectiveEditor({
  objective,
  index,
  onUpdateObjective,
  onRemoveObjective,
}: ObjectiveEditorProps) {
  const handleDescriptionChange = (description: string) => {
    onUpdateObjective(objective.id, { description });
  };

  const handleScoringModeChange = (
    scoringMode: "multi-select" | "single-select",
  ) => {
    onUpdateObjective(objective.id, { scoringMode });
  };

  const handleUpdateChoice = (
    choiceIndex: number,
    updatedChoice: MissionObjectiveChoice,
  ) => {
    const updatedChoices = [...(objective.choices || [])];
    updatedChoices[choiceIndex] = updatedChoice;
    onUpdateObjective(objective.id, { choices: updatedChoices });
  };

  const handleRemoveChoice = (choiceIndex: number) => {
    const updatedChoices = objective.choices?.filter(
      (_, i) => i !== choiceIndex,
    );
    onUpdateObjective(objective.id, { choices: updatedChoices });
  };

  const handleAddChoice = () => {
    const newChoice = {
      id: `choice_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
      description: "New choice",
      points: 5,
      type: "primary" as const,
    };
    onUpdateObjective(objective.id, {
      choices: [...(objective.choices || []), newChoice],
    });
  };

  const canRemoveChoice = (objective.choices?.length || 0) > 1;

  return (
    <div className="border border-gray-200 dark:border-gray-600 rounded p-2 bg-gray-50 dark:bg-gray-700">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-500 dark:text-gray-400">
          Objective {index + 1}
        </span>
        <button
          onClick={() => onRemoveObjective(objective.id)}
          className="text-red-500 hover:text-red-700 text-xs"
        >
          ✕
        </button>
      </div>

      <input
        type="text"
        value={objective.description || ""}
        onChange={(e) => handleDescriptionChange(e.target.value)}
        className="w-full px-2 py-1 mb-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200"
        placeholder="Objective description (optional)"
      />

      {/* Scoring Mode */}
      <select
        value={objective.scoringMode || "multi-select"}
        onChange={(e) =>
          handleScoringModeChange(
            e.target.value as "multi-select" | "single-select",
          )
        }
        className="w-full px-2 py-1 mb-2 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200"
      >
        <option value="multi-select">
          Multi-select (can complete multiple)
        </option>
        <option value="single-select">
          Single-select (only one at a time)
        </option>
      </select>

      {/* Choices for this objective */}
      <div className="space-y-1 mt-2">
        <div className="text-xs font-medium text-gray-600 dark:text-gray-400">
          Choices ({objective.choices?.length || 0}):
        </div>
        {objective.choices?.map((choice, choiceIndex) => (
          <ChoiceEditor
            key={choice.id}
            choice={choice}
            choiceIndex={choiceIndex}
            onUpdateChoice={handleUpdateChoice}
            onRemoveChoice={handleRemoveChoice}
            canRemove={canRemoveChoice}
          />
        ))}
        <button
          onClick={handleAddChoice}
          className="text-xs text-blue-500 hover:text-blue-700"
        >
          + Add Choice
        </button>
      </div>
    </div>
  );
}
