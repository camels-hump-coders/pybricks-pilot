import { useAtom } from "jotai";
import { missionsExpandedAtom } from "../../store/atoms/matUIState";
import { MissionItem } from "./MissionItem";
import type { Mission, GameMatConfig } from "../../schemas/GameMatConfig";
import type { ScoringState } from "../../utils/scoringUtils";

interface MissionsListProps {
  customMatConfig: GameMatConfig | null;
  showScoring: boolean;
  scoringState: ScoringState;
  onToggleObjective: (objectId: string, objectiveId: string, points: number, choiceId: string) => void;
  getTotalPointsForMission: (mission: Mission, state: ScoringState) => number;
  getMaxPointsForMission: (mission: Mission) => number;
}

export function MissionsList({ 
  customMatConfig, 
  showScoring, 
  scoringState, 
  onToggleObjective, 
  getTotalPointsForMission, 
  getMaxPointsForMission 
}: MissionsListProps) {
  const [missionsExpanded, setMissionsExpanded] = useAtom(missionsExpandedAtom);

  if (!customMatConfig || !showScoring) {
    return null;
  }

  return (
    <div className="mt-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
      {/* Accordion Header */}
      <button
        onClick={() => setMissionsExpanded(!missionsExpanded)}
        className="w-full p-3 text-left border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200">
              Missions
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`transition-transform ${missionsExpanded ? "rotate-90" : "rotate-0"}`}
            >
              ▶
            </span>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {missionsExpanded ? "Hide" : "Show"} (
              {customMatConfig?.missions.length || 0})
            </span>
          </div>
        </div>
      </button>
      {missionsExpanded && (
        <div className="space-y-4">
          {customMatConfig.missions.map((mission) => (
            <MissionItem
              key={mission.id}
              mission={mission}
              scoringState={scoringState}
              onToggleObjective={onToggleObjective}
              getTotalPointsForMission={getTotalPointsForMission}
              getMaxPointsForMission={getMaxPointsForMission}
            />
          ))}
        </div>
      )}
    </div>
  );
}