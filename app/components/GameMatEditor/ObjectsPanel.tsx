import type { Mission, MissionObjective } from "../../schemas/GameMatConfig";
import { ObjectEditor } from "./ObjectEditor";

interface ObjectsPanelProps {
  missions: Mission[];
  selectedObject: string | null;
  placingObject: boolean;
  onSetPlacingObject: (placing: boolean) => void;
  onSetSelectedObject: (objectId: string | null) => void;
  onUpdateObject: (updates: Partial<Mission>) => void;
  onDeleteObject: () => void;
  onAddObjective: () => void;
  onRemoveObjective: (objectiveId: string) => void;
  onUpdateObjective: (
    objectiveId: string,
    updates: Partial<MissionObjective>,
  ) => void;
}

export function ObjectsPanel({
  missions,
  selectedObject,
  placingObject,
  onSetPlacingObject,
  onSetSelectedObject,
  onUpdateObject,
  onDeleteObject,
  onAddObjective,
  onRemoveObjective,
  onUpdateObjective,
}: ObjectsPanelProps) {
  const selectedMission = selectedObject
    ? missions.find((obj) => obj.id === selectedObject)
    : null;

  const calculateMissionPoints = (mission: Mission) => {
    return mission.objectives.reduce(
      (sum, o) =>
        sum + (o.choices?.reduce((cSum, c) => cSum + c.points, 0) || 0),
      0,
    );
  };

  return (
    <div>
      <h3 className="font-bold text-gray-800 dark:text-gray-200 mb-2">
        Scoring Objects
      </h3>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        Click "Add New Object" to place markers. Click and drag existing markers
        to move them.
      </p>

      <button
        onClick={() => onSetPlacingObject(true)}
        className="w-full px-3 py-2 bg-green-500 text-white rounded hover:bg-green-600 mb-4"
      >
        {placingObject ? "Click on mat to place" : "Add New Object"}
      </button>

      {selectedMission && (
        <ObjectEditor
          selectedObject={selectedMission}
          onUpdateObject={onUpdateObject}
          onDeleteObject={onDeleteObject}
          onAddObjective={onAddObjective}
          onRemoveObjective={onRemoveObjective}
          onUpdateObjective={onUpdateObjective}
        />
      )}

      <div className="space-y-2">
        {missions.map((obj) => (
          <button
            key={obj.id}
            onClick={() => onSetSelectedObject(obj.id)}
            className={`w-full text-left px-3 py-2 rounded ${
              selectedObject === obj.id
                ? "bg-blue-500 text-white"
                : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
            }`}
          >
            {obj.name} ({calculateMissionPoints(obj)}pts)
          </button>
        ))}
      </div>
    </div>
  );
}
