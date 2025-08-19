import type { Mission, MissionObjective } from "../../schemas/GameMatConfig";
import { ObjectiveEditor } from "./ObjectiveEditor";

interface ObjectEditorProps {
  selectedObject: Mission;
  onUpdateObject: (updates: Partial<Mission>) => void;
  onDeleteObject: () => void;
  onAddObjective: () => void;
  onRemoveObjective: (objectiveId: string) => void;
  onUpdateObjective: (
    objectiveId: string,
    updates: Partial<MissionObjective>,
  ) => void;
}

export function ObjectEditor({
  selectedObject,
  onUpdateObject,
  onDeleteObject,
  onAddObjective,
  onRemoveObjective,
  onUpdateObjective,
}: ObjectEditorProps) {
  return (
    <div className="mb-4 p-3 bg-gray-100 dark:bg-gray-700 rounded">
      <h4 className="font-semibold text-gray-800 dark:text-gray-200 mb-2">
        Edit Object
      </h4>

      <input
        type="text"
        value={selectedObject.name}
        onChange={(e) => onUpdateObject({ name: e.target.value })}
        className="w-full px-2 py-1 mb-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200"
        placeholder="Object name"
      />

      <textarea
        value={selectedObject.description}
        onChange={(e) => onUpdateObject({ description: e.target.value })}
        className="w-full px-2 py-1 mb-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200"
        placeholder="Description (optional)"
        rows={2}
      />

      {/* Scoring Mode Selector */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Scoring Mode
        </label>
        <select
          value="multi-select"
          disabled
          className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 opacity-50"
        >
          <option value="multi-select">
            Multi-select (check any/all objectives)
          </option>
        </select>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Multi-select allows multiple objectives to be completed
          simultaneously. Single-select allows only one objective at a time
          (like Precision Tokens).
        </p>
      </div>

      {/* Objectives Editor */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Objectives
          </h4>
          <button
            onClick={onAddObjective}
            className="px-2 py-1 bg-green-500 text-white text-xs rounded hover:bg-green-600"
          >
            + Add Objective
          </button>
        </div>

        <div className="space-y-2 max-h-40 overflow-y-auto">
          {selectedObject.objectives.map((objective, index) => (
            <ObjectiveEditor
              key={objective.id}
              objective={objective}
              index={index}
              onUpdateObjective={onUpdateObjective}
              onRemoveObjective={onRemoveObjective}
            />
          ))}
          {!selectedObject.objectives.length && (
            <div className="text-xs text-gray-500 dark:text-gray-400 text-center py-2">
              No objectives yet. Click "Add Objective" to get started.
            </div>
          )}
        </div>
      </div>

      <button
        onClick={onDeleteObject}
        className="w-full px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600"
      >
        Delete Object
      </button>
    </div>
  );
}
