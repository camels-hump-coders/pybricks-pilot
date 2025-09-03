import type {
  MissionObjective,
  MissionObjectiveChoice,
} from "../../schemas/GameMatConfig";

interface ChoiceEditorProps {
  choice: MissionObjectiveChoice;
  choiceIndex: number;
  onUpdateChoice: (
    choiceIndex: number,
    updatedChoice: MissionObjectiveChoice,
  ) => void;
  onRemoveChoice: (choiceIndex: number) => void;
  canRemove: boolean;
}

export function ChoiceEditor({
  choice,
  choiceIndex,
  onUpdateChoice,
  onRemoveChoice,
  canRemove,
}: ChoiceEditorProps) {
  const handleDescriptionChange = (description: string) => {
    onUpdateChoice(choiceIndex, { ...choice, description });
  };

  const handlePointsChange = (points: number) => {
    onUpdateChoice(choiceIndex, { ...choice, points });
  };

  const handleTypeChange = (type: "primary" | "bonus") => {
    onUpdateChoice(choiceIndex, { ...choice, type });
  };

  return (
    <div className="flex gap-1 items-center">
      <input
        type="text"
        value={choice.description}
        onChange={(e) => handleDescriptionChange(e.target.value)}
        className="flex-1 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200"
        placeholder="Choice description"
      />
      <input
        type="number"
        value={choice.points}
        onChange={(e) => handlePointsChange(parseInt(e.target.value, 10) || 0)}
        className="w-16 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200"
        placeholder="Pts"
      />
      <select
        value={choice.type || "primary"}
        onChange={(e) =>
          handleTypeChange(e.target.value as "primary" | "bonus")
        }
        className="px-1 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200"
      >
        <option value="primary">Pri</option>
        <option value="bonus">Bon</option>
      </select>
      <button
        onClick={() => onRemoveChoice(choiceIndex)}
        className="text-red-500 hover:text-red-700 text-xs px-1"
        disabled={!canRemove}
        title={canRemove ? "Remove choice" : "Must have at least one choice"}
      >
        ✕
      </button>
    </div>
  );
}
